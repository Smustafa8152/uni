import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { getLocalizedName } from '../../utils/localizedName'
import { supabase, SUPABASE_STORAGE_BUCKET } from '../../lib/supabase'
import { QUESTION_TYPE_OPTIONS } from '../../constants/questionTypes'
import { RUBRIC_CATALOG_FALLBACK } from '../../constants/instructorRubricCatalog'
import { INSTRUCTOR_SEMESTER_SELECT } from '../../utils/instructorSemesters'
import { getActiveInstructorByEmail } from '../../utils/getActiveInstructorByEmail'
import { computeAssessmentWeightTotal } from '../../utils/assessmentWeights'

const defaultExamForm = {
  title: '',
  exam_type: 'midterm',
  total_points: 50,
  weight_percentage: 30,
  start_datetime: '',
  end_datetime: '',
  duration_minutes: 90,
  max_attempts: 1,
  instructions: '',
  shuffle_questions: true,
  shuffle_answers: true,
  randomize_from_bank: false,
  result_visibility: 'after_window',
  late_policy: 'deduct_10_daily',
  assessment_file_url: '',
  assessment_file_name: '',
  rubric_id: '',
}

const defaultOptions = ['Option 1', 'Option 2', 'Option 3', 'Option 4']
const DEFAULT_ORDER_ITEMS = ['Item 1', 'Item 2', 'Item 3']

function getDefaultQuestionForm() {
  return {
    question_type: 'multiple_choice',
    question_text: '',
    marks: 5,
    options: [...defaultOptions],
    correct_answer: 0,
  }
}

const defaultQuestionForm = getDefaultQuestionForm()

const ASSESSMENT_TYPES = [
  { value: 'practice_quiz', key: 'practiceTest' },
  { value: 'short_quiz', key: 'shortQuizGraded' },
  { value: 'assignment', key: 'assignmentFileRubric' },
  { value: 'midterm', key: 'midtermExam' },
  { value: 'final', key: 'finalExam' },
  { value: 'oral', key: 'oralDiscussion' },
]

function toDateParts(start, end) {
  if (!start) return { date: null, startTime: null, endTime: null }
  const startDate = new Date(start)
  const endDate = end ? new Date(end) : null
  return {
    date: startDate.toISOString().slice(0, 10),
    startTime: startDate.toTimeString().slice(0, 8),
    endTime: endDate ? endDate.toTimeString().slice(0, 8) : null,
  }
}

function fromDateParts(date, time) {
  if (!date || !time) return null
  return `${date}T${time}`
}

function parseOptions(text) {
  return text
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean)
}

function questionTypeLabel(t, type) {
  const opt = QUESTION_TYPE_OPTIONS.find((o) => o.value === type)
  return opt ? t(`instructorPortal.${opt.key}`) : t('instructorPortal.multipleChoice')
}

function usesLongQuestionPrompt(type) {
  return ['matching', 'essay', 'short_answer', 'fill_blank', 'numeric', 'file_upload', 'order'].includes(type)
}

function questionPromptPlaceholder(t, type) {
  if (type === 'matching') return t('instructorPortal.matchingPairsHint')
  if (type === 'fill_blank') return t('instructorPortal.fillBlankPlaceholderHint')
  if (type === 'order') return t('instructorPortal.orderPlaceholderHint')
  if (type === 'numeric') return t('instructorPortal.numericPlaceholderHint')
  if (type === 'file_upload') return t('instructorPortal.fileUploadPlaceholderHint')
  return t('instructorPortal.optionFocus')
}

