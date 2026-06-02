import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../contexts/AuthContext'
import { useLanguage } from '../../contexts/LanguageContext'
import { getLocalizedName } from '../../utils/localizedName'
import { supabase } from '../../lib/supabase'
import { downloadQuestionBankTemplate, parseQuestionBankExcelFile } from '../../utils/questionBankExcel'
import { QUESTION_TYPES_WITH_ALL, QUESTION_TYPE_OPTIONS } from '../../constants/questionTypes'
import { getActiveInstructorByEmail } from '../../utils/getActiveInstructorByEmail'

const QB_DEFAULT_OPTIONS = ['Option 1', 'Option 2', 'Option 3', 'Option 4']

function getEmptyQuestion() {
  return {
    question_type: 'multiple_choice',
    difficulty_level: 3,
    bloom_level: 'understand',
    unit_number: 1,
    estimated_marks: 1,
    question_text: '',
    options: [...QB_DEFAULT_OPTIONS],
    correctIndices: [0],
    tags_text: '',
  }
}

const QUESTION_TYPES = QUESTION_TYPES_WITH_ALL
const QUESTION_TYPES_FORM = QUESTION_TYPE_OPTIONS

const QB_DEFAULT_ORDER_ITEMS = ['Item 1', 'Item 2', 'Item 3']

const DIFFICULTY_OPTIONS = [
  { value: '', key: 'allTypes' },
  { value: '1', key: 'difficulty1' },
  { value: '2', key: 'difficulty2' },
  { value: '3', key: 'difficulty3' },
  { value: '4', key: 'difficulty4' },
  { value: '5', key: 'difficulty5' },
]

const BLOOM_OPTIONS = [
  { value: '', key: 'allTypes' },
  { value: 'remember', key: 'bloomRemember' },
  { value: 'understand', key: 'bloomUnderstand' },
  { value: 'apply', key: 'bloomApply' },
  { value: 'analyze', key: 'bloomAnalyze' },
  { value: 'evaluate', key: 'bloomEvaluate' },
  { value: 'create', key: 'bloomCreate' },
]

function parseOptions(text) {
  return text.split('\n').map((x) => x.trim()).filter(Boolean)
}

function parseJsonArray(value) {
  if (Array.isArray(value)) return value
  return []
}

function optionsFromDb(q) {
  const raw = q?.options
  if (Array.isArray(raw)) return raw.map((x) => String(x))
  return []
}

function getTypeLabel(t, type) {
  const map = {
    multiple_choice: 'multipleChoice',
    true_false: 'trueFalse',
    essay: 'essay',
    short_answer: 'shortAnswer',
    matching: 'matching',
    order: 'order',
    fill_blank: 'fillBlank',
    numeric: 'numeric',
    file_upload: 'fileUpload',
  }
  return t(`instructorPortal.${map[type] || 'multipleChoice'}`)
}

function usesMcTfOptions(type) {
  return type === 'multiple_choice' || type === 'true_false'
}

function usesOrderOptions(type) {
  return type === 'order'
}

function getQuestionPlaceholder(t, type) {
  if (type === 'matching') return t('instructorPortal.matchingPairsHint')
  if (type === 'fill_blank') return t('instructorPortal.fillBlankPlaceholderHint')
  if (type === 'order') return t('instructorPortal.orderPlaceholderHint')
  if (type === 'numeric') return t('instructorPortal.numericPlaceholderHint')
  if (type === 'file_upload') return t('instructorPortal.fileUploadPlaceholderHint')
  return t('instructorPortal.optionFocus')
}

function getQuestionTextareaRows(type) {
  if (type === 'matching') return 5
  if (type === 'essay') return 5
  return 3
}

function getBloomLabel(t, bloom) {
  const map = {
    remember: 'bloomRemember',
    understand: 'bloomUnderstand',
    apply: 'bloomApply',
    analyze: 'bloomAnalyze',
    evaluate: 'bloomEvaluate',
    create: 'bloomCreate',
  }
  return t(`instructorPortal.${map[bloom] || 'bloomUnderstand'}`)
}

