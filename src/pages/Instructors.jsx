import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../contexts/LanguageContext'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { invokeAdminPasswordReset } from '../utils/invokeAdminPasswordReset'
import PasswordResetModal from '../components/admin/PasswordResetModal'
import CreatePortalAccountModal from '../components/admin/CreatePortalAccountModal'
import {
  Search,
  Plus,
  Edit,
  Eye,
  Mail,
  Phone,
  User,
  Building2,
  BadgeInfo,
  MoreVertical,
  KeyRound,
  UserX,
  UserCheck,
  UserPlus,
} from 'lucide-react'
import { getLocalizedName } from '../utils/localizedName'
import { formatInstructorDisplayName } from '../utils/academicTitle'

export default function Instructors() {
  const { t, i18n } = useTranslation()
  const { isRTL } = useLanguage()
  const isArabicLayout = isRTL ||
    i18n?.language?.toLowerCase()?.startsWith('ar') ||
    (typeof document !== 'undefined' && document?.documentElement?.dir === 'rtl')
  const navigate = useNavigate()
  const { userRole, collegeId } = useAuth()
  const [instructors, setInstructors] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [menuId, setMenuId] = useState(null)
  const [pwdModalInstructorId, setPwdModalInstructorId] = useState(null)
  const [linkPortalInstructor, setLinkPortalInstructor] = useState(null)
  const [pwdLoading, setPwdLoading] = useState(false)
  const [pwdError, setPwdError] = useState('')
  const [toast, setToast] = useState('')

  const canManageAccounts = userRole === 'admin' || userRole === 'user'

  const fetchInstructors = useCallback(async () => {
    try {
      setLoading(true)
      let query = supabase.from('instructors').select('*, departments(name_en, name_ar, code)')
      if (showInactive) {
        query = query.in('status', ['active', 'inactive', 'on_leave'])
      } else {
        query = query.in('status', ['active', 'on_leave'])
      }
      query = query.order('created_at', { ascending: false })

      // Filter by college_id for college admins - only show instructors from their college
      if (userRole === 'user' && collegeId) {
        query = query.eq('college_id', collegeId)
      }
      // For super admins, show all instructors (no filter)

      const { data, error } = await query
      if (error) throw error
      setInstructors(data || [])
    } catch (err) {
      console.error('Error fetching instructors:', err)
    } finally {
      setLoading(false)
    }
  }, [collegeId, userRole, showInactive])

  const setInstructorStatus = async (instructorId, status) => {
    setToast('')
    const { error } = await supabase.from('instructors').update({ status }).eq('id', instructorId)
    if (error) {
      setToast(error.message)
      return
    }
    setToast(status === 'inactive' ? t('adminAccount.deactivateSuccess') : t('adminAccount.reactivateSuccess'))
    fetchInstructors()
    setMenuId(null)
    setTimeout(() => setToast(''), 4000)
  }

  const submitPasswordReset = async (password) => {
    if (!pwdModalInstructorId) return
    setPwdLoading(true)
    setPwdError('')
    try {
      await invokeAdminPasswordReset({ instructorId: pwdModalInstructorId, newPassword: password })
      setPwdModalInstructorId(null)
      setToast(t('adminAccount.passwordResetSuccess'))
      setTimeout(() => setToast(''), 4000)
    } catch (e) {
      const msg = e?.message || String(e)
      if (msg.includes('Failed to fetch') || msg.includes('Function not found')) {
        setPwdError(t('adminAccount.functionNotDeployed'))
      } else {
        setPwdError(msg)
      }
    } finally {
      setPwdLoading(false)
    }
  }

  useEffect(() => {
    fetchInstructors()
  }, [fetchInstructors])

  const getStatusColor = (status) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800'
      case 'on_leave':
        return 'bg-yellow-100 text-yellow-800'
      case 'inactive':
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusLabel = (status) => {
    const normalized = status || 'active'
    if (isArabicLayout) {
      const map = {
        active: 'نشط',
        on_leave: 'في إجازة',
        inactive: 'غير نشط'
      }
      return map[normalized] || normalized
    }
    return normalized.replace('_', ' ')
  }

  const getInstructorDisplayName = (instructor) => {
    const formatted = formatInstructorDisplayName(instructor, isArabicLayout)
    return formatted || '-'
  }

  const filteredInstructors = instructors.filter(instructor =>
    (instructor.name_en && instructor.name_en.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (instructor.name_ar && instructor.name_ar.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (instructor.email && instructor.email.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (instructor.employee_id && instructor.employee_id.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  return (
    <div className="space-y-8">
      {/* Header */}
      <div
        dir={isArabicLayout ? 'rtl' : 'ltr'}
        className="flex items-center justify-between"
      >
        <div className={isArabicLayout ? 'text-right' : 'text-left'}>
          <h1 className="text-3xl font-bold text-gray-900">{t('navigation.instructors')}</h1>
          <p className="text-gray-600 mt-1">{t('instructors.subtitle')}</p>
        </div>
        <button
          onClick={() => navigate('/instructors/create')}
          className={`flex items-center ${isArabicLayout ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} bg-primary-gradient text-white px-6 py-3 rounded-xl font-semibold shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all`}
        >
          <Plus className="w-5 h-5" />
          <span>{t('instructors.addInstructor')}</span>
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

      {/* Search and Filters */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <div className="flex flex-col md:flex-row gap-4 md:items-center">
          <div className="flex-1 relative">
            <Search className={`absolute ${isArabicLayout ? 'right-3' : 'left-3'} top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400`} />
            <input
              type="text"
              placeholder={t('instructors.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full ${isArabicLayout ? 'pr-10 pl-4 text-right' : 'pl-10 pr-4 text-left'} py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent`}
            />
          </div>
          {canManageAccounts && (
            <label className={`flex items-center gap-2 text-sm text-gray-700 ${isArabicLayout ? 'flex-row-reverse' : ''}`}>
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              {t('instructors.includeInactive')}
            </label>
          )}
        </div>
      </div>

      {/* Instructors Grid */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredInstructors.length === 0 ? (
            <div className="col-span-full text-center py-12 text-gray-500">
              {t('instructors.noInstructorsFound')}
            </div>
          ) : (
            filteredInstructors.map((instructor) => (
              <div
                key={instructor.id}
                dir={isArabicLayout ? 'rtl' : 'ltr'}
                className={`bg-white rounded-2xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow ${isArabicLayout ? 'text-right' : 'text-left'}`}
              >
                <div className="flex items-start gap-4 mb-5">
                  <div className="w-14 h-14 bg-primary-gradient rounded-xl flex items-center justify-center flex-shrink-0">
                    <User className="w-7 h-7 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className={`min-w-0 ${isArabicLayout ? 'text-right' : 'text-left'}`}>
                        <h3 className="text-lg font-bold text-gray-900 truncate">
                          {getInstructorDisplayName(instructor)}
                        </h3>
                        <p className="text-sm text-gray-500 mt-1">{instructor.employee_id || '-'}</p>
                      </div>
                      <span
                        className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${getStatusColor(
                          instructor.status || 'active'
                        )}`}
                      >
                        {getStatusLabel(instructor.status || 'active')}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 mb-5">
                  <div className="flex items-center gap-2 text-sm text-gray-600 justify-start">
                    <Mail className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">{instructor.email || '-'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600 justify-start">
                    <Phone className="w-4 h-4 flex-shrink-0" />
                    <span>{instructor.phone || '-'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600 justify-start">
                    <Building2 className="w-4 h-4 flex-shrink-0" />
                    <span className="font-medium">{isArabicLayout ? 'القسم:' : `${t('instructors.department')}:`}</span>
                    <span className="truncate">{isArabicLayout ? (instructor.departments?.name_ar || '-') : (getLocalizedName(instructor.departments, false) || '-')}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600 justify-start">
                    <BadgeInfo className="w-4 h-4 flex-shrink-0" />
                    <span className="truncate">
                      {isArabicLayout
                        ? (instructor.title_ar || '-')
                        : (instructor.title || '-')}
                    </span>
                  </div>
                </div>

                <div className={`grid gap-2 ${canManageAccounts ? 'grid-cols-3' : 'grid-cols-2'}`}>
                  <button
                    onClick={() => navigate(`/instructors/${instructor.id}`)}
                    className="flex items-center justify-center gap-1.5 py-3 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 text-sm font-medium"
                  >
                    <Eye className="w-4 h-4" />
                    {t('common.view')}
                  </button>
                  <button
                    onClick={() => navigate(`/instructors/${instructor.id}/edit`)}
                    className="flex items-center justify-center gap-1.5 py-3 bg-primary-gradient text-white rounded-lg hover:shadow-lg text-sm font-medium"
                  >
                    <Edit className="w-4 h-4" />
                    {t('common.edit')}
                  </button>
                  {canManageAccounts && (
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setMenuId(menuId === instructor.id ? null : instructor.id)}
                        className="w-full flex items-center justify-center gap-1.5 py-3 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 text-sm font-medium"
                        title={t('instructors.moreActions')}
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                      {menuId === instructor.id && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setMenuId(null)} />
                          <div
                            className={`absolute bottom-full mb-1 ${isArabicLayout ? 'left-0' : 'right-0'} z-20 w-52 bg-white rounded-xl shadow-lg border border-gray-200 py-1`}
                          >
                            {instructor.status !== 'inactive' && (
                              <>
                                {instructor.user_id ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setPwdModalInstructorId(instructor.id)
                                      setPwdError('')
                                      setMenuId(null)
                                    }}
                                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 ${isArabicLayout ? 'flex-row-reverse' : ''}`}
                                  >
                                    <KeyRound className="w-4 h-4 shrink-0" />
                                    {t('instructors.resetPassword')}
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (!instructor.email?.trim()) {
                                        setToast(`ERR::${t('adminAccount.noEmailForAccount')}`)
                                        setMenuId(null)
                                        setTimeout(() => setToast(''), 6000)
                                        return
                                      }
                                      setLinkPortalInstructor(instructor)
                                      setMenuId(null)
                                    }}
                                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 ${isArabicLayout ? 'flex-row-reverse' : ''}`}
                                  >
                                    <UserPlus className="w-4 h-4 shrink-0" />
                                    {t('instructors.createPortalLogin')}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (window.confirm(t('instructors.confirmDeactivate'))) {
                                      setInstructorStatus(instructor.id, 'inactive')
                                    }
                                    setMenuId(null)
                                  }}
                                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-amber-800 hover:bg-amber-50 ${isArabicLayout ? 'flex-row-reverse' : ''}`}
                                >
                                  <UserX className="w-4 h-4 shrink-0" />
                                  {t('instructors.deactivate')}
                                </button>
                              </>
                            )}
                            {instructor.status === 'inactive' && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (window.confirm(t('instructors.confirmReactivate'))) {
                                    setInstructorStatus(instructor.id, 'active')
                                  }
                                  setMenuId(null)
                                }}
                                className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-emerald-800 hover:bg-emerald-50 ${isArabicLayout ? 'flex-row-reverse' : ''}`}
                              >
                                <UserCheck className="w-4 h-4 shrink-0" />
                                {t('instructors.reactivate')}
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <PasswordResetModal
        open={pwdModalInstructorId != null}
        onClose={() => {
          setPwdModalInstructorId(null)
          setPwdError('')
        }}
        onSubmit={submitPasswordReset}
        loading={pwdLoading}
        error={pwdError}
      />

      <CreatePortalAccountModal
        open={linkPortalInstructor != null}
        onClose={() => setLinkPortalInstructor(null)}
        kind="instructor"
        recordId={linkPortalInstructor?.id}
        email={linkPortalInstructor?.email}
        collegeId={linkPortalInstructor?.college_id}
        displayName={linkPortalInstructor ? getInstructorDisplayName(linkPortalInstructor) : ''}
        onLinked={() => {
          setToast(t('adminAccount.createPortalAccountSuccess'))
          setLinkPortalInstructor(null)
          fetchInstructors()
          setTimeout(() => setToast(''), 4000)
        }}
      />
    </div>
  )
}
