import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { getLocalizedName } from '../../utils/localizedName'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Plus, Library, Search, Eye, Edit, Trash2 } from 'lucide-react'
import { Button, EmptyState, PageHeader, Panel, Skeleton } from '../../components/ui'
import { fieldClass } from '../../components/academic/catalogUi'

export default function Classes() {
  const { t } = useTranslation()
  const { isRTL } = useLanguage()
  const navigate = useNavigate()
  const { userRole, collegeId } = useAuth()
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [deletingId, setDeletingId] = useState(null)
  const [toast, setToast] = useState('')

  useEffect(() => {
    fetchClasses()
  }, [collegeId, userRole])

  const fetchClasses = async () => {
    try {
      setLoading(true)
      let query = supabase
        .from('classes')
        .select('*, subjects(name_en, name_ar, code), semesters(name_en, name_ar, code)')
        .eq('status', 'active')
        .order('code')

      if (userRole === 'user' && collegeId) {
        query = query.or(`college_id.eq.${collegeId},is_university_wide.eq.true`)
      }

      const { data, error } = await query
      if (error) throw error
      setClasses(data || [])
    } catch (err) {
      console.error('Error fetching classes:', err)
    } finally {
      setLoading(false)
    }
  }

  const deleteSession = async (cls) => {
    if (!cls?.id) return
    const ok = window.confirm(
      t(
        'classes.confirmDelete',
        'Delete this session section? This can only be done if there are no enrollments.',
      ),
    )
    if (!ok) return

    try {
      setDeletingId(cls.id)
      setToast('')

      const { count: enrollCount, error: enrollErr } = await supabase
        .from('enrollments')
        .select('id', { count: 'exact', head: true })
        .eq('class_id', cls.id)
      if (enrollErr) throw enrollErr
      if ((enrollCount || 0) > 0) {
        setToast(`ERR::${t('classes.cannotDeleteHasEnrollments', 'Cannot delete: students are enrolled. You can deactivate instead.')}`)
        return
      }

      // Clean up dependent rows (FKs are NO ACTION for class_schedules)
      const { error: schedErr } = await supabase.from('class_schedules').delete().eq('class_id', cls.id)
      if (schedErr) throw schedErr

      // Optional cleanups (safe if table exists + RLS allows)
      await supabase.from('class_teams_meetings').delete().eq('class_id', cls.id)

      const { error: delErr } = await supabase.from('classes').delete().eq('id', cls.id)
      if (delErr) throw delErr

      setToast(t('classes.deleteSuccess', 'Session deleted.'))
      fetchClasses()
    } catch (e) {
      console.error('Delete session failed:', e)
      setToast(`ERR::${e?.message || t('classes.deleteFailed', 'Failed to delete session.')}`)
    } finally {
      setDeletingId(null)
      setTimeout(() => setToast(''), 6000)
    }
  }

  const filteredClasses = classes.filter(cls => {
    const subjectName = getLocalizedName(cls.subjects, isRTL)
    return cls.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (subjectName && subjectName.toLowerCase().includes(searchQuery.toLowerCase()))
  })

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('classes.title')}
        subtitle={t('classes.subtitle')}
        actions={
          <Button icon={Plus} onClick={() => navigate('/academic/classes/create')}>
            {t('classes.create')}
          </Button>
        }
      />

      {toast && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            toast.startsWith('ERR::')
              ? 'border-red-200 bg-red-50 text-red-900'
              : 'border-emerald-200 bg-emerald-50 text-emerald-900'
          }`}
        >
          {toast.startsWith('ERR::') ? toast.slice(5) : toast}
        </div>
      )}

      <Panel>
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            type="text"
            placeholder={t('classes.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`${fieldClass} ps-9`}
            aria-label={t('classes.searchPlaceholder')}
          />
        </div>
      </Panel>

      {loading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : filteredClasses.length === 0 ? (
        <Panel>
          <EmptyState icon={Library} title={t('classes.title')} hint={t('classes.searchPlaceholder')} />
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredClasses.map((cls) => (
            <div
              key={cls.id}
              className="rounded-2xl border border-[#dde3ef] bg-white p-5"
            >
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#eef2f9] text-[#1a3a6b]">
                  <Library className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <h3 className="truncate text-base font-extrabold text-[#1a3a6b]">{getLocalizedName(cls.subjects, isRTL)}</h3>
                  <p className="text-sm text-slate-500">{cls.code}</p>
                </div>
              </div>
              <div className="space-y-2 text-sm text-gray-600">
                <p><strong>{t('classes.subject')}:</strong> {cls.subjects?.code} - {getLocalizedName(cls.subjects, isRTL)}</p>
                <p><strong>{t('classes.semester')}:</strong> {getLocalizedName(cls.semesters, isRTL)}</p>
                <p><strong>{t('classes.section')}:</strong> {cls.section}</p>
                <p><strong>{t('classes.capacity')}:</strong> {cls.enrolled || 0}/{cls.capacity}</p>
                {cls.is_university_wide && (
                  <span className="inline-block px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                    {t('classes.universityWideLabel')}
                  </span>
                )}
              </div>
              <div className="mt-4 flex items-center gap-2">
                <Button variant="quiet" size="sm" className="flex-1" icon={Eye} onClick={() => navigate(`/academic/classes/${cls.id}`)}>
                  {t('common.view')}
                </Button>
                <Button size="sm" className="flex-1" icon={Edit} onClick={() => navigate(`/academic/classes/${cls.id}/edit`)}>
                  {t('common.edit')}
                </Button>
                {(userRole === 'admin' || userRole === 'user') && (
                  <Button
                    variant="danger"
                    size="sm"
                    icon={Trash2}
                    loading={deletingId === cls.id}
                    onClick={() => deleteSession(cls)}
                    title={t('common.delete', 'Delete')}
                    aria-label={t('common.delete', 'Delete')}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}


