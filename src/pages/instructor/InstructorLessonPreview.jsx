import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { getLocalizedName } from '../../utils/localizedName'
import { supabase } from '../../lib/supabase'
import { getActiveInstructorByEmail } from '../../utils/getActiveInstructorByEmail'

function normalizeOptions(value) {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') return value.split('\n').map((x) => x.trim()).filter(Boolean)
  return []
}

export default function InstructorLessonPreview() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { language } = useLanguage()
  const [searchParams, setSearchParams] = useSearchParams()

  const [loading, setLoading] = useState(true)
  const [classes, setClasses] = useState([])
  const [selectedClassId, setSelectedClassId] = useState(null)
  const [lessons, setLessons] = useState([])
  const [selectedLessonId, setSelectedLessonId] = useState(null)
  const [lesson, setLesson] = useState(null)
  const [lessonClos, setLessonClos] = useState([])
  const [elements, setElements] = useState([])

  const selectedClass = useMemo(
    () => classes.find((c) => c.id === selectedClassId) || null,
    [classes, selectedClassId]
  )

  useEffect(() => {
    if (!user?.email) return
    loadInstructorClasses()
  }, [user?.email])

  useEffect(() => {
    if (!selectedClassId) return
    loadLessons(selectedClassId)
  }, [selectedClassId])

  useEffect(() => {
    if (!selectedLessonId) {
      setLesson(null)
      setElements([])
      setLessonClos([])
      return
    }
    loadLessonPreview(selectedLessonId)
  }, [selectedLessonId])

  const loadInstructorClasses = async () => {
    setLoading(true)
    try {
      const instructor = await getActiveInstructorByEmail(user.email)

      if (!instructor) {
        setLoading(false)
        return
      }

      const { data: cls } = await supabase
        .from('classes')
        .select('id, section, subject_id, subjects(id, code, name_en, name_ar)')
        .eq('instructor_id', instructor.id)
        .eq('status', 'active')
        .order('id', { ascending: false })

      const list = cls || []
      setClasses(list)

      const queryClassId = Number(searchParams.get('classId'))
      const classId = list.find((c) => c.id === queryClassId)?.id || list[0]?.id || null
      setSelectedClassId(classId)

      if (!classId) setLoading(false)
    } catch (err) {
      console.error(err)
      setLoading(false)
    }
  }

  const loadLessons = async (classId) => {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('class_lessons')
        .select('id, title, unit_number, lesson_number, estimated_minutes, status')
        .eq('class_id', classId)
        .order('unit_number', { ascending: true })
        .order('lesson_number', { ascending: true })

      const list = data || []
      setLessons(list)

      const queryLessonId = Number(searchParams.get('lessonId'))
      const lessonId = list.find((l) => l.id === queryLessonId)?.id || list[0]?.id || null
      setSelectedLessonId(lessonId)

      const next = new URLSearchParams(searchParams)
      next.set('classId', String(classId))
      if (lessonId) {
        next.set('lessonId', String(lessonId))
      } else {
        next.delete('lessonId')
      }
      setSearchParams(next)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const loadLessonPreview = async (lessonId) => {
    setLoading(true)
    try {
      const [{ data: lessonData }, { data: mappingData }, { data: elementsData }] = await Promise.all([
        supabase
          .from('class_lessons')
          .select('id, title, summary, unit_number, lesson_number, estimated_minutes, status')
          .eq('id', lessonId)
          .single(),
        supabase
          .from('class_lesson_clos')
          .select('clo_id, subject_learning_outcomes(id, code, description)')
          .eq('lesson_id', lessonId),
        supabase
          .from('class_lesson_elements')
          .select('id, element_type, title, content, display_order')
          .eq('lesson_id', lessonId)
          .order('display_order', { ascending: true }),
      ])

      setLesson(lessonData || null)
      setLessonClos((mappingData || []).map((m) => m.subject_learning_outcomes).filter(Boolean))
      setElements(elementsData || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const publishLesson = async () => {
    if (!selectedLessonId) return
    await supabase
      .from('class_lessons')
      .update({ status: 'published', published_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', selectedLessonId)
    loadLessonPreview(selectedLessonId)
    loadLessons(selectedClassId)
  }

  const goToLesson = (direction) => {
    if (!lessons.length || !selectedLessonId) return
    const idx = lessons.findIndex((x) => x.id === selectedLessonId)
    const nextIdx = idx + direction
    if (nextIdx < 0 || nextIdx >= lessons.length) return
    const target = lessons[nextIdx]
    setSelectedLessonId(target.id)
    const next = new URLSearchParams(searchParams)
    next.set('classId', String(selectedClassId))
    next.set('lessonId', String(target.id))
    setSearchParams(next)
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
        <div style={{ width: 40, height: 40, border: '3px solid var(--bdr)', borderTopColor: 'var(--p)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    )
  }

  return (
    <>
      <nav className="bc" aria-label={t('instructorPortal.curriculumMap')}>
        <Link to="/instructor/dashboard">{t('instructorPortal.dashboard')}</Link>
        <span className="bc-sep">&rsaquo;</span>
        <Link to="/instructor/courses">{selectedClass?.subjects?.code || t('instructorPortal.myCourses')}</Link>
        <span className="bc-sep">&rsaquo;</span>
        <Link to={`/instructor/build-lessons?classId=${selectedClassId || ''}&lessonId=${selectedLessonId || ''}`}>{t('instructorPortal.buildLesson')}</Link>
        <span className="bc-sep">&rsaquo;</span>
        <span>{t('instructorPortal.previewBreadcrumb')}</span>
      </nav>

      <div className="alert alert-purple">{t('instructorPortal.previewModeAlert')}</div>

      <div className="ph">
        <div>
          <h1>{lesson?.title || t('instructorPortal.buildLesson')}</h1>
          <p className="ph-sub">
            {selectedClass?.subjects?.code || '-'} - {t('instructorPortal.lessonPreviewSubtitle', {
              unit: lesson?.unit_number || 1,
              lesson: lesson?.lesson_number || 1,
              minutes: lesson?.estimated_minutes || 0,
            })}
          </p>
        </div>
        <div className="ph-acts" style={{ gap: 8 }}>
          <select className="fc" style={{ width: 'auto' }} value={selectedClassId || ''} onChange={(e) => setSelectedClassId(Number(e.target.value))}>
            {classes.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.subjects?.code} - {getLocalizedName(cls.subjects, language === 'ar')} ({t('instructorPortal.section')} {cls.section})
              </option>
            ))}
          </select>
          <select className="fc" style={{ width: 'auto' }} value={selectedLessonId || ''} onChange={(e) => setSelectedLessonId(Number(e.target.value))}>
            {lessons.map((l) => (
              <option key={l.id} value={l.id}>U{l.unit_number} L{l.lesson_number} - {l.title}</option>
            ))}
          </select>
          <Link to={`/instructor/build-lessons?classId=${selectedClassId || ''}&lessonId=${selectedLessonId || ''}`} className="btn btn-gh">{t('instructorPortal.backToEdit')}</Link>
          <button type="button" className="btn btn-ok" onClick={publishLesson}>{t('instructorPortal.publishNow')}</button>
        </div>
      </div>

      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <div className="card">
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', padding: 14, background: 'var(--bg)', borderRadius: 'var(--rs)', marginBottom: 20 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{lesson?.title || '-'}</div>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                {lessonClos.map((c) => c.code).join(', ') || t('instructorPortal.noData', 'No data available')}
              </div>
            </div>
          </div>

          {lesson?.summary && (
            <div style={{ fontSize: 15, lineHeight: 1.9, marginBottom: 24, color: 'var(--txt)' }}>
              {lesson.summary}
            </div>
          )}

          {elements.map((element) => {
            const content = element.content || {}

            if (element.element_type === 'heading') {
              const level = Number(content.level || 3)
              const text = content.text || element.title || '-'
              const Tag = level === 2 ? 'h2' : level === 4 ? 'h4' : 'h3'
              return (
                <div key={element.id} style={{ marginBottom: 14 }}>
                  <Tag style={{ fontSize: level === 2 ? 20 : level === 4 ? 15 : 17, fontWeight: 800, color: 'var(--p)', margin: '10px 0 6px' }}>
                    {text}
                  </Tag>
                </div>
              )
            }

            if (element.element_type === 'paragraph' || element.element_type === 'discussion') {
              return (
                <div key={element.id} className="lb-block" style={{ marginBottom: 16 }}>
                  <div className="lb-block-hd"><span className="lb-block-type">{element.element_type}</span></div>
                  {element.title && <div style={{ fontWeight: 700, marginBottom: 8 }}>{element.title}</div>}
                  <div style={{ whiteSpace: 'pre-wrap' }}>{content.text || ''}</div>
                </div>
              )
            }

            if (element.element_type === 'code') {
              return (
                <div key={element.id} style={{ background: '#1e2a3a', borderRadius: 'var(--rs)', padding: 16, marginBottom: 18, color: '#e2e8f0', overflowX: 'auto' }}>
                  {content.caption && <div style={{ color: '#64b5f6', marginBottom: 6, fontWeight: 700 }}>{content.caption}</div>}
                  <pre style={{ margin: 0, direction: 'ltr', textAlign: 'left' }}>
                    <code>{content.code || ''}</code>
                  </pre>
                </div>
              )
            }

            if (element.element_type === 'table') {
              const headers = Array.isArray(content.headers) ? content.headers : []
              const rows = Array.isArray(content.rows) ? content.rows : []
              return (
                <div key={element.id} className="tw" style={{ marginBottom: 18 }}>
                  <table>
                    <thead>
                      <tr>
                        {headers.map((h, i) => (
                          <th key={i}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, ri) => (
                        <tr key={ri}>
                          {(Array.isArray(r) ? r : []).map((cell, ci) => (
                            <td key={ci}>{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            }

            if (element.element_type === 'interactive_order') {
              const items = Array.isArray(content.items) ? content.items : []
              return (
                <div key={element.id} className="interactive-block" style={{ marginBottom: 18 }}>
                  <h4 style={{ fontSize: 15, fontWeight: 800, color: 'var(--info)', marginBottom: 8 }}>
                    🎯 {element.title || 'Interactive exercise'}
                  </h4>
                  {content.prompt && <div style={{ fontSize: 13, color: 'var(--info)', marginBottom: 12 }}>{content.prompt}</div>}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {items.map((it, idx) => (
                      <div key={idx} style={{ background: '#fff', border: '1.5px solid var(--info)', borderRadius: 'var(--rs)', padding: '10px 14px', fontSize: 13 }}>
                        ⠿ {it}
                      </div>
                    ))}
                  </div>
                </div>
              )
            }

            if (element.element_type === 'video') {
              return (
                <div key={element.id} style={{ background: 'var(--bg)', borderRadius: 'var(--r)', padding: 20, marginBottom: 24 }}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>{element.title || 'Video'}</div>
                  <a href={content.url || '#'} target="_blank" rel="noreferrer" className="btn btn-p btn-sm">Open Video</a>
                </div>
              )
            }

            if (element.element_type === 'attachment') {
              return (
                <div key={element.id} style={{ background: 'var(--purple-bg)', border: '1.5px solid var(--purple)', borderRadius: 'var(--r)', padding: 20, marginBottom: 24 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--purple)', marginBottom: 8 }}>{element.title || 'Attachment'}</div>
                  <a href={content.file_url || '#'} target="_blank" rel="noreferrer" className="btn btn-purple btn-sm">{t('instructorPortal.download')}</a>
                </div>
              )
            }

            if (element.element_type === 'quiz' || element.element_type === 'poll') {
              const options = normalizeOptions(content.options)
              return (
                <div key={element.id} style={{ background: element.element_type === 'quiz' ? 'var(--info-bg)' : 'var(--warn-bg)', border: '1.5px solid var(--bdr)', borderRadius: 'var(--r)', padding: 20, marginBottom: 24 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>{element.title || element.element_type}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>{content.question || ''}</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {options.map((opt, idx) => (
                      <div key={idx} className="q-opt"><input type="radio" name={`opt-${element.id}`} /> {opt}</div>
                    ))}
                  </div>
                </div>
              )
            }

            return null
          })}

          {elements.length === 0 && (
            <div style={{ color: 'var(--muted)', marginBottom: 20 }}>{t('instructorPortal.noData', 'No data available')}</div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 16, borderTop: '1px solid var(--bdr)' }}>
            <button type="button" className="btn btn-gh" onClick={() => goToLesson(-1)}>{t('instructorPortal.previousLesson')}</button>
            <button type="button" className="btn btn-p" onClick={() => goToLesson(1)}>{t('instructorPortal.completeLesson')}</button>
          </div>
        </div>
      </div>
    </>
  )
}
