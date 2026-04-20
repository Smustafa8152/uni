import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { supabase, SUPABASE_STORAGE_BUCKET } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { createStudentFromApplication } from '../../utils/createStudentFromApplication'
import { getLocalizedName } from '../../utils/localizedName'
import { resolveOnboardingFeeAmount } from '../../utils/resolveOnboardingFeeAmount'
import { resolveRegistrationFeeAmount } from '../../utils/resolveRegistrationFeeAmount'
import { ArrowLeft, CheckCircle, XCircle, Clock, Mail, Phone, MapPin, Calendar, GraduationCap, FileText, User, AlertCircle, BookOpen, Edit, Save, X, ChevronDown, ChevronUp, ArrowRight, Info, Sparkles, Shield, TrendingUp, ArrowDown } from 'lucide-react'

const TIMELINE_TRIGGER_ICONS = {
  TRSB: { icon: CheckCircle, iconClass: 'text-blue-600', labelClass: 'text-blue-900' },
  TRVF: { icon: XCircle, iconClass: 'text-red-600', labelClass: 'text-red-900' },
  TRVP: { icon: CheckCircle, iconClass: 'text-green-600', labelClass: 'text-green-900' },
  TRPW: { icon: Clock, iconClass: 'text-yellow-600', labelClass: 'text-yellow-900' },
  TRAS: { icon: User, iconClass: 'text-blue-600', labelClass: 'text-blue-900' },
  TRRQ: { icon: AlertCircle, iconClass: 'text-yellow-600', labelClass: 'text-yellow-900' },
  TRUP: { icon: FileText, iconClass: 'text-blue-600', labelClass: 'text-blue-900' },
  TRDA: { icon: CheckCircle, iconClass: 'text-green-600', labelClass: 'text-green-900' },
  TRAC: { icon: CheckCircle, iconClass: 'text-green-600', labelClass: 'text-green-900' },
  TRAF: { icon: CheckCircle, iconClass: 'text-green-600', labelClass: 'text-green-900' },
  TRRJ: { icon: XCircle, iconClass: 'text-red-600', labelClass: 'text-red-900' },
  TRWL: { icon: Clock, iconClass: 'text-purple-600', labelClass: 'text-purple-900' },
  TRMN: { icon: Edit, iconClass: 'text-blue-600', labelClass: 'text-blue-900' },
}

