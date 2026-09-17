import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { useAuth } from '../../contexts/AuthContext'
import { useCollege } from '../../contexts/CollegeContext'
import { supabase } from '../../lib/supabase'
import { getLocalizedName } from '../../utils/localizedName'
import { hasUniversityWideScope, resolveEffectiveCollegeId } from '../../utils/menuPermissions'
import ApplicationMessagesPanel from '../../components/admissions/ApplicationMessagesPanel'
import { MessageSquare, Loader2, ExternalLink, Search } from 'lucide-react'

/**
 * Staff/admin inbox of admission application message threads.
 */
export default function StaffCommunication() {
  const { t } = useTranslation()
  const { isRTL, language } = useLanguage()
  const isArabic = isRTL || language === 'ar'
  const navigate = useNavigate()
  const { user, userRole, collegeId: authCollegeId } = useAuth()
  const { selectedCollegeId } = useCollege()
  const universityWide = hasUniversityWideScope(userRole, authCollegeId)
  const effectiveCollegeId = resolveEffectiveCollegeId(userRole, authCollegeId, selectedCollegeId)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [threads, setThreads] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [search, setSearch] = useState('')
  const [staffUserId, setStaffUserId] = useState(null)
  const [unreadOnly, setUnreadOnly] = useState(false)

  const loadThreads = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      let msgQuery = supabase
        .from('application_messages')
        .select('id, application_id, sender_role, body, created_at, read_at')
        .order('created_at', { ascending: false })
        .limit(800)

      const { data: messages, error: mErr } = await msgQuery
      if (mErr) throw mErr

      const byApp = new Map()
      for (const m of messages || []) {
        const aid = m.application_id
        if (!byApp.has(aid)) {
          byApp.set(aid, {
            applicationId: aid,
            lastMessage: m,
            unreadFromApplicant: 0,
            messageCount: 0,
          })
        }
        const row = byApp.get(aid)
        row.messageCount += 1
        if (m.sender_role === 'applicant' && !m.read_at) row.unreadFromApplicant += 1
        if (new Date(m.created_at) > new Date(row.lastMessage.created_at)) row.lastMessage = m
      }

      const appIds = [...byApp.keys()]
      if (!appIds.length) {
        setThreads([])
        setSelectedId(null)
        return
      }

      let appQuery = supabase
        .from('applications')
        .select(
          `
          id,
          application_number,
          first_name,
          last_name,
          email,
          status_code,
          college_id,
          majors!major_id (name_en, name_ar),
          colleges!college_id (name_en, name_ar)
        `,
        )
        .in('id', appIds)

      if (effectiveCollegeId) {
        appQuery = appQuery.eq('college_id', effectiveCollegeId)
      }

      const { data: apps, error: aErr } = await appQuery
      if (aErr) throw aErr

      const appMap = new Map((apps || []).map((a) => [a.id, a]))
      const list = []
      for (const [aid, meta] of byApp) {
        const app = appMap.get(aid)
        if (!app) continue
        list.push({ ...meta, application: app })
      }
      list.sort(
        (a, b) =>
          new Date(b.lastMessage?.created_at || 0).getTime() -
          new Date(a.lastMessage?.created_at || 0).getTime(),
      )
      setThreads(list)
      setSelectedId((prev) => {
        if (prev && list.some((t) => t.applicationId === prev)) return prev
        return list[0]?.applicationId ?? null
      })
    } catch (e) {
      setError(e?.message || t('communication.loadFailed', 'Failed to load conversations'))
    } finally {
      setLoading(false)
    }
  }, [effectiveCollegeId, t])

  useEffect(() => {
    loadThreads()
  }, [loadThreads])

  useEffect(() => {
    if (!user?.email) return
    supabase
      .from('users')
      .select('id')
      .eq('email', user.email)
      .maybeSingle()
      .then(({ data }) => setStaffUserId(data?.id ?? null))
  }, [user?.email])

  const filtered = useMemo(() => {
    let list = threads
    if (unreadOnly) list = list.filter((t) => t.unreadFromApplicant > 0)
    const q = search.trim().toLowerCase()
    if (!q) return list
    return list.filter((t) => {
      const a = t.application
      const name = `${a?.first_name || ''} ${a?.last_name || ''}`.toLowerCase()
      return (
        name.includes(q) ||
        String(a?.email || '')
          .toLowerCase()
          .includes(q) ||
        String(a?.application_number || '')
          .toLowerCase()
          .includes(q)
      )
    })
  }, [threads, search, unreadOnly])

  const selected = useMemo(
    () => threads.find((t) => t.applicationId === selectedId) || null,
    [threads, selectedId],
  )

  const alignStart = isArabic ? 'text-right' : 'text-left'
  const iconRow = isArabic ? 'flex-row-reverse' : 'flex-row'

  return (
    <div className="space-y-4" dir={isArabic ? 'rtl' : 'ltr'}>
      <div className={`flex flex-wrap items-start justify-between gap-3 ${isArabic ? 'flex-row-reverse' : ''}`}>
        <div className={alignStart}>
          <h1 className="text-2xl font-extrabold text-gray-900">
            {t('communication.title', 'Communication')}
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            {t(
              'communication.subtitle',
              'Admission message threads with applicants. Reply here or open the full application.',
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={loadThreads}
          className="px-4 py-2 rounded-xl text-sm font-semibold border border-gray-300 hover:bg-gray-50"
        >
          {t('common.refresh', 'Refresh')}
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm px-4 py-3">{error}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] gap-4 min-h-[70vh]">
        <aside className="bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col overflow-hidden">
          <div className="p-3 border-b border-gray-100 space-y-2">
            <div className="relative">
              <Search
                className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 ${
                  isArabic ? 'right-3' : 'left-3'
                }`}
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('communication.search', 'Search name, email, application…')}
                className={`w-full py-2.5 border border-gray-300 rounded-xl text-sm ${
                  isArabic ? 'pr-9 pl-3' : 'pl-9 pr-3'
                }`}
              />
            </div>
            <label className={`flex items-center gap-2 text-xs font-medium text-gray-700 ${iconRow}`}>
              <input
                type="checkbox"
                checked={unreadOnly}
                onChange={(e) => setUnreadOnly(e.target.checked)}
              />
              {t('communication.unreadOnly', 'Unread from applicants only')}
            </label>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500">
                <Loader2 className="w-5 h-5 animate-spin" />
                {t('common.loading', 'Loading…')}
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-center text-sm text-gray-500">
                <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
                {t('communication.empty', 'No conversations yet. Messages appear when staff or applicants write on an application.')}
              </div>
            ) : (
              <ul>
                {filtered.map((thread) => {
                  const a = thread.application
                  const active = thread.applicationId === selectedId
                  const name = [a.first_name, a.last_name].filter(Boolean).join(' ') || a.email
                  return (
                    <li key={thread.applicationId}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(thread.applicationId)}
                        className={`w-full ${alignStart} px-4 py-3 border-b border-gray-50 transition-colors ${
                          active ? 'bg-indigo-50' : 'hover:bg-gray-50'
                        }`}
                      >
                        <div className={`flex items-start justify-between gap-2 ${isArabic ? 'flex-row-reverse' : ''}`}>
                          <div className="min-w-0">
                            <div className="font-semibold text-sm text-gray-900 truncate">{name}</div>
                            <div className="text-xs text-gray-500 font-mono">{a.application_number}</div>
                            <div className="text-xs text-gray-600 truncate mt-0.5">
                              {getLocalizedName(a.majors, isArabic) ||
                                getLocalizedName(a.colleges, isArabic) ||
                                a.status_code}
                            </div>
                          </div>
                          {thread.unreadFromApplicant > 0 && (
                            <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-600 text-white">
                              {thread.unreadFromApplicant}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                          {thread.lastMessage?.body}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-1">
                          {thread.lastMessage?.created_at
                            ? new Date(thread.lastMessage.created_at).toLocaleString(
                                isArabic ? 'ar' : undefined,
                              )
                            : ''}
                        </p>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </aside>

        <div className="min-w-0 space-y-3">
          {selected ? (
            <>
              <div
                className={`bg-white rounded-2xl border border-gray-200 shadow-sm px-4 py-3 flex flex-wrap items-center justify-between gap-2 ${
                  isArabic ? 'flex-row-reverse' : ''
                }`}
              >
                <div className={alignStart}>
                  <div className="font-bold text-gray-900">
                    {[selected.application.first_name, selected.application.last_name]
                      .filter(Boolean)
                      .join(' ')}
                  </div>
                  <div className="text-xs text-gray-500 font-mono">
                    {selected.application.application_number} · {selected.application.email}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => navigate(`/admissions/applications/${selected.applicationId}`)}
                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold border border-gray-300 hover:bg-gray-50 ${iconRow}`}
                >
                  <ExternalLink className="w-4 h-4" />
                  {t('communication.openApplication', 'Open application')}
                </button>
              </div>
              <ApplicationMessagesPanel
                application={selected.application}
                mode="staff"
                staffUserId={staffUserId}
                isArabicLayout={isArabic}
                alignStart={alignStart}
                iconRow={iconRow}
              />
            </>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-12 text-center text-gray-500 text-sm">
              {t('communication.pickThread', 'Select a conversation to view messages.')}
            </div>
          )}
        </div>
      </div>

      {!universityWide && !authCollegeId && (
        <p className="text-xs text-amber-700">
          {t(
            'communication.collegeHint',
            'Tip: assign a college to your staff account if you only need one college’s threads.',
          )}
        </p>
      )}
      <p className="text-xs text-gray-400">
        <Link to="/admissions/applications" className="underline hover:text-gray-600">
          {t('communication.backToApplications', 'Back to applications')}
        </Link>
      </p>
    </div>
  )
}
