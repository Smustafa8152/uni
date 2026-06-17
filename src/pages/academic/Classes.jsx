import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { getLocalizedName } from '../../utils/localizedName'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { Plus, Library, Search, Eye, Edit, Trash2, Loader2 } from 'lucide-react'

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
    <div className="space-y-6">
      <div className={`flex items-center ${isRTL ? 'flex-row-reverse justify-between' : 'justify-between'}`}>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{t('classes.title')}</h1>
          <p className="text-gray-600 mt-1">{t('classes.subtitle')}</p>
        </div>
        <button
          onClick={() => navigate('/academic/classes/create')}
          className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} bg-primary-gradient text-white px-6 py-3 rounded-xl font-semibold shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all`}
        >
          <Plus className="w-5 h-5" />
          <span>{t('classes.create')}</span>
        </button>
      </div>

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

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <div className="relative">
          <Search className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400`} />
          <input
            type="text"
            placeholder={t('classes.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full ${isRTL ? 'pr-10 pl-4' : 'pl-10 pr-4'} py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent`}
          />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredClasses.map((cls) => (
            <div
              key={cls.id}
              className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
            >
              <div className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-3'} mb-4`}>
                <div className="w-12 h-12 bg-primary-gradient rounded-lg flex items-center justify-center">
                  <Library className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{getLocalizedName(cls.subjects, isRTL)}</h3>
                  <p className="text-sm text-gray-500">{cls.code}</p>
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
              <div className={`mt-4 flex items-center ${isRTL ? 'space-x-reverse' : 'space-x-2'}`}>
                <button
                  onClick={() => navigate(`/academic/classes/${cls.id}`)}
                  className={`flex-1 flex items-center justify-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors`}
                >
                  <Eye className="w-4 h-4" />
                  <span>{t('common.view')}</span>
                </button>
                <button
                  onClick={() => navigate(`/academic/classes/${cls.id}/edit`)}
                  className={`flex-1 flex items-center justify-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} px-3 py-2 bg-primary-gradient text-white rounded-lg hover:shadow-lg transition-all`}
                >
                  <Edit className="w-4 h-4" />
                  <span>{t('common.edit')}</span>
                </button>
                {(userRole === 'admin' || userRole === 'user') && (
                  <button
                    type="button"
                    onClick={() => deleteSession(cls)}
                    disabled={deletingId === cls.id}
                    className={`flex items-center justify-center px-3 py-2 rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
                    title={t('common.delete', 'Delete')}
                  >
                    {deletingId === cls.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}


