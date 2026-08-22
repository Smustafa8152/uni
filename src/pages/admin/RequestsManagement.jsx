import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { useAuth } from '../../contexts/AuthContext'
import { useCollege } from '../../contexts/CollegeContext'
import { supabase } from '../../lib/supabase'
import { getLocalizedName } from '../../utils/localizedName'
import { resolveEffectiveCollegeId } from '../../utils/menuPermissions'

const UI = {
  p: '#1a3a6b',
  bg: '#f4f6fb',
  sur: '#ffffff',
  bdr: '#dde3ef',
  txt: '#1e2a3a',
  muted: '#6b7a99',
  ok: '#1a7a4a',
  okBg: '#e6f7ef',
  warn: '#b45309',
  warnBg: '#fef3c7',
  err: '#b91c1c',
  errBg: '#fee2e2',
  info: '#1d4ed8',
  infoBg: '#dbeafe',
  neu: '#4b5563',
  neuBg: '#f3f4f6',
}

function badge(status, t) {
  const s = String(status || '').toLowerCase()
  const map = {
    draft: { bg: UI.neuBg, fg: UI.neu, label: t('studentPortal.requests.statusDraft', 'Draft') },
    submitted: { bg: UI.infoBg, fg: UI.info, label: t('studentPortal.requests.statusSubmitted', 'Submitted') },
    processing: { bg: UI.warnBg, fg: UI.warn, label: t('studentPortal.requests.statusProcessing', 'Processing') },
    completed: { bg: UI.okBg, fg: UI.ok, label: t('studentPortal.requests.statusCompleted', 'Completed') },
    cancelled: { bg: UI.neuBg, fg: UI.neu, label: t('studentPortal.requests.statusCancelled', 'Cancelled') },
    rejected: { bg: UI.errBg, fg: UI.err, label: t('studentPortal.requests.statusRejected', 'Rejected') },
  }
  return map[s] || { bg: UI.neuBg, fg: UI.neu, label: s || t('common.unknown', 'Unknown') }
}

export default function RequestsManagement() {
  const { t, i18n } = useTranslation()
  const { isRTL, language } = useLanguage()
  const isArabic = isRTL || language === 'ar' || i18n?.language?.toLowerCase()?.startsWith('ar')
  const { userRole, collegeId: authCollegeId } = useAuth()
  const { selectedCollegeId } = useCollege()
  const navigate = useNavigate()

  const collegeId = resolveEffectiveCollegeId(userRole, authCollegeId, selectedCollegeId)

  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [error, setError] = useState('')
  const [filters, setFilters] = useState({ q: '', status: 'all' })

  useEffect(() => {
    if (userRole !== 'admin' && userRole !== 'user') return
    if (userRole === 'user' && !collegeId) return
    const load = async () => {
      try {
        setLoading(true)
        setError('')

        let query = supabase
          .from('student_service_requests')
          .select(
            `
            id,
            request_number,
            request_type,
            status,
            created_at,
            description,
            students(id, student_id, name_en, name_ar, first_name, last_name, email, college_id)
          `,
          )
          .order('created_at', { ascending: false })
          .limit(200)

        if (collegeId) query = query.eq('college_id', collegeId)
        const { data, error: qErr } = await query
        if (qErr) throw qErr
        setRows(data || [])
      } catch (e) {
        console.error('RequestsManagement load error:', e)
        setError(e?.message || String(e))
        setRows([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [userRole, collegeId])

  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase()
    return (rows || []).filter((r) => {
      if (filters.status !== 'all' && String(r.status) !== String(filters.status)) return false
      if (!q) return true
      const s = r.students
      const hay = [
        r.request_number,
        r.request_type,
        r.description,
        s?.student_id,
        s?.name_en,
        s?.name_ar,
        s?.email,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [rows, filters.q, filters.status])

  if (userRole !== 'admin' && userRole !== 'user') {
    return (
      <div className="rounded-xl bg-amber-50 border border-amber-200 p-6 text-center">
        <p className="text-amber-800">{t('common.error', 'Forbidden')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6" dir={isArabic ? 'rtl' : 'ltr'}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold" style={{ color: UI.p }}>
            {t('admin.requests.title', 'Student requests')}
          </h1>
          <p className="text-sm" style={{ color: UI.muted }}>
            {t('admin.requests.subtitle', 'View all student service requests and statuses.')}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border shadow-sm p-4" style={{ borderColor: UI.bdr }}>
        <div className="flex flex-wrap gap-3 items-center">
          <input
            className="px-3 py-2 rounded-md border text-sm w-full sm:w-[320px]"
            style={{ borderColor: UI.bdr }}
            placeholder={t('common.search', 'Search')}
            value={filters.q}
            onChange={(e) => setFilters((p) => ({ ...p, q: e.target.value }))}
          />
          <select
            className="px-3 py-2 rounded-md border text-sm"
            style={{ borderColor: UI.bdr }}
            value={filters.status}
            onChange={(e) => setFilters((p) => ({ ...p, status: e.target.value }))}
          >
            <option value="all">{t('common.all', 'All')}</option>
            <option value="submitted">{t('studentPortal.requests.statusSubmitted', 'Submitted')}</option>
            <option value="processing">{t('studentPortal.requests.statusProcessing', 'Processing')}</option>
            <option value="completed">{t('studentPortal.requests.statusCompleted', 'Completed')}</option>
            <option value="cancelled">{t('studentPortal.requests.statusCancelled', 'Cancelled')}</option>
            <option value="rejected">{t('studentPortal.requests.statusRejected', 'Rejected')}</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: '#fecaca', backgroundColor: UI.errBg, color: UI.err }}>
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden" style={{ borderColor: UI.bdr }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: UI.p, color: 'white' }}>
                <th className="px-4 py-3 whitespace-nowrap">{t('studentPortal.requests.requestNumber', 'Request #')}</th>
                <th className="px-4 py-3 whitespace-nowrap">{t('studentPortal.requests.type', 'Type')}</th>
                <th className="px-4 py-3 whitespace-nowrap">{t('viewStudent.studentId', 'Student ID')}</th>
                <th className="px-4 py-3 whitespace-nowrap">{t('common.name', 'Name')}</th>
                <th className="px-4 py-3 whitespace-nowrap">{t('common.date', 'Date')}</th>
                <th className="px-4 py-3 whitespace-nowrap">{t('common.status', 'Status')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center" style={{ color: UI.muted }}>
                    {t('common.loading', 'Loading...')}
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center" style={{ color: UI.muted }}>
                    {t('common.noData', 'No data found')}
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const b = badge(r.status, t)
                  const s = r.students
                  return (
                    <tr
                      key={r.id}
                      className="border-b hover:bg-slate-50 cursor-pointer"
                      style={{ borderColor: UI.bdr }}
                      onClick={() => navigate(`/admin/requests/${r.id}`)}
                      title={t('admin.requests.open', 'Open')}
                    >
                      <td className="px-4 py-3 font-extrabold" dir="ltr">{r.request_number}</td>
                      <td className="px-4 py-3">{r.request_type}</td>
                      <td className="px-4 py-3" dir="ltr">{s?.student_id || '—'}</td>
                      <td className="px-4 py-3">{getLocalizedName(s, isArabic) || s?.email || '—'}</td>
                      <td className="px-4 py-3" dir="ltr">{r.created_at ? new Date(r.created_at).toISOString().slice(0, 10) : '—'}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-extrabold" style={{ backgroundColor: b.bg, color: b.fg }}>
                          {b.label}
                        </span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