export default function InstructorAssessmentAuthoring({ embedded = false, embedClassId = null } = {}) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { language } = useLanguage()
  const [searchParams] = useSearchParams()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [platformUserId, setPlatformUserId] = useState(null)
  const [classes, setClasses] = useState([])
  const [selectedClassId, setSelectedClassId] = useState(null)
  const [exams, setExams] = useState([])
  const [selectedExamId, setSelectedExamId] = useState(null)
  const [examForm, setExamForm] = useState(defaultExamForm)
  const [examQuestions, setExamQuestions] = useState([])
  const [questionForm, setQuestionForm] = useState(defaultQuestionForm)
  const [questionBank, setQuestionBank] = useState([])
  const [activeTab, setActiveTab] = useState('manual')
  const [assessmentFileUploading, setAssessmentFileUploading] = useState(false)
  const [rubricRows, setRubricRows] = useState([])
  const [rubricsLoaded, setRubricsLoaded] = useState(false)
  const [clos, setClos] = useState([])
  const [selectedCloIds, setSelectedCloIds] = useState([])

  const selectedClass = useMemo(
    () => classes.find((c) => c.id === selectedClassId) || null,
    [classes, selectedClassId]
  )

  const subjectCode = selectedClass?.subjects?.code || 'ENG101'
  const semesterLabel = selectedClass?.semesters
    ? getLocalizedName(selectedClass.semesters, language === 'ar')
    : ''

  const weightValidation = useMemo(
    () =>
      computeAssessmentWeightTotal(exams, {
        editingId: selectedExamId,
        draftWeight: examForm.weight_percentage,
      }),
    [exams, selectedExamId, examForm.weight_percentage],
  )

  const questionStats = useMemo(() => {
    const totalQuestions = examQuestions.length
    const manualMarks = examQuestions
      .filter((q) => q.question_type === 'essay' || q.question_type === 'short_answer')
      .reduce((acc, q) => acc + Number(q.marks || 0), 0)
    const totalMarks = examQuestions.reduce((acc, q) => acc + Number(q.marks || 0), 0)
    return {
      totalQuestions,
      totalMarks,
      manualMarks,
      autoMarks: totalMarks - manualMarks,
      gap: Number(examForm.total_points || 0) - totalMarks,
    }
  }, [examQuestions, examForm.total_points])

  useEffect(() => {
    if (!user?.email) return
    initialize()
  }, [user?.email])

  useEffect(() => {
    supabase
      .from('rubrics')
      .select('code, name_en, name_ar')
      .eq('is_active', true)
      .order('name_en')
      .then(({ data, error }) => {
        if (!error && data?.length) setRubricRows(data)
        setRubricsLoaded(true)
      })
  }, [])

  useEffect(() => {
    if (!selectedClassId) return
    loadExams(selectedClassId)
  }, [selectedClassId])

  useEffect(() => {
    const subjectId = selectedClass?.subject_id
    if (!subjectId) {
      setClos([])
      return
    }
    supabase
      .from('subject_learning_outcomes')
      .select('id, code, description')
      .eq('subject_id', subjectId)
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .order('id', { ascending: true })
      .then(({ data }) => setClos(data || []))
  }, [selectedClass?.subject_id])

  useEffect(() => {
    if (selectedClassId && classes.length) {
      const classObj = classes.find((c) => c.id === selectedClassId)
      if (classObj?.subject_id) {
        supabase
          .from('subject_question_bank')
          .select('id, question_text, question_type, difficulty_level, estimated_marks, options, correct_answers')
          .eq('subject_id', classObj.subject_id)
          .eq('is_active', true)
          .order('id', { ascending: false })
          .limit(200)
          .then(({ data }) => setQuestionBank(data || []))
      }
    }
  }, [selectedClassId, classes])

  useEffect(() => {
    if (!selectedExamId) {
      setExamForm(defaultExamForm)
      setExamQuestions([])
      setSelectedCloIds([])
      return
    }
    loadExamWithQuestions(selectedExamId)
  }, [selectedExamId])

  const initialize = async () => {
    setLoading(true)
    try {
      const [{ data: instructor }, { data: userRow }] = await Promise.all([
        getActiveInstructorByEmail(user.email),
        supabase.from('users').select('id').eq('email', user.email).maybeSingle(),
      ])

      setPlatformUserId(userRow?.id || null)

      if (!instructor) {
        setLoading(false)
        return
      }

      const { data: cls } = await supabase
        .from('classes')
        .select(`id, section, subject_id, subjects(id, code, name_en, name_ar), semesters(${INSTRUCTOR_SEMESTER_SELECT})`)
        .eq('instructor_id', instructor.id)
        .eq('status', 'active')
        .order('id', { ascending: false })

      const list = cls || []
      setClasses(list)

      const queryClassId = embedded && embedClassId ? embedClassId : Number(searchParams.get('classId'))
      const classId = list.find((c) => c.id === queryClassId)?.id || list[0]?.id || null
      setSelectedClassId(classId)

      const queryExamId = Number(searchParams.get('examId'))
      if (classId && queryExamId) setSelectedExamId(queryExamId)

      if (!classId) setLoading(false)
    } catch (err) {
      console.error(err)
      setLoading(false)
    }
  }

  const loadExams = async (classId) => {
    try {
      const { data } = await supabase
        .from('subject_exams')
        .select('id, title, status, created_at, weight_percentage')
        .eq('class_id', classId)
        .order('created_at', { ascending: false })

      setExams(data || [])

      const queryExamId = Number(searchParams.get('examId'))
      const examId = (data || []).find((e) => e.id === queryExamId)?.id || null
      if (examId) setSelectedExamId(examId)
    } catch (err) {
      console.error(err)
    }
  }

  const loadExamWithQuestions = async (examId) => {
    setLoading(true)
    try {
      const [{ data: exam }, { data: questions }, { data: cloMap }] = await Promise.all([
        supabase
          .from('subject_exams')
          .select('id, title, exam_type, total_points, weight_percentage, scheduled_date, start_time, end_time, duration_minutes, instructions, assessment_settings')
          .eq('id', examId)
          .single(),
        supabase
          .from('subject_exam_questions')
          .select('id, question_bank_id, question_order, question_type, question_text, options, correct_answers, marks, source')
          .eq('subject_exam_id', examId)
          .order('question_order', { ascending: true }),
        supabase.from('subject_exam_clos').select('clo_id').eq('subject_exam_id', examId),
      ])

      if (!exam) {
        setLoading(false)
        return
      }

      const start = fromDateParts(exam.scheduled_date, exam.start_time)
      const end = fromDateParts(exam.scheduled_date, exam.end_time)
      const settings = exam.assessment_settings || {}

      setExamForm({
        ...defaultExamForm,
        title: exam.title || '',
        exam_type: exam.exam_type || 'midterm',
        total_points: Number(exam.total_points || 0),
        weight_percentage: Number(exam.weight_percentage || 0),
        start_datetime: start || '',
        end_datetime: end || '',
        duration_minutes: Number(exam.duration_minutes || 90),
        instructions: exam.instructions || '',
        max_attempts: Number(settings.max_attempts || 1),
        shuffle_questions: settings.shuffle_questions ?? true,
        shuffle_answers: settings.shuffle_answers ?? true,
        randomize_from_bank: settings.randomize_from_bank ?? false,
        result_visibility: settings.result_visibility || 'after_window',
        late_policy: settings.late_policy || 'deduct_10_daily',
        assessment_file_url: settings.assessment_file_url || '',
        assessment_file_name: settings.assessment_file_name || '',
        rubric_id: settings.rubric_id || '',
      })

      setExamQuestions(
        (questions || []).map((q) => ({
          ...q,
          options: Array.isArray(q.options) ? q.options : [],
          correct_answers: Array.isArray(q.correct_answers) ? q.correct_answers : [],
          marks: Number(q.marks || 0),
        }))
      )
      setSelectedCloIds((cloMap || []).map((m) => m.clo_id))
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const createNewAssessment = () => {
    setSelectedExamId(null)
    setExamForm(defaultExamForm)
    setExamQuestions([])
    setSelectedCloIds([])
  }

  const saveAssessment = async () => {
    if (!selectedClass || !platformUserId || !examForm.title.trim()) return
    if (weightValidation.exceeds) {
      alert(
        t('instructorPortal.assessmentWeightExceeded', {
          total: weightValidation.total,
          defaultValue: `Total assessment weight is ${weightValidation.total}% — it cannot exceed 100%.`,
        }),
      )
      return
    }

    setSaving(true)
    try {
      const start = examForm.start_datetime ? new Date(examForm.start_datetime) : new Date()
      const end = examForm.end_datetime ? new Date(examForm.end_datetime) : new Date(start.getTime() + 2 * 60 * 60 * 1000)

      const payload = {
        subject_id: selectedClass.subject_id,
        class_id: selectedClass.id,
        title: examForm.title.trim(),
        exam_type: examForm.exam_type,
        total_points: Number(examForm.total_points || 0),
        weight_percentage: Number(examForm.weight_percentage || 0),
        scheduled_date: start.toISOString().slice(0, 10),
        start_time: start.toTimeString().slice(0, 8),
        end_time: end.toTimeString().slice(0, 8),
        duration_minutes: Number(examForm.duration_minutes || 0),
        instructions: examForm.instructions || null,
        status: 'EX_DRF',
        assessment_settings: {
          max_attempts: Number(examForm.max_attempts || 1),
          shuffle_questions: !!examForm.shuffle_questions,
          shuffle_answers: !!examForm.shuffle_answers,
          randomize_from_bank: !!examForm.randomize_from_bank,
          result_visibility: examForm.result_visibility,
          late_policy: examForm.late_policy,
          assessment_file_url: examForm.assessment_file_url || null,
          assessment_file_name: examForm.assessment_file_name || null,
          rubric_id: examForm.rubric_id || null,
        },
      }

      let examId = selectedExamId
      if (examId) {
        await supabase.from('subject_exams').update(payload).eq('id', examId)
      } else {
        const { data } = await supabase
          .from('subject_exams')
          .insert({ ...payload, created_by: platformUserId })
          .select('id')
          .single()
        examId = data?.id
        setSelectedExamId(examId)
      }

      if (examId) {
        await supabase.from('subject_exam_questions').delete().eq('subject_exam_id', examId)
        if (examQuestions.length) {
          const rows = examQuestions.map((q, idx) => ({
            subject_exam_id: examId,
            question_bank_id: q.question_bank_id || null,
            question_order: idx + 1,
            question_type: q.question_type,
            question_text: q.question_text,
            options: q.options || [],
            correct_answers: q.correct_answers || [],
            marks: Number(q.marks || 0),
            source: q.source || 'manual',
          }))
          await supabase.from('subject_exam_questions').insert(rows)
        }

        await supabase.from('subject_exam_clos').delete().eq('subject_exam_id', examId)
        if (selectedCloIds.length) {
          await supabase.from('subject_exam_clos').insert(
            selectedCloIds.map((cloId) => ({ subject_exam_id: examId, clo_id: cloId })),
          )
        }
      }

      await loadExams(selectedClass.id)
      if (examId) await loadExamWithQuestions(examId)
    } catch (err) {
      console.error(err)
      alert(t('common.error', 'Error'))
    } finally {
      setSaving(false)
    }
  }

  const publishAssessment = async () => {
    if (!selectedClass || !platformUserId || !examForm.title.trim()) return
    if (weightValidation.exceeds) {
      alert(
        t('instructorPortal.assessmentWeightExceeded', {
          total: weightValidation.total,
          defaultValue: `Total assessment weight is ${weightValidation.total}% — it cannot exceed 100%.`,
        }),
      )
      return
    }
    setSaving(true)
    try {
      // First save (ensures questions exist)
      await saveAssessment()
      if (!selectedExamId) return

      const start = examForm.start_datetime ? new Date(examForm.start_datetime) : new Date()
      const end = examForm.end_datetime ? new Date(examForm.end_datetime) : new Date(start.getTime() + (Number(examForm.duration_minutes || 90) * 60 * 1000))
      const now = new Date()
      const nextStatus = now >= start && now <= end ? 'EX_OPN' : 'EX_SCH'
      const payload = {
        status: nextStatus,
        published_at: new Date().toISOString(),
        opened_at: nextStatus === 'EX_OPN' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }

      await supabase.from('subject_exams').update(payload).eq('id', selectedExamId)
      await loadExams(selectedClass.id)
      await loadExamWithQuestions(selectedExamId)
      alert(t('instructorPortal.publishLesson', 'Published'))
    } catch (err) {
      console.error(err)
      alert(t('common.error', 'Error'))
    } finally {
      setSaving(false)
    }
  }

  const uploadAssessmentFile = async (file) => {
    if (!file || !selectedClass) return
    setAssessmentFileUploading(true)
    try {
      const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin'
      const filePath = `assessments/class_${selectedClass.id}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from(SUPABASE_STORAGE_BUCKET).upload(filePath, file)
      if (upErr) throw upErr
      const {
        data: { publicUrl },
      } = supabase.storage.from(SUPABASE_STORAGE_BUCKET).getPublicUrl(filePath)
      setExamForm((p) => ({ ...p, assessment_file_url: publicUrl, assessment_file_name: file.name }))
    } catch (err) {
      console.error(err)
      alert(t('common.error', 'Upload failed'))
    } finally {
      setAssessmentFileUploading(false)
    }
  }

  const addManualQuestion = () => {
    if (!questionForm.question_text.trim()) return

    const options = Array.isArray(questionForm.options) && questionForm.options.length > 0
      ? questionForm.options.map((o) => (typeof o === 'string' ? o.trim() : '')).filter(Boolean)
      : parseOptions(questionForm.options_text || '')
    if (questionForm.question_type === 'matching') {
      // pairs live in question_text only
    } else if (
      (questionForm.question_type === 'multiple_choice' || questionForm.question_type === 'true_false') &&
      options.length === 0
    ) {
      return
    } else if (questionForm.question_type === 'order' && options.length < 2) {
      return
    }

    const qt = questionForm.question_type
    let correct_answers = []
    if (qt === 'essay' || qt === 'short_answer') {
      correct_answers = []
    } else if (qt === 'order') {
      correct_answers = options.map((_, i) => i)
    } else if (qt === 'matching' || qt === 'fill_blank' || qt === 'numeric' || qt === 'file_upload') {
      correct_answers = []
    } else {
      correct_answers = [Number(questionForm.correct_answer || 0)]
    }

    setExamQuestions((prev) => [
      ...prev,
      {
        id: `tmp-${Date.now()}`,
        source: 'manual',
        question_type: qt,
        question_text: questionForm.question_text.trim(),
        options,
        correct_answers,
        marks: Number(questionForm.marks || 0),
      },
    ])

    setQuestionForm(getDefaultQuestionForm())
  }

  const addOption = () => {
    const opts = Array.isArray(questionForm.options) ? questionForm.options : []
    setQuestionForm((p) => ({
      ...p,
      options: [...opts, `Option ${opts.length + 1}`],
    }))
  }

  const updateOption = (index, value) => {
    setQuestionForm((p) => {
      const opts = [...(p.options || [])]
      opts[index] = value
      return { ...p, options: opts }
    })
  }

  const removeOption = (index) => {
    setQuestionForm((p) => {
      const opts = (p.options || []).filter((_, i) => i !== index)
      let correct = Number(p.correct_answer || 0)
      if (correct >= opts.length) correct = Math.max(0, opts.length - 1)
      else if (correct >= index && correct > 0) correct -= 1
      return { ...p, options: opts, correct_answer: correct }
    })
  }

  const addFromBank = (q) => {
    const opts = Array.isArray(q.options) ? q.options : []
    setExamQuestions((prev) => [
      ...prev,
      {
        id: `bank-${q.id}-${Date.now()}`,
        question_bank_id: q.id,
        source: 'bank',
        question_type: q.question_type,
        question_text: q.question_text,
        options: opts,
        correct_answers: Array.isArray(q.correct_answers) ? q.correct_answers : [],
        marks: Number(q.estimated_marks || 1),
      },
    ])
  }

  const removeQuestion = (idx) => {
    setExamQuestions((prev) => prev.filter((_, i) => i !== idx))
  }

  if (loading && !selectedClass) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
        <div style={{ width: 40, height: 40, border: '3px solid var(--bdr)', borderTopColor: 'var(--p)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    )
  }

  return (
    <>
      {!embedded && (
        <>
          <nav className="bc" aria-label={t('instructorPortal.dashboard')}>
            <Link to="/instructor/dashboard">{t('instructorPortal.dashboard')}</Link>
            <span className="bc-sep">›</span>
            <Link to={`/instructor/assessments?classId=${selectedClassId || ''}`}>{subjectCode}</Link>
            <span className="bc-sep">›</span>
            <span>{t('instructorPortal.createAssessments')}</span>
          </nav>

          <div className="ph">
            <div>
              <h1>{t('instructorPortal.createNewAssessment')}</h1>
              <p className="ph-sub">
                {subjectCode} — {semesterLabel || ''}
              </p>
            </div>
            <div className="ph-acts">
              {classes.length > 1 && (
                <select
                  className="fc"
                  style={{ width: 'auto' }}
                  value={selectedClassId || ''}
                  onChange={(e) => {
                    setSelectedClassId(Number(e.target.value))
                    setSelectedExamId(null)
                    setExamForm(defaultExamForm)
                    setExamQuestions([])
                    setSelectedCloIds([])
                  }}
                >
                  {classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.subjects?.code} — {t('instructorPortal.section')} {cls.section} —{' '}
                      {getLocalizedName(cls.semesters || {}, language === 'ar') ||
                        getLocalizedName(cls.subjects, language === 'ar')}
                    </option>
                  ))}
                </select>
              )}
              {exams.length > 0 && (
                <select
                  className="fc"
                  style={{ width: 'auto' }}
                  value={selectedExamId || ''}
                  onChange={(e) => setSelectedExamId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">— {t('instructorPortal.createNewAssessment')} —</option>
                  {exams.map((exam) => (
                    <option key={exam.id} value={exam.id}>
                      {exam.title}
                    </option>
                  ))}
                </select>
              )}
              <button type="button" className="btn btn-gh" onClick={saveAssessment} disabled={saving || weightValidation.exceeds}>
                💾 {t('instructorPortal.saveDraft')}
              </button>
              <button type="button" className="btn btn-ok" onClick={publishAssessment} disabled={saving || !examForm.title.trim() || weightValidation.exceeds}>
                🚀 {t('instructorPortal.publishLesson', 'Publish')}
              </button>
              <Link
                to={`/instructor/exam-settings?classId=${selectedClassId || ''}&examId=${selectedExamId || ''}`}
                className="btn btn-p"
              >
                {t('instructorPortal.nextExamSettings')} ←
              </Link>
            </div>
          </div>

          {selectedClass?.semesters &&
            (selectedClass.semesters.status === 'draft' || selectedClass.semesters.status === 'archived') && (
              <div className="alert alert-warn" role="status" style={{ marginBottom: 16 }}>
                {selectedClass.semesters.status === 'draft'
                  ? t('instructorPortal.semesterLifecycle.bannerDraft')
                  : t('instructorPortal.semesterLifecycle.bannerArchived')}
              </div>
            )}
        </>
      )}

      {embedded && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-hd">
            <div className="card-title">{t('instructorPortal.createNewAssessment')}</div>
            <div className="ph-acts" style={{ margin: 0, flexWrap: 'wrap', gap: 8 }}>
              {classes.length > 1 && (
                <select
                  className="fc"
                  style={{ width: 'auto' }}
                  value={selectedClassId || ''}
                  onChange={(e) => {
                    setSelectedClassId(Number(e.target.value))
                    setSelectedExamId(null)
                    setExamForm(defaultExamForm)
                    setExamQuestions([])
                    setSelectedCloIds([])
                  }}
                >
                  {classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.subjects?.code} — {t('instructorPortal.section')} {cls.section} —{' '}
                      {getLocalizedName(cls.semesters || {}, language === 'ar') ||
                        getLocalizedName(cls.subjects, language === 'ar')}
                    </option>
                  ))}
                </select>
              )}
              {exams.length > 0 && (
                <select
                  className="fc"
                  style={{ width: 'auto' }}
                  value={selectedExamId || ''}
                  onChange={(e) => setSelectedExamId(e.target.value ? Number(e.target.value) : null)}
                >
                  <option value="">— {t('instructorPortal.createNewAssessment')} —</option>
                  {exams.map((exam) => (
                    <option key={exam.id} value={exam.id}>
                      {exam.title}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid2">
        <div>
          <div className="card">
            <div className="card-hd">
              <div className="card-title">📋 {t('instructorPortal.assessmentInfo')}</div>
            </div>
            <div className="fg">
              <label className="fl" htmlFor="assess-title">
                <span className="req">*</span>
                {t('instructorPortal.assessmentTitle')}
              </label>
              <input
                id="assess-title"
                type="text"
                className="fc"
                placeholder={t('instructorPortal.upcomingMidterm')}
                value={examForm.title}
                onChange={(e) => setExamForm((p) => ({ ...p, title: e.target.value }))}
              />
            </div>
            <div className="fg">
              <label className="fl">{t('instructorPortal.assessmentType')}</label>
              <select
                className="fc"
                value={examForm.exam_type}
                onChange={(e) => {
                  const v = e.target.value
                  setExamForm((p) => ({
                    ...p,
                    exam_type: v,
                    ...(v !== 'assignment' ? { assessment_file_url: '', assessment_file_name: '' } : {}),
                  }))
                }}
              >
                {ASSESSMENT_TYPES.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {t(`instructorPortal.${opt.key}`)}
                  </option>
                ))}
              </select>
            </div>
            {clos.length > 0 && (
              <div className="fg">
                <label className="fl">{t('instructorPortal.linkToLearningOutcomes')}</label>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>
                  {t('instructorPortal.assessmentCloLinkHint')}
                </p>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {clos.map((clo) => (
                    <label key={clo.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        style={{ accentColor: 'var(--p)' }}
                        checked={selectedCloIds.includes(clo.id)}
                        onChange={(e) => {
                          const checked = e.target.checked
                          setSelectedCloIds((prev) =>
                            checked ? [...prev, clo.id] : prev.filter((id) => id !== clo.id),
                          )
                        }}
                      />
                      {clo.code}
                    </label>
                  ))}
                </div>
              </div>
            )}
            {examForm.exam_type === 'assignment' && (
              <div className="fg">
                <label className="fl">{t('instructorPortal.assignmentUploadFile')}</label>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>{t('instructorPortal.assignmentUploadHint')}</p>
                <input
                  type="file"
                  className="fc"
                  disabled={assessmentFileUploading || !selectedClass}
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) uploadAssessmentFile(f)
                    e.target.value = ''
                  }}
                />
                {assessmentFileUploading && (
                  <div style={{ fontSize: 13, marginTop: 8 }}>{t('instructorPortal.uploadingFile')}</div>
                )}
                {examForm.assessment_file_url && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                    <a href={examForm.assessment_file_url} target="_blank" rel="noopener noreferrer" className="btn btn-gh btn-sm">
                      {examForm.assessment_file_name || t('instructorPortal.assignmentUploadFile')}
                    </a>
                    <button
                      type="button"
                      className="btn btn-err btn-sm"
                      onClick={() => setExamForm((p) => ({ ...p, assessment_file_url: '', assessment_file_name: '' }))}
                    >
                      {t('instructorPortal.removeUploadedFile')}
                    </button>
                  </div>
                )}
              </div>
            )}
            <div className="fr">
              <div className="fg">
                <label className="fl">{t('instructorPortal.totalMarks')}</label>
                <input
                  type="number"
                  className="fc"
                  value={examForm.total_points}
                  onChange={(e) => setExamForm((p) => ({ ...p, total_points: Number(e.target.value) || 0 }))}
                />
              </div>
              <div className="fg">
                <label className="fl">{t('instructorPortal.weightInCourse')}</label>
                <input
                  type="number"
                  className="fc"
                  min={0}
                  max={100}
                  value={examForm.weight_percentage}
                  onChange={(e) => {
                    const raw = Number(e.target.value)
                    const next = Number.isFinite(raw) ? Math.min(100, Math.max(0, raw)) : 0
                    setExamForm((p) => ({ ...p, weight_percentage: next }))
                  }}
                />
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: -8, marginBottom: 8 }}>
              {t('instructorPortal.assessmentWeightTotal', {
                total: weightValidation.total,
                remaining: weightValidation.remaining,
                defaultValue: `Total configured: ${weightValidation.total}% (${weightValidation.remaining}% remaining)`,
              })}
            </div>
            {weightValidation.exceeds && (
              <div className="alert alert-warn" role="alert" style={{ marginBottom: 12 }}>
                ⚠️{' '}
                {t('instructorPortal.assessmentWeightExceeded', {
                  total: weightValidation.total,
                  defaultValue: `Total assessment weight is ${weightValidation.total}% — it cannot exceed 100%. Reduce weights before saving.`,
                })}
              </div>
            )}
            <div className="fr">
              <div className="fg">
                <label className="fl">{t('instructorPortal.startDate')}</label>
                <input
                  type="datetime-local"
                  className="fc"
                  value={examForm.start_datetime}
                  onChange={(e) => setExamForm((p) => ({ ...p, start_datetime: e.target.value }))}
                />
              </div>
              <div className="fg">
                <label className="fl">{t('instructorPortal.endDate')}</label>
                <input
                  type="datetime-local"
                  className="fc"
                  value={examForm.end_datetime}
                  onChange={(e) => setExamForm((p) => ({ ...p, end_datetime: e.target.value }))}
                />
              </div>
            </div>
            <div className="fr">
              <div className="fg">
                <label className="fl">{t('instructorPortal.durationMinutes')}</label>
                <input
                  type="number"
                  className="fc"
                  value={examForm.duration_minutes}
                  onChange={(e) => setExamForm((p) => ({ ...p, duration_minutes: Number(e.target.value) || 0 }))}
                />
              </div>
              <div className="fg">
                <label className="fl">{t('instructorPortal.maxAttemptsAllowed')}</label>
                <input
                  type="number"
                  className="fc"
                  value={examForm.max_attempts}
                  onChange={(e) => setExamForm((p) => ({ ...p, max_attempts: Number(e.target.value) || 1 }))}
                />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-hd">
              <div className="card-title">📐 {t('instructorPortal.rubricAttachSectionTitle')}</div>
            </div>
            <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>{t('instructorPortal.rubricAttachHelp')}</p>
            <div className="fg" style={{ marginBottom: 0 }}>
              <label className="fl" htmlFor="assess-rubric">
                {t('instructorPortal.attachRubric')}
              </label>
              <select
                id="assess-rubric"
                className="fc"
                value={examForm.rubric_id}
                onChange={(e) => setExamForm((p) => ({ ...p, rubric_id: e.target.value }))}
              >
                {rubricsLoaded && rubricRows.length > 0
                  ? [
                      <option key="rubric-none" value="">
                        {t('instructorPortal.rubricOptionNone')}
                      </option>,
                      ...rubricRows.map((r) => (
                        <option key={r.code} value={r.code}>
                          {language === 'ar' && r.name_ar ? r.name_ar : r.name_en}
                        </option>
                      )),
                    ]
                  : RUBRIC_CATALOG_FALLBACK.map((r) => (
                      <option key={r.id || 'none'} value={r.id}>
                        {t(`instructorPortal.${r.key}`)}
                      </option>
                    ))}
              </select>
            </div>
          </div>

          <div className="card">
            <div className="card-hd">
              <div className="card-title">⚙️ {t('instructorPortal.advancedOptions')}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={examForm.shuffle_questions}
                  onChange={(e) => setExamForm((p) => ({ ...p, shuffle_questions: e.target.checked }))}
                  style={{ accentColor: 'var(--p)', width: 16, height: 16 }}
                />
                <div>
                  <div style={{ fontWeight: 600 }}>{t('instructorPortal.shuffleQuestions')}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{t('instructorPortal.shuffleQuestionsHint')}</div>
                </div>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={examForm.shuffle_answers}
                  onChange={(e) => setExamForm((p) => ({ ...p, shuffle_answers: e.target.checked }))}
                  style={{ accentColor: 'var(--p)', width: 16, height: 16 }}
                />
                <div>
                  <div style={{ fontWeight: 600 }}>{t('instructorPortal.shuffleAnswers')}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{t('instructorPortal.shuffleAnswersHint')}</div>
                </div>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={examForm.randomize_from_bank}
                  onChange={(e) => setExamForm((p) => ({ ...p, randomize_from_bank: e.target.checked }))}
                  style={{ accentColor: 'var(--p)', width: 16, height: 16 }}
                />
                <div>
                  <div style={{ fontWeight: 600 }}>{t('instructorPortal.randomFromBank')}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{t('instructorPortal.randomFromBankHint')}</div>
                </div>
              </label>
              <div className="fg" style={{ marginBottom: 0 }}>
                <label className="fl">{t('instructorPortal.resultVisibilityPolicy')}</label>
                <select
                  className="fc"
                  value={examForm.result_visibility}
                  onChange={(e) => setExamForm((p) => ({ ...p, result_visibility: e.target.value }))}
                >
                  <option value="immediate">{t('instructorPortal.resultImmediate')}</option>
                  <option value="after_window">{t('instructorPortal.resultAfterWindow')}</option>
                  <option value="manual_release">{t('instructorPortal.resultManualRelease')}</option>
                </select>
              </div>
              <div className="fg" style={{ marginBottom: 0 }}>
                <label className="fl">{t('instructorPortal.latePolicy')}</label>
                <select
                  className="fc"
                  value={examForm.late_policy}
                  onChange={(e) => setExamForm((p) => ({ ...p, late_policy: e.target.value }))}
                >
                  <option value="no_late">{t('instructorPortal.lateNoAccept')}</option>
                  <option value="deduct_10_daily">{t('instructorPortal.lateDeduct10')}</option>
                  <option value="allow_without_penalty">{t('instructorPortal.lateAllowNoPenalty')}</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="card">
            <div className="card-hd">
              <div className="card-title">➕ {t('instructorPortal.addQuestions')}</div>
              <Link to={`/instructor/question-bank?classId=${selectedClassId || ''}`} className="btn btn-gh btn-sm">
                {t('instructorPortal.questionBankTitle')}
              </Link>
            </div>
            <nav className="tabs" role="tablist" aria-label={t('instructorPortal.addQuestions')}>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'manual'}
                className={`tab ${activeTab === 'manual' ? 'active' : ''}`}
                onClick={() => setActiveTab('manual')}
              >
                {t('instructorPortal.tabManual')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'bank'}
                className={`tab ${activeTab === 'bank' ? 'active' : ''}`}
                onClick={() => setActiveTab('bank')}
              >
                {t('instructorPortal.tabFromBank')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'random'}
                className={`tab ${activeTab === 'random' ? 'active' : ''}`}
                onClick={() => setActiveTab('random')}
              >
                {t('instructorPortal.tabRandomFromBank')}
              </button>
            </nav>

            {activeTab === 'manual' && (
              <>
                <div className="qa-compose">
                  <div className="qa-compose__title">{t('instructorPortal.composeQuestion')}</div>
                  <div className="fr" style={{ marginBottom: 10, alignItems: 'flex-end' }}>
                    <div className="fg" style={{ marginBottom: 0, flex: 1, minWidth: 0 }}>
                      <label className="fl">{t('instructorPortal.questionType')}</label>
                      <select
                        className="fc"
                        value={questionForm.question_type}
                        onChange={(e) => {
                          const newType = e.target.value
                          setQuestionForm((p) => {
                            const next = { ...p, question_type: newType }
                            if (newType === 'true_false') {
                              next.options = [t('instructorPortal.trueLabel', 'True'), t('instructorPortal.falseLabel', 'False')]
                            } else if (newType === 'multiple_choice') {
                              if (!Array.isArray(p.options) || p.options.length === 0) next.options = [...defaultOptions]
                            } else if (newType === 'order') {
                              next.options = [...DEFAULT_ORDER_ITEMS]
                            } else {
                              next.options = []
                            }
                            next.correct_answer = 0
                            return next
                          })
                        }}
                      >
                        {QUESTION_TYPE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {t(`instructorPortal.${opt.key}`)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="fg" style={{ marginBottom: 0, maxWidth: 100 }}>
                      <label className="fl">{t('instructorPortal.totalMarks')}</label>
                      <input
                        type="number"
                        className="fc"
                        value={questionForm.marks}
                        onChange={(e) => setQuestionForm((p) => ({ ...p, marks: Number(e.target.value) || 0 }))}
                        min={0}
                        aria-label={t('instructorPortal.totalMarks')}
                      />
                    </div>
                  </div>
                  {usesLongQuestionPrompt(questionForm.question_type) ? (
                    <textarea
                      className="fc"
                      rows={questionForm.question_type === 'matching' || questionForm.question_type === 'essay' ? 5 : 4}
                      value={questionForm.question_text}
                      onChange={(e) => setQuestionForm((p) => ({ ...p, question_text: e.target.value }))}
                      placeholder={questionPromptPlaceholder(t, questionForm.question_type)}
                    />
                  ) : (
                    <input
                      type="text"
                      className="fc"
                      value={questionForm.question_text}
                      onChange={(e) => setQuestionForm((p) => ({ ...p, question_text: e.target.value }))}
                      placeholder={t('instructorPortal.optionFocus')}
                    />
                  )}
                  {(questionForm.question_type === 'fill_blank' ||
                    questionForm.question_type === 'numeric' ||
                    questionForm.question_type === 'file_upload') && (
                    <div style={{ background: 'var(--bg)', borderRadius: 'var(--rs)', padding: 10, fontSize: 13, color: 'var(--muted)', marginTop: 10 }}>
                      {questionForm.question_type === 'fill_blank' && t('instructorPortal.qbHintFillBlank')}
                      {questionForm.question_type === 'numeric' && t('instructorPortal.qbHintNumeric')}
                      {questionForm.question_type === 'file_upload' && t('instructorPortal.qbHintFileUpload')}
                    </div>
                  )}
                  {questionForm.question_type === 'matching' && (
                    <div style={{ background: 'var(--bg)', borderRadius: 'var(--rs)', padding: 10, fontSize: 13, color: 'var(--muted)', marginTop: 10 }}>
                      {t('instructorPortal.qbHintMatching')}
                    </div>
                  )}
                  {(questionForm.question_type === 'multiple_choice' || questionForm.question_type === 'true_false') && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                      {(Array.isArray(questionForm.options) ? questionForm.options : []).map((opt, i) => (
                        <div key={i} className={`q-opt q-opt--lite ${i === questionForm.correct_answer ? 'correct' : ''}`}>
                          <input
                            type="radio"
                            name="correct-q"
                            checked={i === questionForm.correct_answer}
                            onChange={() => setQuestionForm((p) => ({ ...p, correct_answer: i }))}
                            aria-label={t('instructorPortal.correctAnswer', { index: i + 1 })}
                          />
                          <input
                            type="text"
                            className="fc"
                            value={typeof opt === 'string' ? opt : ''}
                            onChange={(e) => updateOption(i, e.target.value)}
                            placeholder={`${t('instructorPortal.optionLabel', 'Option')} ${i + 1}`}
                            style={{ flex: 1, minWidth: 0 }}
                          />
                          {(Array.isArray(questionForm.options) ? questionForm.options : []).length > 2 &&
                            questionForm.question_type === 'multiple_choice' && (
                            <button
                              type="button"
                              className="btn btn-gh btn-sm"
                              onClick={() => removeOption(i)}
                              aria-label={t('instructorPortal.removeOption', 'Remove option')}
                              style={{ padding: '4px 8px' }}
                            >
                              ×
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {questionForm.question_type === 'order' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                      <div className="fl" style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {t('instructorPortal.orderOptionsHint')}
                      </div>
                      {(Array.isArray(questionForm.options) ? questionForm.options : []).map((opt, i) => (
                        <div key={i} className="q-opt q-opt--lite">
                          <span style={{ minWidth: 28, fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>{i + 1}</span>
                          <input
                            type="text"
                            className="fc"
                            value={typeof opt === 'string' ? opt : ''}
                            onChange={(e) => updateOption(i, e.target.value)}
                            placeholder={`${t('instructorPortal.optionLabel', 'Option')} ${i + 1}`}
                            style={{ flex: 1, minWidth: 0 }}
                          />
                          {(Array.isArray(questionForm.options) ? questionForm.options : []).length > 2 && (
                            <button
                              type="button"
                              className="btn btn-gh btn-sm"
                              onClick={() => removeOption(i)}
                              aria-label={t('instructorPortal.removeOption', 'Remove option')}
                              style={{ padding: '4px 8px' }}
                            >
                              ×
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {questionForm.question_type === 'essay' || questionForm.question_type === 'short_answer' ? (
                    <div style={{ background: 'var(--bg)', borderRadius: 'var(--rs)', padding: 10, fontSize: 13, color: 'var(--muted)', marginTop: 10 }}>
                      {t('instructorPortal.essayRequiresManual')}
                    </div>
                  ) : null}
                  <div className="qa-compose__actions">
                    {(questionForm.question_type === 'multiple_choice' ||
                      questionForm.question_type === 'true_false' ||
                      questionForm.question_type === 'order') && (
                      <button type="button" className="btn btn-gh btn-sm" onClick={addOption}>
                        + {t('instructorPortal.addOption')}
                      </button>
                    )}
                    <button type="button" className="btn btn-gh btn-sm" onClick={() => setQuestionForm(getDefaultQuestionForm())}>
                      {t('instructorPortal.clearQuestionForm')}
                    </button>
                    <button type="button" className="btn btn-p btn-sm" onClick={addManualQuestion}>
                      {t('instructorPortal.addToAssessment')}
                    </button>
                  </div>
                </div>
              </>
            )}

            {activeTab === 'bank' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {questionBank.slice(0, 15).map((q) => (
                  <div key={q.id} className="q-opt" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 13, flex: 1 }}>{q.question_text}</div>
                    <button type="button" className="btn btn-gh btn-sm" onClick={() => addFromBank(q)}>
                      {t('instructorPortal.addNewQuestion')}
                    </button>
                  </div>
                ))}
                {questionBank.length === 0 && <div style={{ color: 'var(--muted)' }}>{t('instructorPortal.noData')}</div>}
              </div>
            )}

            {activeTab === 'random' && (
              <div style={{ color: 'var(--muted)', fontSize: 14 }}>{t('instructorPortal.randomFromBankHint')}</div>
            )}

            {examQuestions.length > 0 && (
              <>
                <div className="qa-section-label">
                  {t('instructorPortal.questionsInAssessment', { count: examQuestions.length })}
                </div>
                {examQuestions.map((q, idx) => (
                  <div key={`${q.id}-${idx}`} className="q-card">
                    <div className="q-card-hd" style={{ alignItems: 'flex-start' }}>
                      <div className="q-num">{idx + 1}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="qa-qmeta">
                          <span className="qa-qmeta__badge">{questionTypeLabel(t, q.question_type)}</span>
                          <span className="qa-qmeta__marks">
                            {q.marks} {t('instructorPortal.pts')}
                          </span>
                        </div>
                        <div
                          className="q-text"
                          style={q.question_type === 'matching' ? { whiteSpace: 'pre-wrap' } : undefined}
                        >
                          {q.question_text}
                        </div>
                      </div>
                      <button type="button" className="btn btn-err btn-sm shrink-0" onClick={() => removeQuestion(idx)}>
                        {t('instructorPortal.removeFromAssessment')}
                      </button>
                    </div>
                    {q.question_type === 'order' && Array.isArray(q.options) && q.options.length > 0 && (
                      <div className="qa-answer-preview" style={{ marginTop: 10 }}>
                        {q.options.map((opt, oi) => (
                          <div key={oi} className="qa-answer-preview__row">
                            <span className="qa-answer-preview__badge">{oi + 1}</span>
                            <span>{opt}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {(q.question_type === 'multiple_choice' || q.question_type === 'true_false') &&
                      Array.isArray(q.options) &&
                      q.options.length > 0 && (
                        <div className="qa-answer-preview">
                          {q.options.map((opt, oi) => (
                            <div
                              key={oi}
                              className={`qa-answer-preview__row ${q.correct_answers?.includes(oi) ? 'is-correct' : ''}`}
                            >
                              <span className="qa-answer-preview__badge">{String.fromCharCode(65 + oi)}</span>
                              <span>{opt}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    {(q.question_type === 'essay' || q.question_type === 'short_answer') && (
                      <div
                        style={{
                          background: 'var(--bg)',
                          borderRadius: 'var(--rs)',
                          padding: 10,
                          fontSize: 13,
                          color: 'var(--muted)',
                          marginTop: 10,
                        }}
                      >
                        {t('instructorPortal.essayRequiresManual')}
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>

          <div className="card">
            <div className="card-hd">
              <div className="card-title">📊 {t('instructorPortal.assessmentSummary')}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--bdr)' }}>
                <span style={{ color: 'var(--muted)' }}>{t('instructorPortal.totalQuestionsLabel')}</span>
                <strong data-field="question_count">
                  {t('instructorPortal.questionsCount', { count: questionStats.totalQuestions })}
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--bdr)' }}>
                <span style={{ color: 'var(--muted)' }}>{t('instructorPortal.fullMarks')}</span>
                <strong>
                  {t('instructorPortal.marksOutOf', { current: questionStats.totalMarks, total: examForm.total_points })}
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--bdr)' }}>
                <span style={{ color: 'var(--muted)' }}>{t('instructorPortal.autoGrading')}</span>
                <strong>{questionStats.autoMarks} {t('instructorPortal.fullMarks').toLowerCase()}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--bdr)' }}>
                <span style={{ color: 'var(--muted)' }}>{t('instructorPortal.manualGrading')}</span>
                <strong>{questionStats.manualMarks} {t('instructorPortal.fullMarks').toLowerCase()}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                <span style={{ color: 'var(--muted)' }}>{t('instructorPortal.assessmentWeightCourseTotal')}</span>
                <strong style={{ color: weightValidation.exceeds ? 'var(--err)' : undefined }}>
                  {weightValidation.total}%
                </strong>
              </div>
            </div>
            {weightValidation.exceeds && (
              <div className="alert alert-warn" style={{ marginTop: 14 }}>
                ⚠️{' '}
                {t('instructorPortal.assessmentWeightExceeded', {
                  total: weightValidation.total,
                  defaultValue: `Total assessment weight is ${weightValidation.total}% — it cannot exceed 100%.`,
                })}
              </div>
            )}
            {questionStats.gap > 0 && (
              <div className="alert alert-warn" style={{ marginTop: 14 }}>
                ⚠️ {t('instructorPortal.marksIncompleteWarning', { current: questionStats.totalMarks, total: examForm.total_points })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
