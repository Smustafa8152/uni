import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import '../../styles/instructor-portal.css'
import { getLocalizedName } from '../../utils/localizedName'
import { supabase, SUPABASE_STORAGE_BUCKET } from '../../lib/supabase'
import { getActiveInstructorByEmail } from '../../utils/getActiveInstructorByEmail'

const ELEMENT_TYPES = [
  { key: 'heading', label: 'Heading', icon: 'H' },
  { key: 'paragraph', label: 'Paragraph', icon: 'P' },
  { key: 'code', label: 'Code block', icon: '{ }' },
  { key: 'table', label: 'Table', icon: '▦' },
  { key: 'interactive_order', label: 'Interactive: order steps', icon: '⇅' },
  { key: 'video', label: 'Video', icon: 'VID' },
  { key: 'attachment', label: 'Attachment', icon: 'ATT' },
  { key: 'quiz', label: 'Quiz', icon: 'QZ' },
  { key: 'poll', label: 'Poll', icon: 'POL' },
  { key: 'discussion', label: 'Discussion', icon: 'DIS' },
]

const emptyLesson = {
  title: '',
  unit_number: 1,
  lesson_number: 1,
  estimated_minutes: 45,
  summary: '',
  prerequisite_lesson_id: null,
  release_mode: 'scheduled',
  release_at: '',
  release_condition: '',
  status: 'draft',
}

function createElement(type) {
  const defaults = (() => {
    if (type === 'heading') return { level: 3, text: '' }
    if (type === 'paragraph') return { text: '' }
    if (type === 'code') return { language: 'python', code: '', caption: '' }
    if (type === 'table') return { headers: [], rows: [] }
    if (type === 'interactive_order') return { prompt: '', items: [], correct_order: [], shuffle: true }
    if (type === 'video') return { url: '', caption: '', duration_minutes: null, start_time: '', end_time: '' }
    if (type === 'attachment') return { file_url: '', file_name: '' }
    if (type === 'quiz' || type === 'poll') return { question: '', options: [] }
    if (type === 'discussion') return { text: '' }
    return {}
  })()
  return {
    id: null,
    tempId: Math.random().toString(36).slice(2),
    element_type: type,
    title: '',
    content: defaults,
  }
}

function getSubjectMajorIds(subject) {
  const ids = new Set()
  if (subject?.major_id != null) {
    ids.add(Number(subject.major_id))
  }
  for (const row of subject?.subject_majors || []) {
    if (row?.major_id != null) {
      ids.add(Number(row.major_id))
    }
  }
  return [...ids]
}

