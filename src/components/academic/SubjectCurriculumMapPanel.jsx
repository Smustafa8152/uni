import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../../lib/supabase'
import CurriculumReferencesPanel from './CurriculumReferencesPanel'

const emptyForm = { code: '', description: '', bloom_level: 'apply', difficulty_level: 'medium' }

function bloomLevelLabel(t, level) {
  const map = {
    remember: 'bloomRemember',
    understand: 'bloomUnderstand',
    apply: 'bloomApply',
    analyze: 'bloomAnalyze',
    evaluate: 'bloomEvaluate',
    create: 'bloomCreate',
  }
  const key = map[level] || 'bloomUnderstand'
  return t(`instructorPortal.${key}`)
}

function difficultyLevelLabel(t, level) {
  const map = {
    low: 'difficultyLow',
    medium: 'difficultyMedium',
    high: 'difficultyHigh',
  }
  const key = map[level] || 'difficultyMedium'
  return t(`instructorPortal.${key}`)
}

/**
 * Course Learning Outcomes (CLO) editor for one subject.
 * Used on admin curriculum map and academic View Subject.
 */
export default function SubjectCurriculumMapPanel({
  subjectId,
  subjectLabel = '',
  embedAboutColumn = true,
  /** When true, no inner card chrome (parent already wrapped). */
  plainSurface = false,
}) {
  const { t } = useTranslation()

  const [loading, setLoading] = useState(true)
  const [clos, setClos] = useState([])
  const [editingClo, setEditingClo] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!subjectId) {
      setClos([])
      setLoading(false)
      return
    }
    loadClos(subjectId)
  }, [subjectId])

  const loadClos = async (sid) => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('subject_learning_outcomes')
        .select('id, code, description, bloom_level, difficulty_level, display_order')
        .eq('subject_id', sid)
        .eq('is_active', true)
        .order('display_order', { ascending: true })
        .order('id', { ascending: true })

      if (error) throw error
      setClos(data || [])
    } catch (err) {
      console.error(err)
      setClos([])
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setEditingClo(null)
    setForm(emptyForm)
  }

  const onEdit = (clo) => {
    setEditingClo(clo)
    setForm({
      code: clo.code || '',
      description: clo.description || '',
      bloom_level: clo.bloom_level || 'apply',
      difficulty_level: clo.difficulty_level || 'medium',
    })
  }

  const saveClo = async () => {
    if (!subjectId || !form.code.trim() || !form.description.trim()) return

    setSaving(true)
    try {
      if (editingClo?.id) {
        await supabase
          .from('subject_learning_outcomes')
          .update({
            code: form.code.trim(),
            description: form.description.trim(),
            bloom_level: form.bloom_level,
            difficulty_level: form.difficulty_level,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingClo.id)
      } else {
        await supabase.from('subject_learning_outcomes').insert({
          subject_id: subjectId,
          code: form.code.trim(),
          description: form.description.trim(),
          bloom_level: form.bloom_level,
          difficulty_level: form.difficulty_level,
          display_order: clos.length + 1,
        })
      }

      resetForm()
      await loadClos(subjectId)
    } catch (err) {
      console.error(err)
      alert(t('common.error', 'Error'))
    } finally {
      setSaving(false)
    }
  }

  if (!subjectId) {
    return null
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[160px]">
        <div className="w-10 h-10 border-[3px] border-gray-200 border-t-primary-600 rounded-full animate-spin" />
      </div>
    )
  }

  const gridClass = embedAboutColumn ? 'grid grid-cols-1 lg:grid-cols-2 gap-6' : 'grid grid-cols-1 gap-6'

  const cloWrap = plainSurface
    ? 'p-0 bg-transparent border-0 shadow-none rounded-none'
    : 'bg-white rounded-2xl shadow-sm border border-gray-200 p-6'

  const aboutWrap = plainSurface
    ? 'p-0 bg-transparent border-0 shadow-none rounded-none mt-6 lg:mt-0'
    : 'bg-white rounded-2xl shadow-sm border border-gray-200 p-6'

  return (
    <div className={gridClass}>
      <div className={cloWrap}>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('instructorPortal.learningOutcomesClos')}</h2>

        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('admin.curriculumMap.cloCode')}</label>
            <input
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              value={form.code}
              onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
              placeholder="CLO-1"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.description')}</label>
            <textarea
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              rows={3}
              value={form.description}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('instructorPortal.bloomLevel')}</label>
              <select
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                value={form.bloom_level}
                onChange={(e) => setForm((p) => ({ ...p, bloom_level: e.target.value }))}
              >
                <option value="remember">{t('instructorPortal.bloomRemember')}</option>
                <option value="understand">{t('instructorPortal.bloomUnderstand')}</option>
                <option value="apply">{t('instructorPortal.bloomApply')}</option>
                <option value="analyze">{t('instructorPortal.bloomAnalyze')}</option>
                <option value="evaluate">{t('instructorPortal.bloomEvaluate')}</option>
                <option value="create">{t('instructorPortal.bloomCreate')}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('instructorPortal.difficulty')}</label>
              <select
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                value={form.difficulty_level}
                onChange={(e) => setForm((p) => ({ ...p, difficulty_level: e.target.value }))}
              >
                <option value="low">{t('instructorPortal.difficultyLow')}</option>
                <option value="medium">{t('instructorPortal.difficultyMedium')}</option>
                <option value="high">{t('instructorPortal.difficultyHigh')}</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={saveClo}
              disabled={saving}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg font-medium disabled:opacity-50"
            >
              {editingClo ? t('common.update') : t('common.add')}
            </button>
            {editingClo && (
              <button type="button" onClick={resetForm} className="px-4 py-2 border border-gray-300 rounded-lg">
                {t('common.cancel')}
              </button>
            )}
          </div>
        </div>

        <div className="space-y-3">
          {clos.map((clo) => (
            <div key={clo.id} className="border border-gray-100 rounded-xl p-4 bg-gray-50">
              <div className="flex justify-between gap-2">
                <div>
                  <span className="text-xs font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">{clo.code}</span>
                  <p className="text-sm font-medium text-gray-900 mt-2">{clo.description}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {t('instructorPortal.bloomLevel')}: {bloomLevelLabel(t, clo.bloom_level)} | {t('instructorPortal.difficulty')}:{' '}
                    {difficultyLevelLabel(t, clo.difficulty_level)}
                  </p>
                </div>
                <button type="button" onClick={() => onEdit(clo)} className="text-sm text-primary-600 shrink-0">
                  {t('instructorPortal.edit')}
                </button>
              </div>
            </div>
          ))}
          {clos.length === 0 && <p className="text-gray-500 text-sm">{t('instructorPortal.noData')}</p>}
        </div>
      </div>

      {embedAboutColumn && (
        <div className={aboutWrap}>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">{t('admin.curriculumMap.aboutTitle')}</h2>
          <p className="text-sm text-gray-600 leading-relaxed">{t('admin.curriculumMap.aboutBody')}</p>
          {subjectLabel && <p className="text-sm text-gray-600 mt-4">{subjectLabel}</p>}
        </div>
      )}

      <div className={embedAboutColumn ? 'lg:col-span-2' : ''}>
        <CurriculumReferencesPanel
          subjectId={subjectId}
          clos={clos}
          variant="admin"
          canManageSubjectWide
        />
      </div>
    </div>
  )
}