export default function InstructorQuestionBank({ embedded = false, embedClassId = null } = {}) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { language } = useLanguage()
  const [searchParams, setSearchParams] = useSearchParams()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [platformUserId, setPlatformUserId] = useState(null)
  const [classes, setClasses] = useState([])
  const [selectedClassId, setSelectedClassId] = useState(null)
  const [questions, setQuestions] = useState([])
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(getEmptyQuestion)
  const [typeFilter, setTypeFilter] = useState('')
  const [difficultyFilter, setDifficultyFilter] = useState('')
  const [bloomFilter, setBloomFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [importing, setImporting] = useState(false)
  const importFileRef = useRef(null)
  const importExcelRef = useRef(null)

  const selectedClass = useMemo(() => classes.find((c) => c.id === selectedClassId) || null, [classes, selectedClassId])
  const subjectCode = selectedClass?.subjects?.code || 'ENG101'

  const stats = useMemo(() => {
    const total = questions.length
    const mcq = questions.filter((q) => q.question_type === 'multiple_choice').length
    const essay = questions.filter((q) => q.question_type === 'essay' || q.question_type === 'short_answer').length
    const other = total - mcq - essay
    const pctMcq = total ? Math.round((mcq / total) * 100) : 0
    const pctEssay = total ? Math.round((essay / total) * 100) : 0
    const pctOther = total ? Math.round((other / total) * 100) : 0
    return { total, mcq, essay, other, pctMcq, pctEssay, pctOther }
  }, [questions])

  useEffect(() => {
    if (!user?.email) return
    initialize()
  }, [user?.email])

  useEffect(() => {
    if (!selectedClassId || !classes.length) return
    loadQuestions(selectedClassId)
  }, [selectedClassId, classes, typeFilter, difficultyFilter, bloomFilter])

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
        .select('id, section, subject_id, subjects(id, code, name_en, name_ar)')
        .eq('instructor_id', instructor.id)
        .eq('status', 'active')
        .order('id', { ascending: false })

      const list = cls || []
      setClasses(list)

      const queryClassId = embedded && embedClassId ? embedClassId : Number(searchParams.get('classId'))
      const classId = list.find((c) => c.id === queryClassId)?.id || list[0]?.id || null
      setSelectedClassId(classId)
      if (!classId) setLoading(false)
    } catch (err) {
      console.error(err)
      setLoading(false)
    }
  }

  const loadQuestions = async (classId) => {
    setLoading(true)
    try {
      const classObj = classes.find((c) => c.id === classId)
      if (!classObj?.subject_id) {
        setQuestions([])
        return
      }

      let query = supabase
        .from('subject_question_bank')
        .select('*')
        .eq('subject_id', classObj.subject_id)
        .eq('is_active', true)
        .order('id', { ascending: false })

      if (typeFilter) query = query.eq('question_type', typeFilter)
      if (difficultyFilter) query = query.eq('difficulty_level', Number(difficultyFilter))
      if (bloomFilter) query = query.eq('bloom_level', bloomFilter)

      const { data } = await query
      setQuestions(data || [])

      const next = new URLSearchParams(searchParams)
      next.set('classId', String(classId))
      setSearchParams(next)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setEditingId(null)
    setForm(getEmptyQuestion())
    setShowForm(false)
  }

  const qbAddOption = () => {
    setForm((p) => {
      const opts = [...(p.options || [])]
      opts.push(`${opts.length + 1}`)
      return { ...p, options: opts }
    })
  }

  const qbRemoveOption = (index) => {
    setForm((p) => {
      const opts = (p.options || []).filter((_, i) => i !== index)
      if (usesOrderOptions(p.question_type)) {
        return { ...p, options: opts }
      }
      let ids = (p.correctIndices || [])
        .filter((i) => i !== index)
        .map((i) => (i > index ? i - 1 : i))
      if (ids.length === 0 && opts.length) ids = [0]
      return { ...p, options: opts, correctIndices: ids }
    })
  }

  const toggleMcCorrect = (i) => {
    setForm((p) => {
      if (p.question_type !== 'multiple_choice') return p
      const cur = new Set(p.correctIndices || [])
      if (cur.has(i)) cur.delete(i)
      else cur.add(i)
      let arr = [...cur].sort((a, b) => a - b)
      if (arr.length === 0 && (p.options || []).length) arr = [0]
      return { ...p, correctIndices: arr }
    })
  }

  const setTfCorrect = (i) => {
    setForm((p) => ({ ...p, correctIndices: [i] }))
  }

  const qbUpdateOption = (index, value) => {
    setForm((p) => {
      const opts = [...(p.options || [])]
      opts[index] = value
      return { ...p, options: opts }
    })
  }

  const saveQuestion = async () => {
    if (!selectedClass || !platformUserId || !form.question_text.trim()) return

    const qt = form.question_type
    const mcTf = usesMcTfOptions(qt)
    const order = usesOrderOptions(qt)

    let options = []
    let correct_answers = []

    if (order) {
      options = (form.options || []).map((o) => String(o).trim()).filter(Boolean)
      if (options.length < 2) {
        alert(t('instructorPortal.validationOrderMinItems'))
        return
      }
      correct_answers = options.map((_, i) => i)
    } else if (mcTf) {
      options = (form.options || []).map((o) => String(o).trim()).filter(Boolean)
      const rawIdx = [...new Set(form.correctIndices || [])]
        .map((n) => Number(n))
        .filter((n) => !Number.isNaN(n) && n >= 0 && n < options.length)
        .sort((a, b) => a - b)

      if (options.length > 0) {
        if (qt === 'true_false') {
          if (rawIdx.length !== 1) {
            alert(t('instructorPortal.validationSelectCorrectTf'))
            return
          }
        }
        if (qt === 'multiple_choice') {
          if (rawIdx.length < 1) {
            alert(t('instructorPortal.validationSelectCorrectMc'))
            return
          }
        }
      }
      if (options.length > 0) {
        correct_answers = qt === 'true_false' ? [rawIdx[0]] : rawIdx
      }
    }

    setSaving(true)
    try {
      const payload = {
        subject_id: selectedClass.subject_id,
        class_id: selectedClass.id,
        question_type: qt,
        difficulty_level: Number(form.difficulty_level || 3),
        bloom_level: form.bloom_level,
        unit_number: Number(form.unit_number || 1),
        estimated_marks: Number(form.estimated_marks || 1),
        question_text: form.question_text.trim(),
        options,
        correct_answers,
        tags: parseOptions(form.tags_text),
        updated_at: new Date().toISOString(),
      }

      if (editingId) {
        await supabase.from('subject_question_bank').update(payload).eq('id', editingId)
      } else {
        await supabase.from('subject_question_bank').insert({ ...payload, created_by: platformUserId })
      }

      resetForm()
      await loadQuestions(selectedClass.id)
    } catch (err) {
      console.error(err)
      alert(t('common.error', 'Error'))
    } finally {
      setSaving(false)
    }
  }

  const handleImportJson = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !selectedClass?.subject_id || !platformUserId) return
    setImporting(true)
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      const rows = Array.isArray(parsed) ? parsed : parsed?.questions
      if (!Array.isArray(rows) || rows.length === 0) throw new Error('invalid')
      let inserted = 0
      for (const row of rows) {
        const qt = row.question_type || 'multiple_choice'
        const mcTf = usesMcTfOptions(qt)
        const order = usesOrderOptions(qt)
        let options = []
        let correct_answers = []
        if (order) {
          options = Array.isArray(row.options)
            ? row.options.map((x) => String(x).trim()).filter(Boolean)
            : parseOptions(String(row.options_text || ''))
          if (options.length >= 2) {
            correct_answers = options.map((_, i) => i)
          }
        } else if (mcTf) {
          options = Array.isArray(row.options)
            ? row.options.map((x) => String(x).trim()).filter(Boolean)
            : parseOptions(String(row.options_text || ''))
          if (Array.isArray(row.correct_answers)) {
            correct_answers = row.correct_answers.map((x) => Number(x)).filter((x) => !Number.isNaN(x))
          } else {
            correct_answers = parseOptions(String(row.correct_answers_text || ''))
              .map((x) => Number(String(x).trim()))
              .filter((x) => !Number.isNaN(x))
          }
          if (correct_answers.length === 0 && options.length > 0) correct_answers = [0]
        }
        const qtext = String(row.question_text || '').trim()
        if (!qtext) continue
        const payload = {
          subject_id: selectedClass.subject_id,
          class_id: selectedClass.id,
          question_type: qt,
          difficulty_level: Number(row.difficulty_level ?? 3),
          bloom_level: row.bloom_level || 'understand',
          unit_number: Number(row.unit_number ?? 1),
          estimated_marks: Number(row.estimated_marks ?? 1),
          question_text: qtext,
          options,
          correct_answers,
          tags: Array.isArray(row.tags) ? row.tags : parseOptions(String(row.tags_text || '')),
          updated_at: new Date().toISOString(),
        }
        const { error } = await supabase.from('subject_question_bank').insert({ ...payload, created_by: platformUserId })
        if (!error) inserted += 1
      }
      if (inserted === 0) throw new Error('none')
      alert(t('instructorPortal.importSuccess', { count: inserted }))
      await loadQuestions(selectedClass.id)
    } catch (err) {
      console.error(err)
      alert(t('instructorPortal.importFailed'))
    } finally {
      setImporting(false)
    }
  }

  const handleImportExcel = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !selectedClass?.subject_id || !platformUserId) return
    setImporting(true)
    try {
      const buf = await file.arrayBuffer()
      const rows = parseQuestionBankExcelFile(buf)
      let inserted = 0
      for (const row of rows) {
        const payload = {
          subject_id: selectedClass.subject_id,
          class_id: selectedClass.id,
          question_type: row.question_type,
          difficulty_level: row.difficulty_level,
          bloom_level: row.bloom_level,
          unit_number: row.unit_number,
          estimated_marks: row.estimated_marks,
          question_text: row.question_text,
          options: row.options || [],
          correct_answers: row.correct_answers || [],
          tags: row.tags || [],
          updated_at: new Date().toISOString(),
        }
        const { error } = await supabase.from('subject_question_bank').insert({ ...payload, created_by: platformUserId })
        if (!error) inserted += 1
      }
      if (inserted === 0) throw new Error('none')
      alert(t('instructorPortal.importSuccess', { count: inserted }))
      await loadQuestions(selectedClass.id)
    } catch (err) {
      console.error(err)
      alert(t('instructorPortal.importFailed'))
    } finally {
      setImporting(false)
    }
  }

  const buildCorrectIndicesFromDb = (qt, opts, caRaw) => {
    if (!usesMcTfOptions(qt) || !opts.length) return []
    const ca = Array.isArray(caRaw) ? caRaw.map(Number).filter((n) => !Number.isNaN(n)) : []
    let ci = ca.filter((i) => i >= 0 && i < opts.length)
    if (ci.length === 0) ci = [0]
    if (qt === 'true_false') return [ci[0]]
    return [...new Set(ci)].sort((a, b) => a - b)
  }

  const editQuestion = (q) => {
    setShowForm(true)
    setEditingId(q.id)
    const opts = optionsFromDb(q)
    const qt = q.question_type || 'multiple_choice'
    const mcTf = usesMcTfOptions(qt)
    const order = usesOrderOptions(qt)
    let nextOptions = []
    if (mcTf) {
      nextOptions = opts.length ? opts : [...QB_DEFAULT_OPTIONS]
    } else if (order) {
      nextOptions = opts.length >= 2 ? opts : [...QB_DEFAULT_ORDER_ITEMS]
    }
    setForm({
      question_type: qt,
      difficulty_level: q.difficulty_level || 3,
      bloom_level: q.bloom_level || 'understand',
      unit_number: q.unit_number || 1,
      estimated_marks: q.estimated_marks || 1,
      question_text: q.question_text || '',
      options: nextOptions,
      correctIndices: buildCorrectIndicesFromDb(qt, mcTf && opts.length ? opts : [], q.correct_answers),
      tags_text: (q.tags || []).join('\n'),
    })
  }

  const copyQuestion = (q) => {
    setEditingId(null)
    setShowForm(true)
    const opts = optionsFromDb(q)
    const qt = q.question_type || 'multiple_choice'
    const mcTf = usesMcTfOptions(qt)
    const order = usesOrderOptions(qt)
    let nextOptions = []
    if (mcTf) {
      nextOptions = opts.length ? [...opts] : [...QB_DEFAULT_OPTIONS]
    } else if (order) {
      nextOptions = opts.length >= 2 ? [...opts] : [...QB_DEFAULT_ORDER_ITEMS]
    }
    setForm({
      question_type: qt,
      difficulty_level: q.difficulty_level || 3,
      bloom_level: q.bloom_level || 'understand',
      unit_number: q.unit_number || 1,
      estimated_marks: q.estimated_marks || 1,
      question_text: q.question_text || '',
      options: nextOptions,
      correctIndices: buildCorrectIndicesFromDb(qt, mcTf && opts.length ? opts : [], q.correct_answers),
      tags_text: (q.tags || []).join('\n'),
    })
  }

  const deleteQuestion = async (id) => {
    if (!confirm(t('instructorPortal.deleteQuestion') + '?')) return
    await supabase.from('subject_question_bank').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', id)
    if (selectedClassId) loadQuestions(selectedClassId)
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
            <span>{t('instructorPortal.questionBankTitle')}</span>
          </nav>

          <div className="ph">
            <div>
              <h1>
                {t('instructorPortal.questionBankTitle')} — {subjectCode}
              </h1>
              <p className="ph-sub">{t('instructorPortal.questionBankSubtitle', { code: subjectCode })}</p>
            </div>
            <div className="ph-acts">
          <select
            className="fc"
            style={{ width: 'auto' }}
            value={selectedClassId || ''}
            onChange={(e) => setSelectedClassId(Number(e.target.value))}
            aria-label={t('instructorPortal.questionType')}
          >
            {classes.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.subjects?.code} — {getLocalizedName(cls.subjects, language === 'ar')} ({t('instructorPortal.section')} {cls.section})
              </option>
            ))}
          </select>
          <input
            ref={importFileRef}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            aria-hidden
            onChange={handleImportJson}
          />
          <input
            ref={importExcelRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            aria-hidden
            onChange={handleImportExcel}
          />
          <button
            type="button"
            className="btn btn-gh"
            disabled={importing || !selectedClassId}
            title={t('instructorPortal.importJsonHint')}
            onClick={() => importFileRef.current?.click()}
          >
            📥 JSON
          </button>
          <button
            type="button"
            className="btn btn-gh"
            disabled={importing || !selectedClassId}
            title={t('instructorPortal.excelImportHint')}
            onClick={() => importExcelRef.current?.click()}
          >
            📊 {importing ? '…' : t('instructorPortal.importExcelQuestions')}
          </button>
          <button
            type="button"
            className="btn btn-gh"
            onClick={() => downloadQuestionBankTemplate()}
          >
            ⬇ {t('instructorPortal.downloadExcelTemplate')}
          </button>
          <button
            type="button"
            className="btn btn-p"
            onClick={() => {
              setShowForm(true)
              setEditingId(null)
              setForm(getEmptyQuestion())
              setTimeout(() => document.getElementById('qb-form-card')?.scrollIntoView?.({ behavior: 'smooth' }), 100)
            }}
          >
            + {t('instructorPortal.newQuestion')}
          </button>
        </div>
      </div>
        </>
      )}

      {embedded && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-hd">
            <div className="card-title">{t('instructorPortal.questionBankTitle')} — {subjectCode}</div>
            <select
              className="fc"
              style={{ width: 'auto' }}
              value={selectedClassId || ''}
              onChange={(e) => setSelectedClassId(Number(e.target.value))}
              aria-label={t('instructorPortal.questionType')}
            >
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.subjects?.code} — {getLocalizedName(cls.subjects, language === 'ar')} ({t('instructorPortal.section')}{' '}
                  {cls.section})
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="sg">
        <div className="sc acc">
          <div className="sc-lbl">{t('instructorPortal.totalQuestionsInCourse')}</div>
          <div className="sc-val" data-field="total_questions">{stats.total}</div>
          <div className="sc-sub">{t('instructorPortal.inThisCourse')}</div>
        </div>
        <div className="sc ok">
          <div className="sc-lbl">{t('instructorPortal.multipleChoice')}</div>
          <div className="sc-val">{stats.mcq}</div>
          <div className="sc-sub">{stats.pctMcq}%</div>
        </div>
        <div className="sc info">
          <div className="sc-lbl">{t('instructorPortal.essay')} / {t('instructorPortal.shortAnswer')}</div>
          <div className="sc-val">{stats.essay}</div>
          <div className="sc-sub">{stats.pctEssay}%</div>
        </div>
        <div className="sc warn">
          <div className="sc-lbl">{t('instructorPortal.allTypes')}</div>
          <div className="sc-val">{stats.other}</div>
          <div className="sc-sub">{stats.pctOther}%</div>
        </div>
      </div>

      <div className="card">
        <div className="card-hd">
          <div className="card-title">🔍 {t('instructorPortal.filterAndSearch')}</div>
        </div>
        <div className="fr3">
          <div className="fg" style={{ marginBottom: 0 }}>
            <label className="fl">{t('instructorPortal.questionType')}</label>
            <select className="fc" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} data-field="question_type_filter">
              {QUESTION_TYPES.map((opt) => (
                <option key={opt.value || 'all'} value={opt.value}>{t(`instructorPortal.${opt.key}`)}</option>
              ))}
            </select>
          </div>
          <div className="fg" style={{ marginBottom: 0 }}>
            <label className="fl">{t('instructorPortal.difficultyLevel')}</label>
            <select className="fc" value={difficultyFilter} onChange={(e) => setDifficultyFilter(e.target.value)} data-field="difficulty_filter">
              {DIFFICULTY_OPTIONS.map((opt) => (
                <option key={opt.value || 'all'} value={opt.value}>{t(`instructorPortal.${opt.key}`)}</option>
              ))}
            </select>
          </div>
          <div className="fg" style={{ marginBottom: 0 }}>
            <label className="fl">{t('instructorPortal.bloomLevel')}</label>
            <select className="fc" value={bloomFilter} onChange={(e) => setBloomFilter(e.target.value)} data-field="bloom_filter">
              {BLOOM_OPTIONS.map((opt) => (
                <option key={opt.value || 'all'} value={opt.value}>{t(`instructorPortal.${opt.key}`)}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {(showForm || editingId) && (
        <div id="qb-form-card" className="card" style={{ marginBottom: 24 }}>
          <div className="card-hd">
            <div className="card-title">{editingId ? t('instructorPortal.edit') : '+'} {t('instructorPortal.newQuestion')}</div>
          </div>
          <div className="qa-compose" style={{ margin: '0 -4px 16px' }}>
            <div className="qa-compose__title">{t('instructorPortal.composeQuestion')}</div>
            <div className="fr" style={{ marginBottom: 10, alignItems: 'flex-end' }}>
              <div className="fg" style={{ marginBottom: 0, flex: 1, minWidth: 0 }}>
                <label className="fl">{t('instructorPortal.questionType')}</label>
                <select
                  className="fc"
                  value={form.question_type}
                  onChange={(e) => {
                    const v = e.target.value
                    setForm((p) => {
                      const next = { ...p, question_type: v }
                      if (usesMcTfOptions(v)) {
                        if (v === 'true_false') {
                          next.options = [t('instructorPortal.trueLabel'), t('instructorPortal.falseLabel')]
                          next.correctIndices = [0]
                        } else if (!Array.isArray(p.options) || p.options.length === 0) {
                          next.options = [...QB_DEFAULT_OPTIONS]
                          next.correctIndices = [0]
                        } else {
                          next.correctIndices = [0]
                        }
                      } else if (usesOrderOptions(v)) {
                        next.options = [...QB_DEFAULT_ORDER_ITEMS]
                        next.correctIndices = []
                      } else {
                        next.options = []
                        next.correctIndices = []
                      }
                      return next
                    })
                  }}
                >
                  {QUESTION_TYPES_FORM.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {t(`instructorPortal.${opt.key}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="fg" style={{ marginBottom: 0, maxWidth: 110 }}>
                <label className="fl">{t('instructorPortal.totalMarks')}</label>
                <input
                  type="number"
                  className="fc"
                  min={0}
                  value={form.estimated_marks}
                  onChange={(e) => setForm((p) => ({ ...p, estimated_marks: Number(e.target.value) || 0 }))}
                />
              </div>
            </div>
            <div className="fg" style={{ marginBottom: 12 }}>
              <label className="fl">{t('instructorPortal.questionLabel')}</label>
              <textarea
                className="fc"
                rows={getQuestionTextareaRows(form.question_type)}
                value={form.question_text}
                onChange={(e) => setForm((p) => ({ ...p, question_text: e.target.value }))}
                placeholder={getQuestionPlaceholder(t, form.question_type)}
              />
            </div>
            {usesMcTfOptions(form.question_type) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                <div className="fl" style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
                  {form.question_type === 'true_false'
                    ? t('instructorPortal.validationSelectCorrectTf')
                    : t('instructorPortal.validationSelectCorrectMc')}
                </div>
                {(form.options || []).map((opt, i) => {
                  const isMc = form.question_type === 'multiple_choice'
                  const isCorrect = isMc
                    ? (form.correctIndices || []).includes(i)
                    : (form.correctIndices || [])[0] === i
                  return (
                    <div key={i} className={`q-opt q-opt--lite ${isCorrect ? 'correct' : ''}`}>
                      {isMc ? (
                        <input
                          type="checkbox"
                          checked={isCorrect}
                          onChange={() => toggleMcCorrect(i)}
                          aria-label={t('instructorPortal.correctAnswer', { index: i + 1 })}
                          style={{ width: 18, height: 18, accentColor: 'var(--p)' }}
                        />
                      ) : (
                        <input
                          type="radio"
                          name="qb-tf-correct"
                          checked={isCorrect}
                          onChange={() => setTfCorrect(i)}
                          aria-label={t('instructorPortal.correctAnswer', { index: i + 1 })}
                        />
                      )}
                      <input
                        type="text"
                        className="fc"
                        value={typeof opt === 'string' ? opt : ''}
                        onChange={(e) => qbUpdateOption(i, e.target.value)}
                        placeholder={`${t('instructorPortal.optionLabel')} ${i + 1}`}
                        style={{ flex: 1, minWidth: 0 }}
                      />
                      {form.question_type === 'multiple_choice' && (form.options || []).length > 2 && (
                        <button
                          type="button"
                          className="btn btn-gh btn-sm"
                          onClick={() => qbRemoveOption(i)}
                          aria-label={t('instructorPortal.removeOption')}
                          style={{ padding: '4px 8px' }}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            {usesOrderOptions(form.question_type) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                <div className="fl" style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>
                  {t('instructorPortal.orderOptionsHint')}
                </div>
                {(form.options || []).map((opt, i) => (
                  <div key={i} className="q-opt q-opt--lite">
                    <span
                      style={{
                        minWidth: 28,
                        fontSize: 12,
                        fontWeight: 700,
                        color: 'var(--muted)',
                        alignSelf: 'center',
                      }}
                    >
                      {i + 1}
                    </span>
                    <input
                      type="text"
                      className="fc"
                      value={typeof opt === 'string' ? opt : ''}
                      onChange={(e) => qbUpdateOption(i, e.target.value)}
                      placeholder={`${t('instructorPortal.optionLabel')} ${i + 1}`}
                      style={{ flex: 1, minWidth: 0 }}
                    />
                    {(form.options || []).length > 2 && (
                      <button
                        type="button"
                        className="btn btn-gh btn-sm"
                        onClick={() => qbRemoveOption(i)}
                        aria-label={t('instructorPortal.removeOption')}
                        style={{ padding: '4px 8px' }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {(form.question_type === 'essay' || form.question_type === 'short_answer') && (
              <div style={{ background: 'var(--bg)', borderRadius: 'var(--rs)', padding: 10, fontSize: 13, color: 'var(--muted)', marginBottom: 10 }}>
                {t('instructorPortal.essayRequiresManual')}
              </div>
            )}
            {(form.question_type === 'fill_blank' || form.question_type === 'numeric' || form.question_type === 'file_upload') && (
              <div style={{ background: 'var(--bg)', borderRadius: 'var(--rs)', padding: 10, fontSize: 13, color: 'var(--muted)', marginBottom: 10 }}>
                {form.question_type === 'fill_blank' && t('instructorPortal.qbHintFillBlank')}
                {form.question_type === 'numeric' && t('instructorPortal.qbHintNumeric')}
                {form.question_type === 'file_upload' && t('instructorPortal.qbHintFileUpload')}
              </div>
            )}
            {form.question_type === 'matching' && (
              <div style={{ background: 'var(--bg)', borderRadius: 'var(--rs)', padding: 10, fontSize: 13, color: 'var(--muted)', marginBottom: 10 }}>
                {t('instructorPortal.qbHintMatching')}
              </div>
            )}
            <div className="qa-compose__actions">
              {(usesMcTfOptions(form.question_type) || usesOrderOptions(form.question_type)) && (
                <button type="button" className="btn btn-gh btn-sm" onClick={qbAddOption}>
                  + {t('instructorPortal.addOption')}
                </button>
              )}
            </div>
          </div>

          <div className="fr">
            <div className="fg">
              <label className="fl">{t('instructorPortal.difficultyLevel')}</label>
              <input type="number" className="fc" min={1} max={5} value={form.difficulty_level} onChange={(e) => setForm((p) => ({ ...p, difficulty_level: Number(e.target.value) || 3 }))} />
            </div>
            <div className="fg">
              <label className="fl">{t('instructorPortal.bloomLevel')}</label>
              <select className="fc" value={form.bloom_level} onChange={(e) => setForm((p) => ({ ...p, bloom_level: e.target.value }))}>
                <option value="remember">{t('instructorPortal.bloomRemember')}</option>
                <option value="understand">{t('instructorPortal.bloomUnderstand')}</option>
                <option value="apply">{t('instructorPortal.bloomApply')}</option>
                <option value="analyze">{t('instructorPortal.bloomAnalyze')}</option>
                <option value="evaluate">{t('instructorPortal.bloomEvaluate')}</option>
                <option value="create">{t('instructorPortal.bloomCreate')}</option>
              </select>
            </div>
          </div>
          <div className="fr">
            <div className="fg">
              <label className="fl">{t('instructorPortal.unitLabel')}</label>
              <input type="number" className="fc" min={1} value={form.unit_number} onChange={(e) => setForm((p) => ({ ...p, unit_number: Number(e.target.value) || 1 }))} />
            </div>
            <div className="fg">
              <label className="fl">{t('instructorPortal.tagsOnePerLine')}</label>
              <textarea className="fc" rows={2} value={form.tags_text} onChange={(e) => setForm((p) => ({ ...p, tags_text: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button type="button" className="btn btn-p" onClick={saveQuestion} disabled={saving}>
              {editingId ? t('instructorPortal.edit') : t('instructorPortal.add')}
            </button>
            <button type="button" className="btn btn-gh" onClick={resetForm}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-hd">
          <div className="card-title">📋 {t('instructorPortal.questionList')}</div>
        </div>

        {questions.map((q, idx) => (
          <div key={q.id} className="q-card">
            <div className="q-card-hd" style={{ alignItems: 'flex-start' }}>
              <div className="q-num">{idx + 1}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="qa-qmeta">
                  <span className="qa-qmeta__badge">{getTypeLabel(t, q.question_type)}</span>
                  <span className="qa-qmeta__marks">
                    {q.estimated_marks} {t('instructorPortal.pts')}
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: 20,
                      background: Number(q.difficulty_level) >= 4 ? 'var(--err-bg)' : 'var(--warn-bg)',
                      color: Number(q.difficulty_level) >= 4 ? 'var(--err)' : 'var(--warn)',
                    }}
                  >
                    {t('instructorPortal.difficultyLevel')} {q.difficulty_level}
                  </span>
                </div>
                <div
                  className="q-text"
                  data-field="question_text"
                  style={q.question_type === 'matching' ? { whiteSpace: 'pre-wrap' } : undefined}
                >
                  {q.question_text}
                </div>
              </div>
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
              <div style={{ background: 'var(--bg)', borderRadius: 'var(--rs)', padding: 10, fontSize: 13, color: 'var(--muted)', marginTop: 10 }}>
                {t('instructorPortal.essayRequiresManual')}
              </div>
            )}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 8,
                fontSize: 12,
                color: 'var(--muted)',
                marginTop: 12,
                paddingTop: 12,
                borderTop: '1px solid var(--bdr)',
              }}
            >
              <div>
                {t('instructorPortal.unitLabel')} {q.unit_number || '-'} · {getBloomLabel(t, q.bloom_level)} ·{' '}
                {t('instructorPortal.usedTimes', { count: q.usage_count || 0 })}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-gh btn-sm" onClick={() => editQuestion(q)}>
                  {t('instructorPortal.edit')}
                </button>
                <button type="button" className="btn btn-gh btn-sm" onClick={() => copyQuestion(q)}>
                  {t('instructorPortal.copy')}
                </button>
                <button type="button" className="btn btn-err btn-sm" onClick={() => deleteQuestion(q.id)}>
                  {t('instructorPortal.deleteQuestion')}
                </button>
              </div>
            </div>
          </div>
        ))}

        {questions.length === 0 && (
          <div style={{ color: 'var(--muted)', padding: 24, textAlign: 'center' }}>{t('instructorPortal.noData')}</div>
        )}
      </div>
    </>
  )
}