/** @param {'instructor'|'admin'} variant — admin: create lessons + metadata; instructor: elements only */
export default function InstructorBuildLesson({ embedded = false, embedClassId = null, variant = 'instructor' } = {}) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { language, isRTL } = useLanguage()
  const [searchParams, setSearchParams] = useSearchParams()
  const isAdmin = variant === 'admin'
  const elementsOnly = !isAdmin

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [colleges, setColleges] = useState([])
  const [majors, setMajors] = useState([])
  const [classes, setClasses] = useState([])
  const [clos, setClos] = useState([])
  const [lessons, setLessons] = useState([])
  const [allowedSubjectIds, setAllowedSubjectIds] = useState([])
  const [selectedCollegeId, setSelectedCollegeId] = useState(null)
  const [selectedMajorId, setSelectedMajorId] = useState(null)
  const [selectedClassId, setSelectedClassId] = useState(null)
  const [selectedLessonId, setSelectedLessonId] = useState(null)

  const [lessonForm, setLessonForm] = useState(emptyLesson)
  const [selectedCloIds, setSelectedCloIds] = useState([])
  const [elements, setElements] = useState([])
  const [lessonMediaUploadKey, setLessonMediaUploadKey] = useState(null)
  const [tableHeadersDraft, setTableHeadersDraft] = useState({})
  const [sessionTemplateLock, setSessionTemplateLock] = useState(null) // { locked: boolean, templateId?: number }
  /** Instructors need `can_add_materials` on their row to use the lesson builder (same flag as “lesson content” in admin). Admins always allowed. */
  const [canAddLessonContent, setCanAddLessonContent] = useState(isAdmin)

  const permissionBlocked = elementsOnly && !canAddLessonContent
  const templateLocked = elementsOnly && sessionTemplateLock?.locked
  const lessonEditBlocked = permissionBlocked || templateLocked

  const filteredMajors = useMemo(() => {
    if (!isAdmin) return majors
    if (!selectedCollegeId) return []
    return majors.filter((major) => {
      if (major.is_university_wide) return true
      return Number(major.college_id) === Number(selectedCollegeId)
    })
  }, [isAdmin, majors, selectedCollegeId])

  const filteredClasses = useMemo(() => {
    if (!isAdmin) return classes
    if (!selectedCollegeId || !selectedMajorId) return []
    return classes.filter((cls) => {
      const subjectCollegeId = cls.subjects?.college_id != null ? Number(cls.subjects.college_id) : null
      const classCollegeId = cls.college_id != null ? Number(cls.college_id) : null
      const matchesCollege =
        classCollegeId === Number(selectedCollegeId) ||
        (classCollegeId == null &&
          (subjectCollegeId === Number(selectedCollegeId) || cls.subjects?.is_university_wide === true))
      const matchesMajor = allowedSubjectIds.includes(Number(cls.subject_id))
      return matchesCollege && matchesMajor
    })
  }, [isAdmin, classes, selectedCollegeId, selectedMajorId, allowedSubjectIds])

  const selectedClass = useMemo(
    () => classes.find((c) => c.id === selectedClassId) || null,
    [classes, selectedClassId]
  )

  useEffect(() => {
    if (!user?.email) return
    if (isAdmin) loadAdminClasses()
    else loadInstructorClasses()
  }, [user?.email, isAdmin])

  useEffect(() => {
    if (!selectedClassId) return
    loadClassData(selectedClassId)
  }, [selectedClassId, embedded, searchParams])

  useEffect(() => {
    if (!isAdmin) return
    if (!selectedCollegeId) {
      setAllowedSubjectIds([])
      setSelectedMajorId(null)
      setSelectedClassId(null)
      setSelectedLessonId(null)
      return
    }

    if (selectedMajorId && !filteredMajors.some((major) => major.id === selectedMajorId)) {
      setSelectedMajorId(null)
    }
  }, [isAdmin, selectedCollegeId, selectedMajorId, filteredMajors])

  useEffect(() => {
    if (!isAdmin) return
    if (!selectedCollegeId) {
      setAllowedSubjectIds([])
      return
    }
    loadAdminSubjectScope(selectedCollegeId, selectedMajorId)
  }, [isAdmin, selectedCollegeId, selectedMajorId])

  useEffect(() => {
    if (!isAdmin) return

    if (!filteredClasses.length) {
      if (selectedClassId !== null) {
        setSelectedClassId(null)
      }
      setSelectedLessonId(null)
      setClos([])
      setLessons([])
      return
    }

    if (!filteredClasses.some((cls) => cls.id === selectedClassId)) {
      const classIdFromQuery = embedded && embedClassId ? Number(embedClassId) : Number(searchParams.get('classId'))
      const nextClassId = filteredClasses.find((cls) => cls.id === classIdFromQuery)?.id || filteredClasses[0]?.id || null
      setSelectedClassId(nextClassId)
      setSelectedLessonId(null)

      if (!embedded && nextClassId) {
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev)
          next.set('classId', String(nextClassId))
          next.delete('lessonId')
          return next
        }, { replace: true })
      }
    }
  }, [isAdmin, filteredClasses, selectedClassId, embedded, embedClassId, searchParams, setSearchParams])

  useEffect(() => {
    if (!selectedLessonId) {
      setLessonForm(emptyLesson)
      setSelectedCloIds([])
      setElements([])
      return
    }
    loadLesson(selectedLessonId)
  }, [selectedLessonId])

  const loadInstructorClasses = async () => {
    setLoading(true)
    try {
      const instructor = await getActiveInstructorByEmail(user.email)

      const canAdd = Boolean(instructor?.can_add_materials)
      if (!instructor) {
        setCanAddLessonContent(false)
        setLoading(false)
        return
      }
      setCanAddLessonContent(canAdd)

      const { data: cls } = await supabase
        .from('classes')
        .select('id, section, subject_id, subjects(id, code, name_en, name_ar)')
        .eq('instructor_id', instructor.id)
        .eq('status', 'active')
        .order('id', { ascending: false })

      const list = cls || []
      setClasses(list)

      const classIdFromQuery = embedded && embedClassId ? embedClassId : Number(searchParams.get('classId'))
      const initialClassId = list.find((c) => c.id === classIdFromQuery)?.id || list[0]?.id || null
      setSelectedClassId(initialClassId)

      if (!initialClassId) setLoading(false)
    } catch (err) {
      console.error(err)
      setLoading(false)
    }
  }

  const loadAdminClasses = async () => {
    setLoading(true)
    try {
      const [{ data: collegeRows }, { data: majorRows }, { data: cls }] = await Promise.all([
        supabase
          .from('colleges')
          .select('id, name_en, name_ar, code')
          .eq('status', 'active')
          .order('name_en', { ascending: true }),
        supabase
          .from('majors')
          .select('id, name_en, name_ar, code, college_id, is_university_wide')
          .eq('status', 'active')
          .order('name_en', { ascending: true }),
        supabase
          .from('classes')
          .select('id, section, subject_id, college_id, subjects(id, code, name_en, name_ar, college_id, is_university_wide)')
          .eq('status', 'active')
          .order('id', { ascending: false })
          .limit(2000),
      ])

      const collegeList = collegeRows || []
      const majorList = majorRows || []
      const classList = cls || []

      setColleges(collegeList)
      setMajors(majorList)
      setClasses(classList)

      const classIdFromQuery = embedded && embedClassId ? Number(embedClassId) : Number(searchParams.get('classId'))
      const initialClass = classList.find((c) => c.id === classIdFromQuery) || classList[0] || null
      const initialCollegeId = initialClass?.college_id || collegeList[0]?.id || null
      let initialMajorId = null

      if (initialClass?.subject_id != null) {
        const { data: directSubject } = await supabase
          .from('subjects')
          .select('major_id, subject_majors(major_id)')
          .eq('id', initialClass.subject_id)
          .maybeSingle()

        initialMajorId = getSubjectMajorIds(directSubject)[0] || null
      }

      setSelectedCollegeId(initialCollegeId)
      setSelectedMajorId(initialMajorId)
      setSelectedClassId(initialClass?.id || null)

      if (!initialClass?.id) setLoading(false)
    } catch (err) {
      console.error(err)
      setLoading(false)
    }
  }

  const loadAdminSubjectScope = async (collegeId, majorId) => {
    try {
      const numericCollegeId = Number(collegeId)
      const numericMajorId = majorId != null ? Number(majorId) : null

      if (!Number.isFinite(numericCollegeId)) {
        setAllowedSubjectIds([])
        return
      }

      // If major isn't selected (or invalid), show all subjects for the selected college.
      // This is important for subjects that have `major_id = NULL`.
      if (numericMajorId == null || !Number.isFinite(numericMajorId)) {
        const { data: subjectsData, error } = await supabase
          .from('subjects')
          .select('id')
          .eq('status', 'active')
          .or(`college_id.eq.${numericCollegeId},is_university_wide.eq.true`)

        if (error) throw error

        setAllowedSubjectIds(
          (subjectsData || [])
            .map((row) => Number(row.id))
            .filter(Number.isFinite),
        )
        return
      }

      const { data: subjectMajorRows } = await supabase
        .from('subject_majors')
        .select('subject_id')
        .eq('major_id', numericMajorId)

      const subjectIdsFromJunction = (subjectMajorRows || [])
        .map((row) => Number(row.subject_id))
        .filter(Number.isFinite)

      const orParts = [
        `major_id.eq.${numericMajorId}`,
        'is_university_wide.eq.true',
        `and(applies_to_all_majors_of_college.eq.true,college_id.eq.${numericCollegeId})`,
        // Subjects with no major should still be visible in the lesson builder
        // for the selected college (e.g., college-level core subjects).
        `and(major_id.is.null,college_id.eq.${numericCollegeId})`,
      ]

      if (subjectIdsFromJunction.length > 0) {
        orParts.push(`id.in.(${subjectIdsFromJunction.join(',')})`)
      }

      const { data: subjectsData, error } = await supabase
        .from('subjects')
        .select('id')
        .eq('status', 'active')
        .or(orParts.join(','))

      if (error) throw error

      setAllowedSubjectIds(
        (subjectsData || [])
          .map((row) => Number(row.id))
          .filter(Number.isFinite)
      )
    } catch (err) {
      console.error(err)
      setAllowedSubjectIds([])
    }
  }

  const loadClassData = async (classId) => {
    try {
      const currentClass = classes.find((c) => c.id === classId)
      if (!currentClass?.subject_id) {
        setClos([])
        setLessons([])
        setLoading(false)
        return
      }

      const [{ data: closData }, { data: lessonsData }] = await Promise.all([
        supabase
          .from('subject_learning_outcomes')
          .select('id, code, description')
          .eq('subject_id', currentClass.subject_id)
          .eq('is_active', true)
          .order('display_order', { ascending: true })
          .order('id', { ascending: true }),
        supabase
          .from('class_lessons')
          .select('id, title, unit_number, lesson_number, status')
          .eq('class_id', classId)
          .order('unit_number', { ascending: true })
          .order('lesson_number', { ascending: true }),
      ])

      // If the class has no session lessons yet, auto-seed from subject lesson templates
      // so instructors can start adding content immediately.
      let effectiveLessons = lessonsData || []
      if (
        currentClass?.subject_id &&
        Array.isArray(effectiveLessons) &&
        effectiveLessons.length === 0
      ) {
        const { data: templates, error: tplErr } = await supabase
          .from('subject_lessons')
          .select('id, title, unit_number, lesson_number, status')
          .eq('subject_id', currentClass.subject_id)
          .order('unit_number', { ascending: true })
          .order('lesson_number', { ascending: true })

        if (!tplErr && Array.isArray(templates) && templates.length > 0) {
          // Best-effort insert; ignore failures (RLS/constraints) and fall back to refetch.
          try {
            await supabase.from('class_lessons').insert(
              templates.map((t) => ({
                class_id: classId,
                subject_id: currentClass.subject_id,
                title: t.title || `Unit ${t.unit_number} - Lesson ${t.lesson_number}`,
                unit_number: t.unit_number,
                lesson_number: t.lesson_number,
                status: t.status || 'draft',
                subject_lesson_id: t.id,
              })),
            )
          } catch (e) {
            console.warn('Seed class_lessons from subject_lessons failed:', e?.message || e)
          }

          const { data: seededLessons } = await supabase
            .from('class_lessons')
            .select('id, title, unit_number, lesson_number, status')
            .eq('class_id', classId)
            .order('unit_number', { ascending: true })
            .order('lesson_number', { ascending: true })
          effectiveLessons = seededLessons || []
        }
      }

      setClos(closData || [])
      setLessons(effectiveLessons || [])

      const rawLesson = searchParams.get('lessonId')
      const lessonIdFromQuery =
        rawLesson != null && rawLesson !== '' && !Number.isNaN(Number(rawLesson)) ? Number(rawLesson) : null
      const nextLesson =
        lessonIdFromQuery != null ? (effectiveLessons || []).find((l) => l.id === lessonIdFromQuery) : null
      setSelectedLessonId(nextLesson?.id ?? null)

      if (lessonIdFromQuery != null && !nextLesson && !embedded) {
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev)
          next.delete('lessonId')
          return next
        }, { replace: true })
      }

      if (!nextLesson) {
        setLessonForm(emptyLesson)
        setSelectedCloIds([])
        setElements([])
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const loadLesson = async (lessonId) => {
    try {
      // Enforce subject template lock when configured by admin.
      // If a subject lesson template exists for this subject+unit+lesson and has force_use_in_sessions=true,
      // link the class lesson to it and sync elements/CLOs.
      const { data: baseLesson, error: baseErr } = await supabase
        .from('class_lessons')
        .select('id, class_id, subject_id, unit_number, lesson_number, subject_lesson_id')
        .eq('id', lessonId)
        .maybeSingle()

      if (!baseErr && baseLesson?.subject_id && baseLesson?.unit_number != null && baseLesson?.lesson_number != null) {
        try {
          const templateIdFromLesson = baseLesson.subject_lesson_id
          const templateQuery = templateIdFromLesson
            ? supabase
                .from('subject_lessons')
                .select('id, force_use_in_sessions')
                .eq('id', templateIdFromLesson)
                .maybeSingle()
            : supabase
                .from('subject_lessons')
                .select('id, force_use_in_sessions')
                .eq('subject_id', baseLesson.subject_id)
                .eq('unit_number', baseLesson.unit_number)
                .eq('lesson_number', baseLesson.lesson_number)
                .order('updated_at', { ascending: false })
                .limit(1)
                .maybeSingle()

          const { data: tpl } = await templateQuery
          if (tpl?.id && tpl.force_use_in_sessions) {
            setSessionTemplateLock({ locked: true, templateId: tpl.id })

            // Link lesson -> template if not already linked
            if (!templateIdFromLesson || Number(templateIdFromLesson) !== Number(tpl.id)) {
              await supabase
                .from('class_lessons')
                .update({ subject_lesson_id: tpl.id, updated_at: new Date().toISOString() })
                .eq('id', lessonId)
            }

            // Sync CLO mapping
            const [{ data: tplClos }, { data: tplEls }] = await Promise.all([
              supabase.from('subject_lesson_clos').select('clo_id').eq('subject_lesson_id', tpl.id),
              supabase
                .from('subject_lesson_elements')
                .select('element_type, title, content, display_order')
                .eq('subject_lesson_id', tpl.id)
                .order('display_order', { ascending: true }),
            ])

            await supabase.from('class_lesson_clos').delete().eq('lesson_id', lessonId)
            if ((tplClos || []).length) {
              await supabase
                .from('class_lesson_clos')
                .insert((tplClos || []).map((r) => ({ lesson_id: lessonId, clo_id: r.clo_id })))
            }

            await supabase.from('class_lesson_elements').delete().eq('lesson_id', lessonId)
            if ((tplEls || []).length) {
              await supabase.from('class_lesson_elements').insert(
                (tplEls || []).map((r, idx) => ({
                  lesson_id: lessonId,
                  element_type: r.element_type,
                  title: r.title || null,
                  content: r.content || {},
                  display_order: idx,
                })),
              )
            }
          } else {
            setSessionTemplateLock({ locked: false })
          }
        } catch (e) {
          console.warn('Template enforcement skipped:', e?.message || e)
          setSessionTemplateLock({ locked: false })
        }
      } else {
        setSessionTemplateLock({ locked: false })
      }

      const [{ data: lessonData }, { data: mapData }, { data: elementData }] = await Promise.all([
        supabase
          .from('class_lessons')
          .select('id, title, unit_number, lesson_number, estimated_minutes, summary, prerequisite_lesson_id, release_mode, release_at, release_condition, status')
          .eq('id', lessonId)
          .single(),
        supabase.from('class_lesson_clos').select('clo_id').eq('lesson_id', lessonId),
        supabase
          .from('class_lesson_elements')
          .select('id, element_type, title, content, display_order')
          .eq('lesson_id', lessonId)
          .order('display_order', { ascending: true }),
      ])

      if (!lessonData) return

      setLessonForm({
        ...emptyLesson,
        ...lessonData,
        release_at: lessonData.release_at ? lessonData.release_at.slice(0, 16) : '',
      })
      setSelectedCloIds((mapData || []).map((m) => m.clo_id))
      setElements((elementData || []).map((e) => ({ ...e, tempId: Math.random().toString(36).slice(2) })))
    } catch (err) {
      console.error(err)
    }
  }

  const handleAddElement = (type) => {
    if (elementsOnly && !selectedLessonId) return
    setElements((prev) => [...prev, createElement(type)])
  }

  const moveElement = (idx, direction) => {
    if (lessonEditBlocked) return
    const to = idx + direction
    if (to < 0 || to >= elements.length) return
    const copy = [...elements]
    const [item] = copy.splice(idx, 1)
    copy.splice(to, 0, item)
    setElements(copy)
  }

  const updateElement = (idx, next) => {
    setElements((prev) => prev.map((el, i) => (i === idx ? { ...el, ...next } : el)))
  }

  const uploadLessonMedia = async (idx, kind, file) => {
    if (!file || !selectedClass?.id) return
    const key = `${kind}-${idx}`
    setLessonMediaUploadKey(key)
    try {
      const rawExt = file.name.includes('.') ? file.name.split('.').pop() : 'bin'
      const ext = String(rawExt).replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'bin'
      const path = `lessons/class_${selectedClass.id}/${kind}_${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from(SUPABASE_STORAGE_BUCKET).upload(path, file)
      if (upErr) throw upErr
      const {
        data: { publicUrl },
      } = supabase.storage.from(SUPABASE_STORAGE_BUCKET).getPublicUrl(path)
      setElements((prev) =>
        prev.map((el, i) => {
          if (i !== idx) return el
          const c = el.content || {}
          if (kind === 'video') {
            return { ...el, content: { ...c, url: publicUrl } }
          }
          return { ...el, content: { ...c, file_url: publicUrl, file_name: file.name } }
        })
      )
    } catch (err) {
      console.error(err)
      alert(t('instructorPortal.lessonMediaUploadFailed', 'Upload failed'))
    } finally {
      setLessonMediaUploadKey(null)
    }
  }

  const saveLessonCloMapping = async (lessonId) => {
    await supabase.from('class_lesson_clos').delete().eq('lesson_id', lessonId)
    if (selectedCloIds.length) {
      const rows = selectedCloIds.map((cloId) => ({ lesson_id: lessonId, clo_id: cloId }))
      const { error } = await supabase.from('class_lesson_clos').insert(rows)
      if (error) throw error
    }
  }

  const saveLessonElementsOnly = async () => {
    if (lessonEditBlocked) return
    if (!selectedClass || !selectedLessonId) return

    setSaving(true)
    try {
      await supabase.from('class_lesson_elements').delete().eq('lesson_id', selectedLessonId)
      if (elements.length) {
        const rows = elements.map((el, index) => ({
          lesson_id: selectedLessonId,
          element_type: el.element_type,
          title: el.title || null,
          content: el.content || {},
          display_order: index,
        }))
        const { error } = await supabase.from('class_lesson_elements').insert(rows)
        if (error) throw error
      }
      await saveLessonCloMapping(selectedLessonId)
      await supabase
        .from('class_lessons')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', selectedLessonId)
      await loadLesson(selectedLessonId)
      alert(t('instructorPortal.saveLessonContentDone', 'Lesson content saved.'))
    } catch (err) {
      console.error(err)
      alert(t('common.error', 'Error'))
    } finally {
      setSaving(false)
    }
  }

  const saveLesson = async (publish = false) => {
    if (elementsOnly) return
    if (!selectedClass || !lessonForm.title.trim()) return

    setSaving(true)
    try {
      const payload = {
        class_id: selectedClass.id,
        subject_id: selectedClass.subject_id,
        title: lessonForm.title.trim(),
        unit_number: Number(lessonForm.unit_number) || 1,
        lesson_number: Number(lessonForm.lesson_number) || 1,
        estimated_minutes: Number(lessonForm.estimated_minutes) || 45,
        summary: lessonForm.summary || null,
        prerequisite_lesson_id: lessonForm.prerequisite_lesson_id || null,
        release_mode: lessonForm.release_mode || 'scheduled',
        release_at: lessonForm.release_at ? new Date(lessonForm.release_at).toISOString() : null,
        release_condition: lessonForm.release_condition || null,
        status: publish ? 'published' : 'draft',
        published_at: publish ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }

      let lessonId = selectedLessonId

      if (lessonId) {
        const { error } = await supabase.from('class_lessons').update(payload).eq('id', lessonId)
        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('class_lessons')
          .insert(payload)
          .select('id')
          .single()
        if (error) throw error
        lessonId = data.id
        setSelectedLessonId(lessonId)
        if (!embedded) {
          setSearchParams((prev) => {
            const next = new URLSearchParams(prev)
            next.set('classId', String(selectedClass.id))
            next.set('lessonId', String(lessonId))
            return next
          }, { replace: true })
        }
      }

      await saveLessonCloMapping(lessonId)

      await supabase.from('class_lesson_elements').delete().eq('lesson_id', lessonId)
      if (elements.length) {
        const rows = elements.map((el, index) => ({
          lesson_id: lessonId,
          element_type: el.element_type,
          title: el.title || null,
          content: el.content || {},
          display_order: index,
        }))
        await supabase.from('class_lesson_elements').insert(rows)
      }

      await loadClassData(selectedClass.id)
      await loadLesson(lessonId)
      alert(publish ? t('instructorPortal.publishLesson') : t('instructorPortal.saveDraft'))
    } catch (err) {
      console.error(err)
      alert(t('common.error', 'Error'))
    } finally {
      setSaving(false)
    }
  }

  const portalClass = `instructor-portal lesson-builder-root${embedded ? ' lesson-builder-embedded' : ''}`

  const listSep = isRTL ? '، ' : ', '
  const splitList = (raw) =>
    String(raw || '')
      .split(/[,،]/g)
      .map((x) => x.trim())
      .filter(Boolean)

  if (loading) {
    return (
      <div className={portalClass} dir={isRTL ? 'rtl' : 'ltr'}>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
          <div
            style={{
              width: 40,
              height: 40,
              border: '3px solid var(--bdr)',
              borderTopColor: 'var(--p)',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className={portalClass} dir={isRTL ? 'rtl' : 'ltr'}>
      {elementsOnly && sessionTemplateLock?.locked && (
        <div className="alert alert-warn" style={{ marginBottom: 16 }}>
          {t(
            'instructorPortal.templateLocked',
            'This lesson is locked to the admin subject template. You can preview it, but cannot edit the content.',
          )}
        </div>
      )}
      {permissionBlocked && (
        <div className="alert alert-warn" style={{ marginBottom: 16 }}>
          {t('instructorPortal.lessonContentPermissionDenied')}
        </div>
      )}

      {!embedded && (
        <>
          <nav className="bc" aria-label={t('instructorPortal.curriculumMap')}>
            <Link to="/dashboard">{t('navigation.dashboard')}</Link>
            <span className="bc-sep">&rsaquo;</span>
            {isAdmin ? (
              <>
                <Link to="/academic/classes">{t('navigation.sessions')}</Link>
                <span className="bc-sep">&rsaquo;</span>
              </>
            ) : (
              <>
                <Link to="/instructor/dashboard">{t('instructorPortal.dashboard')}</Link>
                <span className="bc-sep">&rsaquo;</span>
                <Link to="/instructor/courses">{t('instructorPortal.myCourses')}</Link>
                <span className="bc-sep">&rsaquo;</span>
              </>
            )}
            <span>{isAdmin ? t('navigation.buildLessonsAdmin') : t('instructorPortal.lessonContentOnlyTitle')}</span>
          </nav>

          <div className="ph">
            <div>
              <h1>{isAdmin ? t('instructorPortal.buildInteractiveLesson') : t('instructorPortal.lessonContentOnlyTitle')}</h1>
              <p className="ph-sub">
                {isAdmin ? (
                  <>
                    {selectedClass?.subjects?.code || '-'} -{' '}
                    {t('instructorPortal.unitLessonSubtitle', {
                      unit: lessonForm.unit_number || 1,
                      lesson: lessonForm.lesson_number || 1,
                      title: lessonForm.title || '',
                    })}
                  </>
                ) : (
                  t('instructorPortal.lessonContentOnlySubtitle')
                )}
              </p>
            </div>
            <div className="ph-acts" style={{ gap: 8 }}>
              {isAdmin && (
                <>
                  <span
                    data-status={lessonForm.status === 'published' ? 'active' : 'draft'}
                    className="badge"
                    style={{ fontSize: 13, padding: '6px 14px' }}
                  >
                    {lessonForm.status === 'published' ? t('instructorPortal.badgeActive') : t('instructorPortal.draft')}
                  </span>
                  <Link
                    to={`/instructor/lesson-preview?classId=${selectedClassId || ''}&lessonId=${selectedLessonId || ''}`}
                    className="btn btn-gh"
                  >
                    {t('instructorPortal.preview')}
                  </Link>
                  <button type="button" className="btn btn-ok" onClick={() => saveLesson(true)} disabled={saving}>
                    {t('instructorPortal.publishLesson')}
                  </button>
                </>
              )}
              {elementsOnly && (
                <>
                  <Link
                    to={`/instructor/lesson-preview?classId=${selectedClassId || ''}&lessonId=${selectedLessonId || ''}`}
                    className={`btn btn-gh${!selectedLessonId ? ' disabled' : ''}`}
                    style={!selectedLessonId ? { pointerEvents: 'none', opacity: 0.5 } : undefined}
                  >
                    {t('instructorPortal.preview')}
                  </Link>
                  <button
                    type="button"
                    className="btn btn-ok"
                    onClick={() => saveLessonElementsOnly()}
                    disabled={saving || !selectedLessonId || lessonEditBlocked}
                  >
                    {t('instructorPortal.saveLessonContent')}
                  </button>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {embedded && (
        <div className="ph" style={{ marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 20 }}>{t('instructorPortal.lessonContentOnlyTitle')}</h1>
            <p className="ph-sub">
              {selectedClass?.subjects?.code || '-'} — {t('instructorPortal.section')}{' '}
              {selectedClass?.section}
            </p>
          </div>
          <div className="ph-acts" style={{ gap: 8 }}>
            {selectedLessonId && (
              <span
                data-status={lessonForm.status === 'published' ? 'active' : 'draft'}
                className="badge"
                style={{ fontSize: 13, padding: '6px 14px' }}
              >
                {lessonForm.status === 'published' ? t('instructorPortal.badgeActive') : t('instructorPortal.draft')}
              </span>
            )}
            <Link
              to={`/instructor/lesson-preview?classId=${selectedClassId || ''}&lessonId=${selectedLessonId || ''}`}
              className={`btn btn-gh${!selectedLessonId ? ' disabled' : ''}`}
              style={!selectedLessonId ? { pointerEvents: 'none', opacity: 0.5 } : undefined}
            >
              {t('instructorPortal.preview')}
            </Link>
            <button
              type="button"
              className="btn btn-ok"
              onClick={() => saveLessonElementsOnly()}
              disabled={saving || !selectedLessonId || lessonEditBlocked}
            >
              {t('instructorPortal.saveLessonContent')}
            </button>
          </div>
        </div>
      )}

      <div className="card lb-selector-card" style={{ marginBottom: 16 }}>
        {isAdmin && (
          <div className="lb-selector-row">
            <div className="fg">
              <label className="fl" htmlFor="lb-college">{t('navigation.colleges', 'Colleges')}</label>
              <select
                id="lb-college"
                className="fc"
                value={selectedCollegeId || ''}
                onChange={(e) => {
                  const nextCollegeId = e.target.value ? Number(e.target.value) : null
                  setSelectedCollegeId(nextCollegeId)
                  setSelectedMajorId(null)
                  setSelectedClassId(null)
                  setSelectedLessonId(null)
                  if (!embedded) {
                    setSearchParams((prev) => {
                      const next = new URLSearchParams(prev)
                      next.delete('classId')
                      next.delete('lessonId')
                      return next
                    }, { replace: true })
                  }
                }}
              >
                <option value="">{t('common.select', 'Select')}</option>
                {colleges.map((college) => (
                  <option key={college.id} value={college.id}>
                    {college.code ? `${college.code} - ` : ''}{getLocalizedName(college, language === 'ar')}
                  </option>
                ))}
              </select>
            </div>
            <div className="fg">
              <label className="fl" htmlFor="lb-major">{t('navigation.majors', 'Majors')}</label>
              <select
                id="lb-major"
                className="fc"
                value={selectedMajorId || ''}
                onChange={(e) => {
                  const nextMajorId = e.target.value ? Number(e.target.value) : null
                  setSelectedMajorId(nextMajorId)
                  setSelectedClassId(null)
                  setSelectedLessonId(null)
                  if (!embedded) {
                    setSearchParams((prev) => {
                      const next = new URLSearchParams(prev)
                      next.delete('classId')
                      next.delete('lessonId')
                      return next
                    }, { replace: true })
                  }
                }}
              >
                <option value="">{t('common.select', 'Select')}</option>
                {filteredMajors.map((major) => (
                  <option key={major.id} value={major.id}>
                    {major.code ? `${major.code} - ` : ''}{getLocalizedName(major, language === 'ar')}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
        <div className="lb-selector-row">
          <div className="fg">
            <label className="fl" htmlFor="lb-course">{t('instructorPortal.courseName')}</label>
            <select
              id="lb-course"
              className="fc"
              disabled={lessonEditBlocked || (isAdmin && (!selectedCollegeId || !selectedMajorId))}
              value={selectedClassId || ''}
              onChange={(e) => {
                const id = e.target.value ? Number(e.target.value) : null
                setSelectedClassId(id)
                setSelectedLessonId(null)
                if (!embedded) {
                  setSearchParams((prev) => {
                    const next = new URLSearchParams(prev)
                    if (id) next.set('classId', String(id))
                    else next.delete('classId')
                    next.delete('lessonId')
                    return next
                  }, { replace: true })
                }
              }}
            >
              {isAdmin && <option value="">{t('common.select', 'Select')}</option>}
              {filteredClasses.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.subjects?.code} - {getLocalizedName(cls.subjects, language === 'ar')} ({t('instructorPortal.section')} {cls.section})
                </option>
              ))}
            </select>
          </div>
          <div className="fg">
            <label className="fl" htmlFor="lb-lesson">{t('instructorPortal.lesson', 'Lesson')}</label>
            <select
              id="lb-lesson"
              className="fc"
              disabled={lessonEditBlocked || !selectedClassId}
              value={selectedLessonId || ''}
              onChange={(e) => {
                const v = e.target.value ? Number(e.target.value) : null
                setSelectedLessonId(v)
                if (!embedded) {
                  setSearchParams((prev) => {
                    const next = new URLSearchParams(prev)
                    next.set('classId', String(selectedClassId))
                    if (v) next.set('lessonId', String(v))
                    else next.delete('lessonId')
                    return next
                  }, { replace: true })
                }
              }}
            >
              {isAdmin ? (
                <option value="">{t('common.new', 'New')}</option>
              ) : (
                <option value="">{t('instructorPortal.selectLessonPlaceholder')}</option>
              )}
              {lessons.map((l) => (
                <option key={l.id} value={l.id}>
                  U{l.unit_number} L{l.lesson_number} - {l.title}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {elementsOnly && lessons.length === 0 && selectedClassId && (
        <div className="card" style={{ marginBottom: 16, color: 'var(--muted)' }}>
          {t('instructorPortal.noLessonsContactAdmin')}
        </div>
      )}

      {elementsOnly && !selectedLessonId && lessons.length > 0 && (
        <div className="card" style={{ marginBottom: 16, color: 'var(--muted)' }}>
          {t('instructorPortal.selectLessonToEditElements')}
        </div>
      )}

      {elementsOnly && selectedLessonId && clos.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-hd">
            <div className="card-title">{t('instructorPortal.linkToLearningOutcomes')}</div>
          </div>
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 12px' }}>
            {t('instructorPortal.lessonCloLinkHint')}
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {clos.map((clo) => (
              <label
                key={clo.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 13,
                  cursor: lessonEditBlocked ? 'not-allowed' : 'pointer',
                  opacity: lessonEditBlocked ? 0.6 : 1,
                }}
              >
                <input
                  type="checkbox"
                  style={{ accentColor: 'var(--p)' }}
                  disabled={lessonEditBlocked}
                  checked={selectedCloIds.includes(clo.id)}
                  onChange={(e) => {
                    const checked = e.target.checked
                    setSelectedCloIds((prev) =>
                      checked ? [...prev, clo.id] : prev.filter((id) => id !== clo.id),
                    )
                  }}
                />
                <span style={{ fontWeight: 600 }}>{clo.code}</span>
                {clo.description ? (
                  <span style={{ color: 'var(--muted)', fontSize: 12 }}>— {clo.description}</span>
                ) : null}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="grid2" style={{ alignItems: 'flex-start' }}>
        <div>
          {isAdmin && (
          <div className="card">
            <div className="card-hd"><div className="card-title">{t('instructorPortal.lessonInformation')}</div></div>
            <div className="fg">
              <label className="fl" htmlFor="lesson-title"><span className="req">*</span>{t('instructorPortal.lessonTitle')}</label>
              <input id="lesson-title" type="text" className="fc" value={lessonForm.title} onChange={(e) => setLessonForm((p) => ({ ...p, title: e.target.value }))} />
            </div>
            <div className="fr">
              <div className="fg">
                <label className="fl">{t('instructorPortal.unit')}</label>
                <input type="number" className="fc" min={1} value={lessonForm.unit_number} onChange={(e) => setLessonForm((p) => ({ ...p, unit_number: Number(e.target.value) || 1 }))} />
              </div>
              <div className="fg">
                <label className="fl">{t('instructorPortal.lessonNumber')}</label>
                <input type="number" className="fc" min={1} value={lessonForm.lesson_number} onChange={(e) => setLessonForm((p) => ({ ...p, lesson_number: Number(e.target.value) || 1 }))} />
              </div>
              <div className="fg">
                <label className="fl">{t('instructorPortal.estimatedTimeMinutes')}</label>
                <input type="number" className="fc" min={1} value={lessonForm.estimated_minutes} onChange={(e) => setLessonForm((p) => ({ ...p, estimated_minutes: Number(e.target.value) || 45 }))} />
              </div>
            </div>
            <div className="fg">
              <label className="fl">{t('common.description', 'Description')}</label>
              <textarea className="fc" rows={3} value={lessonForm.summary || ''} onChange={(e) => setLessonForm((p) => ({ ...p, summary: e.target.value }))} />
            </div>
            <div className="fr">
              <div className="fg">
                <label className="fl">{t('instructorPortal.prerequisiteCondition')}</label>
                <select className="fc" value={lessonForm.prerequisite_lesson_id || ''} onChange={(e) => setLessonForm((p) => ({ ...p, prerequisite_lesson_id: e.target.value ? Number(e.target.value) : null }))}>
                  <option value="">{t('instructorPortal.noCondition')}</option>
                  {lessons.filter((l) => l.id !== selectedLessonId).map((l) => (
                    <option key={l.id} value={l.id}>U{l.unit_number} L{l.lesson_number} - {l.title}</option>
                  ))}
                </select>
              </div>
              <div className="fg">
                <label className="fl">{t('instructorPortal.releaseMode', 'Release Mode')}</label>
                <select className="fc" value={lessonForm.release_mode} onChange={(e) => setLessonForm((p) => ({ ...p, release_mode: e.target.value }))}>
                  <option value="immediate">Immediate</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="conditional">Conditional</option>
                </select>
              </div>
            </div>
            {lessonForm.release_mode === 'scheduled' && (
              <div className="fg">
                <label className="fl">{t('instructorPortal.releaseDate', 'Release Date')}</label>
                <input type="datetime-local" className="fc" value={lessonForm.release_at || ''} onChange={(e) => setLessonForm((p) => ({ ...p, release_at: e.target.value }))} />
              </div>
            )}
            {lessonForm.release_mode === 'conditional' && (
              <div className="fg">
                <label className="fl">{t('instructorPortal.condition', 'Condition')}</label>
                <input className="fc" value={lessonForm.release_condition || ''} onChange={(e) => setLessonForm((p) => ({ ...p, release_condition: e.target.value }))} />
              </div>
            )}
            <div className="fg">
              <label className="fl">{t('instructorPortal.linkToLearningOutcomes')}</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {clos.map((clo) => (
                  <label key={clo.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      style={{ accentColor: 'var(--p)' }}
                      checked={selectedCloIds.includes(clo.id)}
                      onChange={(e) => {
                        const checked = e.target.checked
                        setSelectedCloIds((prev) => checked ? [...prev, clo.id] : prev.filter((id) => id !== clo.id))
                      }}
                    />
                    {clo.code}
                  </label>
                ))}
              </div>
            </div>
          </div>
          )}

          <div className="card">
            <div className="card-hd"><div className="card-title">{t('instructorPortal.addLessonElement')}</div></div>
            <div className="lb-element-picker">
              {ELEMENT_TYPES.map((el) => (
                <button
                  key={el.key}
                  type="button"
                  className="btn btn-gh btn-bl lb-element-btn"
                  style={{ padding: 14, flexDirection: 'column', gap: 4, height: 'auto' }}
                  disabled={lessonEditBlocked || (elementsOnly && !selectedLessonId)}
                  onClick={() => handleAddElement(el.key)}
                >
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{el.icon}</span>
                  <span style={{ fontSize: 13 }}>{el.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <div className="card">
            <div className="card-hd">
              <div className="card-title">{t('instructorPortal.lessonContent')}</div>
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>{t('instructorPortal.dragToReorder')}</span>
            </div>

            {elements.map((element, idx) => (
              <div key={element.id || element.tempId} className="lb-block">
                <div className="lb-block-hd">
                  <span className="lb-block-type">
                    {ELEMENT_TYPES.find((x) => x.key === element.element_type)?.icon}{' '}
                    {ELEMENT_TYPES.find((x) => x.key === element.element_type)?.label || element.element_type}
                  </span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="btn btn-gh btn-sm" disabled={lessonEditBlocked} onClick={() => moveElement(idx, -1)}>Up</button>
                    <button type="button" className="btn btn-gh btn-sm" disabled={lessonEditBlocked} onClick={() => moveElement(idx, 1)}>Down</button>
                    <button type="button" className="btn btn-err btn-sm" disabled={lessonEditBlocked} onClick={() => setElements((prev) => prev.filter((_, i) => i !== idx))}>{t('instructorPortal.delete')}</button>
                  </div>
                </div>

                {/* element title (optional for most types) */}
                {!(element.element_type === 'heading' || element.element_type === 'paragraph') && (
                  <div className="fg" style={{ marginBottom: 8 }}>
                    <label className="fl" style={{ fontSize: 12 }}>{t('common.title', 'Title')}</label>
                    <input className="fc" value={element.title || ''} onChange={(e) => updateElement(idx, { title: e.target.value })} />
                  </div>
                )}

                {element.element_type === 'heading' && (
                  <div className="fr">
                    <div className="fg">
                      <label className="fl" style={{ fontSize: 12 }}>Level</label>
                      <select
                        className="fc"
                        disabled={lessonEditBlocked}
                        value={element.content?.level ?? 3}
                        onChange={(e) => updateElement(idx, { content: { ...element.content, level: Number(e.target.value) } })}
                      >
                        <option value={2}>H2</option>
                        <option value={3}>H3</option>
                        <option value={4}>H4</option>
                      </select>
                    </div>
                    <div className="fg">
                      <label className="fl" style={{ fontSize: 12 }}>{t('common.title', 'Title')}</label>
                      <input
                        className="fc"
                        disabled={lessonEditBlocked}
                        value={element.content?.text || ''}
                        onChange={(e) => updateElement(idx, { content: { ...element.content, text: e.target.value } })}
                      />
                    </div>
                  </div>
                )}

                {element.element_type === 'paragraph' && (
                  <textarea
                    className="fc"
                    rows={4}
                    disabled={lessonEditBlocked}
                    value={element.content?.text || ''}
                    onChange={(e) => updateElement(idx, { content: { ...element.content, text: e.target.value } })}
                  />
                )}

                {element.element_type === 'discussion' && (
                  <textarea
                    className="fc"
                    rows={3}
                    disabled={lessonEditBlocked}
                    value={element.content?.text || ''}
                    onChange={(e) => updateElement(idx, { content: { ...element.content, text: e.target.value } })}
                  />
                )}

                {element.element_type === 'code' && (
                  <>
                    <div className="fr">
                      <div className="fg">
                        <label className="fl" style={{ fontSize: 12 }}>Language</label>
                        <select
                          className="fc"
                          disabled={lessonEditBlocked}
                          value={element.content?.language || 'python'}
                          onChange={(e) => updateElement(idx, { content: { ...element.content, language: e.target.value } })}
                        >
                          <option value="python">Python</option>
                          <option value="javascript">JavaScript</option>
                          <option value="typescript">TypeScript</option>
                          <option value="java">Java</option>
                          <option value="csharp">C#</option>
                          <option value="sql">SQL</option>
                          <option value="text">Plain</option>
                        </select>
                      </div>
                      <div className="fg">
                        <label className="fl" style={{ fontSize: 12 }}>Caption (optional)</label>
                        <input
                          className="fc"
                          disabled={lessonEditBlocked}
                          value={element.content?.caption || ''}
                          onChange={(e) => updateElement(idx, { content: { ...element.content, caption: e.target.value } })}
                        />
                      </div>
                    </div>
                    <textarea
                      className="fc"
                      rows={8}
                      style={{ fontFamily: 'monospace', direction: 'ltr', textAlign: 'left' }}
                      disabled={lessonEditBlocked}
                      value={element.content?.code || ''}
                      onChange={(e) => updateElement(idx, { content: { ...element.content, code: e.target.value } })}
                      placeholder="Paste code here..."
                    />
                  </>
                )}

                {element.element_type === 'table' && (
                  <>
                    <div className="fr">
                      <div className="fg">
                        <label className="fl" style={{ fontSize: 12 }}>Caption (optional)</label>
                        <input
                          className="fc"
                          disabled={lessonEditBlocked}
                          value={element.title || ''}
                          onChange={(e) => updateElement(idx, { title: e.target.value })}
                          placeholder="e.g. Time complexity comparison"
                        />
                      </div>
                      <div className="fg">
                        <label className="fl" style={{ fontSize: 12 }}>Columns</label>
                        <input
                          className="fc"
                          disabled={lessonEditBlocked}
                          value={
                            tableHeadersDraft[String(element.id || element.tempId)] ??
                            (element.content?.headers || []).join(listSep)
                          }
                          onChange={(e) => {
                            const raw = e.target.value
                            const draftKey = String(element.id || element.tempId)
                            setTableHeadersDraft((m) => ({ ...(m || {}), [draftKey]: raw }))

                            const headers = splitList(raw)
                            const oldRows = Array.isArray(element.content?.rows) ? element.content.rows : []
                            const nextRows = oldRows.map((r) => {
                              const row = Array.isArray(r) ? r : []
                              const trimmed = row.slice(0, headers.length)
                              while (trimmed.length < headers.length) trimmed.push('')
                              return trimmed
                            })
                            updateElement(idx, { content: { ...element.content, headers, rows: nextRows } })
                          }}
                          onBlur={() => {
                            const draftKey = String(element.id || element.tempId)
                            setTableHeadersDraft((m) => {
                              const next = { ...(m || {}) }
                              delete next[draftKey]
                              return next
                            })
                          }}
                          placeholder={isRTL ? 'الخوارزمية، أفضل، متوسط، أسوأ، الذاكرة' : 'Algorithm, Best, Average, Worst, Memory'}
                        />
                        <div className="fh">Use comma separated names. Rows below will match the number of columns.</div>
                      </div>
                    </div>

                    {Array.isArray(element.content?.headers) && element.content.headers.length > 0 ? (
                      <div style={{ border: '1px solid var(--bdr)', borderRadius: 'var(--rs)', overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 760 }}>
                          <thead>
                            <tr style={{ background: 'var(--p)', color: '#fff' }}>
                              {element.content.headers.map((h, hi) => (
                                <th key={hi} style={{ padding: '10px 12px', textAlign: 'start', whiteSpace: 'nowrap' }}>
                                  {h}
                                </th>
                              ))}
                              <th style={{ padding: '10px 12px', width: 90 }} />
                            </tr>
                          </thead>
                          <tbody>
                            {(Array.isArray(element.content?.rows) ? element.content.rows : []).map((r, ri) => (
                              <tr key={ri} style={{ borderBottom: '1px solid var(--bdr)' }}>
                                {element.content.headers.map((_, ci) => {
                                  const value = (Array.isArray(r) ? r[ci] : '') || ''
                                  return (
                                    <td key={ci} style={{ padding: 10, verticalAlign: 'top' }}>
                                      <input
                                        className="fc"
                                        style={{ padding: '8px 10px', fontSize: 13 }}
                                        disabled={lessonEditBlocked}
                                        value={value}
                                        onChange={(e) => {
                                          const rows = Array.isArray(element.content?.rows) ? [...element.content.rows] : []
                                          const nextRow = Array.isArray(rows[ri]) ? [...rows[ri]] : []
                                          while (nextRow.length < element.content.headers.length) nextRow.push('')
                                          nextRow[ci] = e.target.value
                                          rows[ri] = nextRow
                                          updateElement(idx, { content: { ...element.content, rows } })
                                        }}
                                      />
                                    </td>
                                  )
                                })}
                                <td style={{ padding: 10, verticalAlign: 'top' }}>
                                  <button
                                    type="button"
                                    className="btn btn-err btn-sm"
                                    disabled={lessonEditBlocked}
                                    onClick={() => {
                                      const rows = (Array.isArray(element.content?.rows) ? element.content.rows : []).filter((_, x) => x !== ri)
                                      updateElement(idx, { content: { ...element.content, rows } })
                                    }}
                                  >
                                    Remove
                                  </button>
                                </td>
                              </tr>
                            ))}
                            {(Array.isArray(element.content?.rows) ? element.content.rows : []).length === 0 && (
                              <tr>
                                <td colSpan={element.content.headers.length + 1} style={{ padding: 14, color: 'var(--muted)' }}>
                                  No rows yet. Click “Add row”.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="alert alert-warn" style={{ marginBottom: 0 }}>
                        Add columns first to start editing table rows.
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-gh btn-sm"
                        disabled={lessonEditBlocked || !(Array.isArray(element.content?.headers) && element.content.headers.length)}
                        onClick={() => {
                          const headers = Array.isArray(element.content?.headers) ? element.content.headers : []
                          const nextRow = headers.map(() => '')
                          const rows = Array.isArray(element.content?.rows) ? [...element.content.rows, nextRow] : [nextRow]
                          updateElement(idx, { content: { ...element.content, rows } })
                        }}
                      >
                        + Add row
                      </button>
                      <button
                        type="button"
                        className="btn btn-gh btn-sm"
                        disabled={lessonEditBlocked}
                        onClick={() => {
                          // paste/import fallback: allows quick bulk editing for power users
                          const headers = Array.isArray(element.content?.headers) ? element.content.headers : []
                          const rowsText = prompt('Paste rows. One row per line, use | to separate cells.') || ''
                          if (!rowsText.trim()) return
                          const rows = rowsText
                            .split('\n')
                            .map((ln) => ln.trim())
                            .filter(Boolean)
                            .map((ln) => ln.split('|').map((c) => c.trim()))
                            .map((r) => {
                              const copy = r.slice(0, headers.length)
                              while (copy.length < headers.length) copy.push('')
                              return copy
                            })
                          updateElement(idx, { content: { ...element.content, rows } })
                        }}
                      >
                        Import rows
                      </button>
                    </div>
                  </>
                )}

                {element.element_type === 'interactive_order' && (
                  <>
                    <div className="fg" style={{ marginBottom: 8 }}>
                      <label className="fl" style={{ fontSize: 12 }}>Prompt</label>
                      <input
                        className="fc"
                        disabled={lessonEditBlocked}
                        value={element.content?.prompt || ''}
                        onChange={(e) => updateElement(idx, { content: { ...element.content, prompt: e.target.value } })}
                        placeholder="e.g. Drag the steps to the correct order"
                      />
                    </div>
                    <div className="fg" style={{ marginBottom: 8 }}>
                      <label className="fl" style={{ fontSize: 12 }}>Items (one per line, first line = correct first step)</label>
                      <textarea
                        className="fc"
                        rows={4}
                        disabled={lessonEditBlocked}
                        value={(element.content?.items || []).join('\n')}
                        onChange={(e) => {
                          const items = e.target.value.split('\n').map((x) => x.trim()).filter(Boolean)
                          const correct = items.map((_, i) => i)
                          updateElement(idx, { content: { ...element.content, items, correct_order: correct } })
                        }}
                        placeholder={'Split list into halves\nSort each half\nMerge the sorted halves'}
                      />
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        style={{ accentColor: 'var(--p)' }}
                        disabled={lessonEditBlocked}
                        checked={element.content?.shuffle ?? true}
                        onChange={(e) => updateElement(idx, { content: { ...element.content, shuffle: e.target.checked } })}
                      />
                      Shuffle items for students
                    </label>
                  </>
                )}

                {element.element_type === 'video' && (
                  <div className="fg" style={{ marginBottom: 0 }}>
                    <label className="fl" style={{ fontSize: 12 }}>{t('instructorPortal.uploadLessonVideo')}</label>
                    <input
                      type="file"
                      className="fc"
                      accept="video/*"
                      disabled={lessonEditBlocked || lessonMediaUploadKey === `video-${idx}`}
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        e.target.value = ''
                        if (f) uploadLessonMedia(idx, 'video', f)
                      }}
                    />
                    {element.content?.url && (
                      <div style={{ fontSize: 12, marginTop: 6, wordBreak: 'break-all', color: 'var(--muted)' }}>
                        {element.content.url}
                      </div>
                    )}
                    <label className="fl" style={{ fontSize: 12, marginTop: 10 }}>{t('instructorPortal.orPasteMediaUrl')}</label>
                    <input
                      type="url"
                      className="fc"
                      placeholder="https://"
                      disabled={lessonEditBlocked}
                      value={element.content?.url || ''}
                      onChange={(e) => updateElement(idx, { content: { ...element.content, url: e.target.value } })}
                    />
                    <label className="fl" style={{ fontSize: 12, marginTop: 10 }}>Caption (optional)</label>
                    <input
                      className="fc"
                      disabled={lessonEditBlocked}
                      value={element.content?.caption || ''}
                      onChange={(e) => updateElement(idx, { content: { ...element.content, caption: e.target.value } })}
                    />
                  </div>
                )}

                {element.element_type === 'attachment' && (
                  <div className="fg" style={{ marginBottom: 0 }}>
                    <label className="fl" style={{ fontSize: 12 }}>{t('instructorPortal.uploadLessonAttachment')}</label>
                    <input
                      type="file"
                      className="fc"
                      disabled={lessonMediaUploadKey === `attachment-${idx}`}
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        e.target.value = ''
                        if (f) uploadLessonMedia(idx, 'attachment', f)
                      }}
                    />
                    {(element.content?.file_url || element.content?.file_name) && (
                      <div style={{ fontSize: 12, marginTop: 6, wordBreak: 'break-all', color: 'var(--muted)' }}>
                        {element.content?.file_name || element.content?.file_url}
                      </div>
                    )}
                    <label className="fl" style={{ fontSize: 12, marginTop: 10 }}>{t('instructorPortal.orPasteMediaUrl')}</label>
                    <input
                      type="url"
                      className="fc"
                      placeholder="https://"
                      disabled={lessonEditBlocked}
                      value={element.content?.file_url || ''}
                      onChange={(e) =>
                        updateElement(idx, { content: { ...element.content, file_url: e.target.value, file_name: '' } })
                      }
                    />
                  </div>
                )}

                {(element.element_type === 'quiz' || element.element_type === 'poll') && (
                  <>
                    <input
                      className="fc"
                      placeholder={t('instructorPortal.questionLabel')}
                      disabled={lessonEditBlocked}
                      value={element.content?.question || ''}
                      onChange={(e) => updateElement(idx, { content: { ...element.content, question: e.target.value } })}
                    />
                    <div style={{ marginTop: 10 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                        <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--muted)' }}>Options</div>
                        <button
                          type="button"
                          className="btn btn-gh btn-sm"
                          disabled={lessonEditBlocked}
                          onClick={() => {
                            const options = Array.isArray(element.content?.options) ? [...element.content.options] : []
                            options.push('')
                            updateElement(idx, { content: { ...element.content, options } })
                          }}
                        >
                          + Add option
                        </button>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {(Array.isArray(element.content?.options) ? element.content.options : []).map((opt, oi) => (
                          <div key={oi} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <span style={{ width: 26, textAlign: 'center', fontWeight: 800, color: 'var(--muted)' }}>{oi + 1}</span>
                            <input
                              className="fc"
                              disabled={lessonEditBlocked}
                              value={opt || ''}
                              placeholder={`Option ${oi + 1}`}
                              onChange={(e) => {
                                const options = Array.isArray(element.content?.options) ? [...element.content.options] : []
                                options[oi] = e.target.value
                                updateElement(idx, { content: { ...element.content, options } })
                              }}
                            />
                            <button
                              type="button"
                              className="btn btn-gh btn-sm"
                              disabled={lessonEditBlocked || oi === 0}
                              onClick={() => {
                                const options = Array.isArray(element.content?.options) ? [...element.content.options] : []
                                const tmp = options[oi - 1]
                                options[oi - 1] = options[oi]
                                options[oi] = tmp
                                updateElement(idx, { content: { ...element.content, options } })
                              }}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              className="btn btn-gh btn-sm"
                              disabled={lessonEditBlocked || oi === (Array.isArray(element.content?.options) ? element.content.options.length - 1 : 0)}
                              onClick={() => {
                                const options = Array.isArray(element.content?.options) ? [...element.content.options] : []
                                const tmp = options[oi + 1]
                                options[oi + 1] = options[oi]
                                options[oi] = tmp
                                updateElement(idx, { content: { ...element.content, options } })
                              }}
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              className="btn btn-err btn-sm"
                              disabled={lessonEditBlocked}
                              onClick={() => {
                                const options = (Array.isArray(element.content?.options) ? element.content.options : []).filter((_, x) => x !== oi)
                                updateElement(idx, { content: { ...element.content, options } })
                              }}
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                        {(Array.isArray(element.content?.options) ? element.content.options : []).length === 0 && (
                          <div style={{ fontSize: 13, color: 'var(--muted)' }}>No options yet. Click “Add option”.</div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))}

            {elements.length === 0 && <div style={{ color: 'var(--muted)' }}>{t('instructorPortal.noData', 'No data available')}</div>}

            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              {isAdmin ? (
                <>
                  <button type="button" className="btn btn-gh" onClick={() => saveLesson(false)} disabled={saving}>
                    {t('instructorPortal.saveDraft')}
                  </button>
                  <Link to={`/instructor/lesson-preview?classId=${selectedClassId || ''}&lessonId=${selectedLessonId || ''}`} className="btn btn-out">
                    {t('instructorPortal.preview')}
                  </Link>
                  <button type="button" className="btn btn-ok" onClick={() => saveLesson(true)} disabled={saving}>
                    {t('instructorPortal.publishLesson')}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="btn btn-ok"
                    onClick={() => saveLessonElementsOnly()}
                    disabled={saving || !selectedLessonId || lessonEditBlocked}
                  >
                    {t('instructorPortal.saveLessonContent')}
                  </button>
                  <Link
                    to={`/instructor/lesson-preview?classId=${selectedClassId || ''}&lessonId=${selectedLessonId || ''}`}
                    className={`btn btn-out${!selectedLessonId ? ' disabled' : ''}`}
                    style={!selectedLessonId ? { pointerEvents: 'none', opacity: 0.5 } : undefined}
                  >
                    {t('instructorPortal.preview')}
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
