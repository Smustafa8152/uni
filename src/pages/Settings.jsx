import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../contexts/LanguageContext'
import { Save, User, Bell, Shield, UserPlus } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { createAuthUser } from '../lib/createAuthUser'
import { supabase } from '../lib/supabase'
import MenuPermissionsPicker from '../components/admin/MenuPermissionsPicker'
import { defaultMenuPermissions, normalizeMenuPermissions } from '../utils/menuPermissions'

export default function Settings() {
  const { t, i18n } = useTranslation()
  const { isRTL, language } = useLanguage()
  const { userRole } = useAuth()
  const isArabicLayout =
    isRTL ||
    language === 'ar' ||
    i18n?.language?.toLowerCase()?.startsWith('ar') ||
    (typeof document !== 'undefined' && document?.documentElement?.dir === 'rtl')
  const alignStart = isArabicLayout ? 'text-right' : 'text-left'
  const iconRow = isArabicLayout ? 'flex-row-reverse' : ''

  const [settings, setSettings] = useState({
    notifications: {
      email: true,
      sms: false,
      push: true,
    },
    profile: {
      name: 'Admin User',
      email: 'admin@university.edu',
      language: 'en',
      timezone: 'Asia/Riyadh',
    },
    security: {
      twoFactor: false,
      sessionTimeout: 30,
    },
  })

  const [saEmail, setSaEmail] = useState('')
  const [saName, setSaName] = useState('')
  const [saPassword, setSaPassword] = useState('')
  const [saConfirm, setSaConfirm] = useState('')
  const [saLoading, setSaLoading] = useState(false)
  const [saError, setSaError] = useState('')
  const [saSuccess, setSaSuccess] = useState('')
  const [saListLoading, setSaListLoading] = useState(false)
  const [saListError, setSaListError] = useState('')
  const [superAdmins, setSuperAdmins] = useState([])

  const [staffName, setStaffName] = useState('')
  const [staffEmail, setStaffEmail] = useState('')
  const [staffPassword, setStaffPassword] = useState('')
  const [staffConfirm, setStaffConfirm] = useState('')
  const [staffMenus, setStaffMenus] = useState(() => defaultMenuPermissions())
  const [staffLoading, setStaffLoading] = useState(false)
  const [staffError, setStaffError] = useState('')
  const [staffSuccess, setStaffSuccess] = useState('')
  const [staffListLoading, setStaffListLoading] = useState(false)
  const [staffListError, setStaffListError] = useState('')
  const [staffUsers, setStaffUsers] = useState([])
  const [editingStaffId, setEditingStaffId] = useState(null)
  const [editingMenus, setEditingMenus] = useState([])
  const [staffSaveBusy, setStaffSaveBusy] = useState(false)

  const loadSuperAdmins = async () => {
    if (userRole !== 'admin') return
    setSaListLoading(true)
    setSaListError('')
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, email, createdAt')
        .eq('role', 'admin')
        .order('createdAt', { ascending: false })
        .limit(200)
      if (error) throw error
      setSuperAdmins(data || [])
    } catch (e) {
      setSaListError(e?.message || String(e))
    } finally {
      setSaListLoading(false)
    }
  }

  const loadStaffUsers = async () => {
    if (userRole !== 'admin') return
    setStaffListLoading(true)
    setStaffListError('')
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, email, menu_permissions, createdAt')
        .eq('role', 'user')
        .order('createdAt', { ascending: false })
        .limit(200)
      if (error) throw error
      setStaffUsers(data || [])
    } catch (e) {
      setStaffListError(e?.message || String(e))
    } finally {
      setStaffListLoading(false)
    }
  }

  useEffect(() => {
    if (userRole === 'admin') {
      loadSuperAdmins()
      loadStaffUsers()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userRole])

  const handleCreateSuperAdmin = async (e) => {
    e.preventDefault()
    setSaError('')
    setSaSuccess('')

    const email = saEmail.trim().toLowerCase()
    if (!email || !email.includes('@')) {
      setSaError(t('settings.superAdminCreate.invalidEmail', 'Please enter a valid email.'))
      return
    }
    if (saPassword.length < 6) {
      setSaError(t('settings.superAdminCreate.passwordMin', 'Password must be at least 6 characters.'))
      return
    }
    if (saPassword !== saConfirm) {
      setSaError(t('settings.superAdminCreate.passwordMismatch', 'Passwords do not match.'))
      return
    }

    setSaLoading(true)
    try {
      const authResult = await createAuthUser({
        email,
        password: saPassword,
        role: 'admin',
        college_id: null,
        name: (saName.trim() || email).trim(),
      })

      const body = authResult?.data ?? authResult
      if (body && typeof body === 'object' && body.error) {
        setSaError(String(body.error))
        return
      }

      setSaSuccess(t('settings.superAdminCreate.success', 'Super admin user created successfully.'))
      setSaEmail('')
      setSaName('')
      setSaPassword('')
      setSaConfirm('')
      loadSuperAdmins()
    } catch (err) {
      setSaError(err?.message || String(err))
    } finally {
      setSaLoading(false)
    }
  }

  const handleCreateStaffUser = async (e) => {
    e.preventDefault()
    setStaffError('')
    setStaffSuccess('')

    const email = staffEmail.trim().toLowerCase()
    if (!email || !email.includes('@')) {
      setStaffError(t('settings.staffUser.invalidEmail', 'Please enter a valid email.'))
      return
    }
    if (staffPassword.length < 6) {
      setStaffError(t('settings.staffUser.passwordMin', 'Password must be at least 6 characters.'))
      return
    }
    if (staffPassword !== staffConfirm) {
      setStaffError(t('settings.staffUser.passwordMismatch', 'Passwords do not match.'))
      return
    }
    const menus = normalizeMenuPermissions(staffMenus) || defaultMenuPermissions()
    if (!menus.length) {
      setStaffError(t('settings.staffUser.menusRequired', 'Select at least one menu item.'))
      return
    }

    setStaffLoading(true)
    try {
      const authResult = await createAuthUser({
        email,
        password: staffPassword,
        role: 'user',
        college_id: null,
        name: (staffName.trim() || email).trim(),
        menu_permissions: menus,
      })

      const body = authResult?.data ?? authResult
      if (body && typeof body === 'object' && body.error) {
        setStaffError(String(body.error))
        return
      }

      // Ensure menus are saved even if the Edge Function has not been redeployed yet
      const createdId = body?.user?.id || body?.data?.user?.id
      if (createdId) {
        await supabase.from('users').update({ menu_permissions: menus }).eq('id', createdId)
      } else if (email) {
        await supabase.from('users').update({ menu_permissions: menus }).eq('email', email)
      }

      setStaffSuccess(t('settings.staffUser.success', 'Staff user created successfully.'))
      setStaffName('')
      setStaffEmail('')
      setStaffPassword('')
      setStaffConfirm('')
      setStaffMenus(defaultMenuPermissions())
      loadStaffUsers()
    } catch (err) {
      setStaffError(err?.message || String(err))
    } finally {
      setStaffLoading(false)
    }
  }

  const startEditMenus = (row) => {
    setEditingStaffId(row.id)
    setEditingMenus(normalizeMenuPermissions(row.menu_permissions) || defaultMenuPermissions())
  }

  const saveStaffMenus = async (userId) => {
    setStaffSaveBusy(true)
    setStaffListError('')
    try {
      const menus = normalizeMenuPermissions(editingMenus) || defaultMenuPermissions()
      const { error } = await supabase
        .from('users')
        .update({ menu_permissions: menus })
        .eq('id', userId)
      if (error) throw error
      setEditingStaffId(null)
      await loadStaffUsers()
    } catch (e) {
      setStaffListError(e?.message || String(e))
    } finally {
      setStaffSaveBusy(false)
    }
  }

  const handleSave = () => {
    alert(t('settings.savedAlert'))
  }

  return (
    <div className="space-y-6" dir={isArabicLayout ? 'rtl' : 'ltr'}>
      <div className={alignStart}>
        <h1 className="text-3xl font-bold text-gray-900">{t('settings.title')}</h1>
        <p className="text-gray-600 mt-1">{t('settings.pageSubtitle')}</p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <div className={`flex items-center gap-3 mb-6 w-full ${isArabicLayout ? 'justify-start' : ''}`}>
          {isArabicLayout ? (
            <>
              <h2 className={`text-xl font-bold text-gray-900 ${alignStart}`}>{t('settings.profileTitle')}</h2>
              <User className="w-6 h-6 text-primary-600 shrink-0" />
            </>
          ) : (
            <>
              <User className="w-6 h-6 text-primary-600 shrink-0" />
              <h2 className={`text-xl font-bold text-gray-900 ${alignStart}`}>{t('settings.profileTitle')}</h2>
            </>
          )}
        </div>
        <div className="space-y-4">
          <div>
            <label className={`block text-sm font-medium text-gray-700 mb-2 ${alignStart}`}>{t('settings.fullName')}</label>
            <input
              type="text"
              value={settings.profile.name}
              onChange={(e) => setSettings({ ...settings, profile: { ...settings.profile, name: e.target.value } })}
              className={`w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent ${alignStart}`}
            />
          </div>
          <div>
            <label className={`block text-sm font-medium text-gray-700 mb-2 ${alignStart}`}>{t('settings.email')}</label>
            <input
              type="email"
              value={settings.profile.email}
              onChange={(e) => setSettings({ ...settings, profile: { ...settings.profile, email: e.target.value } })}
              className={`w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent ${alignStart}`}
              dir="ltr"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={`block text-sm font-medium text-gray-700 mb-2 ${alignStart}`}>{t('settings.language')}</label>
              <select
                value={settings.profile.language}
                onChange={(e) => setSettings({ ...settings, profile: { ...settings.profile, language: e.target.value } })}
                className={`w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent ${alignStart}`}
              >
                <option value="en">{t('settings.langEn')}</option>
                <option value="ar">{t('settings.langAr')}</option>
              </select>
            </div>
            <div>
              <label className={`block text-sm font-medium text-gray-700 mb-2 ${alignStart}`}>{t('settings.timezone')}</label>
              <select
                value={settings.profile.timezone}
                onChange={(e) => setSettings({ ...settings, profile: { ...settings.profile, timezone: e.target.value } })}
                className={`w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent ${alignStart}`}
                dir="ltr"
              >
                <option value="Asia/Riyadh">{t('settings.tzRiyadh')}</option>
                <option value="UTC">{t('settings.tzUtc')}</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <div className={`flex items-center gap-3 mb-6 w-full ${isArabicLayout ? 'justify-start' : ''}`}>
          {isArabicLayout ? (
            <>
              <h2 className={`text-xl font-bold text-gray-900 ${alignStart}`}>{t('settings.notificationsTitle')}</h2>
              <Bell className="w-6 h-6 text-primary-600 shrink-0" />
            </>
          ) : (
            <>
              <Bell className="w-6 h-6 text-primary-600 shrink-0" />
              <h2 className={`text-xl font-bold text-gray-900 ${alignStart}`}>{t('settings.notificationsTitle')}</h2>
            </>
          )}
        </div>
        <div className="space-y-4">
          <label
            className={`flex items-center justify-between gap-4 p-4 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors ${iconRow}`}
          >
            <div className={`min-w-0 flex-1 ${alignStart}`}>
              <p className="font-medium text-gray-900">{t('settings.emailNotif')}</p>
              <p className="text-sm text-gray-600">{t('settings.emailNotifHint')}</p>
            </div>
            <input
              type="checkbox"
              checked={settings.notifications.email}
              onChange={(e) =>
                setSettings({ ...settings, notifications: { ...settings.notifications, email: e.target.checked } })
              }
              className="w-5 h-5 text-primary-600 rounded focus:ring-primary-500 shrink-0"
            />
          </label>
          <label
            className={`flex items-center justify-between gap-4 p-4 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors ${iconRow}`}
          >
            <div className={`min-w-0 flex-1 ${alignStart}`}>
              <p className="font-medium text-gray-900">{t('settings.smsNotif')}</p>
              <p className="text-sm text-gray-600">{t('settings.smsNotifHint')}</p>
            </div>
            <input
              type="checkbox"
              checked={settings.notifications.sms}
              onChange={(e) =>
                setSettings({ ...settings, notifications: { ...settings.notifications, sms: e.target.checked } })
              }
              className="w-5 h-5 text-primary-600 rounded focus:ring-primary-500 shrink-0"
            />
          </label>
          <label
            className={`flex items-center justify-between gap-4 p-4 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors ${iconRow}`}
          >
            <div className={`min-w-0 flex-1 ${alignStart}`}>
              <p className="font-medium text-gray-900">{t('settings.pushNotif')}</p>
              <p className="text-sm text-gray-600">{t('settings.pushNotifHint')}</p>
            </div>
            <input
              type="checkbox"
              checked={settings.notifications.push}
              onChange={(e) =>
                setSettings({ ...settings, notifications: { ...settings.notifications, push: e.target.checked } })
              }
              className="w-5 h-5 text-primary-600 rounded focus:ring-primary-500 shrink-0"
            />
          </label>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <div className={`flex items-center gap-3 mb-6 w-full ${isArabicLayout ? 'justify-start' : ''}`}>
          {isArabicLayout ? (
            <>
              <h2 className={`text-xl font-bold text-gray-900 ${alignStart}`}>{t('settings.securityTitle')}</h2>
              <Shield className="w-6 h-6 text-primary-600 shrink-0" />
            </>
          ) : (
            <>
              <Shield className="w-6 h-6 text-primary-600 shrink-0" />
              <h2 className={`text-xl font-bold text-gray-900 ${alignStart}`}>{t('settings.securityTitle')}</h2>
            </>
          )}
        </div>
        <div className="space-y-4">
          <label
            className={`flex items-center justify-between gap-4 p-4 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors ${iconRow}`}
          >
            <div className={`min-w-0 flex-1 ${alignStart}`}>
              <p className="font-medium text-gray-900">{t('settings.twoFactor')}</p>
              <p className="text-sm text-gray-600">{t('settings.twoFactorHint')}</p>
            </div>
            <input
              type="checkbox"
              checked={settings.security.twoFactor}
              onChange={(e) =>
                setSettings({ ...settings, security: { ...settings.security, twoFactor: e.target.checked } })
              }
              className="w-5 h-5 text-primary-600 rounded focus:ring-primary-500 shrink-0"
            />
          </label>
          <div>
            <label className={`block text-sm font-medium text-gray-700 mb-2 ${alignStart}`}>{t('settings.sessionTimeout')}</label>
            <input
              type="number"
              value={settings.security.sessionTimeout}
              onChange={(e) =>
                setSettings({ ...settings, security: { ...settings.security, sessionTimeout: parseInt(e.target.value, 10) } })
              }
              className={`w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent ${alignStart}`}
              dir="ltr"
            />
          </div>
        </div>
      </div>

      {userRole === 'admin' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <div className={`flex items-center gap-3 mb-6 w-full ${isArabicLayout ? 'justify-start' : ''}`}>
            {isArabicLayout ? (
              <>
                <h2 className={`text-xl font-bold text-gray-900 ${alignStart}`}>{t('settings.superAdminCreate.title', 'Create Super Admin')}</h2>
                <UserPlus className="w-6 h-6 text-primary-600 shrink-0" />
              </>
            ) : (
              <>
                <UserPlus className="w-6 h-6 text-primary-600 shrink-0" />
                <h2 className={`text-xl font-bold text-gray-900 ${alignStart}`}>{t('settings.superAdminCreate.title', 'Create Super Admin')}</h2>
              </>
            )}
          </div>
          <p className={`text-sm text-gray-600 mb-4 ${alignStart}`}>
            {t(
              'settings.superAdminCreate.subtitle',
              'Create additional Super Admin users who can access university-wide settings and administration.'
            )}
          </p>

          <form onSubmit={handleCreateSuperAdmin} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={`block text-sm font-medium text-gray-700 mb-2 ${alignStart}`}>{t('settings.superAdminCreate.name', 'Name')}</label>
                <input
                  type="text"
                  value={saName}
                  onChange={(e) => setSaName(e.target.value)}
                  className={`w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent ${alignStart}`}
                />
              </div>
              <div>
                <label className={`block text-sm font-medium text-gray-700 mb-2 ${alignStart}`}>{t('settings.superAdminCreate.email', 'Email')}</label>
                <input
                  type="email"
                  value={saEmail}
                  onChange={(e) => setSaEmail(e.target.value)}
                  className={`w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent ${alignStart}`}
                  dir="ltr"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={`block text-sm font-medium text-gray-700 mb-2 ${alignStart}`}>{t('settings.superAdminCreate.password', 'Password')}</label>
                <input
                  type="password"
                  value={saPassword}
                  onChange={(e) => setSaPassword(e.target.value)}
                  className={`w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent ${alignStart}`}
                  dir="ltr"
                  required
                />
              </div>
              <div>
                <label className={`block text-sm font-medium text-gray-700 mb-2 ${alignStart}`}>{t('settings.superAdminCreate.confirm', 'Confirm password')}</label>
                <input
                  type="password"
                  value={saConfirm}
                  onChange={(e) => setSaConfirm(e.target.value)}
                  className={`w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent ${alignStart}`}
                  dir="ltr"
                  required
                />
              </div>
            </div>

            {saError && <div className={`text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 ${alignStart}`}>{saError}</div>}
            {saSuccess && (
              <div className={`text-sm text-green-800 bg-green-50 border border-green-200 rounded-xl px-4 py-3 ${alignStart}`}>{saSuccess}</div>
            )}

            <div className={`flex ${isArabicLayout ? 'justify-start' : 'justify-end'}`}>
              <button
                type="submit"
                disabled={saLoading}
                className={`flex items-center gap-2 bg-primary-gradient text-white px-8 py-3 rounded-xl font-semibold shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all disabled:opacity-50 ${iconRow}`}
              >
                <UserPlus className="w-5 h-5 shrink-0" />
                <span>{saLoading ? t('common.loading', 'Loading...') : t('settings.superAdminCreate.submit', 'Create Super Admin')}</span>
              </button>
            </div>
          </form>

          <div className="mt-8 pt-6 border-t border-gray-200">
            <div className={`flex items-center justify-between gap-3 ${iconRow}`}>
              <h3 className={`text-lg font-bold text-gray-900 ${alignStart}`}>
                {t('settings.superAdminCreate.listTitle', 'Super Admin users')}
              </h3>
              <button
                type="button"
                onClick={loadSuperAdmins}
                className="px-4 py-2 rounded-xl border border-gray-200 hover:bg-gray-50 text-sm font-semibold"
              >
                {t('settings.superAdminCreate.refresh', 'Refresh')}
              </button>
            </div>

            {saListError && (
              <div className={`mt-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 ${alignStart}`}>
                {saListError}
              </div>
            )}

            <div className="mt-4">
              {saListLoading ? (
                <div className={`text-sm text-gray-600 ${alignStart}`}>{t('common.loading', 'Loading...')}</div>
              ) : superAdmins.length === 0 ? (
                <div className={`text-sm text-gray-600 ${alignStart}`}>{t('settings.superAdminCreate.none', 'No super admin users found.')}</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-gray-500">
                        <th className={`py-2 px-3 font-semibold ${alignStart}`}>{t('settings.superAdminCreate.colName', 'Name')}</th>
                        <th className={`py-2 px-3 font-semibold ${alignStart}`}>{t('settings.superAdminCreate.colEmail', 'Email')}</th>
                        <th className={`py-2 px-3 font-semibold ${alignStart}`}>{t('settings.superAdminCreate.colCreated', 'Created')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {superAdmins.map((u) => (
                        <tr key={u.id} className="border-t border-gray-100">
                          <td className={`py-3 px-3 font-semibold text-gray-900 ${alignStart}`}>{u.name || '—'}</td>
                          <td className={`py-3 px-3 text-gray-900 ${alignStart}`} dir="ltr">
                            {u.email || '—'}
                          </td>
                          <td className={`py-3 px-3 text-gray-700 ${alignStart}`} dir="ltr">
                            {u.createdAt ? new Date(u.createdAt).toLocaleString() : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {userRole === 'admin' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
          <div className={`flex items-center gap-3 mb-6 w-full ${isArabicLayout ? 'justify-start' : ''}`}>
            {isArabicLayout ? (
              <>
                <h2 className={`text-xl font-bold text-gray-900 ${alignStart}`}>
                  {t('settings.staffUser.title', 'Create Staff User')}
                </h2>
                <UserPlus className="w-6 h-6 text-primary-600 shrink-0" />
              </>
            ) : (
              <>
                <UserPlus className="w-6 h-6 text-primary-600 shrink-0" />
                <h2 className={`text-xl font-bold text-gray-900 ${alignStart}`}>
                  {t('settings.staffUser.title', 'Create Staff User')}
                </h2>
              </>
            )}
          </div>
          <p className={`text-sm text-gray-600 mb-4 ${alignStart}`}>
            {t(
              'settings.staffUser.subtitle',
              'Create a staff login and choose which menu sections they can see. Use quick options like Admissions or Finance, then fine-tune the checkboxes.',
            )}
          </p>

          <form onSubmit={handleCreateStaffUser} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={`block text-sm font-medium text-gray-700 mb-2 ${alignStart}`}>
                  {t('settings.staffUser.name', 'Name')}
                </label>
                <input
                  type="text"
                  value={staffName}
                  onChange={(e) => setStaffName(e.target.value)}
                  className={`w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent ${alignStart}`}
                />
              </div>
              <div>
                <label className={`block text-sm font-medium text-gray-700 mb-2 ${alignStart}`}>
                  {t('settings.staffUser.email', 'Email')}
                </label>
                <input
                  type="email"
                  value={staffEmail}
                  onChange={(e) => setStaffEmail(e.target.value)}
                  className={`w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent ${alignStart}`}
                  dir="ltr"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={`block text-sm font-medium text-gray-700 mb-2 ${alignStart}`}>
                  {t('settings.staffUser.password', 'Password')}
                </label>
                <input
                  type="password"
                  value={staffPassword}
                  onChange={(e) => setStaffPassword(e.target.value)}
                  className={`w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent ${alignStart}`}
                  dir="ltr"
                  required
                />
              </div>
              <div>
                <label className={`block text-sm font-medium text-gray-700 mb-2 ${alignStart}`}>
                  {t('settings.staffUser.confirm', 'Confirm password')}
                </label>
                <input
                  type="password"
                  value={staffConfirm}
                  onChange={(e) => setStaffConfirm(e.target.value)}
                  className={`w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent ${alignStart}`}
                  dir="ltr"
                  required
                />
              </div>
            </div>

            <MenuPermissionsPicker value={staffMenus} onChange={setStaffMenus} disabled={staffLoading} />

            {staffError && (
              <div className={`text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 ${alignStart}`}>
                {staffError}
              </div>
            )}
            {staffSuccess && (
              <div className={`text-sm text-green-800 bg-green-50 border border-green-200 rounded-xl px-4 py-3 ${alignStart}`}>
                {staffSuccess}
              </div>
            )}

            <div className={`flex ${isArabicLayout ? 'justify-start' : 'justify-end'}`}>
              <button
                type="submit"
                disabled={staffLoading}
                className={`flex items-center gap-2 bg-primary-gradient text-white px-8 py-3 rounded-xl font-semibold shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all disabled:opacity-50 ${iconRow}`}
              >
                <UserPlus className="w-5 h-5 shrink-0" />
                <span>
                  {staffLoading
                    ? t('common.loading', 'Loading...')
                    : t('settings.staffUser.submit', 'Create Staff User')}
                </span>
              </button>
            </div>
          </form>

          <div className="mt-8 pt-6 border-t border-gray-200">
            <div className={`flex items-center justify-between gap-3 mb-3 ${iconRow}`}>
              <h3 className={`text-lg font-bold text-gray-900 ${alignStart}`}>
                {t('settings.staffUser.listTitle', 'Staff users')}
              </h3>
              <button
                type="button"
                onClick={loadStaffUsers}
                className="text-sm font-semibold text-primary-700 hover:underline"
              >
                {t('common.refresh', 'Refresh')}
              </button>
            </div>
            {staffListError && (
              <div className={`text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-3 ${alignStart}`}>
                {staffListError}
              </div>
            )}
            {staffListLoading ? (
              <div className={`text-sm text-gray-600 ${alignStart}`}>{t('common.loading', 'Loading...')}</div>
            ) : !staffUsers.length ? (
              <div className={`text-sm text-gray-600 ${alignStart}`}>
                {t('settings.staffUser.none', 'No staff users found.')}
              </div>
            ) : (
              <div className="space-y-3">
                {staffUsers.map((u) => (
                  <div key={u.id} className="border border-gray-200 rounded-xl p-4 bg-gray-50">
                    <div className={`flex flex-wrap items-start justify-between gap-3 ${iconRow}`}>
                      <div className={alignStart}>
                        <div className="font-semibold text-gray-900">{u.name || '—'}</div>
                        <div className="text-sm text-gray-600" dir="ltr">
                          {u.email || '—'}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {Array.isArray(u.menu_permissions) && u.menu_permissions.length
                            ? t('settings.staffUser.menusCount', {
                                defaultValue: '{{n}} menus',
                                n: u.menu_permissions.length,
                              })
                            : t('settings.staffUser.fullMenus', 'Full menu access')}
                        </div>
                      </div>
                      <div className={`flex gap-2 ${iconRow}`}>
                        {editingStaffId === u.id ? (
                          <>
                            <button
                              type="button"
                              disabled={staffSaveBusy}
                              onClick={() => saveStaffMenus(u.id)}
                              className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-primary-600 text-white disabled:opacity-50"
                            >
                              {t('common.save', 'Save')}
                            </button>
                            <button
                              type="button"
                              disabled={staffSaveBusy}
                              onClick={() => setEditingStaffId(null)}
                              className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-300 text-gray-700"
                            >
                              {t('common.cancel', 'Cancel')}
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startEditMenus(u)}
                            className="px-3 py-1.5 rounded-lg text-sm font-semibold border border-gray-300 text-primary-700 hover:bg-white"
                          >
                            {t('settings.staffUser.editMenus', 'Edit menus')}
                          </button>
                        )}
                      </div>
                    </div>
                    {editingStaffId === u.id && (
                      <div className="mt-4">
                        <MenuPermissionsPicker
                          value={editingMenus}
                          onChange={setEditingMenus}
                          disabled={staffSaveBusy}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className={`flex ${isArabicLayout ? 'justify-start' : 'justify-end'}`}>
        <button
          type="button"
          onClick={handleSave}
          className={`flex items-center gap-2 bg-primary-gradient text-white px-8 py-3 rounded-xl font-semibold shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all ${iconRow}`}
        >
          <Save className="w-5 h-5 shrink-0" />
          <span>{t('settings.saveChanges')}</span>
        </button>
      </div>
    </div>
  )
}
