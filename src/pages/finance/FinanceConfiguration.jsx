import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { getLocalizedName } from '../../utils/localizedName'
import { getCollegeCurrencyCode } from '../../utils/getCollegeSettings'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useCollege } from '../../contexts/CollegeContext'
import { Plus, Edit, Trash2, Settings, Loader2, Tag, FileText, GraduationCap } from 'lucide-react'
import ProgramFeesPanel from '../../components/finance/ProgramFeesPanel'

function RtlMoney({ isArabicLayout, className = '', children }) {
  const inner = (
    <span dir="ltr" className={`tabular-nums ${className}`}>
      {children}
    </span>
  )
  if (!isArabicLayout) return inner
  return <div className="flex w-full min-w-0 justify-start">{inner}</div>
}

export default function FinanceConfiguration() {
  const { t, i18n } = useTranslation()
  const { isRTL, language } = useLanguage()
  const isArabicLayout =
    isRTL ||
    language === 'ar' ||
    i18n?.language?.toLowerCase()?.startsWith('ar') ||
    (typeof document !== 'undefined' && document?.documentElement?.dir === 'rtl')
  const alignStart = isArabicLayout ? 'text-right' : 'text-left'

  const navigate = useNavigate()
  const { userRole, collegeId: authCollegeId } = useAuth()
  const { selectedCollegeId, requiresCollegeSelection, colleges, setSelectedCollegeId } = useCollege()
  const collegeId = userRole === 'admin' ? selectedCollegeId : authCollegeId

  const searchParams = new URLSearchParams(window.location.search)
  const initialTab = searchParams.get('tab') || 'programs'
  const [activeTab, setActiveTab] = useState(['types', 'structures'].includes(initialTab) ? initialTab : 'programs')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [feeStructures, setFeeStructures] = useState([])
  const [feeTypes, setFeeTypes] = useState([])
  const [scopeCurrency, setScopeCurrency] = useState(null)

  useEffect(() => {
    if (!collegeId) {
      setScopeCurrency(null)
      return
    }
    getCollegeCurrencyCode(collegeId)
      .then(setScopeCurrency)
      .catch(() => setScopeCurrency(null))
  }, [collegeId])

  useEffect(() => {
    if (activeTab === 'structures') {
      fetchFeeStructures()
    } else if (activeTab === 'types') {
      fetchFeeTypes()
    }
  }, [collegeId, activeTab])

  /** en-US avoids misleading "US$" labels when UI locale is Arabic but amount is USD/KWD/etc. */
  const formatMoney = (amount, currency) => {
    const code = currency || 'USD'
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: code }).format(parseFloat(amount || 0))
    } catch {
      return `${code} ${parseFloat(amount || 0).toFixed(2)}`
    }
  }

  const currencyForFee = (fee) => {
    if (fee?.is_university_wide) return fee.currency || 'USD'
    if (collegeId && scopeCurrency) return scopeCurrency
    return fee?.currency || 'USD'
  }

  const feeCategoryLabel = (raw) => {
    const c = (raw || 'general').toLowerCase().trim()
    const key = `finance.feeCategories.${c}`
    const tr = t(key)
    return tr === key ? raw || 'general' : tr
  }

  const degreeLabel = (level) => {
    const k = `finance.feeStructureForm.degree.${level}`
    const tr = t(k)
    return tr === k ? level : tr
  }

  const fetchFeeTypes = async () => {
    setLoading(true)
    setError('')
    try {
      let query = supabase
        .from('fee_types')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('name_en', { ascending: true })

      if (userRole === 'user' && collegeId) {
        query = query.or(`college_id.eq.${collegeId},is_university_wide.eq.true`)
      } else if (userRole === 'admin' && collegeId) {
        query = query.or(`college_id.eq.${collegeId},is_university_wide.eq.true`)
      }

      const { data, error: qErr } = await query
      if (qErr) {
        console.error('Error fetching fee types:', qErr)
        if (qErr.code === '42P01') {
          setError(t('finance.financeConfigPage.feeTypesMigration'))
        } else {
          setError(t('finance.financeConfigPage.loadFeeTypesError', { message: qErr.message }))
        }
        throw qErr
      }
      setFeeTypes(data || [])
    } catch {
      setFeeTypes([])
    } finally {
      setLoading(false)
    }
  }

  const fetchFeeStructures = async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('finance_configuration')
        .select(`
          id,
          fee_type,
          fee_name_en,
          fee_name_ar,
          amount,
          currency,
          applies_to_degree_level,
          applies_to_major,
          applies_to_semester,
          is_active,
          valid_from,
          valid_to,
          description,
          college_id,
          is_university_wide,
          colleges (id, name_en, name_ar)
        `)
        .order('created_at', { ascending: false })

      if (userRole === 'user' && collegeId) {
        query = query.or(`college_id.eq.${collegeId},is_university_wide.eq.true`)
      } else if (userRole === 'instructor' && collegeId) {
        query = query.or(`college_id.eq.${collegeId},is_university_wide.eq.true`)
      } else if (userRole === 'admin' && collegeId) {
        query = query.or(`college_id.eq.${collegeId},is_university_wide.eq.true`)
      }

      const { data, error: qErr } = await query
      if (qErr) throw qErr
      setFeeStructures(data || [])
    } catch (err) {
      console.error('Error fetching fee structures:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id) => {
    const msg =
      activeTab === 'structures'
        ? t('finance.financeConfigPage.confirmDeleteStructure')
        : t('finance.financeConfigPage.confirmDeleteType')
    if (!confirm(msg)) return

    try {
      const table = activeTab === 'structures' ? 'finance_configuration' : 'fee_types'
      const { error: delErr } = await supabase.from(table).delete().eq('id', id)

      if (delErr) throw delErr

      if (activeTab === 'structures') {
        fetchFeeStructures()
      } else {
        fetchFeeTypes()
      }
    } catch (err) {
      console.error('Error deleting:', err)
      alert(t('finance.financeConfigPage.deleteFailed'))
    }
  }

  const FEE_TYPE_CODE_TO_I18N = {
    admission_fee: 'admissionFee',
    application_fee: 'applicationFee',
    registration_fee: 'registrationFee',
    course_fee: 'courseFee',
    subject_fee: 'subjectFee',
    tuition_fee: 'tuitionFee',
    onboarding_fee: 'onboardingFee',
    penalty_fee: 'penalty',
    penalty: 'penalty',
    miscellaneous: 'miscellaneous',
    other: 'other',
    lab_fee: 'labFee',
    library_fee: 'libraryFee',
    sports_fee: 'sportsFee',
    late_payment_penalty: 'latePaymentPenalty',
  }

  const getFeeTypeLabel = (type) => {
    if (!type) return '—'
    const i18nKey = FEE_TYPE_CODE_TO_I18N[type]
    if (i18nKey) return t(`finance.feeTypes.${i18nKey}`)
    return type
  }

  const th = `px-6 py-3 text-start text-xs font-medium text-gray-500 uppercase tracking-wider`
  const td = `px-6 py-4 text-start`
  const tdNum = `px-6 py-4 text-start`

  return (
    <div className="space-y-6" dir={isArabicLayout ? 'rtl' : 'ltr'}>
      <div className="flex w-full flex-wrap items-center justify-between gap-4">
        <div className={alignStart}>
          <h1 className="text-3xl font-bold text-gray-900">{t('finance.financeConfiguration')}</h1>
          <p className="text-gray-600 mt-1">{t('finance.financeConfigPage.subtitle')}</p>
        </div>
        {activeTab === 'structures' && (
          <button
            type="button"
            onClick={() => navigate('/finance/configuration/create')}
            className="flex items-center gap-2 bg-primary-gradient text-white px-6 py-3 rounded-xl font-semibold shadow-lg hover:shadow-xl shrink-0"
          >
            <Plus className="w-5 h-5 shrink-0" />
            <span>{t('finance.financeConfigPage.addStructure')}</span>
          </button>
        )}
        {activeTab === 'types' && userRole === 'admin' && (
          <button
            type="button"
            onClick={() => navigate('/finance/configuration/types/create')}
            className="flex items-center gap-2 bg-primary-gradient text-white px-6 py-3 rounded-xl font-semibold shadow-lg hover:shadow-xl shrink-0"
          >
            <Plus className="w-5 h-5 shrink-0" />
            <span>{t('finance.financeConfigPage.addType')}</span>
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200">
        <div className="border-b border-gray-200">
          <nav className="flex w-full flex-wrap gap-6 sm:gap-8 px-6 justify-start" aria-label="Tabs">
            <button
              type="button"
              onClick={() => {
                setActiveTab('programs')
                navigate('/finance/configuration', { replace: true })
              }}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'programs'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <GraduationCap className="w-4 h-4 shrink-0" />
                <span>{t('programFees.tab')}</span>
              </div>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('structures')
                navigate('/finance/configuration?tab=structures', { replace: true })
              }}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'structures'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 shrink-0" />
                <span>{t('finance.financeConfigPage.tabStructures')}</span>
              </div>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('types')
                navigate('/finance/configuration?tab=types', { replace: true })
              }}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'types'
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 shrink-0" />
                <span>{t('finance.financeConfigPage.tabTypes')}</span>
              </div>
            </button>
          </nav>
        </div>
      </div>

      {activeTab === 'programs' && <ProgramFeesPanel isArabic={isArabicLayout} />}

      {activeTab !== 'programs' && userRole === 'admin' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4" dir={isArabicLayout ? 'rtl' : 'ltr'}>
          <label className={`block text-sm font-medium text-gray-700 mb-2 ${alignStart}`}>
            {t('finance.financeConfigPage.filterCollege')} {requiresCollegeSelection && <span className="text-red-500">*</span>}
          </label>
          <select
            value={selectedCollegeId || ''}
            onChange={(e) => setSelectedCollegeId(e.target.value ? parseInt(e.target.value, 10) : null)}
            className={`w-full md:max-w-md border rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none ps-4 pe-10 py-2.5 ${alignStart} ${
              requiresCollegeSelection ? 'border-yellow-300 bg-yellow-50' : 'border-gray-300 bg-white'
            }`}
            required={requiresCollegeSelection}
          >
            <option value="">{t('finance.financeConfigPage.allColleges')}</option>
            {colleges.map((college) => (
              <option key={college.id} value={college.id}>
                {getLocalizedName(college, isArabicLayout) || college.name_en}
              </option>
            ))}
          </select>
          {requiresCollegeSelection && (
            <p className={`text-xs text-yellow-600 mt-1 ${alignStart}`}>{t('finance.financeConfigPage.selectCollegeData')}</p>
          )}
        </div>
      )}

      {error && (
        <div className={`bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-xl ${alignStart}`}>{error}</div>
      )}

      {activeTab === 'programs' ? null : loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
        </div>
      ) : activeTab === 'structures' ? (
        feeStructures.length === 0 ? (
          <div className={`bg-white rounded-2xl shadow-sm border border-gray-200 p-12 ${isArabicLayout ? 'text-right' : 'text-center'}`}>
            <Settings className={`w-16 h-16 text-gray-400 mb-4 ${isArabicLayout ? 'ms-auto' : 'mx-auto'}`} />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">{t('finance.financeConfigPage.emptyStructures')}</h3>
            <p className="text-gray-600 mb-6">{t('finance.financeConfigPage.emptyStructuresHint')}</p>
            <button
              type="button"
              onClick={() => navigate('/finance/configuration/create')}
              className="inline-flex items-center gap-2 bg-primary-gradient text-white px-6 py-3 rounded-xl font-semibold"
            >
              <Plus className="w-5 h-5 shrink-0" />
              <span>{t('finance.financeConfigPage.addStructure')}</span>
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-x-auto" dir={isArabicLayout ? 'rtl' : 'ltr'}>
            <table className="w-full min-w-[720px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className={th}>{t('finance.financeConfigPage.table.feeName')}</th>
                  <th className={th}>{t('finance.financeConfigPage.table.type')}</th>
                  <th className={th}>{t('finance.financeConfigPage.table.amount')}</th>
                  <th className={th}>{t('finance.financeConfigPage.table.appliesTo')}</th>
                  <th className={th}>{t('finance.financeConfigPage.table.college')}</th>
                  <th className={th}>{t('finance.financeConfigPage.table.status')}</th>
                  <th className={th}>{t('finance.financeConfigPage.table.actions')}</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {feeStructures.map((fee) => (
                  <tr key={fee.id} className="hover:bg-gray-50">
                    <td className={td}>
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {isArabicLayout
                            ? (fee.fee_name_ar || '').trim() || fee.fee_name_en
                            : fee.fee_name_en || (fee.fee_name_ar || '').trim()}
                        </div>
                        {isArabicLayout
                          ? fee.fee_name_ar &&
                            fee.fee_name_en &&
                            fee.fee_name_ar.trim() !== fee.fee_name_en.trim() && (
                              <div className="text-xs text-gray-500">{fee.fee_name_en}</div>
                            )
                          : fee.fee_name_ar &&
                            fee.fee_name_en !== fee.fee_name_ar && (
                              <div className="text-xs text-gray-500">{fee.fee_name_ar}</div>
                            )}
                      </div>
                    </td>
                    <td className={td}>
                      <span className="text-sm text-gray-900">{getFeeTypeLabel(fee.fee_type)}</span>
                    </td>
                    <td className={tdNum}>
                      <RtlMoney isArabicLayout={isArabicLayout} className="text-sm font-semibold text-primary-600">
                        {formatMoney(fee.amount, currencyForFee(fee))}
                      </RtlMoney>
                    </td>
                    <td className={`${td} align-top`}>
                      <div className="text-sm text-gray-900">
                        {fee.applies_to_semester && Array.isArray(fee.applies_to_semester) && fee.applies_to_semester.length > 0 ? (
                          <div className="font-semibold">
                            {fee.applies_to_semester.length === 1
                              ? t('finance.financeConfigPage.table.semestersOne')
                              : t('finance.financeConfigPage.table.semestersSelected', { count: fee.applies_to_semester.length })}
                          </div>
                        ) : (
                          <span className="text-gray-400">{t('finance.financeConfigPage.table.noSemesters')}</span>
                        )}
                        {fee.applies_to_degree_level && Array.isArray(fee.applies_to_degree_level) && fee.applies_to_degree_level.length > 0 && (
                          <div className="text-xs text-gray-500 mt-1">
                            {t('finance.financeConfigPage.table.degreeLevels', {
                              list: fee.applies_to_degree_level.map((d) => degreeLabel(d)).join(', '),
                            })}
                          </div>
                        )}
                        {fee.applies_to_major && Array.isArray(fee.applies_to_major) && fee.applies_to_major.length > 0 && (
                          <div className="text-xs text-gray-500">
                            {t('finance.financeConfigPage.table.majorsCount', { count: fee.applies_to_major.length })}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className={td}>
                      <span className="text-sm text-gray-900">
                        {fee.is_university_wide
                          ? t('finance.financeConfigPage.table.universityWide')
                          : getLocalizedName(fee.colleges, isArabicLayout) || fee.colleges?.name_en || '—'}
                      </span>
                    </td>
                    <td className={td}>
                      <span
                        className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          fee.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {fee.is_active ? t('finance.financeConfigPage.table.active') : t('finance.financeConfigPage.table.inactive')}
                      </span>
                    </td>
                    <td className={`${td} whitespace-nowrap`}>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => navigate(`/finance/configuration/${fee.id}/edit`)}
                          className="text-primary-600 hover:text-primary-900"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(fee.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : feeTypes.length === 0 ? (
        <div className={`bg-white rounded-2xl shadow-sm border border-gray-200 p-12 ${isArabicLayout ? 'text-right' : 'text-center'}`}>
          <Tag className={`w-16 h-16 text-gray-400 mb-4 ${isArabicLayout ? 'ms-auto' : 'mx-auto'}`} />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">{t('finance.financeConfigPage.emptyTypes')}</h3>
          <p className="text-gray-600 mb-6">{t('finance.financeConfigPage.emptyTypesHint')}</p>
          {userRole === 'admin' && (
            <button
              type="button"
              onClick={() => navigate('/finance/configuration/types/create')}
              className="inline-flex items-center gap-2 bg-primary-gradient text-white px-6 py-3 rounded-xl font-semibold"
            >
              <Plus className="w-5 h-5 shrink-0" />
              <span>{t('finance.financeConfigPage.addType')}</span>
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-x-auto" dir={isArabicLayout ? 'rtl' : 'ltr'}>
          <table className="w-full min-w-[800px]">
            <thead className="bg-gray-50">
              <tr>
                <th className={th}>{t('finance.financeConfigPage.table.code')}</th>
                <th className={th}>{t('finance.financeConfigPage.table.name')}</th>
                <th className={th}>{t('finance.financeConfigPage.table.category')}</th>
                <th className={th}>{t('finance.financeConfigPage.table.semesterBased')}</th>
                <th className={th}>{t('finance.financeConfigPage.table.requiresSemester')}</th>
                <th className={th}>{t('finance.financeConfigPage.table.scope')}</th>
                <th className={th}>{t('finance.financeConfigPage.table.status')}</th>
                {userRole === 'admin' && <th className={th}>{t('finance.financeConfigPage.table.actions')}</th>}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {feeTypes.map((feeType) => (
                <tr key={feeType.id} className="hover:bg-gray-50">
                  <td className={td}>
                    <code className="text-sm font-mono text-gray-900" dir="ltr">
                      {feeType.code}
                    </code>
                  </td>
                  <td className={td}>
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {getLocalizedName(feeType, isArabicLayout) || getFeeTypeLabel(feeType.code) || feeType.name_en}
                      </div>
                      {isArabicLayout
                        ? feeType.name_ar &&
                          feeType.name_en &&
                          feeType.name_ar.trim() !== feeType.name_en.trim() && (
                            <div className="text-xs text-gray-500">{feeType.name_en}</div>
                          )
                        : feeType.name_ar &&
                          feeType.name_en !== feeType.name_ar && (
                            <div className="text-xs text-gray-500">{feeType.name_ar}</div>
                          )}
                    </div>
                  </td>
                  <td className={td}>
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                      {feeCategoryLabel(feeType.category)}
                    </span>
                  </td>
                  <td className={td}>
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full ${
                        feeType.is_semester_based ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {feeType.is_semester_based ? t('finance.financeConfigPage.table.yes') : t('finance.financeConfigPage.table.no')}
                    </span>
                  </td>
                  <td className={td}>
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full ${
                        feeType.requires_semester ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {feeType.requires_semester
                        ? t('finance.financeConfigPage.table.required')
                        : t('finance.financeConfigPage.table.optional')}
                    </span>
                  </td>
                  <td className={td}>
                    <span className="text-sm text-gray-900">
                      {feeType.is_university_wide
                        ? t('finance.financeConfigPage.table.universityWide')
                        : t('finance.financeConfigPage.table.collegeSpecific')}
                    </span>
                  </td>
                  <td className={td}>
                    <span
                      className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        feeType.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {feeType.is_active ? t('finance.financeConfigPage.table.active') : t('finance.financeConfigPage.table.inactive')}
                    </span>
                  </td>
                  {userRole === 'admin' && (
                    <td className={`${td} whitespace-nowrap`}>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => navigate(`/finance/configuration/types/${feeType.id}/edit`)}
                          className="text-primary-600 hover:text-primary-900"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(feeType.id)}
                          className="text-red-600 hover:text-red-900"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
