import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { supabase } from '../../lib/supabase'
import GeneralSettings from '../../components/college/GeneralSettings'
import AcademicSettings from '../../components/college/AcademicSettings'
import FinancialSettings from '../../components/college/FinancialSettings'
import EmailSettings from '../../components/college/EmailSettings'
import OnboardingSettings from '../../components/college/OnboardingSettings'
import SystemSettings from '../../components/college/SystemSettings'
import ExaminationSettings from '../../components/college/ExaminationSettings'
import CollegeTypesSettings from '../../components/university/CollegeTypesSettings'
import GradeTypesSettings from '../../components/university/GradeTypesSettings'
import StudentLifecycleSettings from '../../components/university/StudentLifecycleSettings'
import { 
  Building2, 
  GraduationCap, 
  DollarSign, 
  Mail, 
  UserPlus, 
  Settings, 
  FileText,
  Save,
  ArrowLeft,
  Check,
  Users
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { sendSmtpTestEmail } from '../../utils/sendSmtpTestEmail'

const defaultGradingScale = [
  { letter: 'A+', minPercent: 95, maxPercent: 100, points: 4.0, passing: true },
  { letter: 'A', minPercent: 90, maxPercent: 94, points: 3.7, passing: true },
  { letter: 'B+', minPercent: 85, maxPercent: 89, points: 3.3, passing: true },
  { letter: 'B', minPercent: 80, maxPercent: 84, points: 3.0, passing: true },
  { letter: 'C+', minPercent: 75, maxPercent: 79, points: 2.7, passing: true },
  { letter: 'C', minPercent: 70, maxPercent: 74, points: 2.0, passing: true },
  { letter: 'D', minPercent: 60, maxPercent: 69, points: 1.0, passing: true },
  { letter: 'F', minPercent: 0, maxPercent: 59, points: 0.0, passing: false },
]

export default function UniversitySettings() {
  const { t } = useTranslation()
  const { isRTL } = useLanguage()
  const navigate = useNavigate()
  const { userRole } = useAuth()
  const [activeTab, setActiveTab] = useState('general')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [loadingSettings, setLoadingSettings] = useState(true)
  const [testEmailSending, setTestEmailSending] = useState(false)
  const [testEmailFeedback, setTestEmailFeedback] = useState(null)

  const [collegeTypes, setCollegeTypes] = useState([])
  const [gradeTypes, setGradeTypes] = useState([])

  const [formData, setFormData] = useState({
    // Academic
    credit_hours_source: 'semester', // 'semester' or 'major_sheet'
    min_credit_hours: 12,
    max_credit_hours: 18,
    max_with_permission: 21,
    min_gpa_for_overload: 3,
    min_passing_gpa: 2,
    max_gpa_scale: 4,
    honor_roll_min_gpa: 3.5,
    probation_threshold: 2,
    grading_scale: defaultGradingScale,
    attendance_required: true,
    min_attendance_percentage: 75,
    attendance_warning_threshold: 80,
    max_absence_days: 7,
    present_weight: 100,
    late_weight: 100,
    excused_weight: 100,
    count_excused_in_rate: true,
    count_late_as_full: true,
    enable_warnings: true,
    send_notifications: true,
    enforce_max_absence: true,
    create_alert_at_max: true,
    edit_window_hours: 24,
    require_approval_after_window: true,
    allow_instructor_override: true,
    late_arrival_grace_minutes: 15,
    late_arrival_cutoff_minutes: 30,
    early_departure_minutes: 15,
    contest_deadline_days: 7,
    contest_review_deadline_days: 14,
    max_contest_document_size_mb: 5,
    auto_reject_expired: true,
    require_document_for_contests: true,
    default_upcoming_sessions_days: 7,
    max_upcoming_sessions_days: 30,
    auto_exclude_weekends: true,
    auto_drop_enabled: true,
    auto_drop_threshold: 50,
    enable_prerequisite_checking: true,
    allow_waitlist: true,
    add_drop_period_days: 14,

    // Financial
    tap_api_key: '',
    tap_secret_key: '',
    test_mode: true,
    enable_early_payment_discount: true,
    early_payment_percent: 5,
    early_payment_days: 10,
    enable_sibling_discount: true,
    sibling_discount_percent: 10,
    enable_late_fees: true,
    late_fee_amount: 25,
    late_fee_percentage: 5,
    grace_period_days: 7,
    min_installments: 2,
    max_installments: 24,
    reminder_days_before_due: 3,
    min_days_between_reminders: 2,
    upcoming_due_date_window: 7,
    invoice_prefix: 'INV',
    invoice_number_format: '{prefix}-{year}-{sequence:D6}',
    invoice_due_days: 30,
    currency_code: 'USD',
    currency_symbol: '$',
    decimal_places: 2,
    allow_refunds: true,
    full_refund_period_days: 7,
    partial_refund_period_days: 30,
    partial_refund_percentage: 50,

    // Email
    smtp_host: 'smtp.gmail.com',
    smtp_port: 587,
    enable_ssl: true,
    smtp_username: '',
    smtp_password: '',
    from_email: '',
    from_name: '',
    enable_email_notifications: true,
    test_email_address: '',

    // Onboarding
    enable_online_applications: true,
    application_deadline_days: 30,
    require_document_upload: true,
    application_fee: 100,
    offer_acceptance_days: 14,
    document_submission_days: 7,
    auto_archive_days: 365,
    min_applicant_age: 16,
    max_applicant_age: 100,
    min_scholarship_percentage: 1,
    max_scholarship_percentage: 100,
    personal_statement_min_length: 100,
    personal_statement_max_length: 2000,
    scholarship_justification_min_length: 50,
    scholarship_justification_max_length: 1000,
    default_priority: 'normal',
    default_interview_type: 'in_person',
    max_document_size_mb: 5,
    allowed_file_types: ['PDF', 'JPG/JPEG', 'PNG', 'DOC/DOCX'],
    min_committee_members: 3,
    require_unanimous_decision: false,
    decision_timeout_days: 7,

    // System
    session_timeout_minutes: 30,
    password_expiry_days: 90,
    max_login_attempts: 5,
    account_lockout_duration_minutes: 15,
    enable_two_factor: false,
    max_file_upload_size_mb: 10,
    file_storage_provider: 'local',
    enable_maintenance_mode: false,
    maintenance_message: '',
    enable_automatic_backups: true,
    backup_retention_days: 30,
    backup_schedule_cron: '0 2 * * *',
    default_language: 'en',
    auto_detect_user_language: true,
    enable_rtl_support: true,

    // Examination
    min_passing_percentage: 50,
    min_passing_grade_points: 2,
    min_excellence_percentage: 90,
    min_good_percentage: 75,
    default_midterm_weight: 30,
    default_final_weight: 40,
    default_quiz_weight: 10,
    default_assignment_weight: 20,
    enforce_weight_sum_100: true,
    allow_custom_exam_types: true,
    exam_schedule_generation_window_days: 90,
    default_upcoming_exams_window_days: 7,
    min_preparation_days: 7,
    max_exams_per_day: 3,
    allow_weekend_exams: false,
    allow_overlapping_exams: false,
    allow_makeup_exams: true,
    makeup_request_deadline_days: 3,
    max_makeup_attempts: 2,
    require_room_allocation: true,
    students_per_room: 30,
    social_distancing_capacity_percentage: 50,
    enforce_social_distancing: false,
    require_invigilators: true,
    min_invigilators_per_room: 1,
    max_invigilator_assignments_per_day: 3,
    students_per_invigilator: 30,
    enable_conflict_detection: true,
    check_student_conflicts: true,
    check_invigilator_conflicts: true,
    check_room_conflicts: true,
  })

  useEffect(() => {
    if (userRole !== 'admin') {
      navigate('/dashboard')
      return
    }
    fetchUniversitySettings()
  }, [userRole, navigate])

  const fetchUniversitySettings = async () => {
    setLoadingSettings(true)
    try {
      const { data, error } = await supabase
        .from('university_settings')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1)

      if (error) {
        throw error
      }

      if (data && data.length > 0) {
        const settings = data[0]
        // Load settings from database
        if (settings.academic_settings) {
          setFormData(prev => ({ ...prev, ...settings.academic_settings }))
        }
        if (settings.financial_settings) {
          setFormData(prev => ({ ...prev, ...settings.financial_settings }))
        }
        if (settings.email_settings) {
          setFormData(prev => ({ ...prev, ...settings.email_settings }))
        }
        if (settings.onboarding_settings) {
          setFormData(prev => ({ ...prev, ...settings.onboarding_settings }))
        }
        if (settings.system_settings) {
          setFormData(prev => ({ ...prev, ...settings.system_settings }))
        }
        if (settings.examination_settings) {
          setFormData(prev => ({ ...prev, ...settings.examination_settings }))
        }
        // Load college types
        if (settings.college_types && Array.isArray(settings.college_types)) {
          setCollegeTypes(settings.college_types)
        }
        // Load grade types
        if (settings.grade_types && Array.isArray(settings.grade_types)) {
          setGradeTypes(settings.grade_types)
        }
      }
    } catch (err) {
      console.error('Error fetching university settings:', err)
      setError('Failed to load university settings')
    } finally {
      setLoadingSettings(false)
    }
  }

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (error) setError('')
  }

  const handleSendTestEmail = async () => {
    setTestEmailFeedback(null)
    const to = (formData.test_email_address || '').trim()
    if (!to) {
      setTestEmailFeedback({
        kind: 'error',
        text: t('colleges.emailSettings.testEmailRequired'),
      })
      return
    }
    setTestEmailSending(true)
    try {
      await sendSmtpTestEmail({
        scope: 'university',
        to,
        useSaved: false,
        smtp: {
          host: formData.smtp_host,
          port: Number(formData.smtp_port) || 587,
          enableSsl: Boolean(formData.enable_ssl),
          username: formData.smtp_username,
          password: formData.smtp_password,
          fromEmail: formData.from_email,
          fromName: formData.from_name,
        },
      })
      setTestEmailFeedback({
        kind: 'success',
        text: t('colleges.emailSettings.testEmailSent'),
      })
    } catch (err) {
      setTestEmailFeedback({
        kind: 'error',
        text: err.message || t('colleges.emailSettings.testEmailFailed'),
      })
    } finally {
      setTestEmailSending(false)
    }
  }

  const handleGradingScaleChange = (index, field, value) => {
    const newScale = [...formData.grading_scale]
    newScale[index] = { ...newScale[index], [field]: value }
    setFormData(prev => ({ ...prev, grading_scale: newScale }))
  }

  const handleSubmit = async () => {
    setLoading(true)
    setError('')
    setSuccess(false)

    try {
      // Build settings objects
      const academicSettings = {
        credit_hours_source: formData.credit_hours_source || 'semester',
        min_credit_hours: formData.min_credit_hours,
        max_credit_hours: formData.max_credit_hours,
        max_with_permission: formData.max_with_permission,
        min_gpa_for_overload: formData.min_gpa_for_overload,
        min_passing_gpa: formData.min_passing_gpa,
        max_gpa_scale: formData.max_gpa_scale,
        honor_roll_min_gpa: formData.honor_roll_min_gpa,
        probation_threshold: formData.probation_threshold,
        grading_scale: formData.grading_scale,
        attendance_required: formData.attendance_required,
        min_attendance_percentage: formData.min_attendance_percentage,
        attendance_warning_threshold: formData.attendance_warning_threshold,
        max_absence_days: formData.max_absence_days,
        present_weight: formData.present_weight,
        late_weight: formData.late_weight,
        excused_weight: formData.excused_weight,
        count_excused_in_rate: formData.count_excused_in_rate,
        count_late_as_full: formData.count_late_as_full,
        enable_warnings: formData.enable_warnings,
        send_notifications: formData.send_notifications,
        enforce_max_absence: formData.enforce_max_absence,
        create_alert_at_max: formData.create_alert_at_max,
        edit_window_hours: formData.edit_window_hours,
        require_approval_after_window: formData.require_approval_after_window,
        allow_instructor_override: formData.allow_instructor_override,
        late_arrival_grace_minutes: formData.late_arrival_grace_minutes,
        late_arrival_cutoff_minutes: formData.late_arrival_cutoff_minutes,
        early_departure_minutes: formData.early_departure_minutes,
        contest_deadline_days: formData.contest_deadline_days,
        contest_review_deadline_days: formData.contest_review_deadline_days,
        max_contest_document_size_mb: formData.max_contest_document_size_mb,
        auto_reject_expired: formData.auto_reject_expired,
        require_document_for_contests: formData.require_document_for_contests,
        default_upcoming_sessions_days: formData.default_upcoming_sessions_days,
        max_upcoming_sessions_days: formData.max_upcoming_sessions_days,
        auto_exclude_weekends: formData.auto_exclude_weekends,
        auto_drop_enabled: formData.auto_drop_enabled,
        auto_drop_threshold: formData.auto_drop_threshold,
        enable_prerequisite_checking: formData.enable_prerequisite_checking,
        allow_waitlist: formData.allow_waitlist,
        add_drop_period_days: formData.add_drop_period_days,
      }

      const financialSettings = {
        tap_api_key: formData.tap_api_key,
        tap_secret_key: formData.tap_secret_key,
        test_mode: formData.test_mode,
        enable_early_payment_discount: formData.enable_early_payment_discount,
        early_payment_percent: formData.early_payment_percent,
        early_payment_days: formData.early_payment_days,
        enable_sibling_discount: formData.enable_sibling_discount,
        sibling_discount_percent: formData.sibling_discount_percent,
        enable_late_fees: formData.enable_late_fees,
        late_fee_amount: formData.late_fee_amount,
        late_fee_percentage: formData.late_fee_percentage,
        grace_period_days: formData.grace_period_days,
        min_installments: formData.min_installments,
        max_installments: formData.max_installments,
        reminder_days_before_due: formData.reminder_days_before_due,
        min_days_between_reminders: formData.min_days_between_reminders,
        upcoming_due_date_window: formData.upcoming_due_date_window,
        invoice_prefix: formData.invoice_prefix,
        invoice_number_format: formData.invoice_number_format,
        invoice_due_days: formData.invoice_due_days,
        currency_code: formData.currency_code,
        currency_symbol: formData.currency_symbol,
        decimal_places: formData.decimal_places,
        allow_refunds: formData.allow_refunds,
        full_refund_period_days: formData.full_refund_period_days,
        partial_refund_period_days: formData.partial_refund_period_days,
        partial_refund_percentage: formData.partial_refund_percentage,
      }

      const emailSettings = {
        smtp_host: formData.smtp_host,
        smtp_port: formData.smtp_port,
        enable_ssl: formData.enable_ssl,
        smtp_username: formData.smtp_username,
        smtp_password: formData.smtp_password,
        from_email: formData.from_email,
        from_name: formData.from_name,
        enable_email_notifications: formData.enable_email_notifications,
        test_email_address: formData.test_email_address,
      }

      const onboardingSettings = {
        enable_online_applications: formData.enable_online_applications,
        application_deadline_days: formData.application_deadline_days,
        require_document_upload: formData.require_document_upload,
        application_fee: formData.application_fee,
        offer_acceptance_days: formData.offer_acceptance_days,
        document_submission_days: formData.document_submission_days,
        auto_archive_days: formData.auto_archive_days,
        min_applicant_age: formData.min_applicant_age,
        max_applicant_age: formData.max_applicant_age,
        min_scholarship_percentage: formData.min_scholarship_percentage,
        max_scholarship_percentage: formData.max_scholarship_percentage,
        personal_statement_min_length: formData.personal_statement_min_length,
        personal_statement_max_length: formData.personal_statement_max_length,
        scholarship_justification_min_length: formData.scholarship_justification_min_length,
        scholarship_justification_max_length: formData.scholarship_justification_max_length,
        default_priority: formData.default_priority,
        default_interview_type: formData.default_interview_type,
        max_document_size_mb: formData.max_document_size_mb,
        allowed_file_types: formData.allowed_file_types,
        min_committee_members: formData.min_committee_members,
        require_unanimous_decision: formData.require_unanimous_decision,
        decision_timeout_days: formData.decision_timeout_days,
      }

      const systemSettings = {
        session_timeout_minutes: formData.session_timeout_minutes,
        password_expiry_days: formData.password_expiry_days,
        max_login_attempts: formData.max_login_attempts,
        account_lockout_duration_minutes: formData.account_lockout_duration_minutes,
        enable_two_factor: formData.enable_two_factor,
        max_file_upload_size_mb: formData.max_file_upload_size_mb,
        file_storage_provider: formData.file_storage_provider,
        enable_maintenance_mode: formData.enable_maintenance_mode,
        maintenance_message: formData.maintenance_message,
        enable_automatic_backups: formData.enable_automatic_backups,
        backup_retention_days: formData.backup_retention_days,
        backup_schedule_cron: formData.backup_schedule_cron,
        default_language: formData.default_language,
        auto_detect_user_language: formData.auto_detect_user_language,
        enable_rtl_support: formData.enable_rtl_support,
      }

      const examinationSettings = {
        min_passing_percentage: formData.min_passing_percentage,
        min_passing_grade_points: formData.min_passing_grade_points,
        min_excellence_percentage: formData.min_excellence_percentage,
        min_good_percentage: formData.min_good_percentage,
        default_midterm_weight: formData.default_midterm_weight,
        default_final_weight: formData.default_final_weight,
        default_quiz_weight: formData.default_quiz_weight,
        default_assignment_weight: formData.default_assignment_weight,
        enforce_weight_sum_100: formData.enforce_weight_sum_100,
        allow_custom_exam_types: formData.allow_custom_exam_types,
        exam_schedule_generation_window_days: formData.exam_schedule_generation_window_days,
        default_upcoming_exams_window_days: formData.default_upcoming_exams_window_days,
        min_preparation_days: formData.min_preparation_days,
        max_exams_per_day: formData.max_exams_per_day,
        allow_weekend_exams: formData.allow_weekend_exams,
        allow_overlapping_exams: formData.allow_overlapping_exams,
        allow_makeup_exams: formData.allow_makeup_exams,
        makeup_request_deadline_days: formData.makeup_request_deadline_days,
        max_makeup_attempts: formData.max_makeup_attempts,
        require_room_allocation: formData.require_room_allocation,
        students_per_room: formData.students_per_room,
        social_distancing_capacity_percentage: formData.social_distancing_capacity_percentage,
        enforce_social_distancing: formData.enforce_social_distancing,
        require_invigilators: formData.require_invigilators,
        min_invigilators_per_room: formData.min_invigilators_per_room,
        max_invigilator_assignments_per_day: formData.max_invigilator_assignments_per_day,
        students_per_invigilator: formData.students_per_invigilator,
        enable_conflict_detection: formData.enable_conflict_detection,
        check_student_conflicts: formData.check_student_conflicts,
        check_invigilator_conflicts: formData.check_invigilator_conflicts,
        check_room_conflicts: formData.check_room_conflicts,
      }

      const collegeTypesData = collegeTypes
      const gradeTypesData = gradeTypes

      // Check if settings exist
      const { data: existingData } = await supabase
        .from('university_settings')
        .select('id')
        .limit(1)

      let result
      if (existingData && existingData.length > 0) {
        // Update existing
        result = await supabase
          .from('university_settings')
          .update({
            academic_settings: academicSettings,
            financial_settings: financialSettings,
            email_settings: emailSettings,
            onboarding_settings: onboardingSettings,
            system_settings: systemSettings,
            examination_settings: examinationSettings,
            college_types: collegeTypesData,
            grade_types: gradeTypesData,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingData[0].id)
          .select()
          .limit(1)
      } else {
        // Insert new
        result = await supabase
          .from('university_settings')
          .insert({
            academic_settings: academicSettings,
            financial_settings: financialSettings,
            email_settings: emailSettings,
            onboarding_settings: onboardingSettings,
            system_settings: systemSettings,
            examination_settings: examinationSettings,
            college_types: collegeTypesData,
            grade_types: gradeTypesData,
          })
          .select()
          .limit(1)
      }

      if (result.error) throw result.error

      // Check if we got data back
      if (!result.data || result.data.length === 0) {
        throw new Error('Failed to save university settings')
      }

      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      console.error('Error saving university settings:', err)
      setError(err.message || 'Failed to save university settings')
    } finally {
      setLoading(false)
    }
  }

  const tabs = [
    { id: 'general', name: t('universitySettings.tabs.general'), icon: Building2 },
    { id: 'grade-types', name: t('universitySettings.tabs.gradeTypes'), icon: FileText },
    { id: 'student-lifecycle', name: t('universitySettings.tabs.studentLifecycle'), icon: Users },
    { id: 'academic', name: t('universitySettings.tabs.academic'), icon: GraduationCap },
    { id: 'financial', name: t('universitySettings.tabs.financial'), icon: DollarSign },
    { id: 'email', name: t('universitySettings.tabs.email'), icon: Mail },
    { id: 'onboarding', name: t('universitySettings.tabs.onboarding'), icon: UserPlus },
    { id: 'system', name: t('universitySettings.tabs.system'), icon: Settings },
    { id: 'examination', name: t('universitySettings.tabs.examination'), icon: FileText },
  ]

  if (loadingSettings) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className={`flex items-center ${isRTL ? 'space-x-reverse space-x-3' : 'space-x-3'}`}>
          <button
            onClick={() => navigate('/admin/colleges')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{t('universitySettings.title')}</h1>
            <p className="text-gray-600 mt-1">{t('universitySettings.subtitle')}</p>
          </div>
        </div>
        <button
          onClick={handleSubmit}
          disabled={loading}
          className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} bg-primary-gradient text-white px-6 py-3 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {loading ? (
            <div className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'}`}>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              <span>{t('universitySettings.saving')}</span>
            </div>
          ) : (
            <div className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'}`}>
              <Save className="w-5 h-5" />
              <span>{t('universitySettings.save')}</span>
            </div>
          )}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className={`bg-green-50 border border-green-200 rounded-lg p-4 text-green-700 flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'}`}>
          <Check className="w-5 h-5" />
          <span>{t('universitySettings.saved')}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200">
        <div className="border-b border-gray-200">
          <nav className={`flex ${isRTL ? 'space-x-reverse space-x-1' : 'space-x-1'} p-2`} aria-label="Tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} px-4 py-3 rounded-lg font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-primary-50 text-primary-700 border border-primary-200'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <tab.icon className="w-5 h-5" />
                <span>{tab.name}</span>
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === 'general' && (
            <CollegeTypesSettings
              collegeTypes={collegeTypes}
              onCollegeTypesChange={setCollegeTypes}
            />
          )}
          {activeTab === 'grade-types' && (
            <GradeTypesSettings
              gradeTypes={gradeTypes}
              onGradeTypesChange={setGradeTypes}
            />
          )}
          {activeTab === 'student-lifecycle' && (
            <StudentLifecycleSettings />
          )}
          {activeTab === 'academic' && (
            <AcademicSettings
              formData={formData}
              handleChange={handleChange}
              handleGradingScaleChange={handleGradingScaleChange}
              readOnlyCreditsAndGrading={false}
            />
          )}
          {activeTab === 'financial' && (
            <FinancialSettings formData={formData} handleChange={handleChange} />
          )}
          {activeTab === 'email' && (
            <EmailSettings
              formData={formData}
              handleChange={handleChange}
              onSendTestEmail={handleSendTestEmail}
              testEmailSending={testEmailSending}
              testEmailFeedback={testEmailFeedback}
              showSupabaseAuthSmtpHint
            />
          )}
          {activeTab === 'onboarding' && (
            <OnboardingSettings formData={formData} handleChange={handleChange} />
          )}
          {activeTab === 'system' && (
            <SystemSettings formData={formData} handleChange={handleChange} />
          )}
          {activeTab === 'examination' && (
            <ExaminationSettings formData={formData} handleChange={handleChange} />
          )}
        </div>
      </div>
    </div>
  )
}

