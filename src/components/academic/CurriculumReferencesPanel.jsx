import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase, SUPABASE_STORAGE_BUCKET } from '../../lib/supabase'

const REFERENCE_TYPES = ['textbook', 'reading', 'article', 'standard', 'other']

const emptyForm = {
  title: '',
  author: '',
  reference_type: 'reading',
  file_url: '',
  file_name: '',
  file_size: null,
}

function typeLabel(t, type) {
  const key = `curriculumReferences.type${type.charAt(0).toUpperCase()}${type.slice(1)}`
  return t(`instructorPortal.${key}`, type)
}

/**
 * Course references with PDF upload — curriculum map (admin subject-wide or instructor per section).
 */
export default function CurriculumReferencesPanel({
  subjectId,
  classId = null,
  clos = [],
  variant = 'instructor',
  canManageSubjectWide = false,
}) {
  const { t } = useTranslation()
  const isInstructor = variant === 'instructor'

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [references, setReferences] = useState([])
  const [form, setForm] = useState(emptyForm)
  const [selectedCloIds, setSelectedCloIds] = useState([])
  const [editingId, setEditingId] = useState(null)
  const [showForm, setShowForm] = useState(false)

  const loadReferences = useCallback(async () => {
    if (!subjectId) {
      setReferences([])
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      let query = supabase
        .from('subject_course_references')
        .select(`
          id,
          subject_id,
          class_id,
          title,
          title_ar,
          author,
          description,
          reference_type,
          file_url,
          file_name,
          file_size,
          external_url,
          display_order,
          is_published,
          created_at,
          subject_course_reference_clos(clo_id, subject_learning_outcomes(id, code))
        `)
        .eq('subject_id', subjectId)
        .order('display_order', { ascending: true })
        .order('id', { ascending: true })

      if (classId) {
        query = query.or(`class_id.is.null,class_id.eq.${classId}`)
      } else {
        query = query.is('class_id', null)
      }

      const { data, error } = await query
      if (error) throw error
      setReferences(data || [])
    } catch (err) {
      console.error(err)
      setReferences([])
    } finally {
      setLoading(false)
    }
  }, [subjectId, classId])

  useEffect(() => {
    loadReferences()
  }, [loadReferences])

  const subjectWideRefs = useMemo(
    () => references.filter((r) => r.class_id == null),
    [references],
  )
  const sectionRefs = useMemo(
    () => references.filter((r) => r.class_id != null),
    [references],
  )

  const resetForm = () => {
    setForm(emptyForm)
    setSelectedCloIds([])
    setEditingId(null)
    setShowForm(false)
  }

  const startEdit = (ref) => {
    if (ref.class_id == null && !canManageSubjectWide) return
    setEditingId(ref.id)
    setForm({
      title: ref.title || '',
      author: ref.author || '',
      reference_type: ref.reference_type || 'reading',
      file_url: ref.file_url || '',
      file_name: ref.file_name || '',
      file_size: ref.file_size || null,
    })
    setSelectedCloIds(
      (ref.subject_course_reference_clos || []).map((m) => m.clo_id).filter(Boolean),
    )
    setShowForm(true)
  }

  const uploadPdf = async (file) => {
    if (!file || !subjectId) return
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      alert(t('instructorPortal.curriculumReferencesPdfOnly'))
      return
    }

    setUploading(true)
    try {
      const scope = classId ? `class_${classId}` : `subject_${subjectId}`
      const path = `curriculum-references/${subjectId}/${scope}/${Date.now()}.pdf`
      const { error: upErr } = await supabase.storage.from(SUPABASE_STORAGE_BUCKET).upload(path, file)
      if (upErr) throw upErr
      const {
        data: { publicUrl },
      } = supabase.storage.from(SUPABASE_STORAGE_BUCKET).getPublicUrl(path)
      setForm((p) => ({
        ...p,
        file_url: publicUrl,
        file_name: file.name,
        file_size: file.size,
      }))
    } catch (err) {
      console.error(err)
      alert(t('common.error', 'Upload failed'))
    } finally {
      setUploading(false)
    }
  }

  const saveReference = async () => {
    if (!subjectId || !form.title.trim()) return
    if (!form.file_url && !editingId) {
      alert(t('instructorPortal.curriculumReferencesPdfRequired'))
      return
    }

    setSaving(true)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      const { data: userRow } = await supabase.from('users').select('id').eq('email', user?.email).maybeSingle()

      const payload = {
        subject_id: subjectId,
        class_id: canManageSubjectWide && !classId ? null : classId,
        title: form.title.trim(),
        author: form.author.trim() || null,
        reference_type: form.reference_type,
        file_url: form.file_url || null,
        file_name: form.file_name || null,
        file_size: form.file_size || null,
        is_published: true,
        updated_at: new Date().toISOString(),
      }

      let referenceId = editingId

      if (editingId) {
        const { error } = await supabase.from('subject_course_references').update(payload).eq('id', editingId)
        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('subject_course_references')
          .insert({
            ...payload,
            display_order: references.length + 1,
            created_by: userRow?.id || null,
          })
          .select('id')
          .single()
        if (error) throw error
        referenceId = data?.id
      }

      if (referenceId) {
        await supabase.from('subject_course_reference_clos').delete().eq('reference_id', referenceId)
        if (selectedCloIds.length) {
          const rows = selectedCloIds.map((cloId) => ({ reference_id: referenceId, clo_id: cloId }))
          const { error: cloErr } = await supabase.from('subject_course_reference_clos').insert(rows)
          if (cloErr) throw cloErr
        }
      }

      resetForm()
      await loadReferences()
    } catch (err) {
      console.error(err)
      alert(t('common.error', 'Error'))
    } finally {
      setSaving(false)
    }
  }

  const deleteReference = async (ref) => {
    if (ref.class_id == null && !canManageSubjectWide) return
    if (!window.confirm(t('instructorPortal.curriculumReferencesDeleteConfirm'))) return
    try {
      const { error } = await supabase.from('subject_course_references').delete().eq('id', ref.id)
      if (error) throw error
      if (editingId === ref.id) resetForm()
      await loadReferences()
    } catch (err) {
      console.error(err)
      alert(t('common.error', 'Error'))
    }
  }

  const renderReferenceRow = (ref, { readOnly = false } = {}) => {
    const cloTags = (ref.subject_course_reference_clos || [])
      .map((m) => m.subject_learning_outcomes?.code || clos.find((c) => c.id === m.clo_id)?.code)
      .filter(Boolean)

    const rowStyle = isInstructor
      ? {
          background: 'var(--bg)',
          borderRadius: 'var(--rs)',
          padding: 14,
          border: '1px solid var(--bdr)',
        }
      : {
          background: '#f9fafb',
          borderRadius: 12,
          padding: 14,
          border: '1px solid #e5e7eb',
        }

    return (
      <div key={ref.id} style={rowStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 4 }}>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--info)',
                  background: 'var(--info-bg)',
                  padding: '2px 8px',
                  borderRadius: 20,
                }}
              >
                {typeLabel(t, ref.reference_type)}
              </span>
              {readOnly && (
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {t('instructorPortal.curriculumReferencesCourseWide')}
                </span>
              )}
            </div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{ref.title}</div>
            {ref.author && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{ref.author}</div>}
            {cloTags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                {cloTags.map((code) => (
                  <span
                    key={code}
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: 'var(--ok)',
                      background: 'var(--ok-bg)',
                      padding: '2px 6px',
                      borderRadius: 4,
                    }}
                  >
                    {code}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
            {ref.file_url && (
              <a href={ref.file_url} target="_blank" rel="noopener noreferrer" className="btn btn-gh btn-sm">
                📄 {t('instructorPortal.curriculumReferencesViewPdf')}
              </a>
            )}
            {!readOnly && (
              <>
                <button type="button" className="btn btn-gh btn-sm" onClick={() => startEdit(ref)}>
                  {t('instructorPortal.edit')}
                </button>
                <button type="button" className="btn btn-err btn-sm" onClick={() => deleteReference(ref)}>
                  {t('common.delete')}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }

  const formBlock = showForm && (
    <div
      style={
        isInstructor
          ? { marginTop: 16, padding: 14, background: 'var(--bg)', borderRadius: 'var(--rs)', border: '1px solid var(--bdr)' }
          : { marginTop: 16, padding: 16, background: '#f9fafb', borderRadius: 12, border: '1px solid #e5e7eb' }
      }
    >
      <div className={isInstructor ? 'fg' : undefined} style={!isInstructor ? { marginBottom: 12 } : undefined}>
        <label className={isInstructor ? 'fl' : 'block text-sm font-medium text-gray-700 mb-1'}>
          <span className="req">*</span> {t('instructorPortal.curriculumReferencesTitle')}
        </label>
        <input
          className={isInstructor ? 'fc' : 'w-full px-4 py-2 border border-gray-300 rounded-lg'}
          value={form.title}
          onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
          placeholder={t('instructorPortal.curriculumReferencesTitlePlaceholder')}
        />
      </div>
      <div className={isInstructor ? 'fr' : 'grid grid-cols-1 sm:grid-cols-2 gap-4'} style={isInstructor ? { marginBottom: 0 } : { marginBottom: 12 }}>
        <div className={isInstructor ? 'fg' : undefined}>
          <label className={isInstructor ? 'fl' : 'block text-sm font-medium text-gray-700 mb-1'}>
            {t('instructorPortal.curriculumReferencesAuthor')}
          </label>
          <input
            className={isInstructor ? 'fc' : 'w-full px-4 py-2 border border-gray-300 rounded-lg'}
            value={form.author}
            onChange={(e) => setForm((p) => ({ ...p, author: e.target.value }))}
          />
        </div>
        <div className={isInstructor ? 'fg' : undefined}>
          <label className={isInstructor ? 'fl' : 'block text-sm font-medium text-gray-700 mb-1'}>
            {t('instructorPortal.curriculumReferencesType')}
          </label>
          <select
            className={isInstructor ? 'fc' : 'w-full px-4 py-2 border border-gray-300 rounded-lg'}
            value={form.reference_type}
            onChange={(e) => setForm((p) => ({ ...p, reference_type: e.target.value }))}
          >
            {REFERENCE_TYPES.map((rt) => (
              <option key={rt} value={rt}>
                {typeLabel(t, rt)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className={isInstructor ? 'fg' : undefined} style={!isInstructor ? { marginBottom: 12 } : undefined}>
        <label className={isInstructor ? 'fl' : 'block text-sm font-medium text-gray-700 mb-1'}>
          <span className="req">*</span> {t('instructorPortal.curriculumReferencesPdfFile')}
        </label>
        <input
          type="file"
          accept="application/pdf,.pdf"
          className={isInstructor ? 'fc' : 'w-full text-sm'}
          disabled={uploading}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) uploadPdf(f)
            e.target.value = ''
          }}
        />
        {uploading && <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>{t('instructorPortal.uploadingFile')}</p>}
        {form.file_name && (
          <p style={{ fontSize: 12, marginTop: 6, color: 'var(--ok)' }}>
            {t('instructorPortal.curriculumReferencesAttached')}: {form.file_name}
          </p>
        )}
      </div>
      {clos.length > 0 && (
        <div className={isInstructor ? 'fg' : undefined} style={!isInstructor ? { marginBottom: 12 } : undefined}>
          <label className={isInstructor ? 'fl' : 'block text-sm font-medium text-gray-700 mb-1'}>
            {t('instructorPortal.linkToLearningOutcomes')}
          </label>
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
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        <button type="button" className="btn btn-p btn-sm" onClick={saveReference} disabled={saving || uploading}>
          {saving ? t('common.loading') : editingId ? t('common.update') : t('common.add')}
        </button>
        <button type="button" className="btn btn-gh btn-sm" onClick={resetForm}>
          {t('common.cancel')}
        </button>
      </div>
    </div>
  )

  const wrapClass = isInstructor ? 'card' : 'bg-white rounded-2xl shadow-sm border border-gray-200 p-6'

  if (!subjectId) return null

  return (
    <div className={wrapClass} style={isInstructor ? { marginTop: 16 } : undefined}>
      <div className={isInstructor ? 'card-hd' : 'flex justify-between items-center gap-4 mb-4'}>
        <div className={isInstructor ? 'card-title' : 'text-lg font-semibold text-gray-900'}>
          📚 {t('instructorPortal.curriculumReferencesTitleSection')}
        </div>
        {(classId || canManageSubjectWide) && !showForm && (
          <button type="button" className="btn btn-p btn-sm" onClick={() => setShowForm(true)}>
            + {t('instructorPortal.curriculumReferencesAdd')}
          </button>
        )}
      </div>

      {loading ? (
        <p style={{ color: 'var(--muted)', fontSize: 13 }}>{t('common.loading')}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {classId && subjectWideRefs.length > 0 && (
            <>
              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', margin: 0 }}>
                {t('instructorPortal.curriculumReferencesCourseWideList')}
              </p>
              {subjectWideRefs.map((ref) => renderReferenceRow(ref, { readOnly: true }))}
            </>
          )}

          {classId ? (
            sectionRefs.length > 0 ? (
              sectionRefs.map((ref) => renderReferenceRow(ref))
            ) : (
              !subjectWideRefs.length && (
                <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
                  {t('instructorPortal.curriculumReferencesEmpty')}
                </p>
              )
            )
          ) : references.length > 0 ? (
            references.map((ref) => renderReferenceRow(ref))
          ) : (
            <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
              {t('instructorPortal.curriculumReferencesEmpty')}
            </p>
          )}
        </div>
      )}

      {formBlock}
    </div>
  )
}
