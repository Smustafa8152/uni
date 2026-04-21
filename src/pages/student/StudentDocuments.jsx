import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { useAuth } from '../../contexts/AuthContext'
import { supabase, SUPABASE_STORAGE_BUCKET } from '../../lib/supabase'

const UI = {
  p: '#1a3a6b',
  pl: '#2a5298',
  acc: '#c8a84b',
  bg: '#f4f6fb',
  sur: '#ffffff',
  bdr: '#dde3ef',
  txt: '#1e2a3a',
  muted: '#6b7a99',
  ok: '#1a7a4a',
  warn: '#b45309',
  err: '#b91c1c',
}

function formatDate(val, locale) {
  if (!val) return '—'
  const d = new Date(val)
  if (Number.isNaN(d.getTime())) return String(val)
  return d.toLocaleDateString(locale)
}

function isExpired(expiryDate) {
  if (!expiryDate) return false
  const d = new Date(expiryDate)
  if (Number.isNaN(d.getTime())) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  d.setHours(0, 0, 0, 0)
  return d < today
}

function getStatusBadge(status, expired) {
  if (expired) return { key: 'expired', labelKey: 'studentPortal.documents.statusExpired', color: { bg: '#f3f4f6', text: UI.err } }
  const s = String(status || '').toLowerCase()
  if (s === 'verified') return { key: 'verified', labelKey: 'studentPortal.documents.statusVerified', color: { bg: '#e6f7ef', text: UI.ok } }
  if (s === 'in_review' || s === 'review') return { key: 'in-review', labelKey: 'studentPortal.documents.statusInReview', color: { bg: '#dbeafe', text: '#1d4ed8' } }
  return { key: 'pending', labelKey: 'studentPortal.documents.statusPending', color: { bg: '#fef3c7', text: UI.warn } }
}