// Edit Application Modal Component
function EditApplicationModal({ 
  application, 
  formData, 
  handleChange, 
  handleSave, 
  handleClose, 
  saving, 
  error, 
  majors, 
  semesters, 
  isRTL,
  isArabicLayout,
}) {
  const { t } = useTranslation()
  const editSteps = useMemo(
    () => [
      { id: 1, name: t('admissions.steps.personal'), icon: User },
      { id: 2, name: t('admissions.steps.contact'), icon: Phone },
      { id: 3, name: t('admissions.steps.emergency'), icon: AlertCircle },
      { id: 4, name: t('admissions.steps.academic'), icon: GraduationCap },
      { id: 5, name: t('admissions.steps.tests'), icon: FileText },
      { id: 6, name: t('admissions.steps.transfer'), icon: BookOpen },
      { id: 7, name: t('admissions.steps.additional'), icon: FileText },
    ],
    [t]
  )
  const [currentStep, setCurrentStep] = useState(1)

  const handleFieldChange = (field, value) => {
    handleChange(field, value)
  }

  const handleNext = () => {
    setCurrentStep(prev => Math.min(prev + 1, editSteps.length))
  }

  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1))
  }

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">{t('admissions.steps.personal')}</h2>
            
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Basic Information (English)</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">First Name *</label>
                  <input
                    type="text"
                    value={formData.first_name || ''}
                    onChange={(e) => handleFieldChange('first_name', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Middle Name</label>
                  <input
                    type="text"
                    value={formData.middle_name || ''}
                    onChange={(e) => handleFieldChange('middle_name', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Last Name *</label>
                  <input
                    type="text"
                    value={formData.last_name || ''}
                    onChange={(e) => handleFieldChange('last_name', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    required
                  />
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Basic Information (Arabic - Optional)</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">First Name (Arabic)</label>
                  <input
                    type="text"
                    value={formData.first_name_ar || ''}
                    onChange={(e) => handleFieldChange('first_name_ar', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    dir="rtl"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Middle Name (Arabic)</label>
                  <input
                    type="text"
                    value={formData.middle_name_ar || ''}
                    onChange={(e) => handleFieldChange('middle_name_ar', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    dir="rtl"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Last Name (Arabic)</label>
                  <input
                    type="text"
                    value={formData.last_name_ar || ''}
                    onChange={(e) => handleFieldChange('last_name_ar', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    dir="rtl"
                  />
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Personal Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Email Address *</label>
                  <input
                    type="email"
                    value={formData.email || ''}
                    onChange={(e) => handleFieldChange('email', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number</label>
                  <input
                    type="tel"
                    value={formData.phone || ''}
                    onChange={(e) => handleFieldChange('phone', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Date of Birth *</label>
                  <input
                    type="date"
                    value={formData.date_of_birth || ''}
                    onChange={(e) => handleFieldChange('date_of_birth', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Gender</label>
                  <select
                    value={formData.gender || ''}
                    onChange={(e) => handleFieldChange('gender', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="">Select Gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Nationality</label>
                  <input
                    type="text"
                    value={formData.nationality || ''}
                    onChange={(e) => handleFieldChange('nationality', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Religion</label>
                  <input
                    type="text"
                    value={formData.religion || ''}
                    onChange={(e) => handleFieldChange('religion', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Place of Birth</label>
                  <input
                    type="text"
                    value={formData.place_of_birth || ''}
                    onChange={(e) => handleFieldChange('place_of_birth', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Enrollment Date</label>
                  <input
                    type="date"
                    value={formData.enrollment_date || ''}
                    onChange={(e) => handleFieldChange('enrollment_date', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>
          </div>
        )
      case 2:
        return (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">{t('admissions.steps.contact')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">Street Address</label>
                <input
                  type="text"
                  value={formData.street_address || ''}
                  onChange={(e) => handleFieldChange('street_address', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">City</label>
                <input
                  type="text"
                  value={formData.city || ''}
                  onChange={(e) => handleFieldChange('city', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">State / Province</label>
                <input
                  type="text"
                  value={formData.state_province || ''}
                  onChange={(e) => handleFieldChange('state_province', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Postal / ZIP Code</label>
                <input
                  type="text"
                  value={formData.postal_code || ''}
                  onChange={(e) => handleFieldChange('postal_code', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Country</label>
                <input
                  type="text"
                  value={formData.country || ''}
                  onChange={(e) => handleFieldChange('country', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>
        )
      case 3:
        return (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">{t('admissions.steps.emergency')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Contact Name</label>
                <input
                  type="text"
                  value={formData.emergency_contact_name || ''}
                  onChange={(e) => handleFieldChange('emergency_contact_name', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Relationship</label>
                <input
                  type="text"
                  value={formData.emergency_contact_relationship || ''}
                  onChange={(e) => handleFieldChange('emergency_contact_relationship', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number</label>
                <input
                  type="tel"
                  value={formData.emergency_contact_phone || ''}
                  onChange={(e) => handleFieldChange('emergency_contact_phone', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
                <input
                  type="email"
                  value={formData.emergency_contact_email || ''}
                  onChange={(e) => handleFieldChange('emergency_contact_email', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>
        )
      case 4:
        return (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">{t('admissions.steps.academic')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Major *</label>
                <select
                  value={formData.major_id || ''}
                  onChange={(e) => handleFieldChange('major_id', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  required
                >
                  <option value="">Select Major</option>
                  {majors.map((major) => (
                    <option key={major.id} value={major.id}>
                      {getLocalizedName(major, isArabicLayout) || major.name_en} ({major.code})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Semester</label>
                <select
                  value={formData.semester_id || ''}
                  onChange={(e) => handleFieldChange('semester_id', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="">Select Semester</option>
                  {semesters.map((semester) => (
                    <option key={semester.id} value={semester.id}>
                      {getLocalizedName(semester, isArabicLayout) || semester.name_en} ({semester.code})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">High School Name</label>
                <input
                  type="text"
                  value={formData.high_school_name || ''}
                  onChange={(e) => handleFieldChange('high_school_name', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">High School Country</label>
                <input
                  type="text"
                  value={formData.high_school_country || ''}
                  onChange={(e) => handleFieldChange('high_school_country', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Graduation Year</label>
                <input
                  type="number"
                  value={formData.graduation_year || ''}
                  onChange={(e) => handleFieldChange('graduation_year', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">GPA / Grade</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.gpa || ''}
                  onChange={(e) => handleFieldChange('gpa', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">Certificate Type</label>
                <input
                  type="text"
                  value={formData.certificate_type || ''}
                  onChange={(e) => handleFieldChange('certificate_type', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>
        )
      case 5:
        return (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">{t('admissions.steps.tests')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">TOEFL Score</label>
                <input
                  type="number"
                  value={formData.toefl_score || ''}
                  onChange={(e) => handleFieldChange('toefl_score', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">IELTS Score</label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.ielts_score || ''}
                  onChange={(e) => handleFieldChange('ielts_score', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">SAT Score</label>
                <input
                  type="number"
                  value={formData.sat_score || ''}
                  onChange={(e) => handleFieldChange('sat_score', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">GMAT Score</label>
                <input
                  type="number"
                  value={formData.gmat_score || ''}
                  onChange={(e) => handleFieldChange('gmat_score', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">GRE Score</label>
                <input
                  type="number"
                  value={formData.gre_score || ''}
                  onChange={(e) => handleFieldChange('gre_score', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>
        )
      case 6:
        return (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">{t('admissions.steps.transfer')}</h2>
            <div className="flex items-center space-x-3 mb-6">
              <input
                type="checkbox"
                checked={formData.is_transfer_student || false}
                onChange={(e) => handleFieldChange('is_transfer_student', e.target.checked)}
                className="w-5 h-5 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
              />
              <label className="text-sm font-medium text-gray-700">Transfer Student</label>
            </div>
            {formData.is_transfer_student && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Previous University</label>
                  <input
                    type="text"
                    value={formData.previous_university || ''}
                    onChange={(e) => handleFieldChange('previous_university', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Previous Degree</label>
                  <input
                    type="text"
                    value={formData.previous_degree || ''}
                    onChange={(e) => handleFieldChange('previous_degree', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Transfer Credits</label>
                  <input
                    type="number"
                    value={formData.transfer_credits || ''}
                    onChange={(e) => handleFieldChange('transfer_credits', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
              </div>
            )}
          </div>
        )
      case 7:
        return (
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">{t('admissions.steps.additional')}</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Personal Statement</label>
              <textarea
                value={formData.personal_statement || ''}
                onChange={(e) => handleFieldChange('personal_statement', e.target.value)}
                rows={8}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
            <div className="flex items-center space-x-3">
              <input
                type="checkbox"
                checked={formData.scholarship_request || false}
                onChange={(e) => handleFieldChange('scholarship_request', e.target.checked)}
                className="w-5 h-5 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
              />
              <label className="text-sm font-medium text-gray-700">Scholarship Request</label>
            </div>
            {formData.scholarship_request && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Scholarship Percentage</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.scholarship_percentage || ''}
                  onChange={(e) => handleFieldChange('scholarship_percentage', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
            )}
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl max-w-6xl w-full max-h-[95vh] overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className={`flex items-center ${isRTL ? 'flex-row-reverse justify-between' : 'justify-between'} p-6 border-b border-gray-200 bg-gradient-to-r from-primary-50 to-primary-100`}>
          <div className={isRTL ? 'text-right' : 'text-left'}>
            <h2 className={`text-2xl font-bold text-gray-900 ${isRTL ? 'text-right' : 'text-left'}`}>
              {t('admissions.viewApplication.edit')}
            </h2>
            <p className={`text-sm text-gray-600 mt-1 ${isRTL ? 'text-right' : 'text-left'}`}>
              {t('admissions.viewApplication.editModal.stepProgress', {
                current: currentStep,
                total: editSteps.length,
              })}{' '}
              • {editSteps[currentStep - 1].name}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-white hover:bg-opacity-50 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Progress Steps */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between overflow-x-auto pb-4">
            {editSteps.map((step, index) => {
              const StepIcon = step.icon
              const isActive = currentStep === step.id
              const isCompleted = currentStep > step.id
              
              return (
                <div key={step.id} className="flex items-center flex-shrink-0">
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${
                        isActive
                          ? 'bg-primary-gradient border-primary-600 text-white'
                          : isCompleted
                          ? 'bg-green-100 border-green-500 text-green-600'
                          : 'bg-gray-100 border-gray-300 text-gray-400'
                      }`}
                    >
                      <StepIcon className="w-5 h-5" />
                    </div>
                    <span className={`text-xs mt-2 font-medium ${isActive ? 'text-primary-600' : 'text-gray-500'}`}>
                      {step.name}
                    </span>
                  </div>
                  {index < editSteps.length - 1 && (
                    <div
                      className={`w-16 h-1 mx-2 ${
                        isCompleted ? 'bg-primary-600' : 'bg-gray-200'
                      }`}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 flex items-center space-x-2">
              <AlertCircle className="w-5 h-5" />
              <span>{error}</span>
            </div>
          )}
          {renderStepContent()}
        </div>

        {/* Modal Footer */}
        <div className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-3'} justify-between p-6 border-t border-gray-200 bg-gray-50`}>
          <button
            onClick={handleBack}
            disabled={currentStep === 1}
            className="flex items-center space-x-2 px-6 py-3 border border-gray-300 rounded-xl text-gray-700 font-medium hover:bg-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ArrowLeft className={`w-4 h-4 ${isRTL ? 'rotate-180' : ''}`} />
            <span>{t('admissions.viewApplication.editModal.previous')}</span>
          </button>
          
          <div className="flex items-center space-x-3">
            <button
              onClick={handleClose}
              disabled={saving}
              className="flex items-center space-x-2 px-6 py-3 border border-gray-300 rounded-xl text-gray-700 font-medium hover:bg-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span>{t('admissions.viewApplication.editModal.cancel')}</span>
            </button>
            {currentStep < editSteps.length ? (
              <button
                onClick={handleNext}
                className="flex items-center space-x-2 px-6 py-3 bg-primary-gradient text-white rounded-xl font-semibold hover:shadow-lg transition-all"
              >
                <span>{t('admissions.viewApplication.editModal.next')}</span>
                <ArrowRight className={`w-4 h-4 ${isRTL ? 'rotate-180' : ''}`} />
              </button>
            ) : (
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center space-x-2 px-6 py-3 bg-primary-gradient text-white rounded-xl font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    <span>{t('admissions.viewApplication.editModal.saving')}</span>
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    <span>{t('admissions.viewApplication.editModal.saveChanges')}</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ViewApplication() {
  const navigate = useNavigate()
  const { id: idParam } = useParams()
  const { i18n } = useTranslation()
  const { isRTL, language } = useLanguage()
  const isArabicLayout =
    isRTL ||
    language === 'ar' ||
    i18n?.language?.toLowerCase()?.startsWith('ar') ||
    (typeof document !== 'undefined' && document?.documentElement?.dir === 'rtl')
  /** Align UI strings with Arabic layout even when i18n language is still "en" (e.g. RTL from document only). */
  const t = useCallback(
    (key, opts) => i18n.t(key, { ...opts, lng: isArabicLayout ? 'ar' : i18n.language }),
    [i18n, isArabicLayout]
  )
  const alignStart = isArabicLayout ? 'text-right' : 'text-left'
  const { user } = useAuth()

  const translateActivityNote = useCallback(
    (note) => {
      if (!note || typeof note !== 'string') return note
      const trimmed = note.trim()
      const known = {
        'Application created': 'admissions.viewApplication.timeline.notes.applicationCreated',
      }
      const key = known[trimmed]
      if (key) return t(key)
      const lng = isArabicLayout ? 'ar' : i18n.language
      const regFee = /^Registration fee payment received:\s*\$?([\d.,]+)\s+via\s+(.+)$/i.exec(trimmed)
      if (regFee) {
        return i18n.t('finance.viewInvoice.notesSystem.registrationFeeReceived', {
          amount: regFee[1],
          method: regFee[2].trim(),
          lng,
        })
      }
      const autoFail = /^Auto-validation failed:\s*([\s\S]+)$/i.exec(trimmed)
      if (autoFail) {
        return i18n.t('finance.viewInvoice.notesSystem.autoValidationFailed', {
          details: autoFail[1].trim(),
          lng,
        })
      }
      if (/Admin Payment|University Admin|College admin|processed by/i.test(trimmed)) {
        return t('finance.viewInvoice.adminPaymentNote', {
          role: t('finance.viewInvoice.adminRoleUniversity'),
        })
      }
      return note
    },
    [t, i18n, isArabicLayout]
  )

  const formatGenderLabel = (g) => {
    if (!g) return t('admissions.viewApplication.detail.notAvailable')
    const v = String(g).toLowerCase()
    if (v === 'male') return t('admissions.viewApplication.detail.genderMale')
    if (v === 'female') return t('admissions.viewApplication.detail.genderFemale')
    if (v === 'other') return t('admissions.viewApplication.detail.genderOther')
    return g
  }

  const formatViewDate = (d) =>
    d ? new Date(d).toLocaleDateString(isArabicLayout ? 'ar' : undefined) : t('admissions.viewApplication.detail.notAvailable')
  
  // Parse ID as integer to avoid UUID parsing issues
  const applicationId = idParam ? parseInt(idParam, 10) : null
  
  const [loading, setLoading] = useState(true)
  const [application, setApplication] = useState(null)
  const [error, setError] = useState('')
  const [updating, setUpdating] = useState(false)
  
  // Status management state
  const [statusCodes, setStatusCodes] = useState([])
  const [statusTransitions, setStatusTransitions] = useState([])
  const [requestReasons, setRequestReasons] = useState([])
  const [rejectReasons, setRejectReasons] = useState([])
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [selectedStatus, setSelectedStatus] = useState('')
  const [selectedReason, setSelectedReason] = useState('')
  const [statusNotes, setStatusNotes] = useState('')
  const [modalStep, setModalStep] = useState(1) // 1: Select Status, 2: Select Reason (if needed), 3: Add Notes
  const [showAllStatuses, setShowAllStatuses] = useState(false)
  const [statusPassword, setStatusPassword] = useState('') // Password for student account when accepting application
  
  // Edit mode state
  const [isEditMode, setIsEditMode] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editFormData, setEditFormData] = useState({})
  const [savingEdit, setSavingEdit] = useState(false)
  const [editMajors, setEditMajors] = useState([])
  const [editSemesters, setEditSemesters] = useState([])
  
  // Activity timeline state
  const [activityLog, setActivityLog] = useState([])
  const [loadingActivity, setLoadingActivity] = useState(false)

  // Documents (admin verification + applicant requests)
  const [applicationDocuments, setApplicationDocuments] = useState([])
  const [loadingDocuments, setLoadingDocuments] = useState(false)
  const [documentRequests, setDocumentRequests] = useState([])
  const [showRequestDocsModal, setShowRequestDocsModal] = useState(false)
  const [requestDocsMessage, setRequestDocsMessage] = useState('')
  const [requestDocsSending, setRequestDocsSending] = useState(false)
  const [verifyingDocId, setVerifyingDocId] = useState(null)

  const [showOfferModal, setShowOfferModal] = useState(false)
  const [offerDeadline, setOfferDeadline] = useState('')
  const [tuitionAmount, setTuitionAmount] = useState('')
  const [tuitionTotalAmount, setTuitionTotalAmount] = useState(0)
  const [sendingOffer, setSendingOffer] = useState(false)
  const [offerMessage, setOfferMessage] = useState('')

  const [showReceiveFeeModal, setShowReceiveFeeModal] = useState(false)
  const [receivingFee, setReceivingFee] = useState(false)
  const [receiveFeeAmount, setReceiveFeeAmount] = useState('')
  const [receiveFeeMethod, setReceiveFeeMethod] = useState('cash')

  const coreDocVerified = useMemo(() => {
    const docs = Array.isArray(applicationDocuments) ? applicationDocuments : []
    const idOk = docs.some((d) => d.document_type === 'id_photo' && d.verified_at)
    const trOk = docs.some((d) => d.document_type === 'transcript' && d.verified_at)
    return { idOk, trOk, allOk: idOk && trOk }
  }, [applicationDocuments])

  const canReceiveRegistrationFee = useMemo(() => {
    const code = String(application?.status_code || '').toUpperCase()
    if (!application?.id) return false
    if (application?.registration_fee_paid_at) return false
    if (!coreDocVerified.allOk) return false
    // We only collect the registration fee after document verification step
    return code === 'RVDV' || code === 'RVRC' || code === 'RVIN'
  }, [application?.id, application?.status_code, application?.registration_fee_paid_at, coreDocVerified.allOk])

  const openReceiveFeeModal = async () => {
    setError('')
    setReceiveFeeMethod('cash')
    try {
      const amt = await resolveRegistrationFeeAmount(application)
      setReceiveFeeAmount(Number.isFinite(Number(amt)) ? String(Number(amt).toFixed(2)) : '')
    } catch (_) {
      setReceiveFeeAmount('')
    }
    setShowReceiveFeeModal(true)
  }

  const handleReceiveRegistrationFee = async () => {
    if (!applicationId || !application) return
    setReceivingFee(true)
    setError('')
    try {
      const amt = Number(receiveFeeAmount)
      if (!Number.isFinite(amt) || amt <= 0) throw new Error('Fee amount is required.')
      const now = new Date().toISOString()
      const from = application.status_code || null

      // After docs verified, enable payment for applicant (payment pending).
      const nextStatus = 'APPN'

      const { error: updErr } = await supabase
        .from('applications')
        .update({
          registration_fee_amount: amt,
          status_code: nextStatus,
          status: 'pending',
          status_changed_at: now,
        })
        .eq('id', applicationId)
      if (updErr) throw updErr

      await supabase.from('status_change_audit_log').insert({
        entity_type: 'application',
        entity_id: applicationId,
        from_status_code: from,
        to_status_code: nextStatus,
        transition_reason_code: null,
        trigger_code: 'TRPW',
        notes: `Registration fee payment enabled: ${amt}. Applicant must pay.`,
      })

      setApplication((prev) =>
        prev
          ? {
              ...prev,
              registration_fee_amount: amt,
              status_code: nextStatus,
              status: 'pending',
              status_changed_at: now,
            }
          : prev
      )
      setShowReceiveFeeModal(false)
    } catch (e) {
      setError(e?.message || 'Failed to record fee')
    } finally {
      setReceivingFee(false)
    }
  }

  const getStaffUserId = useCallback(async () => {
    if (!user?.email) return null
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id')
      .eq('email', user.email)
      .maybeSingle()
    if (userError) return null
    return userData?.id ?? null
  }, [user?.email])

  const sendAdmissionNotification = useCallback(
    async ({ type, subject, message, meta } = {}) => {
      try {
        if (!application?.email) return
        const collegeId = application?.college_id ?? null
        await supabase.functions.invoke('send-admission-notification', {
          body: {
            scope: 'college',
            collegeId,
            to: application.email,
            type,
            subject,
            message,
            application: {
              id: application.id,
              application_number: application.application_number,
            },
            meta: meta || {},
          },
        })
      } catch (e) {
        console.warn('Email notification failed:', e?.message || e)
      }
    },
    [application?.email, application?.college_id, application?.id, application?.application_number]
  )

  useEffect(() => {
    if (applicationId) {
      fetchApplication()
      fetchStatusData()
    }
  }, [applicationId])

  const fetchStatusData = async () => {
    try {
      // Fetch all status codes
      const { data: codes, error: codesError } = await supabase
        .from('student_status_codes')
        .select('*')
        .eq('is_active', true)
        .order('code')

      if (codesError) throw codesError
      setStatusCodes(codes || [])

      // Fetch status transitions
      const { data: transitions, error: transitionsError } = await supabase
        .from('status_workflow_transitions')
        .select('*')
        .eq('is_active', true)
        .order('from_status_code')

      if (transitionsError) throw transitionsError
      setStatusTransitions(transitions || [])

      // Fetch request info reasons (RVRI)
      const { data: requestReasonsData, error: requestError } = await supabase
        .from('status_transition_reasons')
        .select('*')
        .eq('reason_type', 'request_info')
        .eq('is_active', true)
        .order('code')

      if (requestError) throw requestError
      setRequestReasons(requestReasonsData || [])

      // Fetch reject reasons (DCRJ)
      const { data: rejectReasonsData, error: rejectError } = await supabase
        .from('status_transition_reasons')
        .select('*')
        .eq('reason_type', 'reject')
        .eq('is_active', true)
        .order('code')

      if (rejectError) throw rejectError
      setRejectReasons(rejectReasonsData || [])
    } catch (err) {
      console.error('Error fetching status data:', err)
    }
  }


  const fetchApplication = async () => {
    if (!applicationId || isNaN(applicationId)) {
      setError('Invalid application ID')
      setLoading(false)
      return null
    }

    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('applications')
        .select(`
          *,
          majors (
            id,
            name_en,
            name_ar,
            code,
            degree_level
          ),
          semesters (
            id,
            name_en,
            name_ar,
            code
          ),
          colleges (
            id,
            name_en,
            name_ar,
            code
          ),
          reviewed_by_user:users!applications_reviewed_by_fkey (
            id,
            email
          )
        `)
        .eq('id', applicationId)
        .single()

      if (error) throw error
      setApplication(data)

      // Fetch uploaded documents + outstanding requests (side effects; do not block primary view)
      setLoadingDocuments(true)
      try {
        const [{ data: docs }, { data: reqs }] = await Promise.all([
          supabase
            .from('application_documents')
            .select('id, application_id, document_type, file_path, file_name, file_size, content_type, uploaded_at, verified_at, verified_by, verification_notes')
            .eq('application_id', applicationId)
            .order('uploaded_at', { ascending: false }),
          supabase
            .from('application_document_requests')
            .select('id, application_id, requested_by, message, created_at, resolved_at, status')
            .eq('application_id', applicationId)
            .order('created_at', { ascending: false }),
        ])
        setApplicationDocuments(docs || [])
        setDocumentRequests(reqs || [])
      } catch (e) {
        console.warn('Failed to fetch documents/requests:', e?.message || e)
      } finally {
        setLoadingDocuments(false)
      }
      
      // Fetch activity log after application is loaded
      if (data?.id && data?.created_at) {
        fetchActivityLogForApplication(data.id, data)
      }
      
      return data
    } catch (err) {
      console.error('Error fetching application:', err)
      setError('Failed to load application')
      return null
    } finally {
      setLoading(false)
    }
  }

  const fetchActivityLogForApplication = async (appId, appData = null) => {
    setLoadingActivity(true)
    try {
      // Use passed appData or current application state
      const currentApp = appData || application
      
      // Fetch status change audit log entries for this application
      const { data: logEntries, error: logError } = await supabase
        .from('status_change_audit_log')
        .select('*')
        .eq('entity_type', 'application')
        .eq('entity_id', appId)
        .order('created_at', { ascending: false })

      if (logError) throw logError

      // Fetch user details for entries that have triggered_by
      const userIds = [...new Set(logEntries?.filter(entry => entry.triggered_by).map(entry => entry.triggered_by) || [])]
      let usersMap = {}
      
      if (userIds.length > 0) {
        const { data: usersData, error: usersError } = await supabase
          .from('users')
          .select('id, email, name')
          .in('id', userIds)
        
        if (!usersError && usersData) {
          usersMap = usersData.reduce((acc, user) => {
            acc[user.id] = user
            return acc
          }, {})
        }
      }

      // Attach user data to log entries
      const logEntriesWithUsers = (logEntries || []).map(entry => ({
        ...entry,
        triggered_by_user: entry.triggered_by ? usersMap[entry.triggered_by] || null : null
      }))

      // Also add the initial creation as an activity
      if (currentApp?.created_at) {
        const initialEntry = {
          id: 'initial',
          from_status_code: null,
          to_status_code: currentApp.status_code || 'APDR',
          trigger_code: 'TRSB',
          triggered_by: null,
          notes: 'Application created',
          created_at: currentApp.created_at,
          triggered_by_user: null,
        }
        // Check if initial entry already exists in logEntries (to avoid duplicates)
        const hasInitialEntry = logEntriesWithUsers?.some(entry => 
          entry.trigger_code === 'TRSB' && !entry.from_status_code && entry.to_status_code === (currentApp.status_code || 'APDR')
        )
        setActivityLog(hasInitialEntry ? logEntriesWithUsers : [initialEntry, ...logEntriesWithUsers])
      } else {
        setActivityLog(logEntriesWithUsers)
      }
    } catch (err) {
      console.error('Error fetching activity log:', err)
      setActivityLog([])
    } finally {
      setLoadingActivity(false)
    }
  }

  const getAvailableTransitions = () => {
    if (!application?.status_code) return []
    
    return statusTransitions.filter(
      transition => transition.from_status_code === application.status_code
    )
  }

  const getAllAvailableStatuses = () => {
    const transitions = getAvailableTransitions()
    const transitionCodes = transitions.map(t => t.to_status_code)
    
    const currentStatus = statusCodes.find(s => s.code === application?.status_code)
    if (!currentStatus) return statusCodes

    return statusCodes.map(status => ({
      ...status,
      isTransition: transitionCodes.includes(status.code),
      transition: transitions.find(t => t.to_status_code === status.code)
    }))
  }

  const getStatusesByCategory = () => {
    const allStatuses = getAllAvailableStatuses()
    const transitions = getAvailableTransitions()
    const transitionCodes = transitions.map(t => t.to_status_code)
    
    const categories = {
      recommended: allStatuses.filter(s => s.isTransition),
      application: allStatuses.filter(s => s.category === 'application' && !s.isTransition),
      review: allStatuses.filter(s => s.category === 'review' && !s.isTransition),
      decision: allStatuses.filter(s => s.category === 'decision' && !s.isTransition),
      enrollment: allStatuses.filter(s => s.category === 'enrollment' && !s.isTransition),
      academic: allStatuses.filter(s => s.category === 'academic' && !s.isTransition),
      graduation: allStatuses.filter(s => (s.category === 'graduation' || s.code === 'GRAD' || s.code === 'ALUM') && !s.isTransition),
      other: allStatuses.filter(s => !transitionCodes.includes(s.code) && !['application', 'review', 'decision', 'enrollment', 'academic', 'graduation'].includes(s.category))
    }
    
    return categories
  }

  const requiresReason = (statusCode) => {
    if (statusCode === 'RVRI') return 'request_info'
    if (statusCode === 'DCRJ') return 'reject'
    return null
  }

  const handleStatusSelect = (statusCode) => {
    setSelectedStatus(statusCode)
    setError('')
    const reasonType = requiresReason(statusCode)
    if (reasonType) {
      setModalStep(2) // Move to reason selection step
    } else {
      setModalStep(3) // Move to notes step
    }
  }

  const handleReasonSelect = (reasonCode) => {
    setSelectedReason(reasonCode)
    setError('')
    setModalStep(3) // Move to notes step
  }

  const docPublicUrl = useCallback((filePath) => {
    if (!filePath) return null
    const { data } = supabase.storage.from(SUPABASE_STORAGE_BUCKET).getPublicUrl(filePath)
    return data?.publicUrl || null
  }, [])

  const handleVerifyDocument = async (docId) => {
    if (!docId) return
    setVerifyingDocId(docId)
    try {
      const staffUserId = await getStaffUserId()
      const { error: upErr } = await supabase
        .from('application_documents')
        .update({
          verified_at: new Date().toISOString(),
          verified_by: staffUserId,
        })
        .eq('id', docId)
      if (upErr) throw upErr

      setApplicationDocuments((prev) =>
        prev.map((d) => (d.id === docId ? { ...d, verified_at: new Date().toISOString(), verified_by: staffUserId } : d))
      )

      await sendAdmissionNotification({
        type: 'document_verified',
        subject: 'Document verified',
        message: 'One of your uploaded documents has been verified.',
        meta: { document_id: docId },
      })
    } catch (e) {
      console.error('Verify document failed:', e)
      setError(e?.message || 'Failed to verify document')
    } finally {
      setVerifyingDocId(null)
    }
  }

  const handleRequestMoreDocuments = async () => {
    const msg = requestDocsMessage.trim()
    if (!msg || !applicationId) return
    setRequestDocsSending(true)
    setError('')
    try {
      const staffUserId = await getStaffUserId()
      const { data: reqRow, error: insErr } = await supabase
        .from('application_document_requests')
        .insert({
          application_id: applicationId,
          requested_by: staffUserId,
          message: msg,
          status: 'open',
        })
        .select('id, application_id, requested_by, message, created_at, resolved_at, status')
        .single()
      if (insErr) throw insErr
      setDocumentRequests((prev) => [reqRow, ...prev])

      // Move application into "info required" if not already there (no reason code enforced here)
      if (application?.status_code !== 'RVRI') {
        await supabase.from('applications').update({ status_code: 'RVRI', status: 'pending' }).eq('id', applicationId)
        await supabase.from('status_change_audit_log').insert({
          entity_type: 'application',
          entity_id: applicationId,
          from_status_code: application?.status_code || null,
          to_status_code: 'RVRI',
          trigger_code: 'TRRQ',
          triggered_by: staffUserId,
          notes: msg,
        })
        setApplication((prev) => (prev ? { ...prev, status_code: 'RVRI', status: 'pending' } : prev))
      }

      await sendAdmissionNotification({
        type: 'request_documents',
        subject: 'Action required: additional documents needed',
        message: msg,
        meta: { request_id: reqRow?.id },
      })

      setShowRequestDocsModal(false)
      setRequestDocsMessage('')
    } catch (e) {
      console.error('Request docs failed:', e)
      setError(e?.message || 'Failed to request documents')
    } finally {
      setRequestDocsSending(false)
    }
  }

  const handleSendOfferLetter = async () => {
    if (!applicationId || !application) return
    setSendingOffer(true)
    setError('')
    try {
      const deadlineIso = offerDeadline ? new Date(offerDeadline).toISOString() : null
      const amountNum = tuitionAmount !== '' ? Number(tuitionAmount) : null
      if (!Number.isFinite(amountNum) || Number(amountNum) <= 0) {
        throw new Error('Tuition fee amount is required.')
      }

      const now = new Date().toISOString()
      const { error: updErr } = await supabase
        .from('applications')
        .update({
          status_code: 'DCCA',
          status: 'accepted',
          status_changed_at: now,
          offer_sent_at: now,
          offer_deadline: deadlineIso,
          tuition_fee_amount: amountNum,
        })
        .eq('id', applicationId)
      if (updErr) throw updErr

      await supabase.from('status_change_audit_log').insert({
        entity_type: 'application',
        entity_id: applicationId,
        from_status_code: application?.status_code || null,
        to_status_code: 'DCCA',
        transition_reason_code: null,
        trigger_code: 'TROF',
        notes: `Offer letter sent. Tuition fee: ${amountNum}.`,
      })

      setApplication((prev) =>
        prev
          ? {
              ...prev,
              status_code: 'DCCA',
              status: 'accepted',
              offer_sent_at: now,
              offer_deadline: deadlineIso,
              tuition_fee_amount: amountNum,
            }
          : prev
      )

      // Email applicant (best effort)
      try {
        const subject = t('offerLetter.emailSentSubject', 'Your offer letter is ready')
        const message =
          offerMessage?.trim() ||
          t(
            'offerLetter.emailSentBody',
            'Please log in to your applicant portal to view your offer letter and pay the tuition fee before the deadline.'
          )
        await supabase.functions.invoke('send-admission-notification', {
          body: {
            scope: 'college',
            type: 'offer_sent',
            to: application.email,
            subject,
            message,
            collegeId: application.college_id,
            application: { application_number: application.application_number },
          },
        })
      } catch (_) {
        // ignore email errors
      }

      setShowOfferModal(false)
      setOfferDeadline('')
      setTuitionAmount('')
      setTuitionTotalAmount(0)
      setOfferMessage('')
    } catch (e) {
      setError(e?.message || 'Failed to send offer letter')
    } finally {
      setSendingOffer(false)
    }
  }

  const handleStatusChange = async () => {
    if (!selectedStatus) {
      setError('Please select a status')
      setModalStep(1)
      return
    }

    const reasonType = requiresReason(selectedStatus)
    if (reasonType && !selectedReason) {
      setError(`Please select a ${reasonType === 'request_info' ? 'request' : 'reject'} reason`)
      setModalStep(2)
      return
    }

    setUpdating(true)
    setError('')
    
    try {
      // Fetch the integer user ID from users table (not the auth UUID)
      let userId = null
      if (user?.email) {
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('id')
          .eq('email', user.email)
          .single()
        
        if (!userError && userData) {
          userId = userData.id
        }
      }

      // Determine legacy status for backward compatibility
      let legacyStatus = 'pending'
      if (selectedStatus.startsWith('DC')) {
        legacyStatus = selectedStatus === 'DCRJ' ? 'rejected' : 'accepted'
      } else if (selectedStatus === 'DCWL') {
        legacyStatus = 'waitlisted'
      } else if (selectedStatus.startsWith('EN') || selectedStatus.startsWith('AC') || selectedStatus === 'GRAD' || selectedStatus === 'ALUM') {
        legacyStatus = 'accepted'
      }

      const updateData = {
        status_code: selectedStatus,
        status: legacyStatus,
        status_reason_code: selectedReason || null,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        review_notes: statusNotes || null,
        status_changed_at: new Date().toISOString(),
        status_changed_by: userId,
      }

      const { error: updateError } = await supabase
        .from('applications')
        .update(updateData)
        .eq('id', applicationId)

      if (updateError) throw updateError

      // Notify applicant by email on key admissions statuses
      if (selectedStatus === 'RVRI') {
        await sendAdmissionNotification({
          type: 'request_documents',
          subject: 'Action required: additional documents needed',
          message:
            statusNotes?.trim() ||
            'Admissions has requested additional information/documents. Please check your applicant dashboard and upload the required items.',
          meta: { to_status_code: selectedStatus, reason_code: selectedReason || null },
        })
      } else if (selectedStatus === 'DCRJ') {
        await sendAdmissionNotification({
          type: 'rejected',
          subject: 'Admission decision',
          message:
            statusNotes?.trim() ||
            'Your application status has been updated. Please check your applicant dashboard for details.',
          meta: { to_status_code: selectedStatus, reason_code: selectedReason || null },
        })
      } else if (selectedStatus === 'DCCA' || selectedStatus === 'DCFA') {
        await sendAdmissionNotification({
          type: 'accepted',
          subject: 'Admission decision',
          message:
            statusNotes?.trim() ||
            'Congratulations! Your application status has been updated. Please check your applicant dashboard for next steps.',
          meta: { to_status_code: selectedStatus, reason_code: selectedReason || null },
        })
      } else if (selectedStatus === 'RVDV') {
        await sendAdmissionNotification({
          type: 'document_verification',
          subject: 'Document verification in progress',
          message:
            statusNotes?.trim() ||
            'Your uploaded documents are now under verification. We will contact you if anything else is required.',
          meta: { to_status_code: selectedStatus, reason_code: selectedReason || null },
        })
      }

      // Find if there's a defined transition for this status change
      const transition = statusTransitions.find(t => 
        t.from_status_code === application?.status_code && t.to_status_code === selectedStatus
      )
      
      // Log the status change to audit log
      const { error: auditError } = await supabase
        .from('status_change_audit_log')
        .insert({
          entity_type: 'application',
          entity_id: applicationId,
          from_status_code: application?.status_code || null,
          to_status_code: selectedStatus,
          transition_reason_code: selectedReason || null,
          trigger_code: transition?.trigger_code || 'TRMN', // Use transition trigger or 'Manual' if no transition defined
          triggered_by: userId,
          notes: statusNotes || null,
        })

      if (auditError) {
        console.error('Error logging status change:', auditError)
        // Don't throw here - the application update was successful
      }
      
      // If status is 'DCFA' (Accepted Final), automatically create student record
      if (selectedStatus === 'DCFA') {
        try {
          // Fetch full application data for student creation
          const { data: fullApplication, error: fetchError } = await supabase
            .from('applications')
            .select('*')
            .eq('id', applicationId)
            .single()

          if (!fetchError && fullApplication) {
            // Pass custom password if provided
            const password = statusPassword?.trim() || null
            const result = await createStudentFromApplication(fullApplication, password)
            
            if (result.success) {
              console.log('✅ Student created successfully from application:', result.student.student_id)
              // Optionally show success message to user
              // You could add a success state here
            } else if (result.alreadyExists) {
              console.log('ℹ️ Student already exists for this application')
              // Student already exists, that's okay
            } else {
              console.error('⚠️ Failed to create student from application:', result.error)
              // Log error but don't block the status update
            }
          }
        } catch (studentCreationError) {
          console.error('Error creating student from application:', studentCreationError)
          // Don't throw - application status update was successful
          // Student can be created manually later if needed
        }
      }
      
      setShowStatusModal(false)
      setSelectedStatus('')
      setSelectedReason('')
      setStatusNotes('')
      setModalStep(1)
      setShowAllStatuses(false)
      
      // Refresh application data (this will also trigger activity log fetch)
      await fetchApplication()
      
      // Also explicitly refetch activity log to ensure it's up to date
      // The fetchApplication above should have already triggered it, but this ensures it
      if (applicationId) {
        // Get the latest application data
        const { data: updatedApp } = await supabase
          .from('applications')
          .select('id, created_at, status_code')
          .eq('id', applicationId)
          .single()
        
        if (updatedApp) {
          fetchActivityLogForApplication(applicationId, updatedApp)
        }
      }
    } catch (err) {
      console.error('Error updating application status:', err)
      setError(err.message || 'Failed to update application status')
    } finally {
      setUpdating(false)
    }
  }

  const resetModal = () => {
    setShowStatusModal(false)
    setSelectedStatus('')
    setSelectedReason('')
    setStatusNotes('')
    setStatusPassword('')
    setModalStep(1)
    setShowAllStatuses(false)
    setError('')
  }

  const getStatusColor = (statusCode) => {
    if (!statusCode) return 'bg-gray-100 text-gray-800 border-gray-200'
    
    const category = statusCodes.find(s => s.code === statusCode)?.category || ''
    
    if (statusCode.startsWith('AP')) return 'bg-blue-100 text-blue-800 border-blue-200'
    if (statusCode.startsWith('RV')) return 'bg-yellow-100 text-yellow-800 border-yellow-200'
    if (statusCode.startsWith('DC')) {
      if (statusCode === 'DCRJ') return 'bg-red-100 text-red-800 border-red-200'
      if (statusCode === 'DCWL') return 'bg-purple-100 text-purple-800 border-purple-200'
      return 'bg-green-100 text-green-800 border-green-200'
    }
    if (statusCode.startsWith('EN')) return 'bg-indigo-100 text-indigo-800 border-indigo-200'
    if (statusCode.startsWith('AC')) return 'bg-teal-100 text-teal-800 border-teal-200'
    if (statusCode === 'GRAD') return 'bg-emerald-100 text-emerald-800 border-emerald-200'
    if (statusCode === 'ALUM') return 'bg-slate-100 text-slate-800 border-slate-200'
    
    return 'bg-gray-100 text-gray-800 border-gray-200'
  }

  const getStatusIcon = (statusCode) => {
    if (!statusCode) return <Clock className="w-5 h-5" />
    
    if (statusCode === 'DCRJ') return <XCircle className="w-5 h-5" />
    if (statusCode === 'DCFA' || statusCode === 'DCCA') return <CheckCircle className="w-5 h-5" />
    if (statusCode.startsWith('EN') || statusCode.startsWith('AC') || statusCode === 'GRAD') return <CheckCircle className="w-5 h-5" />
    if (statusCode === 'DCWL') return <Clock className="w-5 h-5" />
    
    return <Clock className="w-5 h-5" />
  }

  const getStatusDisplayName = (statusCode) => {
    if (!statusCode) return 'Unknown'
    const status = statusCodes.find(s => s.code === statusCode)
    return status ? (isRTL ? status.name_ar : status.name_en) : statusCode
  }

  // Edit mode functions
  const fetchEditMajors = async () => {
    if (!application?.college_id) return
    try {
      const { data, error } = await supabase
        .from('majors')
        .select('id, name_en, name_ar, code, college_id, is_university_wide')
        .eq('status', 'active')
        .or(`college_id.eq.${application.college_id},is_university_wide.eq.true`)
        .order('name_en')
      
      if (error) throw error
      setEditMajors(data || [])
    } catch (err) {
      console.error('Error fetching majors for edit:', err)
    }
  }

  const fetchEditSemesters = async () => {
    if (!application?.college_id) return
    try {
      const { data, error } = await supabase
        .from('semesters')
        .select('id, name_en, name_ar, code, start_date, end_date, college_id, is_university_wide')
        .or(`college_id.eq.${application.college_id},is_university_wide.eq.true`)
        .order('start_date', { ascending: false })
      
      if (error) throw error
      setEditSemesters(data || [])
    } catch (err) {
      console.error('Error fetching semesters for edit:', err)
    }
  }

  const handleEditClick = async () => {
    if (!application) return
    setEditFormData({
      first_name: application.first_name || '',
      middle_name: application.middle_name || '',
      last_name: application.last_name || '',
      first_name_ar: application.first_name_ar || '',
      middle_name_ar: application.middle_name_ar || '',
      last_name_ar: application.last_name_ar || '',
      email: application.email || '',
      phone: application.phone || '',
      date_of_birth: application.date_of_birth || '',
      gender: application.gender || '',
      nationality: application.nationality || '',
      religion: application.religion || '',
      place_of_birth: application.place_of_birth || '',
      street_address: application.street_address || '',
      city: application.city || '',
      state_province: application.state_province || '',
      postal_code: application.postal_code || '',
      country: application.country || '',
      emergency_contact_name: application.emergency_contact_name || '',
      emergency_contact_relationship: application.emergency_contact_relationship || '',
      emergency_contact_phone: application.emergency_contact_phone || '',
      emergency_contact_email: application.emergency_contact_email || '',
      major_id: application.major_id ? String(application.major_id) : '',
      semester_id: application.semester_id ? String(application.semester_id) : '',
      high_school_name: application.high_school_name || '',
      high_school_country: application.high_school_country || '',
      graduation_year: application.graduation_year ? String(application.graduation_year) : '',
      gpa: application.gpa ? String(application.gpa) : '',
      certificate_type: application.certificate_type || '',
      toefl_score: application.toefl_score ? String(application.toefl_score) : '',
      ielts_score: application.ielts_score ? String(application.ielts_score) : '',
      sat_score: application.sat_score ? String(application.sat_score) : '',
      gmat_score: application.gmat_score ? String(application.gmat_score) : '',
      gre_score: application.gre_score ? String(application.gre_score) : '',
      is_transfer_student: application.is_transfer_student || false,
      previous_university: application.previous_university || '',
      previous_degree: application.previous_degree || '',
      transfer_credits: application.transfer_credits ? String(application.transfer_credits) : '',
      personal_statement: application.personal_statement || '',
      scholarship_request: application.scholarship_request || false,
      scholarship_percentage: application.scholarship_percentage ? String(application.scholarship_percentage) : '',
      enrollment_date: application.enrollment_date || '',
    })
    await fetchEditMajors()
    await fetchEditSemesters()
    setShowEditModal(true)
    setError('')
  }

  const handleCloseEditModal = () => {
    setShowEditModal(false)
    setEditFormData({})
    setError('')
  }

  const handleSaveEdit = async () => {
    setSavingEdit(true)
    setError('')
    
    try {
      const updateData = {}
      
      // Build update data from form data
      Object.keys(editFormData).forEach(key => {
        const value = editFormData[key]
        if (key === 'major_id' || key === 'semester_id' || key === 'graduation_year' || key === 'transfer_credits' || key === 'toefl_score' || key === 'sat_score' || key === 'gmat_score' || key === 'gre_score') {
          updateData[key] = value ? parseInt(value) : null
        } else if (key === 'gpa' || key === 'scholarship_percentage' || key === 'ielts_score') {
          updateData[key] = value ? parseFloat(value) : null
        } else if (key === 'is_transfer_student' || key === 'scholarship_request') {
          updateData[key] = value === true || value === 'true'
        } else {
          updateData[key] = value || null
        }
      })

      const { error: updateError } = await supabase
        .from('applications')
        .update(updateData)
        .eq('id', applicationId)

      if (updateError) throw updateError

      setShowEditModal(false)
      setEditFormData({})
      await fetchApplication()
    } catch (err) {
      console.error('Error updating application:', err)
      setError(err.message || 'Failed to update application')
    } finally {
      setSavingEdit(false)
    }
  }

  const handleEditChange = (field, value) => {
    setEditFormData(prev => ({ ...prev, [field]: value }))
    if (error) setError('')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (error && !application) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center space-x-2 text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back</span>
        </button>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      </div>
    )
  }

  if (!application) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => navigate('/admissions/applications')}
          className="flex items-center space-x-2 text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back</span>
        </button>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-700">
          Application not found
        </div>
      </div>
    )
  }

  const availableStatuses = getAllAvailableStatuses()
  const availableTransitions = getAvailableTransitions()
  const reasonType = selectedStatus ? requiresReason(selectedStatus) : null
  const reasonsList = reasonType === 'request_info' ? requestReasons : reasonType === 'reject' ? rejectReasons : []

  return (
    <div className="space-y-6" dir={isArabicLayout ? 'rtl' : 'ltr'}>
      {/* Header: grid keeps actions at start edge (left in EN, right in AR) and status at end */}
      <div
        className="grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3"
        dir={isArabicLayout ? 'rtl' : 'ltr'}
      >
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            onClick={handleEditClick}
            disabled={updating || loading}
            className="flex items-center space-x-2 px-4 py-2 bg-gray-600 text-white rounded-lg font-medium hover:bg-gray-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Edit className="w-4 h-4" />
            <span>{t('admissions.viewApplication.edit')}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setError('')
              // Precompute onboarding fee (10% of total) from finance configuration / major catalog
              ;(async () => {
                try {
                  const res = await resolveOnboardingFeeAmount(application)
                  setTuitionTotalAmount(res.total || 0)
                  setTuitionAmount(res.onboarding ? String(Number(res.onboarding).toFixed(2)) : '')
                } catch (_) {
                  setTuitionTotalAmount(0)
                  setTuitionAmount('')
                }
              })()
              setShowOfferModal(true)
            }}
            disabled={updating || sendingOffer || !application?.registration_fee_paid_at}
            className="flex items-center space-x-2 px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            title={!application?.registration_fee_paid_at ? 'Registration fee must be paid first' : undefined}
          >
            <Mail className="w-4 h-4" />
            <span>{t('admissions.viewApplication.sendOfferLetter', 'Send offer letter')}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setModalStep(1)
              setSelectedStatus('')
              setSelectedReason('')
              setStatusNotes('')
              setStatusPassword('')
              setShowAllStatuses(false)
              setError('')
              setShowStatusModal(true)
            }}
            disabled={updating}
            className="flex items-center space-x-2 px-4 py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Edit className="w-4 h-4" />
            <span>{t('admissions.viewApplication.changeStatus')}</span>
          </button>
        </div>
        <div className="flex min-w-0 items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/admissions/applications')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors shrink-0"
          >
            {isArabicLayout ? <ArrowRight className="w-5 h-5 text-gray-600" /> : <ArrowLeft className="w-5 h-5 text-gray-600" />}
          </button>
          <div className={`min-w-0 flex-1 ${alignStart}`} dir={isArabicLayout ? 'rtl' : 'ltr'}>
            <h1 className={`text-3xl font-bold text-gray-900 ${alignStart}`}>{t('admissions.viewApplication.title')}</h1>
            <p className={`text-gray-600 mt-1 ${alignStart}`}>
              {application?.first_name} {application?.last_name}
            </p>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border font-medium shrink-0 max-w-full ${getStatusColor(
            application?.status_code || application?.status
          )}`}
          dir={isArabicLayout ? 'rtl' : 'ltr'}
        >
          {getStatusIcon(application?.status_code || application?.status)}
          <span className="truncate">{getStatusDisplayName(application?.status_code || application?.status)}</span>
        </span>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      )}

      {/* Enhanced Status Change Modal */}
      {showStatusModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl max-w-5xl w-full max-h-[95vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className={`flex items-center ${isRTL ? 'flex-row-reverse justify-between' : 'justify-between'} p-6 border-b border-gray-200 bg-gradient-to-r from-primary-50 to-primary-100`}>
              <div className={isRTL ? 'text-right' : 'text-left'}>
                <h2 className={`text-2xl font-bold text-gray-900 ${isRTL ? 'text-right' : 'text-left'}`}>
                  Change Application Status
                </h2>
                <p className={`text-sm text-gray-600 mt-1 ${isRTL ? 'text-right' : 'text-left'}`}>
                  Select a new status for this application
                </p>
              </div>
              <button
                onClick={resetModal}
                className="p-2 hover:bg-white hover:bg-opacity-50 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-600" />
              </button>
            </div>

            {/* Progress Steps */}
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <div className="flex items-center justify-center space-x-4">
                <div className={`flex items-center ${modalStep >= 1 ? 'text-primary-600' : 'text-gray-400'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${modalStep >= 1 ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-300 bg-white'}`}>
                    {modalStep > 1 ? <CheckCircle className="w-5 h-5" /> : <span>1</span>}
                  </div>
                  <span className={`ml-2 text-sm font-medium ${isRTL ? 'mr-2 ml-0' : ''}`}>Select Status</span>
                </div>
                <ArrowRight className={`w-4 h-4 ${modalStep >= 2 ? 'text-primary-600' : 'text-gray-300'}`} />
                <div className={`flex items-center ${modalStep >= 2 ? 'text-primary-600' : 'text-gray-400'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${modalStep >= 2 ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-300 bg-white'}`}>
                    {modalStep > 2 ? <CheckCircle className="w-5 h-5" /> : <span>2</span>}
                  </div>
                  <span className={`ml-2 text-sm font-medium ${isRTL ? 'mr-2 ml-0' : ''}`}>
                    {requiresReason(selectedStatus) ? (requiresReason(selectedStatus) === 'reject' ? 'Reject Reason' : 'Request Reason') : 'Add Notes'}
                  </span>
                </div>
                {requiresReason(selectedStatus) && (
                  <>
                    <ArrowRight className={`w-4 h-4 ${modalStep >= 3 ? 'text-primary-600' : 'text-gray-300'}`} />
                    <div className={`flex items-center ${modalStep >= 3 ? 'text-primary-600' : 'text-gray-400'}`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${modalStep >= 3 ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-300 bg-white'}`}>
                        <span>3</span>
                      </div>
                      <span className={`ml-2 text-sm font-medium ${isRTL ? 'mr-2 ml-0' : ''}`}>Add Notes</span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {error && (
                <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 flex items-center space-x-2">
                  <AlertCircle className="w-5 h-5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Step 1: Status Selection */}
              {modalStep === 1 && (
                <div className="space-y-6">
                  {/* Current Status Display */}
                  <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl p-6 border-2 border-gray-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Current Status</label>
                        <div className={`inline-flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} px-4 py-2 rounded-lg border-2 ${getStatusColor(application?.status_code || application?.status)}`}>
                          {getStatusIcon(application?.status_code || application?.status)}
                          <span className="font-bold text-lg">{getStatusDisplayName(application?.status_code || application?.status)}</span>
                          {application?.status_code && (
                            <span className="text-xs font-mono opacity-75">({application.status_code})</span>
                          )}
                        </div>
                      </div>
                      <TrendingUp className="w-8 h-8 text-gray-400" />
                    </div>
                  </div>

                  {/* Recommended Transitions */}
                  {availableTransitions.length > 0 && (
                    <div>
                      <div className="flex items-center space-x-2 mb-4">
                        <Sparkles className="w-5 h-5 text-primary-600" />
                        <h3 className="text-lg font-bold text-gray-900">Recommended Next Steps</h3>
                        <span className="px-2 py-1 bg-primary-100 text-primary-700 rounded-full text-xs font-medium">
                          {availableTransitions.length} available
                        </span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                        {availableTransitions.map(transition => {
                          const targetStatus = statusCodes.find(s => s.code === transition.to_status_code)
                          if (!targetStatus) return null
                          return (
                            <button
                              key={transition.id}
                              onClick={() => handleStatusSelect(targetStatus.code)}
                              className={`p-4 rounded-xl border-2 transition-all hover:shadow-lg hover:scale-105 text-left ${isRTL ? 'text-right' : 'text-left'} ${getStatusColor(targetStatus.code)} hover:border-primary-500`}
                            >
                              <div className="flex items-start justify-between mb-2">
                                <div className="flex-1">
                                  <div className="flex items-center space-x-2 mb-1">
                                    {getStatusIcon(targetStatus.code)}
                                    <span className="font-bold text-sm">{targetStatus.code}</span>
                                  </div>
                                  <p className="font-semibold text-gray-900 mb-1">
                                    {isRTL ? targetStatus.name_ar : targetStatus.name_en}
                                  </p>
                                  {transition.trigger_name_en && (
                                    <p className="text-xs text-gray-600 mt-1">
                                      {isRTL ? transition.trigger_name_ar : transition.trigger_name_en}
                                    </p>
                                  )}
                                </div>
                                <Sparkles className="w-4 h-4 text-primary-600 flex-shrink-0" />
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* All Statuses (Collapsible) */}
                  <div>
                    <button
                      onClick={() => setShowAllStatuses(!showAllStatuses)}
                      className="flex items-center justify-between w-full p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors mb-4"
                    >
                      <div className="flex items-center space-x-2">
                        <Shield className="w-5 h-5 text-gray-600" />
                        <span className="font-semibold text-gray-900">
                          {showAllStatuses ? 'Hide' : 'Show'} All Available Statuses
                        </span>
                      </div>
                      {showAllStatuses ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </button>

                    {showAllStatuses && (
                      <div className="space-y-6">
                        {(() => {
                          const categories = getStatusesByCategory()
                          return Object.entries(categories).map(([category, statuses]) => {
                            if (statuses.length === 0 || category === 'recommended') return null
                            
                            const categoryLabels = {
                              application: { label: 'Application Statuses', icon: FileText, bgClass: 'bg-blue-50', iconClass: 'text-blue-600' },
                              review: { label: 'Review Statuses', icon: AlertCircle, bgClass: 'bg-yellow-50', iconClass: 'text-yellow-600' },
                              decision: { label: 'Decision Statuses', icon: CheckCircle, iconReject: XCircle, bgClass: 'bg-green-50', iconClass: 'text-green-600' },
                              enrollment: { label: 'Enrollment Statuses', icon: GraduationCap, bgClass: 'bg-indigo-50', iconClass: 'text-indigo-600' },
                              academic: { label: 'Academic Statuses', icon: BookOpen, bgClass: 'bg-teal-50', iconClass: 'text-teal-600' },
                              graduation: { label: 'Graduation & Alumni', icon: CheckCircle, bgClass: 'bg-emerald-50', iconClass: 'text-emerald-600' },
                              other: { label: 'Other Statuses', icon: Info, bgClass: 'bg-gray-50', iconClass: 'text-gray-600' }
                            }
                            
                            const catInfo = categoryLabels[category] || categoryLabels.other
                            const CatIcon = catInfo.icon
                            
                            return (
                              <div key={category} className="border border-gray-200 rounded-xl overflow-hidden">
                                <div className={`${catInfo.bgClass} px-4 py-3 border-b border-gray-200`}>
                                  <div className="flex items-center space-x-2">
                                    <CatIcon className={`w-5 h-5 ${catInfo.iconClass}`} />
                                    <h4 className="font-semibold text-gray-900">{catInfo.label}</h4>
                                    <span className="px-2 py-1 bg-white rounded-full text-xs font-medium text-gray-600">
                                      {statuses.length}
                                    </span>
                                  </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
                                  {statuses.map(status => (
                                    <button
                                      key={status.code}
                                      onClick={() => handleStatusSelect(status.code)}
                                      className={`p-3 rounded-lg border-2 transition-all hover:shadow-md hover:scale-[1.02] text-left ${isRTL ? 'text-right' : 'text-left'} ${getStatusColor(status.code)} hover:border-primary-400`}
                                    >
                                      <div className="flex items-center justify-between">
                                        <div className="flex-1">
                                          <div className="flex items-center space-x-2 mb-1">
                                            {getStatusIcon(status.code)}
                                            <span className="font-mono text-xs font-bold">{status.code}</span>
                                          </div>
                                          <p className="text-sm font-medium">
                                            {isRTL ? status.name_ar : status.name_en}
                                          </p>
                                        </div>
                                        <ArrowRight className={`w-4 h-4 opacity-50 ${isRTL ? 'rotate-180' : ''}`} />
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )
                          })
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Step 2: Reason Selection */}
              {modalStep === 2 && reasonType && (
                <div className="space-y-6">
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
                    <div className="flex items-start space-x-3">
                      <Info className="w-5 h-5 text-blue-600 mt-0.5" />
                      <div>
                        <p className="font-semibold text-blue-900 mb-1">
                          {reasonType === 'reject' ? 'Rejection Reason Required' : 'Additional Information Request'}
                        </p>
                        <p className="text-sm text-blue-700">
                          {reasonType === 'reject' 
                            ? 'Please select a reason for rejecting this application. This will be recorded and may be communicated to the applicant.'
                            : 'Please select the type of additional information or documents you need from the applicant.'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 mb-4">
                    {reasonType === 'reject' ? <XCircle className="w-5 h-5 text-red-600" /> : <AlertCircle className="w-5 h-5 text-yellow-600" />}
                    <h3 className="text-lg font-bold text-gray-900">
                      {reasonType === 'request_info' ? 'Request Information Reasons' : 'Rejection Reasons'}
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {reasonsList.map(reason => (
                      <button
                        key={reason.code}
                        onClick={() => handleReasonSelect(reason.code)}
                        className={`p-4 rounded-xl border-2 transition-all hover:shadow-lg text-left ${isRTL ? 'text-right' : 'text-left'} ${
                          selectedReason === reason.code
                            ? reasonType === 'reject' ? 'border-red-500 bg-red-50' : 'border-yellow-500 bg-yellow-50'
                            : 'border-gray-200 bg-white hover:border-primary-300'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-2">
                              <span className="font-mono text-xs font-bold text-gray-600">{reason.code}</span>
                              {selectedReason === reason.code && (
                                <CheckCircle className={`w-4 h-4 ${reasonType === 'reject' ? 'text-red-600' : 'text-yellow-600'}`} />
                              )}
                            </div>
                            <p className="font-semibold text-gray-900">
                              {isRTL ? reason.name_ar : reason.name_en}
                            </p>
                          </div>
                          <ArrowRight className={`w-4 h-4 opacity-50 ${isRTL ? 'rotate-180' : ''}`} />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 3: Notes */}
              {modalStep === 3 && (
                <div className="space-y-6">
                  {/* Selected Status Review */}
                  <div className="bg-gradient-to-r from-primary-50 to-primary-100 rounded-xl p-6 border-2 border-primary-200">
                    <label className="block text-xs font-semibold text-gray-600 mb-3 uppercase tracking-wide">Status Change Summary</label>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">From:</span>
                        <span className={`px-3 py-1 rounded-lg border ${getStatusColor(application?.status_code || application?.status)} font-medium`}>
                          {getStatusDisplayName(application?.status_code || application?.status)}
                        </span>
                      </div>
                      <div className="flex items-center justify-center">
                        <ArrowDown className="w-5 h-5 text-gray-400" />
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">To:</span>
                        <span className={`px-3 py-1 rounded-lg border ${getStatusColor(selectedStatus)} font-medium`}>
                          {getStatusDisplayName(selectedStatus)}
                        </span>
                      </div>
                      {selectedReason && (
                        <div className="mt-3 pt-3 border-t border-primary-200">
                          <span className="text-sm text-gray-600">Reason:</span>
                          <span className="ml-2 text-sm font-medium text-gray-900">
                            {isRTL 
                              ? reasonsList.find(r => r.code === selectedReason)?.name_ar 
                              : reasonsList.find(r => r.code === selectedReason)?.name_en}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {selectedStatus === 'DCFA' && (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
                      <div className="flex items-start space-x-3">
                        <Info className="w-5 h-5 text-blue-600 mt-0.5" />
                        <div className="flex-1">
                          <p className="font-semibold text-blue-900 mb-1">
                            Student Account Password
                          </p>
                          <p className="text-sm text-blue-700 mb-3">
                            When accepting this application, a student account will be automatically created. You can set a custom password here, or leave it blank to generate an automatic password.
                          </p>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Password <span className="text-gray-400 font-normal">(Optional - auto-generated if blank)</span>
                            </label>
                            <input
                              type="password"
                              value={statusPassword}
                              onChange={(e) => setStatusPassword(e.target.value)}
                              className="w-full px-4 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all"
                              placeholder="Leave blank for auto-generated password"
                            />
                            <p className="text-xs text-gray-500 mt-1">
                              If left blank, a temporary password will be generated automatically.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Additional Notes <span className="text-gray-400 font-normal">(Optional)</span>
                    </label>
                    <textarea
                      value={statusNotes}
                      onChange={(e) => setStatusNotes(e.target.value)}
                      rows={6}
                      className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all resize-none"
                      placeholder="Add any additional notes, comments, or instructions about this status change..."
                    />
                    <p className="text-xs text-gray-500 mt-2">
                      These notes will be saved with the status change for future reference.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-3'} justify-between p-6 border-t border-gray-200 bg-gray-50`}>
              <button
                onClick={() => {
                  if (modalStep > 1) {
                    setModalStep(prev => prev - 1)
                    setError('')
                  } else {
                    resetModal()
                  }
                }}
                disabled={updating}
                className="flex items-center space-x-2 px-6 py-3 border-2 border-gray-300 rounded-xl text-gray-700 font-medium hover:bg-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ArrowLeft className={`w-4 h-4 ${isRTL ? 'rotate-180' : ''}`} />
                <span>{modalStep > 1 ? 'Back' : 'Cancel'}</span>
              </button>
              
              {modalStep === 3 && (
                <button
                  onClick={handleStatusChange}
                  disabled={updating || !selectedStatus || (requiresReason(selectedStatus) && !selectedReason)}
                  className="flex items-center space-x-2 px-8 py-3 bg-primary-gradient text-white rounded-xl font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {updating ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      <span>Updating Status...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-5 h-5" />
                      <span>Confirm & Update Status</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Send offer letter modal */}
      {showOfferModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6">
            <div className={`flex items-start justify-between gap-3 mb-4 ${isArabicLayout ? 'flex-row-reverse' : ''}`}>
              <div className={alignStart}>
                <h3 className="text-lg font-bold text-gray-900">
                  {t('admissions.viewApplication.sendOfferLetter', 'Send offer letter')}
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  {t(
                    'admissions.viewApplication.sendOfferLetterHint',
                    'Set the tuition fee amount and deadline. The applicant will receive an email and can pay tuition from the offer letter screen.'
                  )}
                </p>
              </div>
              <button type="button" onClick={() => setShowOfferModal(false)} className="p-2 rounded-lg hover:bg-gray-100">
                <X className="w-5 h-5 text-gray-600" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-800">
                <div className="font-semibold">
                  {t('admissions.viewApplication.tuitionTotal', 'Total semester fees')}:{' '}
                  <span className="font-mono">{Number(tuitionTotalAmount || 0).toFixed(2)}</span>
                </div>
                <div className="mt-1 text-xs text-gray-600">
                  {t('admissions.viewApplication.onboardingPercentNote', 'Onboarding payment is 10% (PM10).')}
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  {t('admissions.viewApplication.tuitionAmount', 'Tuition fee amount')}
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={tuitionAmount}
                  onChange={(e) => setTuitionAmount(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50"
                  placeholder="0.00"
                  disabled
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  {t('admissions.viewApplication.offerDeadline', 'Deadline')}
                </label>
                <input
                  type="date"
                  value={offerDeadline}
                  onChange={(e) => setOfferDeadline(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  {t('admissions.viewApplication.offerEmailNote', 'Email note (optional)')}
                </label>
                <textarea
                  rows={4}
                  value={offerMessage}
                  onChange={(e) => setOfferMessage(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg resize-none"
                />
              </div>
            </div>

            <div className={`mt-6 flex items-center ${isArabicLayout ? 'flex-row-reverse' : ''} justify-end gap-2`}>
              <button
                type="button"
                onClick={() => setShowOfferModal(false)}
                className="px-4 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
                disabled={sendingOffer}
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                type="button"
                onClick={handleSendOfferLetter}
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-bold hover:bg-emerald-700 disabled:opacity-60"
                disabled={sendingOffer}
              >
                {sendingOffer
                  ? t('admissions.viewApplication.sendingOffer', 'Sending…')
                  : t('admissions.viewApplication.confirmSendOffer', 'Send')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Application Modal */}
      {showEditModal && (
        <EditApplicationModal
          application={application}
          formData={editFormData}
          handleChange={handleEditChange}
          handleSave={handleSaveEdit}
          handleClose={handleCloseEditModal}
          saving={savingEdit}
          error={error}
          majors={editMajors}
          semesters={editSemesters}
          isRTL={isRTL}
          isArabicLayout={isArabicLayout}
        />
      )}

      {/* Request more documents modal */}
      {showRequestDocsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6">
            <div className={`flex items-start justify-between gap-3 mb-4 ${isArabicLayout ? 'flex-row-reverse' : ''}`}>
              <div className={alignStart}>
                <h3 className="text-lg font-bold text-gray-900">
                  {t('admissions.viewApplication.detail.requestMoreDocs', 'Request more documents')}
                </h3>
                <p className="text-sm text-gray-600 mt-1">
                  {t(
                    'admissions.viewApplication.detail.requestMoreDocsHint',
                    'Type what documents you need from the applicant. This message will be emailed to the applicant.'
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowRequestDocsModal(false)}
                className="p-2 rounded-lg hover:bg-gray-100"
                aria-label="Close"
              >
                <X className="w-5 h-5 text-gray-600" />
              </button>
            </div>

            <textarea
              value={requestDocsMessage}
              onChange={(e) => setRequestDocsMessage(e.target.value)}
              className={`w-full min-h-[120px] px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${alignStart}`}
              placeholder={t(
                'admissions.viewApplication.detail.requestMoreDocsPlaceholder',
                'Example: Please upload a clearer transcript scan (all pages) and your high school certificate.'
              )}
            />

            <div className={`flex items-center justify-end gap-3 mt-5 ${isArabicLayout ? 'flex-row-reverse' : ''}`}>
              <button
                type="button"
                onClick={() => setShowRequestDocsModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50"
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                type="button"
                onClick={handleRequestMoreDocuments}
                disabled={requestDocsSending || requestDocsMessage.trim().length === 0}
                className="px-4 py-2 bg-yellow-600 text-white rounded-lg font-semibold hover:bg-yellow-700 disabled:opacity-50"
              >
                {requestDocsSending
                  ? t('admissions.viewApplication.detail.sending', 'Sending…')
                  : t('admissions.viewApplication.detail.sendRequest', 'Send request')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Personal Information */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <div className={`flex items-center gap-2 mb-6 ${isArabicLayout ? 'justify-start' : ''}`}>
              {isArabicLayout ? (
                <>
                  <h2 className={`text-xl font-bold text-gray-900 ${alignStart}`}>
                    {t('admissions.viewApplication.detail.personalInfo')}
                  </h2>
                  <User className="w-5 h-5 text-gray-600 shrink-0" />
                </>
              ) : (
                <>
                  <User className="w-5 h-5 text-gray-600 shrink-0" />
                  <h2 className={`text-xl font-bold text-gray-900 ${alignStart}`}>
                    {t('admissions.viewApplication.detail.personalInfo')}
                  </h2>
                </>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className={`block text-sm font-medium text-gray-500 mb-1 ${alignStart}`}>
                  {t('admissions.viewApplication.detail.firstName')}
                </label>
                {isEditMode ? (
                  <input
                    type="text"
                    value={editFormData.first_name || ''}
                    onChange={(e) => handleEditChange('first_name', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                ) : (
                  <p className={`text-gray-900 font-medium ${alignStart}`}>{application?.first_name}</p>
                )}
              </div>
              <div>
                <label className={`block text-sm font-medium text-gray-500 mb-1 ${alignStart}`}>
                  {t('admissions.viewApplication.detail.middleName')}
                </label>
                <p className={`text-gray-900 ${alignStart}`}>
                  {application?.middle_name || t('admissions.viewApplication.detail.notAvailable')}
                </p>
              </div>
              <div>
                <label className={`block text-sm font-medium text-gray-500 mb-1 ${alignStart}`}>
                  {t('admissions.viewApplication.detail.lastName')}
                </label>
                <p className={`text-gray-900 font-medium ${alignStart}`}>{application?.last_name}</p>
              </div>
              <div>
                <label className={`block text-sm font-medium text-gray-500 mb-1 ${alignStart}`}>
                  {t('admissions.viewApplication.detail.dateOfBirth')}
                </label>
                <p className={`text-gray-900 ${alignStart}`}>{formatViewDate(application?.date_of_birth)}</p>
              </div>
              <div>
                <label className={`block text-sm font-medium text-gray-500 mb-1 ${alignStart}`}>
                  {t('admissions.viewApplication.detail.gender')}
                </label>
                <p className={`text-gray-900 ${alignStart}`}>{formatGenderLabel(application?.gender)}</p>
              </div>
              <div>
                <label className={`block text-sm font-medium text-gray-500 mb-1 ${alignStart}`}>
                  {t('admissions.viewApplication.detail.nationality')}
                </label>
                <p className={`text-gray-900 ${alignStart}`}>
                  {application?.nationality || t('admissions.viewApplication.detail.notAvailable')}
                </p>
              </div>
              <div>
                <label className={`block text-sm font-medium text-gray-500 mb-1 ${alignStart}`}>
                  {t('admissions.viewApplication.detail.religion')}
                </label>
                <p className={`text-gray-900 ${alignStart}`}>
                  {application?.religion || t('admissions.viewApplication.detail.notAvailable')}
                </p>
              </div>
              <div>
                <label className={`block text-sm font-medium text-gray-500 mb-1 ${alignStart}`}>
                  {t('admissions.viewApplication.detail.placeOfBirth')}
                </label>
                <p className={`text-gray-900 ${alignStart}`}>
                  {application?.place_of_birth || t('admissions.viewApplication.detail.notAvailable')}
                </p>
              </div>
              {(application?.first_name_ar || application?.last_name_ar) && (
                <div className="md:col-span-2">
                  <label className={`block text-sm font-medium text-gray-500 mb-1 ${alignStart}`}>
                    {t('admissions.viewApplication.detail.nameArabic')}
                  </label>
                  <p className="text-gray-900" dir="rtl">
                    {application?.first_name_ar} {application?.middle_name_ar} {application?.last_name_ar}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Contact Information */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <div className={`flex items-center gap-2 mb-6 ${isArabicLayout ? 'justify-start' : ''}`}>
              {isArabicLayout ? (
                <>
                  <h2 className={`text-xl font-bold text-gray-900 ${alignStart}`}>
                    {t('admissions.viewApplication.detail.contactInfo')}
                  </h2>
                  <Phone className="w-5 h-5 text-gray-600 shrink-0" />
                </>
              ) : (
                <>
                  <Phone className="w-5 h-5 text-gray-600 shrink-0" />
                  <h2 className={`text-xl font-bold text-gray-900 ${alignStart}`}>
                    {t('admissions.viewApplication.detail.contactInfo')}
                  </h2>
                </>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className={`block text-sm font-medium text-gray-500 mb-1 ${alignStart}`}>
                  {t('admissions.viewApplication.detail.email')}
                </label>
                <div
                  className={`flex w-full items-center gap-2 text-gray-900 ${isArabicLayout ? 'justify-start' : 'justify-start'}`}
                  dir={isArabicLayout ? 'rtl' : 'ltr'}
                >
                  <Mail className="w-4 h-4 text-gray-400 shrink-0" />
                  <span dir="ltr" className={`inline-block min-w-0 break-all ${alignStart}`}>
                    {application?.email}
                  </span>
                </div>
              </div>
              <div>
                <label className={`block text-sm font-medium text-gray-500 mb-1 ${alignStart}`}>
                  {t('admissions.viewApplication.detail.phone')}
                </label>
                <div
                  className="flex w-full items-center gap-2 text-gray-900"
                  dir={isArabicLayout ? 'rtl' : 'ltr'}
                >
                  <Phone className="w-4 h-4 text-gray-400 shrink-0" />
                  <span dir="ltr" className={`inline-block min-w-0 ${alignStart}`}>
                    {application?.phone || t('admissions.viewApplication.detail.notAvailable')}
                  </span>
                </div>
              </div>
              {application?.street_address && (
                <div className="md:col-span-2">
                  <label className={`block text-sm font-medium text-gray-500 mb-1 ${alignStart}`}>
                    {t('admissions.viewApplication.detail.address')}
                  </label>
                  <div className={`flex items-start gap-2 ${isArabicLayout ? 'flex-row-reverse' : ''}`}>
                    <MapPin className="w-4 h-4 text-gray-400 mt-1 shrink-0" />
                    <p className={`text-gray-900 ${alignStart}`}>
                      {application.street_address}
                      {application.city && `, ${application.city}`}
                      {application.state_province && `, ${application.state_province}`}
                      {application.postal_code && ` ${application.postal_code}`}
                      {application.country && `, ${application.country}`}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Documents (uploads + verification) */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <div className={`flex items-center justify-between gap-3 mb-6 ${isArabicLayout ? 'flex-row-reverse' : ''}`}>
              <div className={`flex items-center gap-2 ${isArabicLayout ? 'flex-row-reverse' : ''}`}>
                <Shield className="w-5 h-5 text-gray-600 shrink-0" />
                <h2 className={`text-xl font-bold text-gray-900 ${alignStart}`}>
                  {t('admissions.viewApplication.detail.documents', 'Documents')}
                </h2>
              </div>
              <div className={`flex items-center gap-2 ${isArabicLayout ? 'flex-row-reverse' : ''}`}>
                <button
                  type="button"
                  onClick={openReceiveFeeModal}
                  disabled={!canReceiveRegistrationFee || receivingFee}
                  className="px-4 py-2 bg-amber-600 text-white rounded-lg font-semibold hover:bg-amber-700 transition-colors disabled:opacity-50"
                >
                  {t('admissions.viewApplication.receiveRegistrationFee', 'Receive registration fee')}
                </button>
                <button
                  type="button"
                  onClick={() => setShowRequestDocsModal(true)}
                  className="px-4 py-2 bg-yellow-600 text-white rounded-lg font-semibold hover:bg-yellow-700 transition-colors"
                >
                  {t('admissions.viewApplication.detail.requestMoreDocs', 'Request more documents')}
                </button>
              </div>
            </div>

            {loadingDocuments ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
              </div>
            ) : (
              <>
                {applicationDocuments.length === 0 ? (
                  <p className={`text-sm text-gray-600 ${alignStart}`}>
                    {t('admissions.viewApplication.detail.noDocuments', 'No documents uploaded yet.')}
                  </p>
                ) : (
                  <ul className="divide-y divide-gray-200">
                    {applicationDocuments.map((doc) => {
                      const url = docPublicUrl(doc.file_path)
                      const verified = !!doc.verified_at
                      return (
                        <li key={doc.id} className={`py-4 flex items-start justify-between gap-4 ${isArabicLayout ? 'flex-row-reverse' : ''}`}>
                          <div className="min-w-0">
                            <div className={`flex items-center gap-2 ${isArabicLayout ? 'flex-row-reverse' : ''}`}>
                              <span className="font-semibold text-gray-900 text-sm">{doc.document_type}</span>
                              {verified ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
                                  <CheckCircle className="w-3.5 h-3.5" />
                                  {t('admissions.viewApplication.detail.verified', 'Verified')}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-xs font-bold">
                                  <Clock className="w-3.5 h-3.5" />
                                  {t('admissions.viewApplication.detail.pendingVerification', 'Pending')}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-600 mt-1 break-all">
                              {doc.file_name || doc.file_path}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleString(isArabicLayout ? 'ar' : undefined) : ''}
                            </div>
                          </div>
                          <div className={`flex items-center gap-2 shrink-0 ${isArabicLayout ? 'flex-row-reverse' : ''}`}>
                            {url && (
                              <a
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="px-3 py-2 border border-gray-200 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 inline-flex items-center gap-2 no-underline"
                              >
                                <ArrowDown className="w-4 h-4" />
                                {t('admissions.viewApplication.detail.open', 'Open')}
                              </a>
                            )}
                            {!verified && (
                              <button
                                type="button"
                                onClick={() => handleVerifyDocument(doc.id)}
                                disabled={verifyingDocId === doc.id}
                                className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
                              >
                                {verifyingDocId === doc.id
                                  ? t('admissions.viewApplication.detail.verifying', 'Verifying…')
                                  : t('admissions.viewApplication.detail.verify', 'Verify')}
                              </button>
                            )}
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}

                {documentRequests.filter((r) => r.status === 'open').length > 0 && (
                  <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <div className={`font-bold text-amber-950 mb-2 ${alignStart}`}>
                      {t('admissions.viewApplication.detail.openRequests', 'Open requests')}
                    </div>
                    <ul className="space-y-2">
                      {documentRequests
                        .filter((r) => r.status === 'open')
                        .slice(0, 3)
                        .map((r) => (
                          <li key={r.id} className={`text-sm text-amber-950 ${alignStart}`}>
                            <span className="font-mono text-xs text-amber-900/80 me-2">#{r.id}</span>
                            {r.message}
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>

          {showReceiveFeeModal && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6">
                <div className={`flex items-start justify-between gap-3 mb-4 ${isArabicLayout ? 'flex-row-reverse' : ''}`}>
                  <div className={alignStart}>
                    <h3 className="text-lg font-bold text-gray-900">
                      {t('admissions.viewApplication.receiveRegistrationFee', 'Receive registration fee')}
                    </h3>
                    <p className="text-sm text-gray-600 mt-1">
                      {t(
                        'admissions.viewApplication.receiveRegistrationFeeHint',
                        'After documents are verified, enable registration fee payment for the applicant. This will move the application to Payment Pending (APPN) so the applicant can pay from their portal.'
                      )}
                    </p>
                  </div>
                  <button type="button" onClick={() => setShowReceiveFeeModal(false)} className="p-2 rounded-lg hover:bg-gray-100">
                    <X className="w-5 h-5 text-gray-600" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      {t('admissions.viewApplication.feeAmount', 'Fee amount')}
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={receiveFeeAmount}
                      onChange={(e) => setReceiveFeeAmount(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      {t('admissions.viewApplication.paymentMethod', 'Payment method')}
                    </label>
                    <select
                      value={receiveFeeMethod}
                      onChange={(e) => setReceiveFeeMethod(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="cash">{t('payments.methodCash', 'Cash')}</option>
                      <option value="bank_transfer">{t('payments.methodBank', 'Bank transfer')}</option>
                      <option value="online_payment">{t('payments.methodOnline', 'Online payment')}</option>
                      <option value="check">{t('payments.methodCheck', 'Check')}</option>
                      <option value="other">{t('payments.methodOther', 'Other')}</option>
                    </select>
                  </div>
                </div>

                <div className={`mt-6 flex items-center ${isArabicLayout ? 'flex-row-reverse' : ''} justify-end gap-2`}>
                  <button
                    type="button"
                    onClick={() => setShowReceiveFeeModal(false)}
                    className="px-4 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
                    disabled={receivingFee}
                  >
                    {t('common.cancel', 'Cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={handleReceiveRegistrationFee}
                    className="px-4 py-2 rounded-lg bg-amber-600 text-white font-bold hover:bg-amber-700 disabled:opacity-60"
                    disabled={receivingFee}
                  >
                    {receivingFee ? t('admissions.viewApplication.receiving', 'Saving…') : t('common.save', 'Save')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Emergency Contact */}
          {application?.emergency_contact_name && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <div className={`flex items-center gap-2 mb-6 ${isArabicLayout ? 'justify-start' : ''}`}>
                {isArabicLayout ? (
                  <>
                    <h2 className={`text-xl font-bold text-gray-900 ${alignStart}`}>
                      {t('admissions.viewApplication.detail.emergencyContact')}
                    </h2>
                    <AlertCircle className="w-5 h-5 text-gray-600 shrink-0" />
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-5 h-5 text-gray-600 shrink-0" />
                    <h2 className={`text-xl font-bold text-gray-900 ${alignStart}`}>
                      {t('admissions.viewApplication.detail.emergencyContact')}
                    </h2>
                  </>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className={`block text-sm font-medium text-gray-500 mb-1 ${alignStart}`}>
                    {t('admissions.viewApplication.detail.contactName')}
                  </label>
                  <p className={`text-gray-900 ${alignStart}`}>{application.emergency_contact_name}</p>
                </div>
                <div>
                  <label className={`block text-sm font-medium text-gray-500 mb-1 ${alignStart}`}>
                    {t('admissions.viewApplication.detail.relationship')}
                  </label>
                  <p className={`text-gray-900 ${alignStart}`}>
                    {application.emergency_contact_relationship || t('admissions.viewApplication.detail.notAvailable')}
                  </p>
                </div>
                <div>
                  <label className={`block text-sm font-medium text-gray-500 mb-1 ${alignStart}`}>
                    {t('admissions.viewApplication.detail.phone')}
                  </label>
                  <p className={`text-gray-900 ${alignStart}`} dir="ltr">
                    {application.emergency_contact_phone || t('admissions.viewApplication.detail.notAvailable')}
                  </p>
                </div>
                <div>
                  <label className={`block text-sm font-medium text-gray-500 mb-1 ${alignStart}`}>
                    {t('admissions.viewApplication.detail.email')}
                  </label>
                  <p className={`text-gray-900 break-all ${alignStart}`}>
                    {application.emergency_contact_email || t('admissions.viewApplication.detail.notAvailable')}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Academic Information */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <div className={`flex items-center gap-2 mb-6 ${isArabicLayout ? 'justify-start' : ''}`}>
              {isArabicLayout ? (
                <>
                  <h2 className={`text-xl font-bold text-gray-900 ${alignStart}`}>
                    {t('admissions.viewApplication.detail.academicInfo')}
                  </h2>
                  <GraduationCap className="w-5 h-5 text-gray-600 shrink-0" />
                </>
              ) : (
                <>
                  <GraduationCap className="w-5 h-5 text-gray-600 shrink-0" />
                  <h2 className={`text-xl font-bold text-gray-900 ${alignStart}`}>
                    {t('admissions.viewApplication.detail.academicInfo')}
                  </h2>
                </>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className={`block text-sm font-medium text-gray-500 mb-1 ${alignStart}`}>
                  {t('admissions.viewApplication.detail.major')}
                </label>
                <p className={`text-gray-900 ${alignStart}`}>
                  {application?.majors
                    ? getLocalizedName(application.majors, isArabicLayout) || application.majors.name_en
                    : '—'}
                </p>
              </div>
              <div>
                <label className={`block text-sm font-medium text-gray-500 mb-1 ${alignStart}`}>
                  {t('admissions.viewApplication.detail.semester')}
                </label>
                <p className={`text-gray-900 ${alignStart}`}>
                  {application?.semesters
                    ? getLocalizedName(application.semesters, isArabicLayout) || application.semesters.name_en
                    : '—'}
                </p>
              </div>
              <div>
                <label className={`block text-sm font-medium text-gray-500 mb-1 ${alignStart}`}>
                  {t('admissions.viewApplication.detail.highSchool')}
                </label>
                <p className={`text-gray-900 ${alignStart}`}>
                  {application?.high_school_name || t('admissions.viewApplication.detail.notAvailable')}
                </p>
              </div>
              <div>
                <label className={`block text-sm font-medium text-gray-500 mb-1 ${alignStart}`}>
                  {t('admissions.viewApplication.detail.graduationYear')}
                </label>
                <p className={`text-gray-900 ${alignStart}`}>
                  {application?.graduation_year || t('admissions.viewApplication.detail.notAvailable')}
                </p>
              </div>
              <div>
                <label className={`block text-sm font-medium text-gray-500 mb-1 ${alignStart}`}>
                  {t('admissions.viewApplication.detail.gpa')}
                </label>
                <p className={`text-gray-900 ${alignStart}`}>
                  {application?.gpa || t('admissions.viewApplication.detail.notAvailable')}
                </p>
              </div>
              <div>
                <label className={`block text-sm font-medium text-gray-500 mb-1 ${alignStart}`}>
                  {t('admissions.viewApplication.detail.certificateType')}
                </label>
                <p className={`text-gray-900 ${alignStart}`}>
                  {application?.certificate_type || t('admissions.viewApplication.detail.notAvailable')}
                </p>
              </div>
            </div>
          </div>

          {/* Test Scores */}
          {(application?.toefl_score || application?.ielts_score || application?.sat_score || application?.gmat_score || application?.gre_score) && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <div className={`flex items-center gap-2 mb-6 ${isArabicLayout ? 'justify-start' : ''}`}>
                {isArabicLayout ? (
                  <>
                    <h2 className={`text-xl font-bold text-gray-900 ${alignStart}`}>
                      {t('admissions.viewApplication.detail.testScores')}
                    </h2>
                    <FileText className="w-5 h-5 text-gray-600 shrink-0" />
                  </>
                ) : (
                  <>
                    <FileText className="w-5 h-5 text-gray-600 shrink-0" />
                    <h2 className={`text-xl font-bold text-gray-900 ${alignStart}`}>
                      {t('admissions.viewApplication.detail.testScores')}
                    </h2>
                  </>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {application.toefl_score && (
                  <div>
                    <label className={`block text-sm font-medium text-gray-500 mb-1 ${alignStart}`}>
                      {t('admissions.viewApplication.detail.toefl')}
                    </label>
                    <p className={`text-gray-900 ${alignStart}`}>{application.toefl_score}/120</p>
                  </div>
                )}
                {application.ielts_score && (
                  <div>
                    <label className={`block text-sm font-medium text-gray-500 mb-1 ${alignStart}`}>
                      {t('admissions.viewApplication.detail.ielts')}
                    </label>
                    <p className={`text-gray-900 ${alignStart}`}>{application.ielts_score}/9.0</p>
                  </div>
                )}
                {application.sat_score && (
                  <div>
                    <label className={`block text-sm font-medium text-gray-500 mb-1 ${alignStart}`}>
                      {t('admissions.viewApplication.detail.sat')}
                    </label>
                    <p className={`text-gray-900 ${alignStart}`}>{application.sat_score}/1600</p>
                  </div>
                )}
                {application.gmat_score && (
                  <div>
                    <label className={`block text-sm font-medium text-gray-500 mb-1 ${alignStart}`}>
                      {t('admissions.viewApplication.detail.gmat')}
                    </label>
                    <p className={`text-gray-900 ${alignStart}`}>{application.gmat_score}/800</p>
                  </div>
                )}
                {application.gre_score && (
                  <div>
                    <label className={`block text-sm font-medium text-gray-500 mb-1 ${alignStart}`}>
                      {t('admissions.viewApplication.detail.gre')}
                    </label>
                    <p className={`text-gray-900 ${alignStart}`}>{application.gre_score}/340</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Transfer Information */}
          {application?.is_transfer_student && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <div className={`flex items-center gap-2 mb-6 ${isArabicLayout ? 'justify-start' : ''}`}>
                {isArabicLayout ? (
                  <>
                    <h2 className={`text-xl font-bold text-gray-900 ${alignStart}`}>
                      {t('admissions.viewApplication.detail.transferInfo')}
                    </h2>
                    <BookOpen className="w-5 h-5 text-gray-600 shrink-0" />
                  </>
                ) : (
                  <>
                    <BookOpen className="w-5 h-5 text-gray-600 shrink-0" />
                    <h2 className={`text-xl font-bold text-gray-900 ${alignStart}`}>
                      {t('admissions.viewApplication.detail.transferInfo')}
                    </h2>
                  </>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className={`block text-sm font-medium text-gray-500 mb-1 ${alignStart}`}>
                    {t('admissions.viewApplication.detail.previousUniversity')}
                  </label>
                  <p className={`text-gray-900 ${alignStart}`}>
                    {application.previous_university || t('admissions.viewApplication.detail.notAvailable')}
                  </p>
                </div>
                <div>
                  <label className={`block text-sm font-medium text-gray-500 mb-1 ${alignStart}`}>
                    {t('admissions.viewApplication.detail.previousDegree')}
                  </label>
                  <p className={`text-gray-900 ${alignStart}`}>
                    {application.previous_degree || t('admissions.viewApplication.detail.notAvailable')}
                  </p>
                </div>
                <div>
                  <label className={`block text-sm font-medium text-gray-500 mb-1 ${alignStart}`}>
                    {t('admissions.viewApplication.detail.transferCredits')}
                  </label>
                  <p className={`text-gray-900 ${alignStart}`}>
                    {application.transfer_credits || t('admissions.viewApplication.detail.notAvailable')}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Additional Information */}
          {(application?.personal_statement || application?.scholarship_request) && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <div className={`flex items-center gap-2 mb-6 ${isArabicLayout ? 'justify-start' : ''}`}>
                {isArabicLayout ? (
                  <>
                    <h2 className={`text-xl font-bold text-gray-900 ${alignStart}`}>
                      {t('admissions.viewApplication.detail.additionalInfo')}
                    </h2>
                    <FileText className="w-5 h-5 text-gray-600 shrink-0" />
                  </>
                ) : (
                  <>
                    <FileText className="w-5 h-5 text-gray-600 shrink-0" />
                    <h2 className={`text-xl font-bold text-gray-900 ${alignStart}`}>
                      {t('admissions.viewApplication.detail.additionalInfo')}
                    </h2>
                  </>
                )}
              </div>
              {application.personal_statement && (
                <div className="mb-6">
                  <label className={`block text-sm font-medium text-gray-500 mb-2 ${alignStart}`}>
                    {t('admissions.viewApplication.detail.personalStatement')}
                  </label>
                  <p className={`text-gray-900 whitespace-pre-wrap ${alignStart}`}>{application.personal_statement}</p>
                </div>
              )}
              {application.scholarship_request && (
                <div>
                  <label className={`block text-sm font-medium text-gray-500 mb-1 ${alignStart}`}>
                    {t('admissions.viewApplication.detail.scholarshipRequest')}
                  </label>
                  <p className={`text-gray-900 ${alignStart}`}>
                    {t('admissions.viewApplication.detail.scholarshipYes')}{' '}
                    {application.scholarship_percentage && `(${application.scholarship_percentage}%)`}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Application Summary */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
            <h3 className={`text-lg font-bold text-gray-900 mb-4 ${alignStart}`}>
              {t('admissions.viewApplication.detail.applicationSummary')}
            </h3>
            <div className="space-y-3">
              <div>
                <label className={`block text-xs font-medium text-gray-500 mb-1 ${alignStart}`}>
                  {t('admissions.viewApplication.detail.applicationId')}
                </label>
                <p className={`text-sm font-medium text-gray-900 ${alignStart}`}>
                  <span dir="ltr" className="inline-block">
                    #{application?.id}
                  </span>
                </p>
              </div>
              <div>
                <label className={`block text-xs font-medium text-gray-500 mb-1 ${alignStart}`}>
                  {t('admissions.viewApplication.detail.statusCode')}
                </label>
                <p className={`text-sm font-medium text-gray-900 ${alignStart}`}>
                  <span dir="ltr" className="inline-block">
                    {application?.status_code || application?.status || t('admissions.viewApplication.detail.notAvailable')}
                  </span>
                </p>
              </div>
              {application?.status_reason_code && (
                <div>
                  <label className={`block text-xs font-medium text-gray-500 mb-1 ${alignStart}`}>
                    {t('admissions.viewApplication.detail.reasonCode')}
                  </label>
                  <p className={`text-sm text-gray-900 ${alignStart}`}>
                    <span dir="ltr" className="inline-block">
                      {application.status_reason_code}
                    </span>
                  </p>
                </div>
              )}
              {application?.financial_milestone_code && (
                <div>
                  <label className={`block text-xs font-medium text-gray-500 mb-1 ${alignStart}`}>
                    {t('admissions.viewApplication.detail.financialMilestone')}
                  </label>
                  <p className={`text-sm text-gray-900 ${alignStart}`}>
                    <span dir="ltr" className="inline-block">
                      {application.financial_milestone_code}
                    </span>
                  </p>
                </div>
              )}
              <div>
                <label className={`block text-xs font-medium text-gray-500 mb-1 ${alignStart}`}>
                  {t('admissions.viewApplication.detail.submitted')}
                </label>
                <p className={`text-sm text-gray-900 ${alignStart}`}>{formatViewDate(application?.created_at)}</p>
              </div>
              <div>
                <label className={`block text-xs font-medium text-gray-500 mb-1 ${alignStart}`}>
                  {t('admissions.viewApplication.detail.college')}
                </label>
                <p className={`text-sm text-gray-900 ${alignStart}`}>
                  {application?.colleges
                    ? getLocalizedName(application.colleges, isArabicLayout) || application.colleges.name_en
                    : '—'}
                </p>
              </div>
              {application?.status_changed_at && (
                <div>
                  <label className={`block text-xs font-medium text-gray-500 mb-1 ${alignStart}`}>
                    {t('admissions.viewApplication.detail.lastStatusChange')}
                  </label>
                  <p className={`text-sm text-gray-900 ${alignStart}`}>
                    {formatViewDate(application.status_changed_at)}
                  </p>
                </div>
              )}
              {application?.reviewed_at && (
                <>
                  <div>
                    <label className={`block text-xs font-medium text-gray-500 mb-1 ${alignStart}`}>
                      {t('admissions.viewApplication.detail.reviewed')}
                    </label>
                    <p className={`text-sm text-gray-900 ${alignStart}`}>{formatViewDate(application.reviewed_at)}</p>
                  </div>
                  <div>
                    <label className={`block text-xs font-medium text-gray-500 mb-1 ${alignStart}`}>
                      {t('admissions.viewApplication.detail.reviewedBy')}
                    </label>
                    <p className={`text-sm text-gray-900 break-all ${alignStart}`}>
                      <span dir="ltr" className="inline-block">
                        {application.reviewed_by_user?.email || t('admissions.viewApplication.detail.notAvailable')}
                      </span>
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Review Notes */}
          {application?.review_notes && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <h3 className={`text-lg font-bold text-gray-900 mb-4 ${alignStart}`}>
                {t('admissions.viewApplication.detail.reviewNotes')}
              </h3>
              <p className={`text-sm text-gray-700 whitespace-pre-wrap ${alignStart}`}>{application.review_notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Activity Timeline */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6 gap-4 w-full">
          <div className="flex items-center gap-3 min-w-0 flex-1" dir={isArabicLayout ? 'rtl' : 'ltr'}>
            <div className="min-w-0 flex-1">
              <h2 className={`text-2xl font-bold text-gray-900 ${alignStart}`}>
                {t('admissions.viewApplication.timeline.title')}
              </h2>
              <p className={`text-sm text-gray-600 mt-1 ${alignStart}`}>
                {t('admissions.viewApplication.timeline.subtitle')}
              </p>
            </div>
            <Calendar className="w-6 h-6 text-primary-600 shrink-0" />
          </div>
          {loadingActivity && (
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
          )}
        </div>

        {loadingActivity ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : activityLog.length === 0 ? (
          <div className={`py-12 text-gray-500 ${alignStart}`}>
            <div className={isArabicLayout ? 'flex justify-end' : 'flex justify-center'}>
              <Clock className="w-12 h-12 mb-3 opacity-50" />
            </div>
            <p>{t('admissions.viewApplication.timeline.noActivity')}</p>
          </div>
        ) : (
          <div className="relative">
            {/* Timeline Line */}
            <div className={`absolute ${isRTL ? 'right-8' : 'left-8'} top-0 bottom-0 w-0.5 bg-gray-200`}></div>
            
            {/* Timeline Items */}
            <div className="space-y-6">
              {activityLog.map((entry, index) => {
                const fromStatus = entry.from_status_code ? statusCodes.find(s => s.code === entry.from_status_code) : null
                const isLatest = index === 0
                const ti = entry.trigger_code ? TIMELINE_TRIGGER_ICONS[entry.trigger_code] : null
                const triggerKey = entry.trigger_code
                  ? `admissions.viewApplication.timelineTriggers.${entry.trigger_code}`
                  : ''
                const triggerLabel =
                  entry.trigger_code && triggerKey
                    ? (() => {
                        const tr = t(triggerKey)
                        return tr !== triggerKey ? tr : entry.trigger_code
                      })()
                    : ''
                const TriggerIcon = ti?.icon || Clock

                return (
                  <div key={entry.id || index} className={`relative flex ${isRTL ? 'flex-row-reverse' : 'flex-row'} items-start ${isRTL ? 'space-x-reverse space-x-4' : 'space-x-4'}`}>
                    {/* Timeline Dot */}
                    <div className={`relative z-10 flex-shrink-0 ${isRTL ? 'ml-4' : 'mr-4'}`}>
                      <div className={`w-4 h-4 rounded-full border-4 border-white shadow-lg ${
                        isLatest ? 'bg-primary-600' : 'bg-gray-400'
                      }`}></div>
                      {isLatest && (
                        <div className="absolute inset-0 w-4 h-4 rounded-full bg-primary-600 animate-ping opacity-75"></div>
                      )}
                    </div>
                    
                    {/* Content Card */}
                    <div className={`flex-1 ${alignStart} ${isLatest ? 'bg-primary-50 border-2 border-primary-200' : 'bg-gray-50 border border-gray-200'} rounded-xl p-4 transition-all hover:shadow-md`}>
                      <div className="flex items-start gap-3 w-full" dir={isArabicLayout ? 'rtl' : 'ltr'}>
                        {isArabicLayout ? (
                          <>
                            <div className={`text-xs text-gray-500 whitespace-nowrap shrink-0 ${alignStart}`} dir="ltr">
                              <div className="font-medium">
                                {new Date(entry.created_at).toLocaleDateString('ar')}
                              </div>
                              <div className="text-gray-400">
                                {new Date(entry.created_at).toLocaleTimeString('ar', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </div>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2 mb-2" dir="rtl">
                                {entry.trigger_code && ti && (
                                  <>
                                    <span className={`font-semibold ${ti.labelClass}`}>{triggerLabel}</span>
                                    <TriggerIcon className={`w-5 h-5 shrink-0 ${ti.iconClass}`} />
                                  </>
                                )}
                                {entry.trigger_code && !ti && (
                                  <>
                                    <span className="font-semibold text-gray-900">{triggerLabel}</span>
                                    <Clock className="w-5 h-5 text-gray-600 shrink-0" />
                                  </>
                                )}
                                {!entry.trigger_code && (
                                  <>
                                    <span className="font-semibold text-gray-900">
                                      {t('admissions.viewApplication.timeline.statusChange')}
                                    </span>
                                    <Clock className="w-5 h-5 text-gray-600 shrink-0" />
                                  </>
                                )}
                                {entry.trigger_code && (
                                  <span className="text-xs font-mono text-gray-500 bg-white px-2 py-1 rounded">
                                    {entry.trigger_code}
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-2 mb-3" dir="rtl">
                                {fromStatus ? (
                                  <>
                                    <span className={`px-3 py-1 rounded-lg text-sm font-semibold ${getStatusColor(entry.to_status_code)}`}>
                                      {getStatusDisplayName(entry.to_status_code)}
                                    </span>
                                    <ArrowRight className="w-4 h-4 text-gray-400 shrink-0 rotate-180" />
                                    <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(fromStatus.code)}`}>
                                      {getStatusDisplayName(fromStatus.code)}
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <span className={`px-3 py-1 rounded-lg text-sm font-semibold ${getStatusColor(entry.to_status_code)}`}>
                                      {getStatusDisplayName(entry.to_status_code)}
                                    </span>
                                    <span className="text-xs text-gray-500 italic">
                                      {t('admissions.viewApplication.timeline.initialStatus')}
                                    </span>
                                  </>
                                )}
                                <span className="text-xs font-mono text-gray-500" dir="ltr">
                                  ({entry.to_status_code})
                                </span>
                              </div>
                              {entry.notes && (
                                <div className="mt-3 p-3 bg-white rounded-lg border border-gray-200">
                                  <p className={`text-sm text-gray-700 whitespace-pre-wrap ${alignStart}`}>
                                    {translateActivityNote(entry.notes)}
                                  </p>
                                </div>
                              )}
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2 mb-2" dir="ltr">
                                {entry.trigger_code && ti && (
                                  <>
                                    <TriggerIcon className={`w-5 h-5 shrink-0 ${ti.iconClass}`} />
                                    <span className={`font-semibold ${ti.labelClass}`}>{triggerLabel}</span>
                                  </>
                                )}
                                {entry.trigger_code && !ti && (
                                  <>
                                    <Clock className="w-5 h-5 text-gray-600 shrink-0" />
                                    <span className="font-semibold text-gray-900">{triggerLabel}</span>
                                  </>
                                )}
                                {!entry.trigger_code && (
                                  <>
                                    <Clock className="w-5 h-5 text-gray-600 shrink-0" />
                                    <span className="font-semibold text-gray-900">
                                      {t('admissions.viewApplication.timeline.statusChange')}
                                    </span>
                                  </>
                                )}
                                {entry.trigger_code && (
                                  <span className="text-xs font-mono text-gray-500 bg-white px-2 py-1 rounded">
                                    {entry.trigger_code}
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-2 mb-3" dir="ltr">
                                {fromStatus ? (
                                  <>
                                    <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(fromStatus.code)}`}>
                                      {getStatusDisplayName(fromStatus.code)}
                                    </span>
                                    <ArrowRight className="w-4 h-4 text-gray-400 shrink-0" />
                                    <span className={`px-3 py-1 rounded-lg text-sm font-semibold ${getStatusColor(entry.to_status_code)}`}>
                                      {getStatusDisplayName(entry.to_status_code)}
                                    </span>
                                    <span className="text-xs font-mono text-gray-500" dir="ltr">
                                      ({entry.to_status_code})
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <span className="text-xs text-gray-500 italic">
                                      {t('admissions.viewApplication.timeline.initialStatus')}
                                    </span>
                                    <span className={`px-3 py-1 rounded-lg text-sm font-semibold ${getStatusColor(entry.to_status_code)}`}>
                                      {getStatusDisplayName(entry.to_status_code)}
                                    </span>
                                    <span className="text-xs font-mono text-gray-500" dir="ltr">
                                      ({entry.to_status_code})
                                    </span>
                                  </>
                                )}
                              </div>
                              {entry.notes && (
                                <div className="mt-3 p-3 bg-white rounded-lg border border-gray-200">
                                  <p className={`text-sm text-gray-700 whitespace-pre-wrap ${alignStart}`}>
                                    {translateActivityNote(entry.notes)}
                                  </p>
                                </div>
                              )}
                            </div>
                            <div className={`text-xs text-gray-500 whitespace-nowrap shrink-0 ${alignStart}`} dir="ltr">
                              <div className="font-medium">
                                {new Date(entry.created_at).toLocaleDateString()}
                              </div>
                              <div className="text-gray-400">
                                {new Date(entry.created_at).toLocaleTimeString(undefined, {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                      
                      {/* Triggered By */}
                      {entry.triggered_by_user && (
                        <div
                          className="mt-3 pt-3 border-t border-gray-200 flex items-center gap-2 text-xs text-gray-600"
                          dir={isArabicLayout ? 'rtl' : 'ltr'}
                        >
                          {isArabicLayout ? (
                            <>
                              <span>
                                {t('admissions.viewApplication.timeline.triggeredBy', {
                                  email:
                                    entry.triggered_by_user.email ||
                                    entry.triggered_by_user.name ||
                                    t('admissions.viewApplication.timeline.unknownUser'),
                                })}
                              </span>
                              <User className="w-4 h-4 shrink-0" />
                            </>
                          ) : (
                            <>
                              <User className="w-4 h-4 shrink-0" />
                              <span>
                                {t('admissions.viewApplication.timeline.triggeredBy', {
                                  email:
                                    entry.triggered_by_user.email ||
                                    entry.triggered_by_user.name ||
                                    t('admissions.viewApplication.timeline.unknownUser'),
                                })}
                              </span>
                            </>
                          )}
                        </div>
                      )}
                      {!entry.triggered_by_user && entry.trigger_code && (
                        <div
                          className="mt-3 pt-3 border-t border-gray-200 flex items-center gap-2 text-xs text-gray-500 italic"
                          dir={isArabicLayout ? 'rtl' : 'ltr'}
                        >
                          {isArabicLayout ? (
                            <>
                              <span>{t('admissions.viewApplication.timeline.systemTriggered')}</span>
                              <Sparkles className="w-4 h-4 shrink-0" />
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4 shrink-0" />
                              <span>{t('admissions.viewApplication.timeline.systemTriggered')}</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

