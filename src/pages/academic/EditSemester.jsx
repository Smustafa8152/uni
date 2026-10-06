import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { getLocalizedName } from '../../utils/localizedName'
import { getSemesterCreditsFromUniversitySettings } from '../../utils/getCollegeSettings'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { ArrowLeft, Save, Check } from 'lucide-react'

export default function EditSemester() {
  const { t } = useTranslation()
  const { isRTL } = useLanguage()
  const { id } = useParams()
  const navigate = useNavigate()
  const { userRole, collegeId: authCollegeId } = useAuth()
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [collegeId, setCollegeId] = useState(authCollegeId)
  const [colleges, setColleges] = useState([])
  const [academicYears, setAcademicYears] = useState([])
  const [isUniversityWide, setIsUniversityWide] = useState(false)
  const [semesterCreditsFromUni, setSemesterCreditsFromUni] = useState({
    min_credit_hours: 12,
    max_credit_hours: 18,
    max_credit_hours_with_permission: 21,
    min_gpa_for_max_credits: 3.0,
  })

  const [formData, setFormData] = useState({
    academic_year_id: '',
    name_en: '',
    name_ar: '',
    code: '',
    academic_year_number: '',
    season: '',
    start_date: '',
    end_date: '',
    registration_start_date: '',
    registration_end_date: '',
    late_registration_end_date: '',
    add_deadline: '',
    drop_deadline: '',
    withdrawal_deadline: '',
    description: '',
    description_ar: '',
    status: 'planned',
    college_id: null,
    is_university_wide: false,
  })

  useEffect(() => {
    fetchSemester()
    if (userRole === 'admin') {
      fetchColleges()
    }
  }, [id, userRole])

  useEffect(() => {
    if (formData.college_id !== null || isUniversityWide) {
      fetchAcademicYears()
    }
  }, [formData.college_id, isUniversityWide, userRole])

  useEffect(() => {
    const fetchCredits = async () => {
      const credits = await getSemesterCreditsFromUniversitySettings()
      setSemesterCreditsFromUni(credits)
    }
    fetchCredits()
  }, [])

  const fetchSemester = async () => {
    try {
      setFetching(true)
      const { data, error } = await supabase
        .from('semesters')
        .select('*')
        .eq('id', id)
        .single()

      if (error) throw error

      setFormData({
        academic_year_id: data.academic_year_id || '',
        name_en: data.name_en || '',
        name_ar: data.name_ar || '',
        code: data.code || '',
        academic_year_number: data.academic_year_number || '',
        season: data.season || '',
        start_date: data.start_date || '',
        end_date: data.end_date || '',
        registration_start_date: data.registration_start_date || '',
        registration_end_date: data.registration_end_date || '',
        late_registration_end_date: data.late_registration_end_date || '',
        add_deadline: data.add_deadline || '',
        drop_deadline: data.drop_deadline || '',
        withdrawal_deadline: data.withdrawal_deadline || '',
        description: data.description || '',
        description_ar: data.description_ar || '',
        status: data.status || 'planned',
        college_id: data.college_id,
        is_university_wide: data.is_university_wide || false,
      })
      setIsUniversityWide(data.is_university_wide || false)
      setCollegeId(data.college_id || authCollegeId)
    } catch (err) {
      console.error('Error fetching semester:', err)
      setError(err.message || 'Failed to load semester')
    } finally {
      setFetching(false)
    }
  }

  const fetchColleges = async () => {
    try {
      const { data, error } = await supabase
        .from('colleges')
        .select('id, name_en, name_ar, code')
        .eq('status', 'active')
        .order('name_en')

      if (error) throw error
      setColleges(data || [])
    } catch (err) {
      console.error('Error fetching colleges:', err)
    }
  }

  const fetchAcademicYears = async () => {
    try {
      let query = supabase
        .from('academic_years')
        .select('id, name_en, name_ar, code, start_date, end_date')
        .order('start_date', { ascending: false })

      if (userRole === 'user' && collegeId) {
        query = query.or(`college_id.eq.${collegeId},is_university_wide.eq.true`)
      } else if (isUniversityWide) {
        query = query.eq('is_university_wide', true)
      } else if (collegeId && userRole === 'admin') {
        query = query.or(`college_id.eq.${collegeId},is_university_wide.eq.true`)
      }

      const { data, error } = await query
      if (error) throw error
      setAcademicYears(data || [])
    } catch (err) {
      console.error('Error fetching academic years:', err)
    }
  }

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess(false)

    try {
      const submitData = {
        academic_year_id: parseInt(formData.academic_year_id),
        name_en: formData.name_en,
        name_ar: formData.name_ar || formData.name_en,
        code: formData.code,
        academic_year_number: formData.academic_year_number ? parseInt(formData.academic_year_number) : null,
        season: formData.season || null,
        start_date: formData.start_date,
        end_date: formData.end_date,
        registration_start_date: formData.registration_start_date || null,
        registration_end_date: formData.registration_end_date || null,
        late_registration_end_date: formData.late_registration_end_date || null,
        add_deadline: formData.add_deadline || null,
        drop_deadline: formData.drop_deadline || null,
        withdrawal_deadline: formData.withdrawal_deadline || null,
        min_credit_hours: semesterCreditsFromUni.min_credit_hours,
        max_credit_hours: semesterCreditsFromUni.max_credit_hours,
        max_credit_hours_with_permission: semesterCreditsFromUni.max_credit_hours_with_permission,
        min_gpa_for_max_credits: semesterCreditsFromUni.min_gpa_for_max_credits,
        description: formData.description || null,
        description_ar: formData.description_ar || null,
        status: formData.status,
        is_university_wide: isUniversityWide,
        college_id: isUniversityWide ? null : (formData.college_id || collegeId),
      }

      const { error: updateError } = await supabase
        .from('semesters')
        .update(submitData)
        .eq('id', id)

      if (updateError) throw updateError

      setSuccess(true)
      setTimeout(() => {
        navigate('/academic/semesters')
      }, 2000)
    } catch (err) {
      setError(err.message || 'Failed to update semester')
      console.error('Error updating semester:', err)
    } finally {
      setLoading(false)
    }
  }

  if (fetching) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <button
            onClick={() => navigate(-1)}
            className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} text-gray-600 hover:text-gray-900 mb-4`}
          >
            <ArrowLeft className="w-5 h-5" />
            <span>{t('academic.semesters.back')}</span>
          </button>
          <h1 className="text-3xl font-bold text-gray-900">{t('academic.semesters.updateTitle')}</h1>
          <p className="text-gray-600 mt-1">{t('academic.semesters.updateSubtitle')}</p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 mb-6">
            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
                {error}
              </div>
            )}
            {success && (
              <div className={`mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'}`}>
                <Check className="w-5 h-5" />
                <span>{t('academic.semesters.updatedSuccess')}</span>
              </div>
            )}

            <div className="space-y-6">
              {userRole === 'admin' && (
                <div className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} p-4 bg-gray-50 rounded-lg`}>
                  <input
                    type="checkbox"
                    checked={isUniversityWide}
                    onChange={(e) => {
                      setIsUniversityWide(e.target.checked)
                      if (e.target.checked) {
                        setFormData(prev => ({ ...prev, college_id: null }))
                        setCollegeId(null)
                      } else {
                        setFormData(prev => ({ ...prev, college_id: collegeId }))
                      }
                    }}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <label className="text-sm font-medium text-gray-700">
                    {t('academic.semesters.universityWide')}
                  </label>
                </div>
              )}

              {userRole === 'admin' && !isUniversityWide && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('navigation.colleges')}</label>
                  <select
                    value={formData.college_id || ''}
                    onChange={(e) => {
                      const selectedCollegeId = e.target.value ? parseInt(e.target.value) : null
                      setCollegeId(selectedCollegeId)
                      handleChange('college_id', selectedCollegeId)
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="">{t('academic.semesters.selectCollege')}</option>
                    {colleges.map(college => (
                      <option key={college.id} value={college.id}>{getLocalizedName(college, isRTL)}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('academic.semesters.academicYear')} *</label>
                <select
                  value={formData.academic_year_id}
                  onChange={(e) => handleChange('academic_year_id', e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="">{t('academic.semesters.selectAcademicYear')}</option>
                  {academicYears.map(year => (
                    <option key={year.id} value={year.id}>
                      {getLocalizedName(year, isRTL)} ({year.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('academic.semesters.name')} *</label>
                <input
                  type="text"
                  value={formData.name_en}
                  onChange={(e) => handleChange('name_en', e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="e.g., Fall Semester 2024"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('academic.semesters.nameAr')}</label>
                <input
                  type="text"
                  value={formData.name_ar}
                  onChange={(e) => handleChange('name_ar', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="الفصل الدراسي الأول 2024"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('academic.semesters.code')} *</label>
                  <input
                    type="text"
                    value={formData.code}
                    onChange={(e) => handleChange('code', e.target.value)}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="e.g., FALL2024"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('academic.semesters.numberYear')} *</label>
                  <input
                    type="number"
                    value={formData.academic_year_number}
                    onChange={(e) => handleChange('academic_year_number', e.target.value)}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="2024"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('academic.semesters.season')} *</label>
                <select
                  value={formData.season}
                  onChange={(e) => handleChange('season', e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="">{t('academic.semesters.selectSeason')}</option>
                  <option value="fall">{t('academic.semesters.fall')}</option>
                  <option value="spring">{t('academic.semesters.spring')}</option>
                  <option value="summer">{t('academic.semesters.summer')}</option>
                  <option value="winter">{t('academic.semesters.winter')}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('academic.semesters.status')} *</label>
                <select
                  value={formData.status}
                  onChange={(e) => handleChange('status', e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="planned">{t('academic.semesters.planned')}</option>
                  <option value="active">{t('academic.semesters.active')}</option>
                  <option value="registration_open">{t('academic.semesters.registration_open')}</option>
                  <option value="completed">{t('academic.semesters.completed')}</option>
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('academic.semesters.startDate')} *</label>
                  <input
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => handleChange('start_date', e.target.value)}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('academic.semesters.endDate')} *</label>
                  <input
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => handleChange('end_date', e.target.value)}
                    required
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Add other fields similar to CreateSemester */}
              <div className="border-t pt-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('academic.semesters.registrationDates')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('academic.semesters.registrationStart')}</label>
                    <input
                      type="date"
                      value={formData.registration_start_date}
                      onChange={(e) => handleChange('registration_start_date', e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('academic.semesters.registrationEnd')}</label>
                    <input
                      type="date"
                      value={formData.registration_end_date}
                      onChange={(e) => handleChange('registration_end_date', e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('academic.semesters.lateRegistrationEnd')}</label>
                    <input
                      type="date"
                      value={formData.late_registration_end_date}
                      onChange={(e) => handleChange('late_registration_end_date', e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('academic.semesters.academicDeadlines')}</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('academic.semesters.addDeadline')}</label>
                    <input
                      type="date"
                      value={formData.add_deadline}
                      onChange={(e) => handleChange('add_deadline', e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('academic.semesters.dropDeadline')}</label>
                    <input
                      type="date"
                      value={formData.drop_deadline}
                      onChange={(e) => handleChange('drop_deadline', e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">{t('academic.semesters.withdrawalDeadline')}</label>
                    <input
                      type="date"
                      value={formData.withdrawal_deadline}
                      onChange={(e) => handleChange('withdrawal_deadline', e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('academic.semesters.creditHoursConfig')}</h3>
                <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                  <p className="text-xs text-gray-500 mb-4">{t('academic.semesters.creditHoursFromUniversitySettings') || 'Semester credit limits are configured in University Settings. These values are read-only.'}</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs text-gray-500 mb-1">{t('academic.semesters.minCredits')}</div>
                      <div className="text-sm font-medium text-gray-900">{semesterCreditsFromUni.min_credit_hours}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1">{t('academic.semesters.maxCredits')}</div>
                      <div className="text-sm font-medium text-gray-900">{semesterCreditsFromUni.max_credit_hours}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1">{t('academic.semesters.maxWithPermission')}</div>
                      <div className="text-sm font-medium text-gray-900">{semesterCreditsFromUni.max_credit_hours_with_permission}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500 mb-1">{t('academic.semesters.minGpaForMax')}</div>
                      <div className="text-sm font-medium text-gray-900">{semesterCreditsFromUni.min_gpa_for_max_credits}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('academic.semesters.description')}</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => handleChange('description', e.target.value)}
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="Additional information about this semester..."
                  />
                </div>
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('academic.semesters.descriptionAr')}</label>
                  <textarea
                    value={formData.description_ar}
                    onChange={(e) => handleChange('description_ar', e.target.value)}
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="معلومات إضافية عن هذا الفصل الدراسي..."
                  />
                </div>
              </div>
            </div>
          </div>

          <div className={`flex ${isRTL ? 'justify-start space-x-reverse space-x-4' : 'justify-end space-x-4'}`}>
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              {t('academic.semesters.cancel')}
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} px-6 py-2 bg-primary-gradient text-white rounded-lg font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <Save className="w-5 h-5" />
              <span>{loading ? t('academic.semesters.updating') : t('academic.semesters.edit')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}



