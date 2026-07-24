import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { supabase } from '../../lib/supabase'
import { ArrowLeft, Building2, Edit, Mail, Phone, Globe, MapPin, Calendar, Settings, ChevronDown, ChevronUp, GraduationCap, DollarSign, UserPlus, FileText } from 'lucide-react'

export default function ViewCollege() {
  const { t } = useTranslation()
  const { isRTL } = useLanguage()
  const { id } = useParams()
  const navigate = useNavigate()
  const [college, setCollege] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedSettings, setExpandedSettings] = useState({})

  useEffect(() => {
    fetchCollege()
  }, [id])

  const fetchCollege = async () => {
    try {
      const { data, error } = await supabase
        .from('colleges')
        .select('*')
        .eq('id', id)
        .single()

      if (error) throw error
      setCollege(data)
    } catch (err) {
      setError(err.message || 'Failed to fetch college')
      console.error('Error fetching college:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  const toggleSetting = (settingType) => {
    setExpandedSettings(prev => ({
      ...prev,
      [settingType]: !prev[settingType]
    }))
  }

  const renderSettingValue = (value) => {
    if (value === null || value === undefined) return <span className="text-gray-400">-</span>
    if (typeof value === 'boolean') return <span className={value ? 'text-green-600' : 'text-gray-400'}>{value ? 'Yes' : 'No'}</span>
    if (typeof value === 'object' && !Array.isArray(value)) {
      return (
        <div className="ml-4 space-y-1">
          {Object.entries(value).map(([key, val]) => (
            <div key={key} className="text-sm">
              <span className="text-gray-500 font-medium">{key}:</span> {renderSettingValue(val)}
            </div>
          ))}
        </div>
      )
    }
    if (Array.isArray(value)) {
      return (
        <div className="ml-4 space-y-1">
          {value.map((item, idx) => (
            <div key={idx} className="text-sm">
              {typeof item === 'object' ? (
                <div className="ml-4">
                  {Object.entries(item).map(([k, v]) => (
                    <div key={k}>
                      <span className="text-gray-500 font-medium">{k}:</span> {renderSettingValue(v)}
                    </div>
                  ))}
                </div>
              ) : (
                renderSettingValue(item)
              )}
            </div>
          ))}
        </div>
      )
    }
    return <span className="text-gray-900">{String(value)}</span>
  }

  if (error || !college) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => navigate('/admin/colleges')}
          className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} text-gray-600 hover:text-gray-900`}
        >
          <ArrowLeft className="w-5 h-5" />
          <span>{t('colleges.back')}</span>
        </button>
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-red-700">
          {error || 'College not found'}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/admin/colleges')}
          className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} text-gray-600 hover:text-gray-900`}
        >
          <ArrowLeft className="w-5 h-5" />
          <span>{t('colleges.back')}</span>
        </button>
        <button
          onClick={() => navigate(`/admin/colleges/${id}/edit`)}
          className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} bg-primary-gradient text-white px-6 py-2 rounded-xl font-semibold hover:shadow-lg transition-all`}
        >
          <Edit className="w-5 h-5" />
          <span>{t('colleges.edit')}</span>
        </button>
      </div>

      {/* College Header Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <div className={`flex items-start ${isRTL ? 'space-x-reverse space-x-6' : 'space-x-6'}`}>
          <div
            className="w-20 h-20 rounded-xl flex items-center justify-center shadow-lg"
            style={{ backgroundColor: college.primary_color || '#952562' }}
          >
            <Building2 className="w-10 h-10 text-white" />
          </div>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-gray-900">{college.name_en}</h1>
            {college.name_ar && (
              <p className="text-xl text-gray-600 mt-1">{college.name_ar}</p>
            )}
            <div className={`flex items-center ${isRTL ? 'space-x-reverse space-x-4' : 'space-x-4'} mt-4`}>
              <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium">
                {t('colleges.prefix')}: {college.code}
              </span>
              {college.abbreviation && (
                <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium">
                  {college.abbreviation}
                </span>
              )}
              <span
                className={`px-3 py-1 rounded-lg text-sm font-medium ${
                  college.status === 'active'
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                {college.status}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Contact Information */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">{t('colleges.contactInfo')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {college.official_email && (
            <div className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-3'}`}>
              <Mail className="w-5 h-5 text-gray-400" />
              <div>
                <p className="text-sm text-gray-500">{t('colleges.email')}</p>
                <p className="text-gray-900">{college.official_email}</p>
              </div>
            </div>
          )}
          {college.phone_number && (
            <div className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-3'}`}>
              <Phone className="w-5 h-5 text-gray-400" />
              <div>
                <p className="text-sm text-gray-500">{t('colleges.phone')}</p>
                <p className="text-gray-900">{college.phone_number}</p>
              </div>
            </div>
          )}
          {college.website_url && (
            <div className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-3'}`}>
              <Globe className="w-5 h-5 text-gray-400" />
              <div>
                <p className="text-sm text-gray-500">{t('colleges.website')}</p>
                <a
                  href={college.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:underline"
                >
                  {college.website_url}
                </a>
              </div>
            </div>
          )}
          {college.address_en && (
            <div className={`flex items-start ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-3'}`}>
              <MapPin className="w-5 h-5 text-gray-400 mt-1" />
              <div>
                <p className="text-sm text-gray-500">{t('colleges.addressEn')}</p>
                <p className="text-gray-900">{college.address_en}</p>
              </div>
            </div>
          )}
          {college.address_ar && (
            <div className={`flex items-start ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-3'}`}>
              <MapPin className="w-5 h-5 text-gray-400 mt-1" />
              <div>
                <p className="text-sm text-gray-500">{t('colleges.addressAr')}</p>
                <p className="text-gray-900">{college.address_ar}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ID Configuration */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">{t('colleges.idConfiguration')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">{t('colleges.studentId')}</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">{t('colleges.prefix')}:</span>
                <span className="text-sm font-medium text-gray-900">{college.student_id_prefix || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">{t('colleges.format')}:</span>
                <span className="text-sm font-medium text-gray-900">{college.student_id_format || '{prefix}{year}{sequence:D4}'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">{t('colleges.startingNumber')}:</span>
                <span className="text-sm font-medium text-gray-900">{college.student_id_starting_number || 1}</span>
              </div>
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">{t('colleges.instructorId')}</h3>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">{t('colleges.prefix')}:</span>
                <span className="text-sm font-medium text-gray-900">{college.instructor_id_prefix || 'INS'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">{t('colleges.format')}:</span>
                <span className="text-sm font-medium text-gray-900">{college.instructor_id_format || '{prefix}{year}{sequence:D4}'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-500">{t('colleges.startingNumber')}:</span>
                <span className="text-sm font-medium text-gray-900">{college.instructor_id_starting_number || 1}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Settings Overview */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <h2 className={`text-xl font-bold text-gray-900 mb-4 flex items-center ${isRTL ? 'space-x-reverse space-x-2' : 'space-x-2'}`}>
          <Settings className="w-5 h-5" />
          <span>{t('colleges.settingsOverview')}</span>
        </h2>
        <div className="space-y-4">
          {/* Academic Settings */}
          <div className="border border-gray-200 rounded-lg">
            <button
              onClick={() => toggleSetting('academic')}
              className={`w-full flex items-center ${isRTL ? 'flex-row-reverse' : 'justify-between'} p-4 hover:bg-gray-50 transition-colors`}
            >
              <div className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse space-x-3' : 'space-x-3'}`}>
                <GraduationCap className="w-5 h-5 text-primary-600" />
                <div className={`text-left ${isRTL ? 'text-right' : ''}`}>
                  <p className="font-semibold text-gray-900">{t('colleges.academicSettings')}</p>
                  <p className="text-xs text-gray-500">
                    {college.academic_settings ? t('colleges.configured') : t('colleges.notConfigured')}
                  </p>
                </div>
              </div>
              {expandedSettings.academic ? (
                <ChevronUp className="w-5 h-5 text-gray-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-400" />
              )}
            </button>
            {expandedSettings.academic && college.academic_settings && (
              <div className="p-4 border-t border-gray-200 bg-gray-50">
                <div className="space-y-3 text-sm">
                  {Object.entries(college.academic_settings).map(([key, value]) => (
                    <div key={key}>
                      <p className="font-medium text-gray-700 mb-1 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}:</p>
                      <div className="ml-2">{renderSettingValue(value)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Financial Settings */}
          <div className="border border-gray-200 rounded-lg">
            <button
              onClick={() => toggleSetting('financial')}
              className={`w-full flex items-center ${isRTL ? 'flex-row-reverse' : 'justify-between'} p-4 hover:bg-gray-50 transition-colors`}
            >
              <div className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse space-x-3' : 'space-x-3'}`}>
                <DollarSign className="w-5 h-5 text-primary-600" />
                <div className={`text-left ${isRTL ? 'text-right' : ''}`}>
                  <p className="font-semibold text-gray-900">{t('colleges.financialSettings')}</p>
                  <p className="text-xs text-gray-500">
                    {college.financial_settings ? t('colleges.configured') : t('colleges.notConfigured')}
                  </p>
                </div>
              </div>
              {expandedSettings.financial ? (
                <ChevronUp className="w-5 h-5 text-gray-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-400" />
              )}
            </button>
            {expandedSettings.financial && college.financial_settings && (
              <div className="p-4 border-t border-gray-200 bg-gray-50">
                <div className="space-y-3 text-sm">
                  {Object.entries(college.financial_settings).map(([key, value]) => (
                    <div key={key}>
                      <p className="font-medium text-gray-700 mb-1 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}:</p>
                      <div className="ml-2">{renderSettingValue(value)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Email Settings */}
          <div className="border border-gray-200 rounded-lg">
            <button
              onClick={() => toggleSetting('email')}
              className={`w-full flex items-center ${isRTL ? 'flex-row-reverse' : 'justify-between'} p-4 hover:bg-gray-50 transition-colors`}
            >
              <div className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse space-x-3' : 'space-x-3'}`}>
                <Mail className="w-5 h-5 text-primary-600" />
                <div className={`text-left ${isRTL ? 'text-right' : ''}`}>
                  <p className="font-semibold text-gray-900">{t('colleges.emailSettings')}</p>
                  <p className="text-xs text-gray-500">
                    {college.email_settings ? t('colleges.configured') : t('colleges.notConfigured')}
                  </p>
                </div>
              </div>
              {expandedSettings.email ? (
                <ChevronUp className="w-5 h-5 text-gray-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-400" />
              )}
            </button>
            {expandedSettings.email && college.email_settings && (
              <div className="p-4 border-t border-gray-200 bg-gray-50">
                <div className="space-y-3 text-sm">
                  {Object.entries(college.email_settings).map(([key, value]) => (
                    <div key={key}>
                      <p className="font-medium text-gray-700 mb-1 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}:</p>
                      <div className="ml-2">{renderSettingValue(value)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Onboarding Settings */}
          <div className="border border-gray-200 rounded-lg">
            <button
              onClick={() => toggleSetting('onboarding')}
              className={`w-full flex items-center ${isRTL ? 'flex-row-reverse' : 'justify-between'} p-4 hover:bg-gray-50 transition-colors`}
            >
              <div className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse space-x-3' : 'space-x-3'}`}>
                <UserPlus className="w-5 h-5 text-primary-600" />
                <div className={`text-left ${isRTL ? 'text-right' : ''}`}>
                  <p className="font-semibold text-gray-900">{t('colleges.onboardingSettings')}</p>
                  <p className="text-xs text-gray-500">
                    {college.onboarding_settings ? t('colleges.configured') : t('colleges.notConfigured')}
                  </p>
                </div>
              </div>
              {expandedSettings.onboarding ? (
                <ChevronUp className="w-5 h-5 text-gray-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-400" />
              )}
            </button>
            {expandedSettings.onboarding && college.onboarding_settings && (
              <div className="p-4 border-t border-gray-200 bg-gray-50">
                <div className="space-y-3 text-sm">
                  {Object.entries(college.onboarding_settings).map(([key, value]) => (
                    <div key={key}>
                      <p className="font-medium text-gray-700 mb-1 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}:</p>
                      <div className="ml-2">{renderSettingValue(value)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* System Settings */}
          <div className="border border-gray-200 rounded-lg">
            <button
              onClick={() => toggleSetting('system')}
              className={`w-full flex items-center ${isRTL ? 'flex-row-reverse' : 'justify-between'} p-4 hover:bg-gray-50 transition-colors`}
            >
              <div className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse space-x-3' : 'space-x-3'}`}>
                <Settings className="w-5 h-5 text-primary-600" />
                <div className={`text-left ${isRTL ? 'text-right' : ''}`}>
                  <p className="font-semibold text-gray-900">{t('colleges.systemSettings')}</p>
                  <p className="text-xs text-gray-500">
                    {college.system_settings ? t('colleges.configured') : t('colleges.notConfigured')}
                  </p>
                </div>
              </div>
              {expandedSettings.system ? (
                <ChevronUp className="w-5 h-5 text-gray-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-400" />
              )}
            </button>
            {expandedSettings.system && college.system_settings && (
              <div className="p-4 border-t border-gray-200 bg-gray-50">
                <div className="space-y-3 text-sm">
                  {Object.entries(college.system_settings).map(([key, value]) => (
                    <div key={key}>
                      <p className="font-medium text-gray-700 mb-1 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}:</p>
                      <div className="ml-2">{renderSettingValue(value)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Examination Settings */}
          <div className="border border-gray-200 rounded-lg">
            <button
              onClick={() => toggleSetting('examination')}
              className={`w-full flex items-center ${isRTL ? 'flex-row-reverse' : 'justify-between'} p-4 hover:bg-gray-50 transition-colors`}
            >
              <div className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse space-x-3' : 'space-x-3'}`}>
                <FileText className="w-5 h-5 text-primary-600" />
                <div className={`text-left ${isRTL ? 'text-right' : ''}`}>
                  <p className="font-semibold text-gray-900">{t('colleges.examinationSettings')}</p>
                  <p className="text-xs text-gray-500">
                    {college.examination_settings ? t('colleges.configured') : t('colleges.notConfigured')}
                  </p>
                </div>
              </div>
              {expandedSettings.examination ? (
                <ChevronUp className="w-5 h-5 text-gray-400" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-400" />
              )}
            </button>
            {expandedSettings.examination && college.examination_settings && (
              <div className="p-4 border-t border-gray-200 bg-gray-50">
                <div className="space-y-3 text-sm">
                  {Object.entries(college.examination_settings).map(([key, value]) => (
                    <div key={key}>
                      <p className="font-medium text-gray-700 mb-1 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}:</p>
                      <div className="ml-2">{renderSettingValue(value)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Metadata */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <h2 className={`text-xl font-bold text-gray-900 mb-4 flex items-center ${isRTL ? 'space-x-reverse space-x-2' : 'space-x-2'}`}>
          <Calendar className="w-5 h-5" />
          <span>{t('colleges.metadata')}</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-500">{t('colleges.createdAt')}</p>
            <p className="text-gray-900">
              {new Date(college.created_at).toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">{t('colleges.updatedAt')}</p>
            <p className="text-gray-900">
              {new Date(college.updated_at).toLocaleString()}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}




