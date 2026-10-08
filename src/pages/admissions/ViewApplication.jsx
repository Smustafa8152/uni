import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { supabase, SUPABASE_STORAGE_BUCKET } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { createStudentFromApplication } from '../../utils/createStudentFromApplication'
import { getLocalizedName } from '../../utils/localizedName'
import { resolveOnboardingFeeAmount } from '../../utils/resolveOnboardingFeeAmount'
import { resolveRegistrationFeeAmount } from '../../utils/resolveRegistrationFeeAmount'
import { getPaymentsEnabled } from '../../utils/getPaymentsEnabled'
import ApplicationFeeSummary from '../../components/applicant/ApplicationFeeSummary'
import { getNationalityLabel, normalizeNationalityCode } from '../../utils/nationalities'
import { getApplicantStatus } from '../../utils/applicationStatusDisplay'
import { emailForActionStatus } from '../../utils/admissionMessageTemplates'
import NationalitySelect from '../../components/common/NationalitySelect'
import { ArrowLeft, CheckCircle, XCircle, Clock, Mail, Phone, MapPin, Calendar, GraduationCap, FileText, User, AlertCircle, BookOpen, Edit, Save, X, ArrowRight, Info, Sparkles, Shield, ArrowDown, KeyRound, Eye, EyeOff, Loader2, Copy, MessageSquare, Video, History } from 'lucide-react'
import { Button, toast } from '../../components/ui'
import { invokeAdminPasswordReset } from '../../utils/invokeAdminPasswordReset'
import ApplicationMessagesPanel from '../../components/admissions/ApplicationMessagesPanel'
import InterviewExamInvitePanel from '../../components/admissions/InterviewExamInvitePanel'

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
              <h3 className="text-lg font-semibold text-gray-800 mb-4">{t('admissions.viewApplication.editModal.fields.basicInfoEn')}</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('admissions.viewApplication.editModal.fields.firstName')} *</label>
                  <input
                    type="text"
                    value={formData.first_name || ''}
                    onChange={(e) => handleFieldChange('first_name', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('admissions.viewApplication.editModal.fields.middleName')}</label>
                  <input
                    type="text"
                    value={formData.middle_name || ''}
                    onChange={(e) => handleFieldChange('middle_name', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('admissions.viewApplication.editModal.fields.lastName')} *</label>
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
              <h3 className="text-lg font-semibold text-gray-800 mb-4">{t('admissions.viewApplication.editModal.fields.basicInfoAr')}</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('admissions.viewApplication.editModal.fields.firstNameAr')}</label>
                  <input
                    type="text"
                    value={formData.first_name_ar || ''}
                    onChange={(e) => handleFieldChange('first_name_ar', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    dir="rtl"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('admissions.viewApplication.editModal.fields.middleNameAr')}</label>
                  <input
                    type="text"
                    value={formData.middle_name_ar || ''}
                    onChange={(e) => handleFieldChange('middle_name_ar', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    dir="rtl"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('admissions.viewApplication.editModal.fields.lastNameAr')}</label>
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
              <h3 className="text-lg font-semibold text-gray-800 mb-4">{t('admissions.viewApplication.editModal.fields.personalDetails')}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('admissions.viewApplication.editModal.fields.emailAddress')} *</label>
                  <input
                    type="email"
                    value={formData.email || ''}
                    onChange={(e) => handleFieldChange('email', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('admissions.viewApplication.editModal.fields.phoneNumber')}</label>
                  <input
                    type="tel"
                    value={formData.phone || ''}
                    onChange={(e) => handleFieldChange('phone', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('admissions.viewApplication.editModal.fields.dateOfBirth')} *</label>
                  <input
                    type="date"
                    value={formData.date_of_birth || ''}
                    onChange={(e) => handleFieldChange('date_of_birth', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('admissions.viewApplication.editModal.fields.gender')}</label>
                  <select
                    value={formData.gender || ''}
                    onChange={(e) => handleFieldChange('gender', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="">{t('admissions.viewApplication.editModal.fields.selectGender')}</option>
                    <option value="male">{t('admissions.viewApplication.editModal.fields.male')}</option>
                    <option value="female">{t('admissions.viewApplication.editModal.fields.female')}</option>
                    <option value="other">{t('admissions.viewApplication.editModal.fields.other')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('admissions.viewApplication.editModal.fields.nationality')}</label>
                  <NationalitySelect
                    value={formData.nationality || ''}
                    onChange={(code) => handleFieldChange('nationality', code)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('admissions.viewApplication.editModal.fields.religion')}</label>
                  <input
                    type="text"
                    value={formData.religion || ''}
                    onChange={(e) => handleFieldChange('religion', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('admissions.viewApplication.editModal.fields.placeOfBirth')}</label>
                  <input
                    type="text"
                    value={formData.place_of_birth || ''}
                    onChange={(e) => handleFieldChange('place_of_birth', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('admissions.viewApplication.editModal.fields.enrollmentDate')}</label>
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
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('admissions.viewApplication.editModal.fields.streetAddress')}</label>
                <input
                  type="text"
                  value={formData.street_address || ''}
                  onChange={(e) => handleFieldChange('street_address', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('admissions.viewApplication.editModal.fields.city')}</label>
                <input
                  type="text"
                  value={formData.city || ''}
                  onChange={(e) => handleFieldChange('city', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('admissions.viewApplication.editModal.fields.stateProvince')}</label>
                <input
                  type="text"
                  value={formData.state_province || ''}
                  onChange={(e) => handleFieldChange('state_province', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('admissions.viewApplication.editModal.fields.postalCode')}</label>
                <input
                  type="text"
                  value={formData.postal_code || ''}
                  onChange={(e) => handleFieldChange('postal_code', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('admissions.viewApplication.editModal.fields.country')}</label>
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
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('admissions.viewApplication.editModal.fields.contactName')}</label>
                <input
                  type="text"
                  value={formData.emergency_contact_name || ''}
                  onChange={(e) => handleFieldChange('emergency_contact_name', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('admissions.viewApplication.editModal.fields.relationship')}</label>
                <input
                  type="text"
                  value={formData.emergency_contact_relationship || ''}
                  onChange={(e) => handleFieldChange('emergency_contact_relationship', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('admissions.viewApplication.editModal.fields.phoneNumber')}</label>
                <input
                  type="tel"
                  value={formData.emergency_contact_phone || ''}
                  onChange={(e) => handleFieldChange('emergency_contact_phone', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('admissions.viewApplication.editModal.fields.emailAddress')}</label>
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
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('admissions.viewApplication.editModal.fields.major')} *</label>
                <select
                  value={formData.major_id || ''}
                  onChange={(e) => handleFieldChange('major_id', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  required
                >
                  <option value="">{t('admissions.viewApplication.editModal.fields.selectMajor')}</option>
                  {majors.map((major) => (
                    <option key={major.id} value={major.id}>
                      {getLocalizedName(major, isArabicLayout) || major.name_en} ({major.code})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('admissions.viewApplication.editModal.fields.semester')}</label>
                <select
                  value={formData.semester_id || ''}
                  onChange={(e) => handleFieldChange('semester_id', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="">{t('admissions.viewApplication.editModal.fields.selectSemester')}</option>
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
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('admissions.viewApplication.editModal.fields.highSchoolName')}</label>
                <input
                  type="text"
                  value={formData.high_school_name || ''}
                  onChange={(e) => handleFieldChange('high_school_name', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('admissions.viewApplication.editModal.fields.highSchoolCountry')}</label>
                <input
                  type="text"
                  value={formData.high_school_country || ''}
                  onChange={(e) => handleFieldChange('high_school_country', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('admissions.viewApplication.editModal.fields.graduationYear')}</label>
                <input
                  type="number"
                  value={formData.graduation_year || ''}
                  onChange={(e) => handleFieldChange('graduation_year', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('admissions.viewApplication.editModal.fields.gpa')}</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.gpa || ''}
                  onChange={(e) => handleFieldChange('gpa', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('admissions.viewApplication.editModal.fields.certificateType')}</label>
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
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('admissions.viewApplication.editModal.fields.toeflScore')}</label>
                <input
                  type="number"
                  value={formData.toefl_score || ''}
                  onChange={(e) => handleFieldChange('toefl_score', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('admissions.viewApplication.editModal.fields.ieltsScore')}</label>
                <input
                  type="number"
                  step="0.1"
                  value={formData.ielts_score || ''}
                  onChange={(e) => handleFieldChange('ielts_score', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('admissions.viewApplication.editModal.fields.satScore')}</label>
                <input
                  type="number"
                  value={formData.sat_score || ''}
                  onChange={(e) => handleFieldChange('sat_score', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('admissions.viewApplication.editModal.fields.gmatScore')}</label>
                <input
                  type="number"
                  value={formData.gmat_score || ''}
                  onChange={(e) => handleFieldChange('gmat_score', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('admissions.viewApplication.editModal.fields.greScore')}</label>
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
              <label className="text-sm font-medium text-gray-700">{t('admissions.viewApplication.editModal.fields.transferStudent')}</label>
            </div>
            {formData.is_transfer_student && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('admissions.viewApplication.editModal.fields.previousUniversity')}</label>
                  <input
                    type="text"
                    value={formData.previous_university || ''}
                    onChange={(e) => handleFieldChange('previous_university', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('admissions.viewApplication.editModal.fields.previousDegree')}</label>
                  <input
                    type="text"
                    value={formData.previous_degree || ''}
                    onChange={(e) => handleFieldChange('previous_degree', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('admissions.viewApplication.editModal.fields.transferCredits')}</label>
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
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('admissions.viewApplication.editModal.fields.personalStatement')}</label>
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
              <label className="text-sm font-medium text-gray-700">{t('admissions.viewApplication.editModal.fields.scholarshipRequest')}</label>
            </div>
            {formData.scholarship_request && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('admissions.viewApplication.detail.scholarshipType')}
                  </label>
                  <input
                    type="text"
                    value={formData.scholarship_type || ''}
                    onChange={(e) => handleFieldChange('scholarship_type', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t('admissions.viewApplication.editModal.fields.scholarshipPercentage')}</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.scholarship_percentage || ''}
                    onChange={(e) => handleFieldChange('scholarship_percentage', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('admissions.viewApplication.detail.scholarshipDetails')}
                  </label>
                  <textarea
                    rows={4}
                    value={formData.scholarship_details || ''}
                    onChange={(e) => handleFieldChange('scholarship_details', e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                  />
                </div>
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
  const [searchParams, setSearchParams] = useSearchParams()
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
        'Application submitted.': 'admissions.viewApplication.timeline.notes.applicationSubmitted',
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
  const [secondChoiceMajor, setSecondChoiceMajor] = useState(null)
  const [secondChoiceCollege, setSecondChoiceCollege] = useState(null)
  const [paymentsEnabled, setPaymentsEnabled] = useState(true)
  const [error, setError] = useState('')
  const [updating, setUpdating] = useState(false)

  useEffect(() => {
    const majorId = application?.second_choice_major_id
    if (!majorId) {
      setSecondChoiceMajor(null)
      return
    }
    let alive = true
    supabase
      .from('majors')
      .select('id, name_en, name_ar, code')
      .eq('id', majorId)
      .maybeSingle()
      .then(({ data }) => {
        if (alive) setSecondChoiceMajor(data || null)
      })
    return () => {
      alive = false
    }
  }, [application?.second_choice_major_id])

  useEffect(() => {
    const collegeId = application?.second_choice_college_id
    if (!collegeId) {
      setSecondChoiceCollege(null)
      return
    }
    let alive = true
    supabase
      .from('colleges')
      .select('id, name_en, name_ar, code')
      .eq('id', collegeId)
      .maybeSingle()
      .then(({ data }) => {
        if (alive) setSecondChoiceCollege(data || null)
      })
    return () => {
      alive = false
    }
  }, [application?.second_choice_college_id])
  
  // Status management state
  const [statusCodes, setStatusCodes] = useState([])
  const [statusTransitions, setStatusTransitions] = useState([])
  const [requestReasons, setRequestReasons] = useState([])
  const [rejectReasons, setRejectReasons] = useState([])
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [showPasswordReset, setShowPasswordReset] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [resettingPassword, setResettingPassword] = useState(false)
  const [passwordResetError, setPasswordResetError] = useState('')
  const [passwordResetSuccess, setPasswordResetSuccess] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('')
  const [selectedReason, setSelectedReason] = useState('')
  const [statusNotes, setStatusNotes] = useState('')
  const [showAllStatuses, setShowAllStatuses] = useState(false)
  
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
  const [rejectDoc, setRejectDoc] = useState(null)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectingDoc, setRejectingDoc] = useState(false)
  const [staffUserId, setStaffUserId] = useState(null)

  const [showOfferModal, setShowOfferModal] = useState(false)
  const [tuitionAmount, setTuitionAmount] = useState('')
  const [tuitionTotalAmount, setTuitionTotalAmount] = useState(0)
  const [sendingOffer, setSendingOffer] = useState(false)

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

  /** ID + transcript verified, and every uploaded document row verified (e.g. scholarship files). */
  const offerLetterDocumentsReady = useMemo(() => {
    const docs = Array.isArray(applicationDocuments) ? applicationDocuments : []
    if (docs.length === 0 || !coreDocVerified.allOk) return false
    return docs.every((d) => !!d.verified_at)
  }, [applicationDocuments, coreDocVerified.allOk])

  const canReceiveRegistrationFee = useMemo(() => {
    if (!paymentsEnabled) return false
    const code = String(application?.status_code || '').toUpperCase()
    if (!application?.id) return false
    if (application?.registration_fee_paid_at) return false
    if (!coreDocVerified.allOk) return false
    // We only collect the registration fee after document verification step
    return code === 'RVDV' || code === 'RVRC' || code === 'RVIN'
  }, [paymentsEnabled, application?.id, application?.status_code, application?.registration_fee_paid_at, coreDocVerified.allOk])

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
      const paymentsEnabled = await getPaymentsEnabled(application.college_id).catch(() => true)
      if (!paymentsEnabled) {
        const now = new Date().toISOString()
        const from = application.status_code || null
        const nextStatus = 'RVQU'

        const { error: updErr } = await supabase
          .from('applications')
          .update({
            registration_fee_amount: 0,
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
          trigger_code: 'TRVP',
          notes: 'Application status updated.',
        })

        setApplication((prev) =>
          prev
            ? {
                ...prev,
                registration_fee_amount: 0,
                status_code: nextStatus,
                status: 'pending',
                status_changed_at: now,
              }
            : prev
        )
        setShowReceiveFeeModal(false)
        return
      }

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

      const paymentEmail = emailForActionStatus('APPN', isArabicLayout)
      if (paymentEmail) {
        await sendAdmissionNotification({
          type: paymentEmail.key,
          subject: paymentEmail.subject,
          message: paymentEmail.body,
          meta: { to_status_code: nextStatus },
        })
      }

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

  useEffect(() => {
    getStaffUserId().then((id) => setStaffUserId(id))
  }, [getStaffUserId])

  const sendAdmissionNotification = useCallback(
    async ({ type, subject, message, meta, details } = {}) => {
      if (!application?.email) throw new Error('This application has no email address.')
      const collegeId = application?.college_id ?? null
      const { data, error } = await supabase.functions.invoke('send-admission-notification', {
        body: {
          scope: 'college',
          collegeId,
          to: application.email,
          type,
          subject,
          message,
          details: Array.isArray(details) ? details : [],
          applicationId: application.id,
          application: {
            id: application.id,
            application_number: application.application_number,
          },
          meta: meta || {},
        },
      })
      if (error) {
        let detail = error.message || 'Email failed'
        try {
          const body = await error.context?.json?.()
          if (body?.error) detail = String(body.error)
        } catch {
          /* keep the invoke message */
        }
        throw new Error(detail)
      }
      if (data?.error) throw new Error(String(data.error))
      if (data?.skipped) {
        throw new Error('Email notifications are turned off. Turn them on in the college email settings.')
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
      setError(t('admissions.viewApplication.errors.invalidId'))
      setLoading(false)
      return null
    }

    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('applications')
        .select(`
          *,
          majors!major_id (
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
          colleges!college_id (
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
      getPaymentsEnabled(data?.college_id).then(setPaymentsEnabled).catch(() => setPaymentsEnabled(true))

      // Fetch uploaded documents + outstanding requests (side effects; do not block primary view)
      setLoadingDocuments(true)
      try {
        const [{ data: docs }, { data: reqs }] = await Promise.all([
          supabase
            .from('application_documents')
            .select('id, application_id, document_type, document_label, file_path, file_name, file_size, content_type, uploaded_at, verified_at, verified_by, verification_notes, rejected_at, rejection_reason')
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
      setError(t('admissions.viewApplication.errors.loadFailed'))
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
    if (!requiresReason(statusCode)) setSelectedReason('')
  }

  const handleReasonSelect = (reasonCode) => {
    setSelectedReason(reasonCode)
    setError('')
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
      const verified = {
        verified_at: new Date().toISOString(),
        verified_by: staffUserId,
        rejected_at: null,
        rejected_by: null,
        rejection_reason: null,
      }
      const { error: upErr } = await supabase.from('application_documents').update(verified).eq('id', docId)
      if (upErr) throw upErr

      setApplicationDocuments((prev) => prev.map((d) => (d.id === docId ? { ...d, ...verified } : d)))

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

  const documentTitle = (doc) =>
    String(doc?.document_label || '').trim() ||
    t(`admissions.viewApplication.documentTypes.${doc?.document_type}`, { defaultValue: doc?.document_type || '' })

  const openRejectDocument = (doc) => {
    setRejectDoc(doc)
    setRejectReason('')
    setError('')
  }

  const handleRejectDocument = async () => {
    const reason = rejectReason.trim()
    if (!rejectDoc?.id || !reason) return
    setRejectingDoc(true)
    setError('')
    try {
      const staffUserId = await getStaffUserId()
      const rejected = {
        rejected_at: new Date().toISOString(),
        rejected_by: staffUserId,
        rejection_reason: reason,
        verified_at: null,
        verified_by: null,
      }
      const { error: upErr } = await supabase.from('application_documents').update(rejected).eq('id', rejectDoc.id)
      if (upErr) throw upErr
      setApplicationDocuments((prev) => prev.map((d) => (d.id === rejectDoc.id ? { ...d, ...rejected } : d)))

      const docName = documentTitle(rejectDoc)
      setRejectDoc(null)
      try {
        await sendAdmissionNotification({
          type: 'document_rejected',
          subject: t('admissions.viewApplication.detail.rejectEmailSubject', { document: docName }),
          message: t('admissions.viewApplication.detail.rejectEmailBody', { url: `${window.location.origin}/login/applicant` }),
          details: [
            { label: t('admissions.viewApplication.detail.rejectEmailDocument'), value: docName },
            { label: t('admissions.viewApplication.detail.rejectEmailReason'), value: reason },
          ],
          meta: { document_id: rejectDoc.id },
        })
        toast(t('admissions.viewApplication.detail.rejectSent'))
      } catch (mailErr) {
        setError(t('admissions.viewApplication.detail.rejectEmailFailed', { error: mailErr?.message || '' }))
      }
    } catch (e) {
      console.error('Reject document failed:', e)
      setError(e?.message || t('admissions.viewApplication.detail.rejectFailed'))
    } finally {
      setRejectingDoc(false)
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

      const docsEmail = emailForActionStatus('RVRI', isArabicLayout, msg)
      await sendAdmissionNotification({
        type: 'request_documents',
        subject: docsEmail.subject,
        message: docsEmail.body,
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

  /** The database accepts a token until it expires; Edge Functions also need the sign-in to still exist. */
  const requireLiveSession = async () => {
    const { error: userErr } = await supabase.auth.getUser()
    if (!userErr) return
    const { error: refreshErr } = await supabase.auth.refreshSession()
    if (refreshErr) throw new Error(t('admissions.viewApplication.sessionEnded'))
  }

  const handleSendOfferLetter = async () => {
    if (!applicationId || !application) return
    setSendingOffer(true)
    setError('')
    let statusChanged = false
    try {
      const deadlineIso = null
      let amountNum = tuitionAmount !== '' ? Number(tuitionAmount) : null
      if (!paymentsEnabled) {
        amountNum = 0
      } else if (!Number.isFinite(amountNum) || Number(amountNum) <= 0) {
        throw new Error('Tuition fee amount is required.')
      }

      await requireLiveSession()

      const now = new Date().toISOString()
      const { error: updErr } = await supabase
        .from('applications')
        .update({
          // Offer becomes available to accept. We immediately finalize via accept-offer below.
          status_code: 'DCCA',
          status: 'accepted',
          status_changed_at: now,
          offer_sent_at: now,
          offer_deadline: deadlineIso,
          tuition_fee_amount: amountNum,
        })
        .eq('id', applicationId)
      if (updErr) throw updErr
      statusChanged = true

      await supabase.from('status_change_audit_log').insert({
        entity_type: 'application',
        entity_id: applicationId,
        from_status_code: application?.status_code || null,
        to_status_code: 'DCCA',
        transition_reason_code: null,
        trigger_code: 'TROF',
        notes: paymentsEnabled
          ? `Offer letter sent. Tuition fee: ${amountNum}.`
          : 'Offer letter sent.',
      })

      // Admit immediately. The applicant does not accept the offer.
      const { data: acceptData, error: acceptErr } = await supabase.functions.invoke('accept-offer', {
        body: { applicationId, forceFinalize: true },
      })
      if (acceptErr) {
        let detail = acceptErr.message || 'Failed to finalize admission'
        try {
          const body = await acceptErr.context?.json?.()
          if (body?.error) detail = String(body.error)
        } catch {
          /* keep the invoke message */
        }
        throw new Error(detail === 'Invalid session' ? t('admissions.viewApplication.sessionEnded') : detail)
      }
      if (acceptData?.error || acceptData?.success === false) {
        throw new Error(acceptData?.error || 'Failed to finalize admission')
      }
      statusChanged = false

      setApplication((prev) =>
        prev
          ? {
              ...prev,
              status_code: 'DCFA',
              status: 'accepted',
              offer_sent_at: now,
              offer_deadline: deadlineIso,
              tuition_fee_amount: amountNum,
            }
          : prev,
      )

      try {
        const subject = t('offerLetter.emailSentSubject', 'You have been admitted')
        const baseMessage = paymentsEnabled
          ? t(
              'offerLetter.emailSentBody',
              'Congratulations. You have been admitted. Your place is confirmed. Log in to the student portal with the same email and password you used to apply. Any remaining fees can be paid from the student portal.',
            )
          : t(
              'offerLetter.emailSentBodyPortal',
              'Congratulations. You have been admitted. Your place is confirmed. Log in to the student portal with the same email and password you used to apply.',
            )
        const message = baseMessage
        const { error: mailErr } = await supabase.functions.invoke('send-admission-notification', {
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
        if (mailErr) throw mailErr
      } catch (mailError) {
        console.error('Admission email failed:', mailError)
        setError(t('offerLetter.emailFailed', 'The applicant was admitted, but the confirmation email could not be sent.'))
      }

      setShowOfferModal(false)
      setTuitionAmount('')
      setTuitionTotalAmount(0)
    } catch (e) {
      if (statusChanged) {
        await supabase
          .from('applications')
          .update({
            status_code: application.status_code,
            status: application.status,
            status_changed_at: application.status_changed_at,
            offer_sent_at: application.offer_sent_at,
            offer_deadline: application.offer_deadline,
            tuition_fee_amount: application.tuition_fee_amount,
          })
          .eq('id', applicationId)
      }
      setError(e?.message || 'Failed to send offer letter')
    } finally {
      setSendingOffer(false)
    }
  }

  const handleStatusChange = async () => {
    if (!selectedStatus) {
      setError(t('admissions.viewApplication.errors.selectStatus'))
      return
    }

    const reasonNeeded = requiresReason(selectedStatus)
    if (reasonNeeded && !selectedReason) {
      setError(
        reasonNeeded === 'request_info'
          ? t('admissions.viewApplication.statusModal.requestInfoTitle')
          : t('admissions.viewApplication.statusModal.rejectionRequired'),
      )
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

      // Action statuses always email the matching template. Other decisions keep their own notice.
      const actionEmail = emailForActionStatus(selectedStatus, isArabicLayout, statusNotes)
      if (actionEmail) {
        await sendAdmissionNotification({
          type: actionEmail.key,
          subject: actionEmail.subject,
          message: actionEmail.body,
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
      } else if (selectedStatus === 'DCWL') {
        await sendAdmissionNotification({
          type: 'waitlisted',
          subject: 'Update regarding your admission application',
          message:
            statusNotes?.trim() ||
            'Your application has been waitlisted. Please check your applicant portal for updates.',
          meta: { to_status_code: selectedStatus },
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
            const result = await createStudentFromApplication(fullApplication)
            
            if (result.success && result.alreadyExists) {
              console.log('Student already exists; login promoted:', result.student.student_id)
            } else if (result.success) {
              console.log('Student created from application:', result.student.student_id)
            } else {
              console.error('Failed to create or promote the student login:', result.error)
              setError(result.error || 'The status was saved, but the student login could not be opened.')
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
    if (!statusCode) return t('common.unknown')
    const status = statusCodes.find(s => s.code === statusCode)
    return status ? (isArabicLayout ? status.name_ar : status.name_en) : statusCode
  }

  const applicantSeesLine = (statusCode) =>
    t('track.applicantSees', { label: t(getApplicantStatus(statusCode).labelKey) })

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
      nationality: normalizeNationalityCode(application.nationality) || application.nationality || '',
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
      scholarship_type: application.scholarship_type || '',
      scholarship_details: application.scholarship_details || '',
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
        } else if (key === 'nationality') {
          updateData[key] = normalizeNationalityCode(value) || null
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

  const openPasswordReset = () => {
    setShowPasswordReset((open) => !open)
    setNewPassword('')
    setConfirmPassword('')
    setShowNewPassword(false)
    setPasswordResetError('')
    setPasswordResetSuccess('')
  }

  const submitPasswordReset = async (event) => {
    event.preventDefault()
    setPasswordResetError('')
    setPasswordResetSuccess('')
    if (!application?.email) {
      setPasswordResetError(t('admissions.viewApplication.resetPasswordNoEmail'))
      return
    }
    if (newPassword.length < 6) {
      setPasswordResetError(t('admissions.viewApplication.passwordMin'))
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordResetError(t('admissions.viewApplication.passwordMismatch'))
      return
    }
    setResettingPassword(true)
    try {
      await invokeAdminPasswordReset({ applicationId: application.id, newPassword })
      setNewPassword('')
      setConfirmPassword('')
      setPasswordResetSuccess(t('admissions.viewApplication.passwordResetSuccess'))
    } catch (err) {
      const msg = err?.message || String(err)
      setPasswordResetError(
        msg.includes('Failed to fetch') || msg.includes('Function not found')
          ? t('adminAccount.functionNotDeployed')
          : msg
      )
    } finally {
      setResettingPassword(false)
    }
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
          <span>{t('common.back')}</span>
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
          <span>{t('common.back')}</span>
        </button>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-700">
          {t('admissions.viewApplication.errors.notFound')}
        </div>
      </div>
    )
  }

  const availableTransitions = getAvailableTransitions()
  const reasonType = selectedStatus ? requiresReason(selectedStatus) : null
  const reasonsList = reasonType === 'request_info' ? requestReasons : reasonType === 'reject' ? rejectReasons : []

  const StatusTile = ({ code }) => {
    const selected = selectedStatus === code
    return (
      <button
        type="button"
        onClick={() => handleStatusSelect(code)}
        className={`flex h-full min-h-[6.25rem] flex-col rounded-2xl border p-3 text-start transition ${getStatusColor(code)} ${
          selected ? 'border-gray-900 shadow-md ring-2 ring-gray-900' : 'hover:shadow-sm'
        }`}
      >
        <span className="flex items-start justify-between gap-2">
          <span className="text-sm font-bold leading-snug text-gray-900">{getStatusDisplayName(code)}</span>
          {selected ? (
            <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <span dir="ltr" className="shrink-0 font-mono text-[10px] font-bold leading-5 opacity-50">{code}</span>
          )}
        </span>
        <span className="mt-auto pt-2 text-[11px] leading-snug opacity-75">{applicantSeesLine(code)}</span>
      </button>
    )
  }

  const StageCard = ({ label, code, emptyText }) => (
    <div className={`flex min-h-[5.75rem] flex-col justify-between rounded-3xl px-4 py-3 text-start ${
      code ? `border shadow-sm ${getStatusColor(code)}` : 'border-2 border-dashed border-slate-300 bg-white'
    }`}>
      <span className={`text-xs font-semibold ${code ? 'opacity-70' : 'text-slate-400'}`}>{label}</span>
      <span className={`text-base font-bold leading-snug ${code ? 'text-gray-900' : 'text-slate-400'}`}>
        {code ? getStatusDisplayName(code) : emptyText}
      </span>
    </div>
  )

  // ---- header and tabs ----
  const latinName = [application?.first_name, application?.last_name].filter(Boolean).join(' ').trim()
  const arabicName = [application?.first_name_ar, application?.middle_name_ar, application?.last_name_ar].filter(Boolean).join(' ').trim()
  const applicantDisplayName = (isArabicLayout ? arabicName || latinName : latinName || arabicName) || t('admissions.viewApplication.title')
  const applicationNumberText = application?.application_number || `#${application?.id}`
  const copyApplicationNumber = () => {
    const done = () => toast(t('admissions.viewApplication.page.numberCopied'))
    try {
      navigator.clipboard.writeText(String(applicationNumberText)).then(done, () => {})
    } catch (_) {
      /* clipboard is not available on this page */
    }
  }
  const nameOf = (row) => (row ? getLocalizedName(row, isArabicLayout) || row.name_en || row.name_ar : '') || '—'
  const heroFacts = [
    [t('admissions.viewApplication.detail.major'), nameOf(application?.majors)],
    [t('admissions.viewApplication.detail.college'), nameOf(application?.colleges)],
    [t('admissions.viewApplication.detail.semester'), nameOf(application?.semesters)],
    [t('admissions.viewApplication.detail.submitted'), formatViewDate(application?.created_at)],
  ]
  const heroButtonClass = '!h-auto min-h-10 !whitespace-normal py-2 leading-tight sm:!whitespace-nowrap'
  const unverifiedDocuments = applicationDocuments.filter((doc) => !doc.verified_at).length
  const pageTabs = [
    { id: 'overview', icon: User, label: t('admissions.viewApplication.page.tabs.overview') },
    {
      id: 'documents',
      icon: Shield,
      label: t('admissions.viewApplication.page.tabs.documents'),
      count: unverifiedDocuments || applicationDocuments.length,
      attention: unverifiedDocuments > 0,
    },
    { id: 'messages', icon: MessageSquare, label: t('admissions.viewApplication.page.tabs.messages') },
    { id: 'interview', icon: Video, label: t('admissions.viewApplication.page.tabs.interview') },
    { id: 'activity', icon: History, label: t('admissions.viewApplication.page.tabs.activity'), count: activityLog.length },
  ]
  const requestedTab = searchParams.get('tab')
  const activeTab = pageTabs.some((tab) => tab.id === requestedTab) ? requestedTab : 'overview'
  const selectTab = (tabId) => {
    const next = new URLSearchParams(searchParams)
    if (tabId === 'overview') next.delete('tab')
    else next.set('tab', tabId)
    setSearchParams(next, { replace: true })
  }

  return (
    <div className="space-y-5" dir={isArabicLayout ? 'rtl' : 'ltr'}>
      {/* Who this is, where the application stands, and what staff can do next */}
      <div className="rounded-2xl border border-[#dde3ef] bg-white">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4 p-5 sm:p-6">
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => navigate('/admissions/applications')}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-[#1a3a6b]"
            >
              {isArabicLayout ? <ArrowRight className="h-4 w-4" /> : <ArrowLeft className="h-4 w-4" />}
              {t('admissions.viewApplication.page.back')}
            </button>
            <h1 className="mt-2 break-words text-2xl font-extrabold tracking-tight text-[#1a3a6b] sm:text-[28px]">{applicantDisplayName}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
              <button
                type="button"
                onClick={copyApplicationNumber}
                title={t('admissions.viewApplication.page.copyNumber')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#eef2f9] px-2.5 py-1 font-mono text-sm font-bold text-[#1a3a6b] hover:bg-[#dde3ef]"
              >
                <span dir="ltr">{applicationNumberText}</span>
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              {application?.email ? (
                <span dir="ltr" className="break-all">
                  {application.email}
                </span>
              ) : null}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-bold ${getStatusColor(
                  application?.status_code || application?.status
                )}`}
              >
                {getStatusIcon(application?.status_code || application?.status)}
                {getStatusDisplayName(application?.status_code || application?.status)}
              </span>
              <span className="text-xs text-slate-500">{applicantSeesLine(application?.status_code)}</span>
            </div>
          </div>

          {/* Phones: two buttons per row, labels may wrap. Wider screens: one row. */}
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
            <Button
              icon={Edit}
              className={heroButtonClass}
              disabled={updating}
              onClick={() => {
                const nextSteps = getAvailableTransitions()
                setSelectedStatus(nextSteps.length === 1 ? nextSteps[0].to_status_code : '')
                setSelectedReason('')
                setStatusNotes('')
                setShowAllStatuses(false)
                setError('')
                setShowStatusModal(true)
              }}
            >
              {t('admissions.viewApplication.changeStatus')}
            </Button>
            <Button
              variant="quiet"
              icon={Mail}
              className={heroButtonClass}
              disabled={updating || sendingOffer}
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
            >
              {t('admissions.viewApplication.sendOfferLetter', 'Send offer letter')}
            </Button>
            <Button variant="quiet" icon={FileText} className={heroButtonClass} disabled={updating || loading} onClick={handleEditClick}>
              {t('admissions.viewApplication.edit')}
            </Button>
            <Button variant="quiet" icon={KeyRound} className={heroButtonClass} disabled={updating || resettingPassword} onClick={openPasswordReset}>
              {t('admissions.viewApplication.resetPassword')}
            </Button>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-b-2xl border-t border-[#dde3ef] bg-[#dde3ef] lg:grid-cols-4">
          {heroFacts.map(([label, value]) => (
            <div key={label} className="min-w-0 bg-white px-5 py-3">
              <dt className="text-xs font-semibold text-slate-500">{label}</dt>
              <dd className="mt-0.5 break-words text-sm font-bold text-slate-800">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      )}

      {showPasswordReset && (
        <form
          onSubmit={submitPasswordReset}
          className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm"
        >
          <h2 className={`text-lg font-semibold text-gray-900 ${alignStart}`}>
            {t('admissions.viewApplication.resetPasswordTitle')}
          </h2>
          <p className={`text-sm text-gray-600 mt-1 ${alignStart}`}>
            {application?.email
              ? t('admissions.viewApplication.resetPasswordHint', { email: application.email })
              : t('admissions.viewApplication.resetPasswordNoEmail')}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <label className="block">
              <span className={`block text-sm font-medium text-gray-700 mb-1 ${alignStart}`}>
                {t('admissions.viewApplication.newPassword')}
              </span>
              <span className="relative block">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={`w-full py-2 border border-gray-300 rounded-lg ${isArabicLayout ? 'pl-10 pr-4' : 'pr-10 pl-4'}`}
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((visible) => !visible)}
                  className={`absolute top-1/2 -translate-y-1/2 ${isArabicLayout ? 'left-3' : 'right-3'} text-gray-500`}
                  aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </span>
            </label>
            <label className="block">
              <span className={`block text-sm font-medium text-gray-700 mb-1 ${alignStart}`}>
                {t('admissions.viewApplication.confirmPassword')}
              </span>
              <input
                type={showNewPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                dir="ltr"
              />
            </label>
          </div>
          {passwordResetError && (
            <div className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {passwordResetError}
            </div>
          )}
          {passwordResetSuccess && (
            <div className="mt-3 text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              {passwordResetSuccess}
            </div>
          )}
          <div className={`flex gap-3 mt-4 ${isArabicLayout ? 'flex-row-reverse' : ''}`}>
            <button
              type="submit"
              disabled={resettingPassword || !application?.email}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50"
            >
              {resettingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
              {t('admissions.viewApplication.savePassword')}
            </button>
            <button
              type="button"
              onClick={() => setShowPasswordReset(false)}
              className="px-4 py-2 border border-gray-300 rounded-lg font-medium hover:bg-gray-50"
            >
              {t('common.cancel')}
            </button>
          </div>
        </form>
      )}

      {/* Status change: now → next, on one screen */}
      {showStatusModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 [@media(min-height:760px)]:items-center [@media(min-height:760px)]:p-4">
          <div
            className="max-h-[100dvh] w-full max-w-lg overflow-y-auto rounded-t-[28px] bg-[#f6f7fb] shadow-2xl sm:max-h-[90dvh] sm:rounded-[28px]"
            dir={isArabicLayout ? 'rtl' : 'ltr'}
          >
            <div className="sticky top-0 z-10 border-b border-slate-200 bg-[#f6f7fb] px-5 pb-3 pt-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-slate-900">
                  {t('admissions.viewApplication.statusModal.title')}
                </h2>
                <button
                  type="button"
                  onClick={resetModal}
                  className="rounded-full bg-white p-2 text-slate-500 shadow-sm hover:text-slate-800"
                  aria-label={t('admissions.viewApplication.statusModal.cancel')}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
                <StageCard
                  label={t('admissions.viewApplication.statusModal.now')}
                  code={application?.status_code || application?.status}
                />
                <span className="flex items-center justify-center text-slate-400">
                  {isArabicLayout ? <ArrowLeft className="h-5 w-5" /> : <ArrowRight className="h-5 w-5" />}
                </span>
                <StageCard
                  label={t('admissions.viewApplication.statusModal.next')}
                  code={selectedStatus}
                  emptyText={t('admissions.viewApplication.statusModal.chooseNext')}
                />
              </div>

              {selectedStatus ? (
                <p className="mt-2 text-center text-xs text-slate-500">{applicantSeesLine(selectedStatus)}</p>
              ) : null}
              {availableTransitions.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAllStatuses((open) => !open)}
                  className="mt-2 text-sm font-semibold text-[#1a3a6b] hover:underline"
                >
                  {showAllStatuses
                    ? t('admissions.viewApplication.statusModal.hideAll')
                    : t('admissions.viewApplication.statusModal.otherStatus')}
                </button>
              )}
            </div>

            <div className="space-y-3 px-5 pb-2 pt-3">
              {error && (
                <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {availableTransitions.length > 1 && (
                <div className="grid grid-cols-2 items-stretch gap-2">
                  {availableTransitions.map((transition) => (
                    <StatusTile key={transition.id || transition.to_status_code} code={transition.to_status_code} />
                  ))}
                </div>
              )}

              {(showAllStatuses || availableTransitions.length === 0) && (
                <div className="space-y-4">
                  {Object.entries(getStatusesByCategory()).map(([category, statuses]) => {
                    if (!statuses.length || category === 'recommended') return null
                    const categoryLabels = {
                      application: t('admissions.viewApplication.statusModal.categories.application'),
                      review: t('admissions.viewApplication.statusModal.categories.review'),
                      decision: t('admissions.viewApplication.statusModal.categories.decision'),
                      enrollment: t('admissions.viewApplication.statusModal.categories.enrollment'),
                      academic: t('admissions.viewApplication.statusModal.categories.academic'),
                      graduation: t('admissions.viewApplication.statusModal.categories.graduation'),
                      other: t('admissions.viewApplication.statusModal.categories.other'),
                    }
                    return (
                      <div key={category}>
                        <p className="mb-2 text-xs font-bold text-slate-400">{categoryLabels[category] || categoryLabels.other}</p>
                        <div className="grid grid-cols-2 items-stretch gap-2">
                          {statuses.map((status) => (
                            <StatusTile key={status.code} code={status.code} />
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {reasonType && (
                <div className={`rounded-2xl border p-3 ${reasonType === 'reject' ? 'border-red-200 bg-red-50' : 'border-yellow-200 bg-yellow-50'}`}>
                  <p className={`mb-2 text-sm font-semibold ${reasonType === 'reject' ? 'text-red-900' : 'text-yellow-900'}`}>
                    {reasonType === 'reject'
                      ? t('admissions.viewApplication.statusModal.rejectionReasons')
                      : t('admissions.viewApplication.statusModal.requestReasons')}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {reasonsList.map((reason) => {
                      const selected = selectedReason === reason.code
                      return (
                        <button
                          key={reason.code}
                          type="button"
                          onClick={() => handleReasonSelect(reason.code)}
                          className={`rounded-full border px-3 py-1.5 text-start text-sm font-medium ${
                            selected
                              ? reasonType === 'reject'
                                ? 'border-red-600 bg-red-600 text-white'
                                : 'border-yellow-600 bg-yellow-500 text-white'
                              : 'border-white bg-white text-gray-800 hover:border-gray-300'
                          }`}
                        >
                          {isArabicLayout ? reason.name_ar : reason.name_en}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <label className="block text-start">
                <span className="mb-1.5 block text-xs font-semibold text-slate-500">
                  {t('admissions.viewApplication.statusModal.notesLabel')}{' '}
                  <span className="font-normal">({t('admissions.viewApplication.statusModal.optional')})</span>
                </span>
                <textarea
                  value={statusNotes}
                  onChange={(e) => setStatusNotes(e.target.value)}
                  rows={1}
                  className="w-full resize-none rounded-2xl border border-white bg-white px-3.5 py-2.5 text-sm shadow-sm outline-none focus:border-[#1a3a6b]"
                  placeholder={t('admissions.viewApplication.statusModal.notesPlaceholder')}
                />
              </label>
            </div>

            <div className="bg-[#f6f7fb] px-5 pb-4 pt-2">
              <button
                type="button"
                onClick={handleStatusChange}
                disabled={updating || !selectedStatus || (requiresReason(selectedStatus) && !selectedReason)}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary-gradient px-5 py-3.5 text-sm font-semibold text-white shadow-sm hover:shadow-md disabled:opacity-40"
              >
                {updating ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-white" />
                    <span>{t('admissions.viewApplication.statusModal.updating')}</span>
                  </>
                ) : (
                  <span>
                    {selectedStatus
                      ? `${t('admissions.viewApplication.statusModal.confirm')} · ${getStatusDisplayName(selectedStatus)}`
                      : t('admissions.viewApplication.statusModal.confirm')}
                  </span>
                )}
              </button>
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
                  {paymentsEnabled
                    ? t(
                        'admissions.viewApplication.sendOfferLetterHint',
                        'The applicant is admitted as soon as you send this, and receives an email confirming that they are in.',
                      )
                    : t(
                        'admissions.viewApplication.sendOfferLetterHintPortal',
                        'The applicant is admitted as soon as you send this, and receives an email confirming that they are in.',
                      )}
                </p>
              </div>
              <button type="button" onClick={() => setShowOfferModal(false)} className="p-2 rounded-lg hover:bg-gray-100">
                <X className="w-5 h-5 text-gray-600" />
              </button>
            </div>

            <div className="space-y-4">
              {paymentsEnabled && (
                <>
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
                </>
              )}

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
      {rejectDoc && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-start gap-3 text-start">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 text-red-600">
                  <XCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">
                    {t('admissions.viewApplication.detail.rejectTitle', { document: documentTitle(rejectDoc) })}
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">{t('admissions.viewApplication.detail.rejectHint')}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRejectDoc(null)}
                className="p-2 rounded-lg hover:bg-gray-100"
                aria-label={t('common.close')}
              >
                <X className="w-5 h-5 text-gray-600" />
              </button>
            </div>

            <div className="flex flex-wrap gap-2 mb-3">
              {['unclear', 'wrongDocument', 'incomplete', 'expired', 'nameMismatch'].map((key) => {
                const text = t(`admissions.viewApplication.detail.rejectReasons.${key}`)
                const picked = rejectReason.trim() === text
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setRejectReason(text)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                      picked ? 'border-red-300 bg-red-50 text-red-800' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {text}
                  </button>
                )
              })}
            </div>

            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full min-h-[110px] px-4 py-3 border border-gray-300 rounded-lg text-start focus:ring-2 focus:ring-red-400 focus:border-transparent"
              placeholder={t('admissions.viewApplication.detail.rejectPlaceholder')}
            />
            <p className="mt-2 text-xs text-gray-500">{t('admissions.viewApplication.detail.rejectNotice')}</p>

            <div className="flex items-center justify-end gap-3 mt-5">
              <button
                type="button"
                onClick={() => setRejectDoc(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50"
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                type="button"
                onClick={handleRejectDocument}
                disabled={rejectingDoc || rejectReason.trim().length === 0}
                className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 disabled:opacity-50"
              >
                {rejectingDoc && <Loader2 className="w-4 h-4 animate-spin" />}
                {t('admissions.viewApplication.detail.rejectSubmit')}
              </button>
            </div>
          </div>
        </div>
      )}

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
                aria-label={t('common.close')}
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

      {/* One part of the application at a time, instead of one very long page */}
      <div
        className="overflow-x-auto rounded-2xl border border-[#dde3ef] bg-white p-1.5"
        role="tablist"
        aria-label={t('admissions.viewApplication.title')}
      >
        <div className="flex min-w-max gap-1">
          {pageTabs.map((tab) => {
            const selected = activeTab === tab.id
            const TabIcon = tab.icon
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={(e) => {
                  selectTab(tab.id)
                  e.currentTarget.scrollIntoView({ inline: 'nearest', block: 'nearest' })
                }}
                className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-bold transition-colors ${
                  selected ? 'bg-[#1a3a6b] text-white' : 'text-slate-600 hover:bg-[#eef2f9] hover:text-[#1a3a6b]'
                }`}
              >
                <TabIcon className="h-4 w-4" aria-hidden="true" />
                {tab.label}
                {tab.count ? (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[11px] leading-none tabular-nums ${
                      tab.attention ? 'bg-[#c8a84b] text-[#12284c]' : selected ? 'bg-white/20 text-white' : 'bg-[#eef2f9] text-[#1a3a6b]'
                    }`}
                  >
                    {tab.count}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      </div>

      <div role="tabpanel" className={activeTab === 'overview' ? 'space-y-5' : 'hidden'}>
          <ApplicationFeeSummary application={application} />
          {/* Personal Information */}
          <div className="rounded-2xl border border-[#dde3ef] bg-white p-5 sm:p-6">
            <div className={`flex items-center gap-2 mb-6 ${isArabicLayout ? 'justify-start' : ''}`}>
              {isArabicLayout ? (
                <>
                  <h2 className={`text-base font-extrabold text-[#1a3a6b] ${alignStart}`}>
                    {t('admissions.viewApplication.detail.personalInfo')}
                  </h2>
                  <User className="w-5 h-5 text-[#c8a84b] shrink-0" />
                </>
              ) : (
                <>
                  <User className="w-5 h-5 text-[#c8a84b] shrink-0" />
                  <h2 className={`text-base font-extrabold text-[#1a3a6b] ${alignStart}`}>
                    {t('admissions.viewApplication.detail.personalInfo')}
                  </h2>
                </>
              )}
            </div>
            <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className={`block text-xs font-semibold text-slate-500 mb-1 ${alignStart}`}>
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
                <label className={`block text-xs font-semibold text-slate-500 mb-1 ${alignStart}`}>
                  {t('admissions.viewApplication.detail.middleName')}
                </label>
                <p className={`text-gray-900 ${alignStart}`}>
                  {application?.middle_name || t('admissions.viewApplication.detail.notAvailable')}
                </p>
              </div>
              <div>
                <label className={`block text-xs font-semibold text-slate-500 mb-1 ${alignStart}`}>
                  {t('admissions.viewApplication.detail.lastName')}
                </label>
                <p className={`text-gray-900 font-medium ${alignStart}`}>{application?.last_name}</p>
              </div>
              <div>
                <label className={`block text-xs font-semibold text-slate-500 mb-1 ${alignStart}`}>
                  {t('admissions.viewApplication.detail.dateOfBirth')}
                </label>
                <p className={`text-gray-900 ${alignStart}`}>{formatViewDate(application?.date_of_birth)}</p>
              </div>
              <div>
                <label className={`block text-xs font-semibold text-slate-500 mb-1 ${alignStart}`}>
                  {t('admissions.viewApplication.detail.gender')}
                </label>
                <p className={`text-gray-900 ${alignStart}`}>{formatGenderLabel(application?.gender)}</p>
              </div>
              <div>
                <label className={`block text-xs font-semibold text-slate-500 mb-1 ${alignStart}`}>
                  {t('admissions.viewApplication.detail.nationality')}
                </label>
                <p className={`text-gray-900 ${alignStart}`}>
                  {application?.nationality
                    ? getNationalityLabel(application.nationality, isArabicLayout)
                    : t('admissions.viewApplication.detail.notAvailable')}
                </p>
              </div>
              <div>
                <label className={`block text-xs font-semibold text-slate-500 mb-1 ${alignStart}`}>
                  {t('admissions.viewApplication.detail.religion')}
                </label>
                <p className={`text-gray-900 ${alignStart}`}>
                  {application?.religion || t('admissions.viewApplication.detail.notAvailable')}
                </p>
              </div>
              <div>
                <label className={`block text-xs font-semibold text-slate-500 mb-1 ${alignStart}`}>
                  {t('admissions.viewApplication.detail.placeOfBirth')}
                </label>
                <p className={`text-gray-900 ${alignStart}`}>
                  {application?.place_of_birth || t('admissions.viewApplication.detail.notAvailable')}
                </p>
              </div>
              {(application?.first_name_ar || application?.middle_name_ar || application?.last_name_ar) && (
                <div className="sm:col-span-2 lg:col-span-3">
                  <label className={`block text-xs font-semibold text-slate-500 mb-1 ${alignStart}`}>
                    {t('admissions.viewApplication.detail.nameArabic')}
                  </label>
                  <p className={`text-gray-900 ${alignStart}`}>
                    <span dir="rtl">{arabicName}</span>
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Contact Information */}
          <div className="rounded-2xl border border-[#dde3ef] bg-white p-5 sm:p-6">
            <div className={`flex items-center gap-2 mb-6 ${isArabicLayout ? 'justify-start' : ''}`}>
              {isArabicLayout ? (
                <>
                  <h2 className={`text-base font-extrabold text-[#1a3a6b] ${alignStart}`}>
                    {t('admissions.viewApplication.detail.contactInfo')}
                  </h2>
                  <Phone className="w-5 h-5 text-[#c8a84b] shrink-0" />
                </>
              ) : (
                <>
                  <Phone className="w-5 h-5 text-[#c8a84b] shrink-0" />
                  <h2 className={`text-base font-extrabold text-[#1a3a6b] ${alignStart}`}>
                    {t('admissions.viewApplication.detail.contactInfo')}
                  </h2>
                </>
              )}
            </div>
            <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className={`block text-xs font-semibold text-slate-500 mb-1 ${alignStart}`}>
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
                <label className={`block text-xs font-semibold text-slate-500 mb-1 ${alignStart}`}>
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
              {(application?.street_address || application?.city || application?.state_province || application?.postal_code || application?.country) && (
                <div className="md:col-span-2">
                  <label className={`block text-xs font-semibold text-slate-500 mb-1 ${alignStart}`}>
                    {t('admissions.viewApplication.detail.address')}
                  </label>
                  <div className={`flex items-start gap-2 ${isArabicLayout ? 'flex-row-reverse' : ''}`}>
                    <MapPin className="w-4 h-4 text-gray-400 mt-1 shrink-0" />
                    <p className={`text-gray-900 ${alignStart}`}>
                      {[application.street_address, application.city, application.state_province, application.postal_code, application.country]
                        .filter(Boolean)
                        .join(', ')}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Emergency Contact */}
          {application?.emergency_contact_name && (
            <div className="rounded-2xl border border-[#dde3ef] bg-white p-5 sm:p-6">
              <div className={`flex items-center gap-2 mb-6 ${isArabicLayout ? 'justify-start' : ''}`}>
                {isArabicLayout ? (
                  <>
                    <h2 className={`text-base font-extrabold text-[#1a3a6b] ${alignStart}`}>
                      {t('admissions.viewApplication.detail.emergencyContact')}
                    </h2>
                    <AlertCircle className="w-5 h-5 text-[#c8a84b] shrink-0" />
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-5 h-5 text-[#c8a84b] shrink-0" />
                    <h2 className={`text-base font-extrabold text-[#1a3a6b] ${alignStart}`}>
                      {t('admissions.viewApplication.detail.emergencyContact')}
                    </h2>
                  </>
                )}
              </div>
              <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label className={`block text-xs font-semibold text-slate-500 mb-1 ${alignStart}`}>
                    {t('admissions.viewApplication.detail.contactName')}
                  </label>
                  <p className={`text-gray-900 ${alignStart}`}>{application.emergency_contact_name}</p>
                </div>
                <div>
                  <label className={`block text-xs font-semibold text-slate-500 mb-1 ${alignStart}`}>
                    {t('admissions.viewApplication.detail.relationship')}
                  </label>
                  <p className={`text-gray-900 ${alignStart}`}>
                    {application.emergency_contact_relationship || t('admissions.viewApplication.detail.notAvailable')}
                  </p>
                </div>
                <div>
                  <label className={`block text-xs font-semibold text-slate-500 mb-1 ${alignStart}`}>
                    {t('admissions.viewApplication.detail.phone')}
                  </label>
                  <p className={`text-gray-900 ${alignStart}`} dir="ltr">
                    {application.emergency_contact_phone || t('admissions.viewApplication.detail.notAvailable')}
                  </p>
                </div>
                <div>
                  <label className={`block text-xs font-semibold text-slate-500 mb-1 ${alignStart}`}>
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
          <div className="rounded-2xl border border-[#dde3ef] bg-white p-5 sm:p-6">
            <div className={`flex items-center gap-2 mb-6 ${isArabicLayout ? 'justify-start' : ''}`}>
              {isArabicLayout ? (
                <>
                  <h2 className={`text-base font-extrabold text-[#1a3a6b] ${alignStart}`}>
                    {t('admissions.viewApplication.detail.academicInfo')}
                  </h2>
                  <GraduationCap className="w-5 h-5 text-[#c8a84b] shrink-0" />
                </>
              ) : (
                <>
                  <GraduationCap className="w-5 h-5 text-[#c8a84b] shrink-0" />
                  <h2 className={`text-base font-extrabold text-[#1a3a6b] ${alignStart}`}>
                    {t('admissions.viewApplication.detail.academicInfo')}
                  </h2>
                </>
              )}
            </div>
            <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className={`block text-xs font-semibold text-slate-500 mb-1 ${alignStart}`}>
                  {t('admissions.viewApplication.detail.major')}
                </label>
                <p className={`text-gray-900 ${alignStart}`}>
                  {application?.majors
                    ? getLocalizedName(application.majors, isArabicLayout) || application.majors.name_en
                    : '—'}
                </p>
              </div>
              <div>
                <label className={`block text-xs font-semibold text-slate-500 mb-1 ${alignStart}`}>
                  {t('admissions.viewApplication.detail.semester')}
                </label>
                <p className={`text-gray-900 ${alignStart}`}>
                  {application?.semesters
                    ? getLocalizedName(application.semesters, isArabicLayout) || application.semesters.name_en
                    : '—'}
                </p>
              </div>
              <div>
                <label className={`block text-xs font-semibold text-slate-500 mb-1 ${alignStart}`}>
                  {t('admissions.viewApplication.detail.highSchool')}
                </label>
                <p className={`text-gray-900 ${alignStart}`}>
                  {application?.high_school_name || t('admissions.viewApplication.detail.notAvailable')}
                </p>
              </div>
              <div>
                <label className={`block text-xs font-semibold text-slate-500 mb-1 ${alignStart}`}>
                  {t('admissions.viewApplication.detail.graduationYear')}
                </label>
                <p className={`text-gray-900 ${alignStart}`}>
                  {application?.graduation_year || t('admissions.viewApplication.detail.notAvailable')}
                </p>
              </div>
              <div>
                <label className={`block text-xs font-semibold text-slate-500 mb-1 ${alignStart}`}>
                  {t('admissions.viewApplication.detail.gpa')}
                </label>
                <p className={`text-gray-900 ${alignStart}`}>
                  {application?.gpa || t('admissions.viewApplication.detail.notAvailable')}
                </p>
              </div>
              <div>
                <label className={`block text-xs font-semibold text-slate-500 mb-1 ${alignStart}`}>
                  {t('admissions.viewApplication.detail.certificateType')}
                </label>
                <p className={`text-gray-900 ${alignStart}`}>
                  {application?.certificate_type || t('admissions.viewApplication.detail.notAvailable')}
                </p>
              </div>
            </div>
          </div>

          {/* Application form details (simplified public form) */}
          {(() => {
            const rows = [
              [
                t('applyForm.fields.academicLevel'),
                application?.majors?.degree_level
                  ? t(`applyForm.degreeLevels.${application.majors.degree_level}`, application.majors.degree_level)
                  : null,
              ],
              [
                t('applyForm.fields.faculty2'),
                secondChoiceCollege ? getLocalizedName(secondChoiceCollege, isArabicLayout) || secondChoiceCollege.name_en : null,
              ],
              [t('applyForm.fields.secondChoice'), secondChoiceMajor ? getLocalizedName(secondChoiceMajor, isArabicLayout) || secondChoiceMajor.name_en : null],
              [t('applyForm.fields.workload'), application?.study_type ? t(`applyForm.workload.${application.study_type}`, application.study_type) : null],
              [
                t('applyForm.fields.isFormerStudent'),
                application?.is_former_student == null
                  ? null
                  : application.is_former_student
                    ? t('registerApplication.fields.yes')
                    : t('registerApplication.fields.no'),
              ],
              [t('applyForm.fields.matricNo'), application?.is_former_student ? application?.matric_no || '—' : null],
              [
                t('applyForm.fields.educationCountry'),
                application?.high_school_country ? getNationalityLabel(application.high_school_country, isArabicLayout) : null,
              ],
              [
                t('applyForm.fields.highestEducationLevel'),
                application?.highest_education_level
                  ? t(`applyForm.educationLevels.${application.highest_education_level}`, application.highest_education_level)
                  : null,
              ],
              [t('applyForm.fields.specialization'), application?.specialization],
              [
                t('applyForm.fields.languageOfStudy'),
                application?.language_of_study ? t(`applyForm.languages.${application.language_of_study}`, application.language_of_study) : null,
              ],
              [
                t('applyForm.fields.languageCertificateName'),
                application?.language_certificate_name
                  ? `${t(`applyForm.languageCertificates.${application.language_certificate_name}`, application.language_certificate_name)}${
                      application?.language_certificate_result ? ` — ${application.language_certificate_result}` : ''
                    }`
                  : null,
              ],
              [t('applyForm.fields.title'), application?.title ? t(`applyForm.titles.${application.title}`, application.title) : null],
              [t('applyForm.fields.race'), application?.race],
              [t('applyForm.fields.idType'), application?.id_type ? t(`applyForm.idTypes.${application.id_type}`, application.id_type) : null],
              [t('applyForm.fields.idNumber'), application?.id_number],
              [t('applyForm.fields.idIssueCountry'), application?.id_issue_country ? getNationalityLabel(application.id_issue_country, isArabicLayout) : null],
              [t('applyForm.fields.idIssueDate'), application?.id_issue_date ? formatViewDate(application.id_issue_date) : null],
              [t('applyForm.fields.idExpiryDate'), application?.id_expiry_date ? formatViewDate(application.id_expiry_date) : null],
              [t('applyForm.fields.homePhone'), application?.home_phone],
              [
                t('applyForm.fields.referralSource'),
                application?.referral_source ? t(`applyForm.referralSources.${application.referral_source}`, application.referral_source) : null,
              ],
            ].filter(([, value]) => value)

            if (rows.length === 0) return null

            return (
              <div className="rounded-2xl border border-[#dde3ef] bg-white p-5 sm:p-6">
                <div className={`flex items-center gap-2 mb-6 ${isArabicLayout ? 'justify-start flex-row-reverse' : ''}`}>
                  <FileText className="w-5 h-5 text-[#c8a84b] shrink-0" />
                  <h2 className={`text-base font-extrabold text-[#1a3a6b] ${alignStart}`}>
                    {t('admissions.viewApplication.detail.applicationDetails', 'Application form details')}
                  </h2>
                </div>
                <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                  {rows.map(([label, value]) => (
                    <div key={label}>
                      <label className={`block text-xs font-semibold text-slate-500 mb-1 ${alignStart}`}>{label}</label>
                      <p className={`text-gray-900 ${alignStart}`}>{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* Test Scores */}
          {(application?.toefl_score || application?.ielts_score || application?.sat_score || application?.gmat_score || application?.gre_score) && (
            <div className="rounded-2xl border border-[#dde3ef] bg-white p-5 sm:p-6">
              <div className={`flex items-center gap-2 mb-6 ${isArabicLayout ? 'justify-start' : ''}`}>
                {isArabicLayout ? (
                  <>
                    <h2 className={`text-base font-extrabold text-[#1a3a6b] ${alignStart}`}>
                      {t('admissions.viewApplication.detail.testScores')}
                    </h2>
                    <FileText className="w-5 h-5 text-[#c8a84b] shrink-0" />
                  </>
                ) : (
                  <>
                    <FileText className="w-5 h-5 text-[#c8a84b] shrink-0" />
                    <h2 className={`text-base font-extrabold text-[#1a3a6b] ${alignStart}`}>
                      {t('admissions.viewApplication.detail.testScores')}
                    </h2>
                  </>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {application.toefl_score && (
                  <div>
                    <label className={`block text-xs font-semibold text-slate-500 mb-1 ${alignStart}`}>
                      {t('admissions.viewApplication.detail.toefl')}
                    </label>
                    <p className={`text-gray-900 ${alignStart}`}>{application.toefl_score}/120</p>
                  </div>
                )}
                {application.ielts_score && (
                  <div>
                    <label className={`block text-xs font-semibold text-slate-500 mb-1 ${alignStart}`}>
                      {t('admissions.viewApplication.detail.ielts')}
                    </label>
                    <p className={`text-gray-900 ${alignStart}`}>{application.ielts_score}/9.0</p>
                  </div>
                )}
                {application.sat_score && (
                  <div>
                    <label className={`block text-xs font-semibold text-slate-500 mb-1 ${alignStart}`}>
                      {t('admissions.viewApplication.detail.sat')}
                    </label>
                    <p className={`text-gray-900 ${alignStart}`}>{application.sat_score}/1600</p>
                  </div>
                )}
                {application.gmat_score && (
                  <div>
                    <label className={`block text-xs font-semibold text-slate-500 mb-1 ${alignStart}`}>
                      {t('admissions.viewApplication.detail.gmat')}
                    </label>
                    <p className={`text-gray-900 ${alignStart}`}>{application.gmat_score}/800</p>
                  </div>
                )}
                {application.gre_score && (
                  <div>
                    <label className={`block text-xs font-semibold text-slate-500 mb-1 ${alignStart}`}>
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
            <div className="rounded-2xl border border-[#dde3ef] bg-white p-5 sm:p-6">
              <div className={`flex items-center gap-2 mb-6 ${isArabicLayout ? 'justify-start' : ''}`}>
                {isArabicLayout ? (
                  <>
                    <h2 className={`text-base font-extrabold text-[#1a3a6b] ${alignStart}`}>
                      {t('admissions.viewApplication.detail.transferInfo')}
                    </h2>
                    <BookOpen className="w-5 h-5 text-[#c8a84b] shrink-0" />
                  </>
                ) : (
                  <>
                    <BookOpen className="w-5 h-5 text-[#c8a84b] shrink-0" />
                    <h2 className={`text-base font-extrabold text-[#1a3a6b] ${alignStart}`}>
                      {t('admissions.viewApplication.detail.transferInfo')}
                    </h2>
                  </>
                )}
              </div>
              <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label className={`block text-xs font-semibold text-slate-500 mb-1 ${alignStart}`}>
                    {t('admissions.viewApplication.detail.previousUniversity')}
                  </label>
                  <p className={`text-gray-900 ${alignStart}`}>
                    {application.previous_university || t('admissions.viewApplication.detail.notAvailable')}
                  </p>
                </div>
                <div>
                  <label className={`block text-xs font-semibold text-slate-500 mb-1 ${alignStart}`}>
                    {t('admissions.viewApplication.detail.previousDegree')}
                  </label>
                  <p className={`text-gray-900 ${alignStart}`}>
                    {application.previous_degree || t('admissions.viewApplication.detail.notAvailable')}
                  </p>
                </div>
                <div>
                  <label className={`block text-xs font-semibold text-slate-500 mb-1 ${alignStart}`}>
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
          {(application?.personal_statement ||
            application?.scholarship_request ||
            application?.scholarship_type ||
            application?.scholarship_details) && (
            <div className="rounded-2xl border border-[#dde3ef] bg-white p-5 sm:p-6">
              <div className={`flex items-center gap-2 mb-6 ${isArabicLayout ? 'justify-start' : ''}`}>
                {isArabicLayout ? (
                  <>
                    <h2 className={`text-base font-extrabold text-[#1a3a6b] ${alignStart}`}>
                      {t('admissions.viewApplication.detail.additionalInfo')}
                    </h2>
                    <FileText className="w-5 h-5 text-[#c8a84b] shrink-0" />
                  </>
                ) : (
                  <>
                    <FileText className="w-5 h-5 text-[#c8a84b] shrink-0" />
                    <h2 className={`text-base font-extrabold text-[#1a3a6b] ${alignStart}`}>
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
                <div className="space-y-4">
                  <div>
                    <h3 className={`text-sm font-bold text-gray-800 mb-2 ${alignStart}`}>
                      {t('admissions.viewApplication.detail.scholarshipSection')}
                    </h3>
                    <label className={`block text-xs font-semibold text-slate-500 mb-1 ${alignStart}`}>
                      {t('admissions.viewApplication.detail.scholarshipRequest')}
                    </label>
                    <p className={`text-gray-900 ${alignStart}`}>
                      {t('admissions.viewApplication.detail.scholarshipYes')}{' '}
                      {application.scholarship_percentage != null &&
                        application.scholarship_percentage !== '' &&
                        `(${application.scholarship_percentage}%)`}
                    </p>
                  </div>
                  {application.scholarship_type && (
                    <div>
                      <label className={`block text-xs font-semibold text-slate-500 mb-1 ${alignStart}`}>
                        {t('admissions.viewApplication.detail.scholarshipType')}
                      </label>
                      <p className={`text-gray-900 ${alignStart}`}>{application.scholarship_type}</p>
                    </div>
                  )}
                  {application.scholarship_details && (
                    <div>
                      <label className={`block text-xs font-semibold text-slate-500 mb-1 ${alignStart}`}>
                        {t('admissions.viewApplication.detail.scholarshipDetails')}
                      </label>
                      <p className={`text-gray-900 whitespace-pre-wrap ${alignStart}`}>{application.scholarship_details}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {/* Review Notes */}
          {application?.review_notes && (
            <div className="rounded-2xl border border-[#dde3ef] bg-white p-5 sm:p-6">
              <h3 className={`text-base font-extrabold text-[#1a3a6b] mb-4 ${alignStart}`}>
                {t('admissions.viewApplication.detail.reviewNotes')}
              </h3>
              <p className={`text-sm text-gray-700 whitespace-pre-wrap ${alignStart}`}>{application.review_notes}</p>
            </div>
          )}
          {/* Application Summary */}
          <div className="rounded-2xl border border-[#dde3ef] bg-white p-5 sm:p-6">
            <h3 className={`text-base font-extrabold text-[#1a3a6b] mb-4 ${alignStart}`}>
              {t('admissions.viewApplication.detail.applicationSummary')}
            </h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-3 lg:grid-cols-4">
              <div>
                <label className={`block text-xs font-semibold text-slate-500 mb-1 ${alignStart}`}>
                  {t('admissions.viewApplication.detail.applicationId')}
                </label>
                <p className={`text-sm font-medium text-gray-900 ${alignStart}`}>
                  <span dir="ltr" className="inline-block">
                    #{application?.id}
                  </span>
                </p>
              </div>
              <div>
                <label className={`block text-xs font-semibold text-slate-500 mb-1 ${alignStart}`}>
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
                  <label className={`block text-xs font-semibold text-slate-500 mb-1 ${alignStart}`}>
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
                  <label className={`block text-xs font-semibold text-slate-500 mb-1 ${alignStart}`}>
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
                <label className={`block text-xs font-semibold text-slate-500 mb-1 ${alignStart}`}>
                  {t('admissions.viewApplication.detail.submitted')}
                </label>
                <p className={`text-sm text-gray-900 ${alignStart}`}>{formatViewDate(application?.created_at)}</p>
              </div>
              <div>
                <label className={`block text-xs font-semibold text-slate-500 mb-1 ${alignStart}`}>
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
                  <label className={`block text-xs font-semibold text-slate-500 mb-1 ${alignStart}`}>
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
                    <label className={`block text-xs font-semibold text-slate-500 mb-1 ${alignStart}`}>
                      {t('admissions.viewApplication.detail.reviewed')}
                    </label>
                    <p className={`text-sm text-gray-900 ${alignStart}`}>{formatViewDate(application.reviewed_at)}</p>
                  </div>
                  <div>
                    <label className={`block text-xs font-semibold text-slate-500 mb-1 ${alignStart}`}>
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

      </div>

      <div role="tabpanel" className={activeTab === 'documents' ? 'space-y-5' : 'hidden'}>
          {/* Documents (uploads + verification) */}
          <div className="rounded-2xl border border-[#dde3ef] bg-white p-5 sm:p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-[#c8a84b] shrink-0" />
                <h2 className={`text-base font-extrabold text-[#1a3a6b] ${alignStart}`}>
                  {t('admissions.viewApplication.detail.documents', 'Documents')}
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {paymentsEnabled && (
                <button
                  type="button"
                  onClick={openReceiveFeeModal}
                  disabled={!canReceiveRegistrationFee || receivingFee}
                  className="px-4 py-2 bg-amber-600 text-white rounded-lg font-semibold hover:bg-amber-700 transition-colors disabled:opacity-50"
                >
                  {t('admissions.viewApplication.receiveRegistrationFee', 'Receive registration fee')}
                </button>
                )}
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
                      const rejected = !verified && !!doc.rejected_at
                      const title = documentTitle(doc)
                      return (
                        <li key={doc.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-gray-900 text-sm">
                                {title}
                              </span>
                              {verified ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
                                  <CheckCircle className="w-3.5 h-3.5" />
                                  {t('admissions.viewApplication.detail.verified', 'Verified')}
                                </span>
                              ) : rejected ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-800 text-xs font-bold">
                                  <XCircle className="w-3.5 h-3.5" />
                                  {t('admissions.viewApplication.detail.rejected')}
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
                            {rejected && (
                              <div className="mt-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-800">
                                <span className="font-bold">{t('admissions.viewApplication.detail.rejectReasonLabel')}: </span>
                                {doc.rejection_reason}
                                <div className="mt-1 text-red-700/80">{t('admissions.viewApplication.detail.waitingNewUpload')}</div>
                              </div>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
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
                            {!verified && !rejected && (
                              <button
                                type="button"
                                onClick={() => openRejectDocument(doc)}
                                className="px-3 py-2 border border-red-200 bg-white text-red-700 rounded-lg text-sm font-semibold hover:bg-red-50"
                              >
                                {t('admissions.viewApplication.detail.reject')}
                              </button>
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

          {paymentsEnabled && showReceiveFeeModal && (
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

      </div>

      <div role="tabpanel" className={activeTab === 'messages' ? 'space-y-5' : 'hidden'}>
          <ApplicationMessagesPanel
            application={application}
            mode="staff"
            staffUserId={staffUserId}
            isArabicLayout={isArabicLayout}
            alignStart={alignStart}
            iconRow={isArabicLayout ? 'flex-row-reverse' : 'flex-row'}
          />

      </div>

      <div role="tabpanel" className={activeTab === 'interview' ? 'space-y-5' : 'hidden'}>
          <InterviewExamInvitePanel
            application={application}
            applicationId={applicationId}
            staffUserId={staffUserId}
            sendAdmissionNotification={sendAdmissionNotification}
            onUpdated={fetchApplication}
            isArabicLayout={isArabicLayout}
            alignStart={alignStart}
            iconRow={isArabicLayout ? 'flex-row-reverse' : 'flex-row'}
          />

      </div>

      <div role="tabpanel" className={activeTab === 'activity' ? 'space-y-5' : 'hidden'}>
      {/* Activity Timeline */}
      <div className="rounded-2xl border border-[#dde3ef] bg-white p-5 sm:p-6">
        <div className="flex items-center justify-between mb-6 gap-4 w-full">
          <div className="flex items-center gap-3 min-w-0 flex-1" dir={isArabicLayout ? 'rtl' : 'ltr'}>
            <div className="min-w-0 flex-1">
              <h2 className={`text-base font-extrabold text-[#1a3a6b] ${alignStart}`}>
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
                            <div className={`text-xs text-gray-500 whitespace-nowrap shrink-0 ${alignStart}`}>
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
                                    <Clock className="w-5 h-5 text-[#c8a84b] shrink-0" />
                                  </>
                                )}
                                {!entry.trigger_code && (
                                  <>
                                    <span className="font-semibold text-gray-900">
                                      {t('admissions.viewApplication.timeline.statusChange')}
                                    </span>
                                    <Clock className="w-5 h-5 text-[#c8a84b] shrink-0" />
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
                                    <Clock className="w-5 h-5 text-[#c8a84b] shrink-0" />
                                    <span className="font-semibold text-gray-900">{triggerLabel}</span>
                                  </>
                                )}
                                {!entry.trigger_code && (
                                  <>
                                    <Clock className="w-5 h-5 text-[#c8a84b] shrink-0" />
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

    </div>
  )
}