export default function StudentDocuments() {
  const { t } = useTranslation()
  const { isRTL, language } = useLanguage()
  const { user } = useAuth()

  const [loading, setLoading] = useState(true)
  const [student, setStudent] = useState(null)
  const [docs, setDocs] = useState([])
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)

  const [form, setForm] = useState({
    document_type: '',
    expiry_date: '',
    file: null,
  })

  const locale = language === 'ar' ? 'ar' : undefined
  const isArabic = isRTL || language === 'ar'

  const fetchAll = async () => {
    if (!user?.email) return
    setLoading(true)
    try {
      const { data: sData, error: sErr } = await supabase
        .from('students')
        .select('id, student_id, name_en, name_ar, email')
        .eq('email', user.email)
        .eq('status', 'active')
        .maybeSingle()
      if (sErr) throw sErr
      if (!sData?.id) {
        setStudent(null)
        setDocs([])
        return
      }
      setStudent(sData)

      const { data: dData, error: dErr } = await supabase
        .from('student_documents')
        .select('id, document_type, file_path, file_name, uploaded_at, expiry_date, status, verified_at')
        .eq('student_id', sData.id)
        .order('uploaded_at', { ascending: false })
      if (dErr) throw dErr
      setDocs(dData || [])
    } catch (e) {
      console.error('StudentDocuments fetch error:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email])

  const expiredDocs = useMemo(() => (docs || []).filter((d) => isExpired(d.expiry_date)), [docs])

  const stats = useMemo(() => {
    const total = docs.length
    const expired = expiredDocs.length
    const verified = docs.filter((d) => String(d.status || '').toLowerCase() === 'verified' && !isExpired(d.expiry_date)).length
    const review = docs.filter((d) => ['in_review', 'review'].includes(String(d.status || '').toLowerCase()) && !isExpired(d.expiry_date)).length
    return { total, verified, review, expired }
  }, [docs, expiredDocs])

  const onPickFile = (f) => {
    if (!f) return
    setForm((p) => ({ ...p, file: f }))
  }

  const handleUpload = async (e) => {
    e?.preventDefault?.()
    if (!student?.id) return
    if (!form.document_type || !form.file) return

    try {
      setUploading(true)
      const file = form.file
      const safeName = String(file.name || 'document').replace(/[^\w.\-() ]+/g, '_')
      const ts = new Date().toISOString().replace(/[:.]/g, '-')
      const path = `student-documents/${student.id}/${form.document_type}/${ts}-${safeName}`

      const { error: upErr } = await supabase.storage.from(SUPABASE_STORAGE_BUCKET).upload(path, file, {
        upsert: false,
        contentType: file.type || undefined,
      })
      if (upErr) throw upErr

      const payload = {
        student_id: student.id,
        document_type: form.document_type,
        file_path: path,
        file_name: safeName,
        file_size: file.size || null,
        content_type: file.type || null,
        uploaded_at: new Date().toISOString(),
        expiry_date: form.expiry_date || null,
        status: 'in_review',
      }

      const { error: insErr } = await supabase.from('student_documents').upsert(payload, { onConflict: 'student_id,document_type' })
      if (insErr) throw insErr

      setForm({ document_type: '', expiry_date: '', file: null })
      if (fileRef.current) fileRef.current.value = ''
      await fetchAll()
    } catch (err) {
      console.error('StudentDocuments upload error:', err)
    } finally {
      setUploading(false)
    }
  }

  const handleDownload = async (doc) => {
    try {
      const { data, error } = await supabase.storage.from(SUPABASE_STORAGE_BUCKET).createSignedUrl(doc.file_path, 60)
      if (error) throw error
      if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
    } catch (e) {
      console.error('StudentDocuments download error:', e)
    }
  }

  if (loading && !student) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-slate-600 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className={`space-y-6 ${isRTL ? 'text-right' : 'text-left'}`} dir={isArabic ? 'rtl' : 'ltr'}>
      <nav className="flex flex-wrap items-center gap-2 text-sm" style={{ color: UI.muted }}>
        <a href="/" className="no-underline hover:underline" style={{ color: UI.muted }}>
          {t('studentPortal.documents.breadcrumbHome', { defaultValue: 'Home' })}
        </a>
        <span style={{ color: UI.bdr }}>/</span>
        <a href="/dashboard" className="no-underline hover:underline" style={{ color: UI.muted }}>
          {t('studentPortal.studentPortal', { defaultValue: 'Student Portal' })}
        </a>
        <span style={{ color: UI.bdr }}>/</span>
        <span className="font-semibold" style={{ color: UI.p }}>
          {t('studentPortal.documents.title', { defaultValue: 'Document Center' })}
        </span>
      </nav>

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold" style={{ color: UI.p }}>
            {t('studentPortal.documents.title', { defaultValue: 'Document Center' })}
          </h1>
          <p className="text-sm" style={{ color: UI.muted }}>
            {t('studentPortal.documents.subtitle', { defaultValue: 'Manage your personal and academic official documents' })}
          </p>
        </div>
      </div>

      {expiredDocs.length > 0 && (
        <div className="rounded-lg border-r-4 px-4 py-3 text-sm" style={{ backgroundColor: '#fef3c7', borderColor: UI.warn, color: UI.warn }}>
          ⚠️ {t('studentPortal.documents.expiredDocAlert', { defaultValue: 'Expired document:' })}{' '}
          <strong>{t('studentPortal.documents.expiredDocNameFallback', { defaultValue: 'Document' })}</strong>
          {' — '}
          {t('studentPortal.documents.expiredDocAction', { defaultValue: 'please update it.' })}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-6">
        <div className="space-y-6">
          {/* Uploaded Documents */}
          <div className="bg-white rounded-xl border shadow-sm" style={{ borderColor: UI.bdr }}>
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: UI.bdr }}>
              <div className="text-base font-extrabold" style={{ color: UI.p }}>
                {t('studentPortal.documents.uploadedDocs', { defaultValue: 'Uploaded documents' })}
              </div>
              <button
                type="button"
                className="px-4 py-2 rounded-md text-sm font-extrabold text-white"
                style={{ backgroundColor: UI.p }}
                onClick={() => document.getElementById('student-doc-upload')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              >
                + {t('studentPortal.documents.uploadDoc', { defaultValue: 'Upload document' })}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: UI.p, color: 'white' }}>
                    <th className="px-4 py-3 whitespace-nowrap">{t('studentPortal.documents.colDocType', { defaultValue: 'Document type' })}</th>
                    <th className="px-4 py-3 whitespace-nowrap">{t('studentPortal.documents.colUploadDate', { defaultValue: 'Upload date' })}</th>
                    <th className="px-4 py-3 whitespace-nowrap">{t('studentPortal.documents.colExpiryDate', { defaultValue: 'Expiry date' })}</th>
                    <th className="px-4 py-3 whitespace-nowrap">{t('studentPortal.documents.colStatus', { defaultValue: 'Status' })}</th>
                    <th className="px-4 py-3 whitespace-nowrap">{t('studentPortal.documents.colActions', { defaultValue: 'Actions' })}</th>
                  </tr>
                </thead>
                <tbody>
                  {docs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-5 text-center" style={{ color: UI.muted }}>
                        {t('studentPortal.documents.noDocs', { defaultValue: 'No documents uploaded yet.' })}
                      </td>
                    </tr>
                  ) : (
                    docs.map((d) => {
                      const expired = isExpired(d.expiry_date)
                      const badge = getStatusBadge(d.status || (d.verified_at ? 'verified' : 'in_review'), expired)
                      return (
                        <tr key={d.id} className="border-b" style={{ borderColor: UI.bdr }}>
                          <td className="px-4 py-3 font-semibold" style={{ color: UI.txt }}>
                            {t(`studentPortal.documents.types.${d.document_type}`, { defaultValue: d.document_type })}
                          </td>
                          <td className="px-4 py-3">{formatDate(d.uploaded_at, locale)}</td>
                          <td className="px-4 py-3" style={expired ? { color: UI.err, fontWeight: 800 } : undefined}>
                            {d.expiry_date ? formatDate(d.expiry_date, locale) : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-extrabold"
                              style={{ backgroundColor: badge.color.bg, color: badge.color.text }}
                            >
                              {t(badge.labelKey, { defaultValue: badge.key })}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              className="px-3 py-1.5 rounded-md border text-xs font-extrabold"
                              style={{ backgroundColor: UI.bg, borderColor: UI.bdr, color: UI.txt }}
                              onClick={() => handleDownload(d)}
                            >
                              ⬇ {t('studentPortal.documents.download', { defaultValue: 'Download' })}
                            </button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Official Documents */}
          <div className="bg-white rounded-xl border shadow-sm" style={{ borderColor: UI.bdr }}>
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: UI.bdr }}>
              <div className="text-base font-extrabold" style={{ color: UI.p }}>
                {t('studentPortal.documents.officialDocs', { defaultValue: 'Issued official documents' })}
              </div>
            </div>
            <div className="p-5 text-sm" style={{ color: UI.muted }}>
              {t('studentPortal.documents.officialDocsPlaceholder', { defaultValue: 'This section will list documents issued by the university (PDF) once the requests center is connected.' })}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* Upload New Document */}
          <div id="student-doc-upload" className="bg-white rounded-xl border shadow-sm" style={{ borderColor: UI.bdr }}>
            <div className="px-6 py-4 border-b" style={{ borderColor: UI.bdr }}>
              <div className="text-base font-extrabold" style={{ color: UI.p }}>
                {t('studentPortal.documents.uploadNew', { defaultValue: 'Upload a new document' })}
              </div>
            </div>
            <form className="p-6 space-y-4" onSubmit={handleUpload}>
              <div>
                <label className="block text-sm font-semibold mb-1" style={{ color: UI.txt }}>
                  {t('studentPortal.documents.docType', { defaultValue: 'Document type' })} <span style={{ color: UI.err }}>*</span>
                </label>
                <select
                  className="w-full px-3 py-2.5 rounded-md border bg-white"
                  style={{ borderColor: UI.bdr }}
                  value={form.document_type}
                  required
                  onChange={(e) => setForm((p) => ({ ...p, document_type: e.target.value }))}
                >
                  <option value="">{t('studentPortal.documents.pickDocType', { defaultValue: 'Choose document type…' })}</option>
                  <option value="id_photo">{t('studentPortal.documents.types.id_photo', { defaultValue: 'National ID photo' })}</option>
                  <option value="passport">{t('studentPortal.documents.types.passport', { defaultValue: 'Passport' })}</option>
                  <option value="certificate">{t('studentPortal.documents.types.certificate', { defaultValue: 'Certificate' })}</option>
                  <option value="transcript">{t('studentPortal.documents.types.transcript', { defaultValue: 'Transcript' })}</option>
                  <option value="photo">{t('studentPortal.documents.types.photo', { defaultValue: 'Personal photo' })}</option>
                  <option value="other">{t('studentPortal.documents.types.other', { defaultValue: 'Other' })}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1" style={{ color: UI.txt }}>
                  {t('studentPortal.documents.expiryDate', { defaultValue: 'Expiry date (if any)' })}
                </label>
                <input
                  className="w-full px-3 py-2.5 rounded-md border bg-white"
                  style={{ borderColor: UI.bdr }}
                  type="date"
                  value={form.expiry_date}
                  onChange={(e) => setForm((p) => ({ ...p, expiry_date: e.target.value }))}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1" style={{ color: UI.txt }}>
                  {t('studentPortal.documents.file', { defaultValue: 'File' })} <span style={{ color: UI.err }}>*</span>
                </label>
                <label
                  className="block rounded-xl border-2 border-dashed text-center px-4 py-7 cursor-pointer"
                  style={{ borderColor: UI.bdr, color: UI.muted }}
                >
                  <input
                    ref={fileRef}
                    type="file"
                    className="hidden"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => onPickFile(e.target.files?.[0])}
                  />
                  <div className="text-3xl mb-2">📎</div>
                  <div className="text-sm font-extrabold">{t('studentPortal.documents.pickFile', { defaultValue: 'Click to choose a file' })}</div>
                  <div className="text-xs mt-1">{t('studentPortal.documents.fileHint', { defaultValue: 'PDF, JPG, PNG — max 5MB' })}</div>
                  {form.file?.name && (
                    <div className="text-xs mt-2" style={{ color: UI.txt }}>
                      {form.file.name}
                    </div>
                  )}
                </label>
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-md font-extrabold text-white"
                style={{ backgroundColor: UI.p, opacity: uploading ? 0.7 : 1 }}
                disabled={uploading}
              >
                ↑ {uploading ? t('studentPortal.documents.uploading', { defaultValue: 'Uploading…' }) : t('studentPortal.documents.uploadBtn', { defaultValue: 'Upload document' })}
              </button>
            </form>
          </div>

          {/* Document Stats */}
          <div className="bg-white rounded-xl border shadow-sm" style={{ borderColor: UI.bdr }}>
            <div className="px-6 py-4 border-b" style={{ borderColor: UI.bdr }}>
              <div className="text-base font-extrabold" style={{ color: UI.p }}>
                {t('studentPortal.documents.summary', { defaultValue: 'Documents summary' })}
              </div>
            </div>
            <div className="p-6 text-sm space-y-3">
              <div className="flex items-center justify-between">
                <span style={{ color: UI.muted }}>{t('studentPortal.documents.totalDocs', { defaultValue: 'Total documents' })}</span>
                <strong>{stats.total}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span style={{ color: UI.ok }}>{t('studentPortal.documents.verifiedDocs', { defaultValue: 'Verified' })}</span>
                <strong>{stats.verified}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span style={{ color: '#1d4ed8' }}>{t('studentPortal.documents.reviewDocs', { defaultValue: 'In review' })}</span>
                <strong>{stats.review}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span style={{ color: UI.err }}>{t('studentPortal.documents.expiredDocs', { defaultValue: 'Expired' })}</span>
                <strong>{stats.expired}</strong>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

