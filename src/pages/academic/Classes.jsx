import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { getLocalizedName } from '../../utils/localizedName'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Plus, Library, Search, Eye, Edit, Trash2 } from 'lucide-react'
import { Badge, Button, EmptyState, PageHeader, Skeleton } from '../../components/ui'
import { Mark, Register, RegisterRow, fieldClass } from '../../components/academic/catalogUi'

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

      <Register
        toolbar={
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
        }
      >
        {loading ? (
          <div className="space-y-px p-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : filteredClasses.length === 0 ? (
          <EmptyState icon={Library} title={t('classes.title')} hint={t('classes.searchPlaceholder')} />
        ) : (
          filteredClasses.map((cls) => (
            <RegisterRow
              key={cls.id}
              mark={<Mark icon={Library} />}
              title={getLocalizedName(cls.subjects, isRTL)}
              code={cls.code}
              tags={cls.is_university_wide ? <Badge tone="info">{t('classes.universityWideLabel')}</Badge> : null}
              detail={
                <span className="flex flex-wrap gap-x-4 gap-y-1">
                  <span>{t('classes.semester')}: {getLocalizedName(cls.semesters, isRTL)}</span>
                  <span>{t('classes.section')}: {cls.section}</span>
                  <span>{t('classes.capacity')}: {cls.enrolled || 0}/{cls.capacity}</span>
                </span>
              }
              actions={
                <>
                  <Button variant="quiet" size="sm" icon={Eye} onClick={() => navigate(`/academic/classes/${cls.id}`)}>
                    {t('common.view')}
                  </Button>
                  <Button size="sm" icon={Edit} onClick={() => navigate(`/academic/classes/${cls.id}/edit`)}>
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
                </>
              }
            />
          ))
        )}
      </Register>
    </div>
  )
}


