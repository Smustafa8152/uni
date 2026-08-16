import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { supabase } from '../../lib/supabase'
import { createClient } from '@supabase/supabase-js'
import GeneralSettings from '../../components/college/GeneralSettings'
import AcademicSettings from '../../components/college/AcademicSettings'
import FinancialSettings from '../../components/college/FinancialSettings'
import EmailSettings from '../../components/college/EmailSettings'
import OnboardingSettings from '../../components/college/OnboardingSettings'
import SystemSettings from '../../components/college/SystemSettings'
import ExaminationSettings from '../../components/college/ExaminationSettings'
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
  Check
} from 'lucide-react'
import { sendSmtpTestEmail } from '../../utils/sendSmtpTestEmail'
import { DEFAULT_GRADING_SCALE, MAX_GPA_SCALE } from '../../utils/getCollegeSettings'

const defaultGradingScale = DEFAULT_GRADING_SCALE

// Helper function to create admin account directly using service role key
async function createAdminAccountDirectly(collegeId, formData, serviceRoleKey, supabaseUrl) {
  try {
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    const adminEmail = formData.admin_email || formData.contact_email || formData.official_email
    const adminName = formData.admin_name || formData.dean_name || formData.name_en + ' Admin'

    // Create auth user
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: adminEmail,
      password: formData.admin_password,
      email_confirm: true,
      user_metadata: {
        name: adminName,
        role: 'user',
      },
    })

    if (authError) {
      throw new Error(authError.message)
    }

    // Create user record
    const { error: userError } = await supabaseAdmin
      .from('users')
      .upsert({
        openId: authData.user.id,
        email: adminEmail,
        name: adminName,
        role: 'user',
        college_id: collegeId,
        loginMethod: 'email',
        menu_permissions: formData.admin_menu_permissions?.length
          ? formData.admin_menu_permissions
          : null,
      }, {
        onConflict: 'openId'
      })

    if (userError) {
      // If user record fails, delete auth user
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
      throw new Error(userError.message)
    }

    console.log('✅ College admin account created successfully')
    return { success: true }
  } catch (error) {
    console.error('Error creating admin account:', error)
    throw error
  }
}

export default function CreateCollege() {
  const { t } = useTranslation()
  const { isRTL } = useLanguage()
  const navigate = useNavigate()
  const { id } = useParams()
  const isEditMode = !!id
  const [activeTab, setActiveTab] = useState('general')
  const [loading, setLoading] = useState(false)
  const [loadingData, setLoadingData] = useState(isEditMode)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [useUniversitySettings, setUseUniversitySettings] = useState(false)
  const [universitySettings, setUniversitySettings] = useState(null)
  const [loadingUniversitySettings, setLoadingUniversitySettings] = useState(false)
  const [collegeTypes, setCollegeTypes] = useState([])
  const [testEmailSending, setTestEmailSending] = useState(false)
  const [testEmailFeedback, setTestEmailFeedback] = useState(null)

  // Fetch college data if in edit mode
  useEffect(() => {
    if (isEditMode && id) {
      fetchCollegeData()
    }
  }, [id, isEditMode])

  // Fetch university settings when checkbox is checked
  useEffect(() => {
    if (useUniversitySettings && !universitySettings) {
      fetchUniversitySettings()
    }
  }, [useUniversitySettings])

  // Fetch college types on mount
  useEffect(() => {
    fetchCollegeTypes()
  }, [])

  // Auto-fill form when university settings are loaded
  useEffect(() => {
    if (useUniversitySettings && universitySettings) {
      autoFillFromUniversitySettings()
    }
  }, [universitySettings, useUniversitySettings])

  const fetchCollegeData = async () => {
    if (!id) return
    setLoadingData(true)
    setError('')
    try {
      const { data, error: fetchError } = await supabase
        .from('colleges')
        .select('*')
        .eq('id', id)
        .single()

      if (fetchError) throw fetchError

      if (data) {
        // Populate form with existing college data
        setFormData(prev => ({
          ...prev,
          code: data.code || '',
          name_en: data.name_en || '',
          name_ar: data.name_ar || '',
          type: data.type || '',
          description_en: data.description_en || '',
          description_ar: data.description_ar || '',
          abbreviation: data.abbreviation || '',
          official_email: data.official_email || '',
          phone_number: data.phone_number || '',
          website_url: data.website_url || '',
          address_en: data.address_en || '',
          address_ar: data.address_ar || '',
          logo_url: data.logo_url || '',
          primary_color: data.primary_color || '#952562',
          secondary_color: data.secondary_color || '#E82B5E',
          dean_name: data.dean_name || '',
          dean_email: data.dean_email || '',
          dean_phone: data.dean_phone || '',
          contact_email: data.contact_email || '',
          contact_phone: data.contact_phone || '',
          building: data.building || '',
          floor: data.floor || '',
          room_number: data.room_number || '',
          location_description: data.location_description || '',
          vision: data.vision || '',
          mission: data.mission || '',
          established_date: data.established_date || '',
          accreditation_info: data.accreditation_info || '',
          student_id_prefix: data.student_id_prefix || '',
          student_id_format: data.student_id_format || '{prefix}{year}{sequence:D4}',
          student_id_starting_number: data.student_id_starting_number || 1,
          instructor_id_prefix: data.instructor_id_prefix || 'INS',
          instructor_id_format: data.instructor_id_format || '{prefix}{year}{sequence:D4}',
          instructor_id_starting_number: data.instructor_id_starting_number || 1,
          default_language: data.default_language || 'en',
          timezone: data.timezone || 'UTC',
          use_university_settings: data.use_university_settings || false,
        }))

        // Set checkbox based on college data
        setUseUniversitySettings(data.use_university_settings || false)

        // Always load settings from JSONB fields (settings are always saved per college)
        if (data.academic_settings) {
          const academic = data.academic_settings
          // creditHours and gradingScale come from University Settings - not loaded per college
          if (academic.gpa) {
            setFormData(prev => ({
              ...prev,
              min_passing_gpa: academic.gpa.minPassing || prev.min_passing_gpa,
              max_gpa_scale: academic.gpa.maxScale || prev.max_gpa_scale,
              honor_roll_min_gpa: academic.gpa.honorRollMin || prev.honor_roll_min_gpa,
              probation_threshold: academic.gpa.probationThreshold || prev.probation_threshold,
            }))
          }
          if (academic.attendance) {
            const att = academic.attendance
            setFormData(prev => ({
              ...prev,
              attendance_required: att.required ?? prev.attendance_required,
              min_attendance_percentage: att.minPercentage || prev.min_attendance_percentage,
              attendance_warning_threshold: att.warningThreshold || prev.attendance_warning_threshold,
              max_absence_days: att.maxAbsenceDays || prev.max_absence_days,
              present_weight: att.presentWeight || prev.present_weight,
              late_weight: att.lateWeight || prev.late_weight,
              excused_weight: att.excusedWeight || prev.excused_weight,
              count_excused_in_rate: att.countExcusedInRate ?? prev.count_excused_in_rate,
              count_late_as_full: att.countLateAsFull ?? prev.count_late_as_full,
              enable_warnings: att.enableWarnings ?? prev.enable_warnings,
              send_notifications: att.sendNotifications ?? prev.send_notifications,
              enforce_max_absence: att.enforceMaxAbsence ?? prev.enforce_max_absence,
              create_alert_at_max: att.createAlertAtMax ?? prev.create_alert_at_max,
              edit_window_hours: att.editWindowHours || prev.edit_window_hours,
              require_approval_after_window: att.requireApprovalAfterWindow ?? prev.require_approval_after_window,
              allow_instructor_override: att.allowInstructorOverride ?? prev.allow_instructor_override,
              late_arrival_grace_minutes: att.lateArrivalGraceMinutes || prev.late_arrival_grace_minutes,
              late_arrival_cutoff_minutes: att.lateArrivalCutoffMinutes || prev.late_arrival_cutoff_minutes,
              early_departure_minutes: att.earlyDepartureMinutes || prev.early_departure_minutes,
              contest_deadline_days: att.contestDeadlineDays || prev.contest_deadline_days,
              contest_review_deadline_days: att.contestReviewDeadlineDays || prev.contest_review_deadline_days,
              max_contest_document_size_mb: att.maxContestDocumentSizeMB || prev.max_contest_document_size_mb,
              auto_reject_expired: att.autoRejectExpired ?? prev.auto_reject_expired,
              require_document_for_contests: att.requireDocumentForContests ?? prev.require_document_for_contests,
              default_upcoming_sessions_days: att.defaultUpcomingSessionsDays || prev.default_upcoming_sessions_days,
              max_upcoming_sessions_days: att.maxUpcomingSessionsDays || prev.max_upcoming_sessions_days,
              auto_exclude_weekends: att.autoExcludeWeekends ?? prev.auto_exclude_weekends,
              auto_drop_enabled: att.autoDropEnabled ?? prev.auto_drop_enabled,
              auto_drop_threshold: att.autoDropThreshold || prev.auto_drop_threshold,
            }))
          }
          if (academic.courseRegistration) {
            setFormData(prev => ({
              ...prev,
              enable_prerequisite_checking: academic.courseRegistration.enablePrerequisiteChecking ?? prev.enable_prerequisite_checking,
              allow_waitlist: academic.courseRegistration.allowWaitlist ?? prev.allow_waitlist,
              add_drop_period_days: academic.courseRegistration.addDropPeriodDays || prev.add_drop_period_days,
            }))
          }
        }

        // Load Financial settings
        if (data.financial_settings) {
          const financial = data.financial_settings
          if (typeof financial.payments_enabled === 'boolean') {
            setFormData(prev => ({ ...prev, payments_enabled: financial.payments_enabled }))
          }
          if (financial.paymentGateway) {
            setFormData(prev => ({
              ...prev,
              tap_api_key: financial.paymentGateway.tapApiKey || prev.tap_api_key,
              tap_secret_key: financial.paymentGateway.tapSecretKey || prev.tap_secret_key,
              test_mode: financial.paymentGateway.testMode ?? prev.test_mode,
            }))
          }
          if (financial.discounts) {
            setFormData(prev => ({
              ...prev,
              enable_early_payment_discount: financial.discounts.enableEarlyPayment ?? prev.enable_early_payment_discount,
              early_payment_percent: financial.discounts.earlyPaymentPercent || prev.early_payment_percent,
              early_payment_days: financial.discounts.earlyPaymentDays || prev.early_payment_days,
              enable_sibling_discount: financial.discounts.enableSibling ?? prev.enable_sibling_discount,
              sibling_discount_percent: financial.discounts.siblingDiscountPercent || prev.sibling_discount_percent,
            }))
          }
          if (financial.lateFees) {
            setFormData(prev => ({
              ...prev,
              enable_late_fees: financial.lateFees.enabled ?? prev.enable_late_fees,
              late_fee_amount: financial.lateFees.amount || prev.late_fee_amount,
              late_fee_percentage: financial.lateFees.percentage || prev.late_fee_percentage,
              grace_period_days: financial.lateFees.gracePeriodDays || prev.grace_period_days,
            }))
          }
          if (financial.installments) {
            setFormData(prev => ({
              ...prev,
              min_installments: financial.installments.minInstallments || prev.min_installments,
              max_installments: financial.installments.maxInstallments || prev.max_installments,
            }))
          }
          if (financial.reminders) {
            setFormData(prev => ({
              ...prev,
              reminder_days_before_due: financial.reminders.daysBeforeDue || prev.reminder_days_before_due,
              min_days_between_reminders: financial.reminders.minDaysBetween || prev.min_days_between_reminders,
              upcoming_due_window: financial.reminders.upcomingDueWindow || prev.upcoming_due_window,
            }))
          }
          if (financial.invoice) {
            setFormData(prev => ({
              ...prev,
              invoice_prefix: financial.invoice.prefix || prev.invoice_prefix,
              invoice_format: financial.invoice.format || prev.invoice_format,
              invoice_due_days: financial.invoice.dueDays || prev.invoice_due_days,
            }))
          }
          if (financial.currency) {
            setFormData(prev => ({
              ...prev,
              currency_code: financial.currency.code || prev.currency_code,
              currency_symbol: financial.currency.symbol || prev.currency_symbol,
              decimal_places: financial.currency.decimalPlaces || prev.decimal_places,
            }))
          }
          if (financial.refund) {
            setFormData(prev => ({
              ...prev,
              allow_refunds: financial.refund.allowRefunds ?? prev.allow_refunds,
              full_refund_period_days: financial.refund.fullRefundPeriodDays || prev.full_refund_period_days,
              partial_refund_period_days: financial.refund.partialRefundPeriodDays || prev.partial_refund_period_days,
              partial_refund_percent: financial.refund.partialRefundPercent || prev.partial_refund_percent,
            }))
          }
        }

        // Load Email settings
        if (data.email_settings) {
          const email = data.email_settings
          if (email.smtp) {
            setFormData(prev => ({
              ...prev,
              smtp_host: email.smtp.host || prev.smtp_host,
              smtp_port: email.smtp.port || prev.smtp_port,
              enable_ssl: email.smtp.enableSsl ?? prev.enable_ssl,
              smtp_username: email.smtp.username || prev.smtp_username,
              smtp_password: email.smtp.password || prev.smtp_password,
              from_email: email.smtp.fromEmail || prev.from_email,
              from_name: email.smtp.fromName || prev.from_name,
            }))
          }
          setFormData(prev => ({
            ...prev,
            enable_email_notifications:
              email.notifications?.enableEmailNotifications ??
              email.enable_email_notifications ??
              prev.enable_email_notifications,
            test_email_address:
              email.testEmail || email.test_email_address || prev.test_email_address,
          }))
        }

        // Load Onboarding settings
        if (data.onboarding_settings) {
          const onboarding = data.onboarding_settings
          if (onboarding.application) {
            const app = onboarding.application
            setFormData(prev => ({
              ...prev,
              enable_online_applications: app.enableOnlineApplications ?? prev.enable_online_applications,
              application_deadline_days: app.deadlineDays || prev.application_deadline_days,
              require_document_upload: app.requireDocumentUpload ?? prev.require_document_upload,
              application_fee: app.applicationFee || prev.application_fee,
              offer_acceptance_days: app.offerAcceptanceDays || prev.offer_acceptance_days,
              document_submission_days: app.documentSubmissionDays || prev.document_submission_days,
              auto_archive_days: app.autoArchiveDays || prev.auto_archive_days,
              min_applicant_age: app.minApplicantAge || prev.min_applicant_age,
              max_applicant_age: app.maxApplicantAge || prev.max_applicant_age,
              min_scholarship_percent: app.minScholarshipPercent || prev.min_scholarship_percent,
              max_scholarship_percent: app.maxScholarshipPercent || prev.max_scholarship_percent,
              personal_statement_min_length: app.personalStatementMinLength || prev.personal_statement_min_length,
              personal_statement_max_length: app.personalStatementMaxLength || prev.personal_statement_max_length,
              scholarship_justification_min_length: app.scholarshipJustificationMinLength || prev.scholarship_justification_min_length,
              scholarship_justification_max_length: app.scholarshipJustificationMaxLength || prev.scholarship_justification_max_length,
              default_priority: app.defaultPriority || prev.default_priority,
              default_interview_type: app.defaultInterviewType || prev.default_interview_type,
            }))
          }
          if (onboarding.documents) {
            setFormData(prev => ({
              ...prev,
              max_document_size_mb: onboarding.documents.maxSizeMB || prev.max_document_size_mb,
              allowed_file_types: onboarding.documents.allowedTypes || prev.allowed_file_types,
            }))
          }
          if (onboarding.committee) {
            setFormData(prev => ({
              ...prev,
              min_committee_members: onboarding.committee.minMembers || prev.min_committee_members,
              require_unanimous: onboarding.committee.requireUnanimous ?? prev.require_unanimous,
              decision_timeout_days: onboarding.committee.decisionTimeoutDays || prev.decision_timeout_days,
            }))
          }
        }

        // Load System settings
        if (data.system_settings) {
          const system = data.system_settings
          if (system.security) {
            setFormData(prev => ({
              ...prev,
              session_timeout_minutes: system.security.sessionTimeoutMinutes || prev.session_timeout_minutes,
              password_expiry_days: system.security.passwordExpiryDays || prev.password_expiry_days,
              max_login_attempts: system.security.maxLoginAttempts || prev.max_login_attempts,
              account_lockout_minutes: system.security.accountLockoutMinutes || prev.account_lockout_minutes,
              enable_two_factor: system.security.enableTwoFactor ?? prev.enable_two_factor,
            }))
          }
          if (system.fileUpload) {
            setFormData(prev => ({
              ...prev,
              max_file_upload_size_mb: system.fileUpload.maxSizeMB || prev.max_file_upload_size_mb,
              storage_provider: system.fileUpload.storageProvider || prev.storage_provider,
            }))
          }
          if (system.maintenance) {
            setFormData(prev => ({
              ...prev,
              maintenance_enabled: system.maintenance.enabled ?? prev.maintenance_enabled,
              maintenance_message: system.maintenance.message || prev.maintenance_message,
            }))
          }
          if (system.backup) {
            setFormData(prev => ({
              ...prev,
              backup_enabled: system.backup.enabled ?? prev.backup_enabled,
              backup_retention_days: system.backup.retentionDays || prev.backup_retention_days,
              backup_schedule: system.backup.schedule || prev.backup_schedule,
            }))
          }
          if (system.localization) {
            setFormData(prev => ({
              ...prev,
              default_language: system.localization.defaultLanguage || prev.default_language,
              timezone: system.localization.timezone || prev.timezone,
              auto_detect_language: system.localization.autoDetectLanguage ?? prev.auto_detect_language,
              enable_rtl:
                system.localization.enableRTL ??
                system.localization.enableRtlSupport ??
                prev.enable_rtl,
            }))
          }
        }

        // Load Examination settings
        if (data.examination_settings) {
          const exam = data.examination_settings
          if (exam.grading) {
            setFormData(prev => ({
              ...prev,
              min_passing_percentage: exam.grading.minPassingPercentage || prev.min_passing_percentage,
              min_passing_grade_points: exam.grading.minPassingGradePoints || prev.min_passing_grade_points,
              min_excellence_percentage: exam.grading.minExcellencePercentage || prev.min_excellence_percentage,
              min_good_percentage: exam.grading.minGoodPercentage || prev.min_good_percentage,
            }))
          }
          if (exam.examTypes) {
            setFormData(prev => ({
              ...prev,
              default_midterm_weight: exam.examTypes.defaultMidtermWeight || prev.default_midterm_weight,
              default_final_weight: exam.examTypes.defaultFinalWeight || prev.default_final_weight,
              default_quiz_weight: exam.examTypes.defaultQuizWeight || prev.default_quiz_weight,
              default_assignment_weight: exam.examTypes.defaultAssignmentWeight || prev.default_assignment_weight,
              enforce_weight_sum_100: exam.examTypes.enforceWeightSum100 ?? prev.enforce_weight_sum_100,
              allow_custom_exam_types: exam.examTypes.allowCustomTypes ?? prev.allow_custom_exam_types,
            }))
          }
          if (exam.scheduling) {
            setFormData(prev => ({
              ...prev,
              exam_schedule_generation_window_days: exam.scheduling.generationWindowDays || prev.exam_schedule_generation_window_days,
              default_upcoming_exams_window_days: exam.scheduling.defaultUpcomingExamsWindowDays || prev.default_upcoming_exams_window_days,
              min_preparation_days: exam.scheduling.minPreparationDays || prev.min_preparation_days,
              max_exams_per_day: exam.scheduling.maxExamsPerDay || prev.max_exams_per_day,
              allow_weekend_exams: exam.scheduling.allowWeekendExams ?? prev.allow_weekend_exams,
              allow_overlapping_exams: exam.scheduling.allowOverlappingExams ?? prev.allow_overlapping_exams,
            }))
          }
          if (exam.makeup) {
            setFormData(prev => ({
              ...prev,
              allow_makeup_exams: exam.makeup.allowMakeupExams ?? prev.allow_makeup_exams,
              makeup_request_deadline_days: exam.makeup.requestDeadlineDays || prev.makeup_request_deadline_days,
              max_makeup_attempts: exam.makeup.maxAttempts || prev.max_makeup_attempts,
              makeup_exam_penalty_percentage: exam.makeup.penaltyPercentage || prev.makeup_exam_penalty_percentage,
            }))
          }
          if (exam.roomAllocation) {
            setFormData(prev => ({
              ...prev,
              require_room_allocation: exam.roomAllocation.requireRoomAllocation ?? prev.require_room_allocation,
              students_per_room: exam.roomAllocation.studentsPerRoom || prev.students_per_room,
              social_distancing_capacity_percent: exam.roomAllocation.socialDistancingCapacityPercent || prev.social_distancing_capacity_percent,
              enforce_social_distancing: exam.roomAllocation.enforceSocialDistancing ?? prev.enforce_social_distancing,
            }))
          }
          if (exam.invigilator) {
            setFormData(prev => ({
              ...prev,
              require_invigilators: exam.invigilator.requireInvigilators ?? prev.require_invigilators,
              min_invigilators_per_room: exam.invigilator.minInvigilatorsPerRoom || prev.min_invigilators_per_room,
              max_invigilator_assignments_per_day: exam.invigilator.maxAssignmentsPerDay || prev.max_invigilator_assignments_per_day,
              students_per_invigilator: exam.invigilator.studentsPerInvigilator || prev.students_per_invigilator,
            }))
          }
          if (exam.conflictDetection) {
            setFormData(prev => ({
              ...prev,
              enable_conflict_detection: exam.conflictDetection.enabled ?? prev.enable_conflict_detection,
              check_student_conflicts: exam.conflictDetection.checkStudentConflicts ?? prev.check_student_conflicts,
              check_invigilator_conflicts: exam.conflictDetection.checkInvigilatorConflicts ?? prev.check_invigilator_conflicts,
              check_room_conflicts: exam.conflictDetection.checkRoomConflicts ?? prev.check_room_conflicts,
            }))
          }
        }
      }
    } catch (err) {
      console.error('Error fetching college:', err)
      setError(err.message || 'Failed to load college data')
    } finally {
      setLoadingData(false)
    }
  }

  const fetchCollegeTypes = async () => {
    try {
      const { data, error } = await supabase
        .from('university_settings')
        .select('college_types')
        .order('updated_at', { ascending: false })
        .limit(1)

      if (error) {
        console.error('Error fetching college types:', error)
        return
      }

      if (data && data.length > 0 && data[0].college_types && Array.isArray(data[0].college_types)) {
        setCollegeTypes(data[0].college_types)
      }
    } catch (err) {
      console.error('Error fetching college types:', err)
    }
  }

  const fetchUniversitySettings = async () => {
    setLoadingUniversitySettings(true)
    try {
      const { data, error } = await supabase
        .from('university_settings')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1)

      if (error) {
        console.error('Error fetching university settings:', error)
        setError('Failed to load university settings')
        setUseUniversitySettings(false)
        return
      }

      if (data && data.length > 0) {
        setUniversitySettings(data[0])
        // Update college types if available
        if (data[0].college_types && Array.isArray(data[0].college_types)) {
          setCollegeTypes(data[0].college_types)
        }
      } else {
        setError('No university settings found. Please configure university settings first.')
        setUseUniversitySettings(false)
      }
    } catch (err) {
      console.error('Error fetching university settings:', err)
      setError('Failed to load university settings')
      setUseUniversitySettings(false)
    } finally {
      setLoadingUniversitySettings(false)
    }
  }

  const autoFillFromUniversitySettings = () => {
    if (!universitySettings) return

    setFormData(prev => {
      const newData = { ...prev }
      
      // Auto-fill Academic settings
      if (universitySettings.academic_settings) {
        const academic = universitySettings.academic_settings
        // creditHours and gradingScale come from University Settings - not stored per college
        if (academic.gpa) {
          newData.min_passing_gpa = academic.gpa.minPassing || newData.min_passing_gpa
          newData.max_gpa_scale = academic.gpa.maxScale || newData.max_gpa_scale
          newData.honor_roll_min_gpa = academic.gpa.honorRollMin || newData.honor_roll_min_gpa
          newData.probation_threshold = academic.gpa.probationThreshold || newData.probation_threshold
        }
        if (academic.attendance) {
          const att = academic.attendance
          newData.attendance_required = att.required ?? newData.attendance_required
          newData.min_attendance_percentage = att.minPercentage || newData.min_attendance_percentage
          newData.attendance_warning_threshold = att.warningThreshold || newData.attendance_warning_threshold
          newData.max_absence_days = att.maxAbsenceDays || newData.max_absence_days
          newData.present_weight = att.presentWeight || newData.present_weight
          newData.late_weight = att.lateWeight || newData.late_weight
          newData.excused_weight = att.excusedWeight || newData.excused_weight
          newData.count_excused_in_rate = att.countExcusedInRate ?? newData.count_excused_in_rate
          newData.count_late_as_full = att.countLateAsFull ?? newData.count_late_as_full
          newData.enable_warnings = att.enableWarnings ?? newData.enable_warnings
          newData.send_notifications = att.sendNotifications ?? newData.send_notifications
          newData.enforce_max_absence = att.enforceMaxAbsence ?? newData.enforce_max_absence
          newData.create_alert_at_max = att.createAlertAtMax ?? newData.create_alert_at_max
          newData.edit_window_hours = att.editWindowHours || newData.edit_window_hours
          newData.require_approval_after_window = att.requireApprovalAfterWindow ?? newData.require_approval_after_window
          newData.allow_instructor_override = att.allowInstructorOverride ?? newData.allow_instructor_override
          newData.late_arrival_grace_minutes = att.lateArrivalGraceMinutes || newData.late_arrival_grace_minutes
          newData.late_arrival_cutoff_minutes = att.lateArrivalCutoffMinutes || newData.late_arrival_cutoff_minutes
          newData.early_departure_minutes = att.earlyDepartureMinutes || newData.early_departure_minutes
          newData.contest_deadline_days = att.contestDeadlineDays || newData.contest_deadline_days
          newData.contest_review_deadline_days = att.contestReviewDeadlineDays || newData.contest_review_deadline_days
          newData.max_contest_document_size_mb = att.maxContestDocumentSizeMB || newData.max_contest_document_size_mb
          newData.auto_reject_expired = att.autoRejectExpired ?? newData.auto_reject_expired
          newData.require_document_for_contests = att.requireDocumentForContests ?? newData.require_document_for_contests
          newData.default_upcoming_sessions_days = att.defaultUpcomingSessionsDays || newData.default_upcoming_sessions_days
          newData.max_upcoming_sessions_days = att.maxUpcomingSessionsDays || newData.max_upcoming_sessions_days
          newData.auto_exclude_weekends = att.autoExcludeWeekends ?? newData.auto_exclude_weekends
          newData.auto_drop_enabled = att.autoDropEnabled ?? newData.auto_drop_enabled
          newData.auto_drop_threshold = att.autoDropThreshold || newData.auto_drop_threshold
        }
        if (academic.courseRegistration) {
          newData.enable_prerequisite_checking = academic.courseRegistration.enablePrerequisiteChecking ?? newData.enable_prerequisite_checking
          newData.allow_waitlist = academic.courseRegistration.allowWaitlist ?? newData.allow_waitlist
          newData.add_drop_period_days = academic.courseRegistration.addDropPeriodDays || newData.add_drop_period_days
        }
      }

      // Auto-fill Financial settings
      if (universitySettings.financial_settings) {
        const financial = universitySettings.financial_settings
        if (typeof financial.payments_enabled === 'boolean') {
          newData.payments_enabled = financial.payments_enabled
        }
        if (financial.paymentGateway) {
          newData.tap_api_key = financial.paymentGateway.tapApiKey || newData.tap_api_key
          newData.tap_secret_key = financial.paymentGateway.tapSecretKey || newData.tap_secret_key
          newData.test_mode = financial.paymentGateway.testMode ?? newData.test_mode
        }
        if (financial.discounts) {
          newData.enable_early_payment_discount = financial.discounts.enableEarlyPayment ?? newData.enable_early_payment_discount
          newData.early_payment_percent = financial.discounts.earlyPaymentPercent || newData.early_payment_percent
          newData.early_payment_days = financial.discounts.earlyPaymentDays || newData.early_payment_days
          newData.enable_sibling_discount = financial.discounts.enableSibling ?? newData.enable_sibling_discount
          newData.sibling_discount_percent = financial.discounts.siblingPercent || newData.sibling_discount_percent
        }
        if (financial.lateFees) {
          newData.enable_late_fees = financial.lateFees.enabled ?? newData.enable_late_fees
          newData.late_fee_amount = financial.lateFees.amount || newData.late_fee_amount
          newData.late_fee_percentage = financial.lateFees.percentage || newData.late_fee_percentage
          newData.grace_period_days = financial.lateFees.gracePeriodDays || newData.grace_period_days
        }
        if (financial.installments) {
          newData.min_installments = financial.installments.minInstallments || newData.min_installments
          newData.max_installments = financial.installments.maxInstallments || newData.max_installments
        }
        if (financial.reminders) {
          newData.reminder_days_before_due = financial.reminders.daysBeforeDue || newData.reminder_days_before_due
          newData.min_days_between_reminders = financial.reminders.minDaysBetween || newData.min_days_between_reminders
          newData.upcoming_due_window = financial.reminders.upcomingDueWindow || newData.upcoming_due_window
        }
        if (financial.invoice) {
          newData.invoice_prefix = financial.invoice.prefix || newData.invoice_prefix
          newData.invoice_format = financial.invoice.format || newData.invoice_format
          newData.invoice_due_days = financial.invoice.dueDays || newData.invoice_due_days
        }
        if (financial.currency) {
          newData.currency_code = financial.currency.code || newData.currency_code
          newData.currency_symbol = financial.currency.symbol || newData.currency_symbol
          newData.decimal_places = financial.currency.decimalPlaces || newData.decimal_places
        }
        if (financial.refund) {
          newData.allow_refunds = financial.refund.allowRefunds ?? newData.allow_refunds
          newData.full_refund_period_days = financial.refund.fullRefundPeriodDays || newData.full_refund_period_days
          newData.partial_refund_period_days = financial.refund.partialRefundPeriodDays || newData.partial_refund_period_days
          newData.partial_refund_percent = financial.refund.partialRefundPercent || newData.partial_refund_percent
        }
      }

      // Auto-fill Email settings
      if (universitySettings.email_settings) {
        const email = universitySettings.email_settings
        if (email.smtp) {
          newData.smtp_host = email.smtp.host || newData.smtp_host
          newData.smtp_port = email.smtp.port || newData.smtp_port
          newData.enable_ssl = email.smtp.enableSsl ?? newData.enable_ssl
          newData.smtp_username = email.smtp.username || newData.smtp_username
          newData.smtp_password = email.smtp.password || newData.smtp_password
          newData.from_email = email.smtp.fromEmail || newData.from_email
          newData.from_name = email.smtp.fromName || newData.from_name
        } else if (email.smtp_host) {
          newData.smtp_host = email.smtp_host || newData.smtp_host
          newData.smtp_port = email.smtp_port || newData.smtp_port
          newData.enable_ssl = email.enable_ssl ?? newData.enable_ssl
          newData.smtp_username = email.smtp_username || newData.smtp_username
          newData.smtp_password = email.smtp_password || newData.smtp_password
          newData.from_email = email.from_email || newData.from_email
          newData.from_name = email.from_name || newData.from_name
        }
        newData.enable_email_notifications =
          email.notifications?.enableEmailNotifications ??
          email.enable_email_notifications ??
          newData.enable_email_notifications
        newData.test_email_address =
          email.testEmail || email.test_email_address || newData.test_email_address
      }

      // Auto-fill Onboarding settings
      if (universitySettings.onboarding_settings) {
        const onboarding = universitySettings.onboarding_settings
        if (onboarding.application) {
          const app = onboarding.application
          newData.enable_online_applications = app.enableOnlineApplications ?? newData.enable_online_applications
          newData.application_deadline_days = app.deadlineDays || newData.application_deadline_days
          newData.require_document_upload = app.requireDocumentUpload ?? newData.require_document_upload
          newData.application_fee = app.applicationFee || newData.application_fee
          newData.offer_acceptance_days = app.offerAcceptanceDays || newData.offer_acceptance_days
          newData.document_submission_days = app.documentSubmissionDays || newData.document_submission_days
          newData.auto_archive_days = app.autoArchiveDays || newData.auto_archive_days
          newData.min_applicant_age = app.minApplicantAge || newData.min_applicant_age
          newData.max_applicant_age = app.maxApplicantAge || newData.max_applicant_age
          newData.min_scholarship_percent = app.minScholarshipPercent || newData.min_scholarship_percent
          newData.max_scholarship_percent = app.maxScholarshipPercent || newData.max_scholarship_percent
          newData.personal_statement_min_length = app.personalStatementMinLength || newData.personal_statement_min_length
          newData.personal_statement_max_length = app.personalStatementMaxLength || newData.personal_statement_max_length
          newData.scholarship_justification_min_length = app.scholarshipJustificationMinLength || newData.scholarship_justification_min_length
          newData.scholarship_justification_max_length = app.scholarshipJustificationMaxLength || newData.scholarship_justification_max_length
          newData.default_priority = app.defaultPriority || newData.default_priority
          newData.default_interview_type = app.defaultInterviewType || newData.default_interview_type
        }
        if (onboarding.documents) {
          newData.max_document_size_mb = onboarding.documents.maxSizeMB || newData.max_document_size_mb
          newData.allowed_file_types = onboarding.documents.allowedTypes || newData.allowed_file_types
        }
        if (onboarding.committee) {
          newData.min_committee_members = onboarding.committee.minMembers || newData.min_committee_members
          newData.require_unanimous = onboarding.committee.requireUnanimous ?? newData.require_unanimous
          newData.decision_timeout_days = onboarding.committee.decisionTimeoutDays || newData.decision_timeout_days
        }
      }

      // Auto-fill System settings
      if (universitySettings.system_settings) {
        const system = universitySettings.system_settings
        if (system.security) {
          newData.session_timeout_minutes = system.security.sessionTimeoutMinutes || newData.session_timeout_minutes
          newData.password_expiry_days = system.security.passwordExpiryDays || newData.password_expiry_days
          newData.max_login_attempts = system.security.maxLoginAttempts || newData.max_login_attempts
          newData.account_lockout_minutes = system.security.accountLockoutMinutes || newData.account_lockout_minutes
          newData.enable_two_factor = system.security.enableTwoFactor ?? newData.enable_two_factor
        }
        if (system.fileUpload) {
          newData.max_file_upload_size_mb = system.fileUpload.maxSizeMB || newData.max_file_upload_size_mb
          newData.storage_provider = system.fileUpload.storageProvider || newData.storage_provider
        }
        if (system.maintenance) {
          newData.maintenance_enabled = system.maintenance.enabled ?? newData.maintenance_enabled
          newData.maintenance_message = system.maintenance.message || newData.maintenance_message
        }
        if (system.backup) {
          newData.backup_enabled = system.backup.enabled ?? newData.backup_enabled
          newData.backup_retention_days = system.backup.retentionDays || newData.backup_retention_days
          newData.backup_schedule = system.backup.schedule || newData.backup_schedule
        }
        if (system.localization) {
          newData.auto_detect_language = system.localization.autoDetectUserLanguage ?? newData.auto_detect_language
          newData.enable_rtl = system.localization.enableRtlSupport ?? newData.enable_rtl
        }
      }

      // Auto-fill Examination settings
      if (universitySettings.examination_settings) {
        const exam = universitySettings.examination_settings
        newData.min_passing_percentage = exam.min_passing_percentage || newData.min_passing_percentage
        newData.min_passing_grade_points = exam.min_passing_grade_points || newData.min_passing_grade_points
        newData.min_excellence_percentage = exam.min_excellence_percentage || newData.min_excellence_percentage
        newData.min_good_percentage = exam.min_good_percentage || newData.min_good_percentage
        newData.default_midterm_weight = exam.default_midterm_weight || newData.default_midterm_weight
        newData.default_final_weight = exam.default_final_weight || newData.default_final_weight
        newData.default_quiz_weight = exam.default_quiz_weight || newData.default_quiz_weight
        newData.default_assignment_weight = exam.default_assignment_weight || newData.default_assignment_weight
        newData.enforce_weight_sum_100 = exam.enforce_weight_sum_100 ?? newData.enforce_weight_sum_100
        newData.allow_custom_exam_types = exam.allow_custom_exam_types ?? newData.allow_custom_exam_types
        newData.exam_schedule_generation_window_days = exam.exam_schedule_generation_window_days || newData.exam_schedule_generation_window_days
        newData.default_upcoming_exams_window_days = exam.default_upcoming_exams_window_days || newData.default_upcoming_exams_window_days
        newData.min_preparation_days = exam.min_preparation_days || newData.min_preparation_days
        newData.max_exams_per_day = exam.max_exams_per_day || newData.max_exams_per_day
        newData.allow_weekend_exams = exam.allow_weekend_exams ?? newData.allow_weekend_exams
        newData.allow_overlapping_exams = exam.allow_overlapping_exams ?? newData.allow_overlapping_exams
        newData.allow_makeup_exams = exam.allow_makeup_exams ?? newData.allow_makeup_exams
        newData.makeup_request_deadline_days = exam.makeup_request_deadline_days || newData.makeup_request_deadline_days
        newData.max_makeup_attempts = exam.max_makeup_attempts || newData.max_makeup_attempts
        newData.require_room_allocation = exam.require_room_allocation ?? newData.require_room_allocation
        newData.students_per_room = exam.students_per_room || newData.students_per_room
        newData.social_distancing_capacity_percent = exam.social_distancing_capacity_percentage || newData.social_distancing_capacity_percent
        newData.enforce_social_distancing = exam.enforce_social_distancing ?? newData.enforce_social_distancing
        newData.require_invigilators = exam.require_invigilators ?? newData.require_invigilators
        newData.min_invigilators_per_room = exam.min_invigilators_per_room || newData.min_invigilators_per_room
        newData.max_invigilator_assignments_per_day = exam.max_invigilator_assignments_per_day || newData.max_invigilator_assignments_per_day
        newData.students_per_invigilator = exam.students_per_invigilator || newData.students_per_invigilator
        newData.enable_conflict_detection = exam.enable_conflict_detection ?? newData.enable_conflict_detection
        newData.check_student_conflicts = exam.check_student_conflicts ?? newData.check_student_conflicts
        newData.check_invigilator_conflicts = exam.check_invigilator_conflicts ?? newData.check_invigilator_conflicts
        newData.check_room_conflicts = exam.check_room_conflicts ?? newData.check_room_conflicts
      }

      return newData
    })
  }

  const [formData, setFormData] = useState({
    // General
    code: '',
    name_en: '',
    name_ar: '',
    type: '',
    description_en: '',
    description_ar: '',
    abbreviation: '',
    official_email: '',
    phone_number: '',
    website_url: '',
    address_en: '',
    address_ar: '',
    logo_url: '',
    primary_color: '#952562',
    secondary_color: '#E82B5E',
    // Contact
    dean_name: '',
    dean_email: '',
    dean_phone: '',
    contact_email: '',
    contact_phone: '',
    // College Admin Account
    create_admin_account: true,
    admin_email: '',
    admin_password: '',
    admin_name: '',
    admin_menu_permissions: [
      'dashboard',
      'academicYears',
      'semesters',
      'departments',
      'majors',
      'subjects',
      'sessions',
      'enrollments',
      'students',
      'instructors',
      'schedule',
      'examinations',
      'attendance',
      'gradingManagement',
      'financeAffairs',
      'admissions',
      'studentRequests',
      'settings',
    ],
    // Location
    building: '',
    floor: '',
    room_number: '',
    location_description: '',
    // Vision & Mission
    vision: '',
    mission: '',
    // Additional
    established_date: '',
    accreditation_info: '',
    student_id_prefix: '',
    student_id_format: '{prefix}{year}{sequence:D4}',
    student_id_starting_number: 1,
    instructor_id_prefix: 'INS',
    instructor_id_format: '{prefix}{year}{sequence:D4}',
    instructor_id_starting_number: 1,
    default_language: 'en',
    timezone: 'UTC',
    
    // Academic
    min_credit_hours: 12,
    max_credit_hours: 18,
    max_with_permission: 21,
    min_gpa_for_overload: 3,
    min_passing_gpa: 2,
    max_gpa_scale: MAX_GPA_SCALE,
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
    payments_enabled: true,
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
    upcoming_due_window: 7,
    invoice_prefix: 'INV',
    invoice_format: '{prefix}-{year}-{sequence:D6}',
    invoice_due_days: 30,
    currency_code: 'USD',
    currency_symbol: '$',
    decimal_places: 2,
    allow_refunds: true,
    full_refund_period_days: 7,
    partial_refund_period_days: 30,
    partial_refund_percent: 50,

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
    min_scholarship_percent: 1,
    max_scholarship_percent: 100,
    personal_statement_min_length: 100,
    personal_statement_max_length: 2000,
    scholarship_justification_min_length: 50,
    scholarship_justification_max_length: 1000,
    default_priority: 'normal',
    default_interview_type: 'in_person',
    max_document_size_mb: 5,
    allowed_file_types: ['PDF', 'JPG', 'JPEG', 'PNG', 'DOC', 'DOCX'],
    min_committee_members: 3,
    require_unanimous: false,
    decision_timeout_days: 30,

    // System
    session_timeout_minutes: 30,
    password_expiry_days: 90,
    max_login_attempts: 5,
    account_lockout_minutes: 15,
    enable_two_factor: false,
    max_file_upload_size_mb: 10,
    storage_provider: 'local',
    maintenance_enabled: false,
    maintenance_message: '',
    backup_enabled: true,
    backup_retention_days: 30,
    backup_schedule: '0 2 * * *',
    auto_detect_language: true,
    enable_rtl: true,

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
    makeup_exam_penalty_percentage: 0,
    require_room_allocation: true,
    students_per_room: 30,
    social_distancing_capacity_percent: 50,
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

  const tabs = [
    { id: 'general', label: t('colleges.tabs.general'), icon: Building2 },
    { id: 'academic', label: t('colleges.tabs.academic'), icon: GraduationCap },
    { id: 'financial', label: t('colleges.tabs.financial'), icon: DollarSign },
    { id: 'email', label: t('colleges.tabs.email'), icon: Mail },
    { id: 'onboarding', label: t('colleges.tabs.onboarding'), icon: UserPlus },
    { id: 'system', label: t('colleges.tabs.system'), icon: Settings },
    { id: 'examination', label: t('colleges.tabs.examination'), icon: FileText },
  ]

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleGradingScaleChange = (index, field, value) => {
    const newScale = [...formData.grading_scale]
    newScale[index] = { ...newScale[index], [field]: value }
    setFormData(prev => ({ ...prev, grading_scale: newScale }))
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
        scope: 'college',
        collegeId: isEditMode && id ? Number(id) : undefined,
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

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess(false)

    try {
      // Build settings JSONB objects
      // Note: Grading scale and semester credits come from University Settings only - not stored per college
      const academicSettings = {
        gpa: {
          minPassing: formData.min_passing_gpa,
          maxScale: formData.max_gpa_scale,
          honorRollMin: formData.honor_roll_min_gpa,
          probationThreshold: formData.probation_threshold,
        },
        attendance: {
          required: formData.attendance_required,
          minPercentage: formData.min_attendance_percentage,
          warningThreshold: formData.attendance_warning_threshold,
          maxAbsenceDays: formData.max_absence_days,
          presentWeight: formData.present_weight,
          lateWeight: formData.late_weight,
          excusedWeight: formData.excused_weight,
          countExcusedInRate: formData.count_excused_in_rate,
          countLateAsFull: formData.count_late_as_full,
          enableWarnings: formData.enable_warnings,
          sendNotifications: formData.send_notifications,
          enforceMaxAbsence: formData.enforce_max_absence,
          createAlertAtMax: formData.create_alert_at_max,
          editWindowHours: formData.edit_window_hours,
          requireApprovalAfterWindow: formData.require_approval_after_window,
          allowInstructorOverride: formData.allow_instructor_override,
          lateArrivalGraceMinutes: formData.late_arrival_grace_minutes,
          lateArrivalCutoffMinutes: formData.late_arrival_cutoff_minutes,
          earlyDepartureMinutes: formData.early_departure_minutes,
          contestDeadlineDays: formData.contest_deadline_days,
          contestReviewDeadlineDays: formData.contest_review_deadline_days,
          maxContestDocumentSizeMB: formData.max_contest_document_size_mb,
          autoRejectExpired: formData.auto_reject_expired,
          requireDocumentForContests: formData.require_document_for_contests,
          defaultUpcomingSessionsDays: formData.default_upcoming_sessions_days,
          maxUpcomingSessionsDays: formData.max_upcoming_sessions_days,
          autoExcludeWeekends: formData.auto_exclude_weekends,
          autoDropEnabled: formData.auto_drop_enabled,
          autoDropThreshold: formData.auto_drop_threshold,
        },
        courseRegistration: {
          enablePrerequisiteChecking: formData.enable_prerequisite_checking,
          allowWaitlist: formData.allow_waitlist,
          addDropPeriodDays: formData.add_drop_period_days,
        },
      }

      const financialSettings = {
        payments_enabled: formData.payments_enabled,
        paymentGateway: {
          tapApiKey: formData.tap_api_key,
          tapSecretKey: formData.tap_secret_key,
          testMode: formData.test_mode,
        },
        discounts: {
          enableEarlyPayment: formData.enable_early_payment_discount,
          earlyPaymentPercent: formData.early_payment_percent,
          earlyPaymentDays: formData.early_payment_days,
          enableSiblingDiscount: formData.enable_sibling_discount,
          siblingDiscountPercent: formData.sibling_discount_percent,
        },
        lateFees: {
          enabled: formData.enable_late_fees,
          amount: formData.late_fee_amount,
          percentage: formData.late_fee_percentage,
          gracePeriodDays: formData.grace_period_days,
        },
        installments: {
          minInstallments: formData.min_installments,
          maxInstallments: formData.max_installments,
        },
        reminders: {
          daysBeforeDue: formData.reminder_days_before_due,
          minDaysBetween: formData.min_days_between_reminders,
          upcomingDueWindow: formData.upcoming_due_window,
        },
        invoice: {
          prefix: formData.invoice_prefix,
          format: formData.invoice_format,
          dueDays: formData.invoice_due_days,
        },
        currency: {
          code: formData.currency_code,
          symbol: formData.currency_symbol,
          decimalPlaces: formData.decimal_places,
        },
        refund: {
          allowRefunds: formData.allow_refunds,
          fullRefundPeriodDays: formData.full_refund_period_days,
          partialRefundPeriodDays: formData.partial_refund_period_days,
          partialRefundPercent: formData.partial_refund_percent,
        },
      }

      const emailSettings = {
        smtp: {
          host: formData.smtp_host,
          port: formData.smtp_port,
          enableSsl: formData.enable_ssl,
          username: formData.smtp_username,
          password: formData.smtp_password,
          fromEmail: formData.from_email,
          fromName: formData.from_name,
        },
        notifications: {
          enableEmailNotifications: formData.enable_email_notifications,
        },
        testEmail: formData.test_email_address,
      }

      const onboardingSettings = {
        application: {
          enableOnlineApplications: formData.enable_online_applications,
          deadlineDays: formData.application_deadline_days,
          requireDocumentUpload: formData.require_document_upload,
          applicationFee: formData.application_fee,
          offerAcceptanceDays: formData.offer_acceptance_days,
          documentSubmissionDays: formData.document_submission_days,
          autoArchiveDays: formData.auto_archive_days,
          minApplicantAge: formData.min_applicant_age,
          maxApplicantAge: formData.max_applicant_age,
          minScholarshipPercent: formData.min_scholarship_percent,
          maxScholarshipPercent: formData.max_scholarship_percent,
          personalStatementMinLength: formData.personal_statement_min_length,
          personalStatementMaxLength: formData.personal_statement_max_length,
          scholarshipJustificationMinLength: formData.scholarship_justification_min_length,
          scholarshipJustificationMaxLength: formData.scholarship_justification_max_length,
          defaultPriority: formData.default_priority,
          defaultInterviewType: formData.default_interview_type,
        },
        documents: {
          maxSizeMB: formData.max_document_size_mb,
          allowedTypes: formData.allowed_file_types,
        },
        committee: {
          minMembers: formData.min_committee_members,
          requireUnanimous: formData.require_unanimous,
          decisionTimeoutDays: formData.decision_timeout_days,
        },
      }

      const systemSettings = {
        security: {
          sessionTimeoutMinutes: formData.session_timeout_minutes,
          passwordExpiryDays: formData.password_expiry_days,
          maxLoginAttempts: formData.max_login_attempts,
          accountLockoutMinutes: formData.account_lockout_minutes,
          enableTwoFactor: formData.enable_two_factor,
        },
        fileUpload: {
          maxSizeMB: formData.max_file_upload_size_mb,
          storageProvider: formData.storage_provider,
        },
        maintenance: {
          enabled: formData.maintenance_enabled,
          message: formData.maintenance_message,
        },
        backup: {
          enabled: formData.backup_enabled,
          retentionDays: formData.backup_retention_days,
          schedule: formData.backup_schedule,
        },
        localization: {
          defaultLanguage: formData.default_language,
          timezone: formData.timezone,
          autoDetectLanguage: formData.auto_detect_language,
          enableRTL: formData.enable_rtl,
        },
      }

      const examinationSettings = {
        grading: {
          minPassingPercentage: formData.min_passing_percentage,
          minPassingGradePoints: formData.min_passing_grade_points,
          minExcellencePercentage: formData.min_excellence_percentage,
          minGoodPercentage: formData.min_good_percentage,
        },
        examTypes: {
          defaultMidtermWeight: formData.default_midterm_weight,
          defaultFinalWeight: formData.default_final_weight,
          defaultQuizWeight: formData.default_quiz_weight,
          defaultAssignmentWeight: formData.default_assignment_weight,
          enforceWeightSum100: formData.enforce_weight_sum_100,
          allowCustomTypes: formData.allow_custom_exam_types,
        },
        scheduling: {
          generationWindowDays: formData.exam_schedule_generation_window_days,
          defaultUpcomingExamsWindowDays: formData.default_upcoming_exams_window_days,
          minPreparationDays: formData.min_preparation_days,
          maxExamsPerDay: formData.max_exams_per_day,
          allowWeekendExams: formData.allow_weekend_exams,
          allowOverlappingExams: formData.allow_overlapping_exams,
        },
        makeup: {
          allowMakeupExams: formData.allow_makeup_exams,
          requestDeadlineDays: formData.makeup_request_deadline_days,
          maxAttempts: formData.max_makeup_attempts,
          penaltyPercentage: formData.makeup_exam_penalty_percentage,
        },
        roomAllocation: {
          requireRoomAllocation: formData.require_room_allocation,
          studentsPerRoom: formData.students_per_room,
          socialDistancingCapacityPercent: formData.social_distancing_capacity_percent,
          enforceSocialDistancing: formData.enforce_social_distancing,
        },
        invigilator: {
          requireInvigilators: formData.require_invigilators,
          minInvigilatorsPerRoom: formData.min_invigilators_per_room,
          maxAssignmentsPerDay: formData.max_invigilator_assignments_per_day,
          studentsPerInvigilator: formData.students_per_invigilator,
        },
        conflictDetection: {
          enabled: formData.enable_conflict_detection,
          checkStudentConflicts: formData.check_student_conflicts,
          checkInvigilatorConflicts: formData.check_invigilator_conflicts,
          checkRoomConflicts: formData.check_room_conflicts,
        },
      }

      const collegeData = {
        code: formData.code,
        name_en: formData.name_en,
        name_ar: formData.name_ar,
        type: formData.type || null,
        description_en: formData.description_en || null,
        description_ar: formData.description_ar || null,
        abbreviation: formData.abbreviation,
        official_email: formData.official_email,
        phone_number: formData.phone_number,
        website_url: formData.website_url,
        address_en: formData.address_en,
        address_ar: formData.address_ar,
        logo_url: formData.logo_url,
        primary_color: formData.primary_color,
        secondary_color: formData.secondary_color,
        student_id_prefix: formData.student_id_prefix,
        student_id_format: formData.student_id_format,
        student_id_starting_number: formData.student_id_starting_number,
        instructor_id_prefix: formData.instructor_id_prefix,
        instructor_id_format: formData.instructor_id_format,
        instructor_id_starting_number: formData.instructor_id_starting_number,
        dean_name: formData.dean_name || null,
        dean_email: formData.dean_email || null,
        dean_phone: formData.dean_phone || null,
        contact_email: formData.contact_email || null,
        contact_phone: formData.contact_phone || null,
        building: formData.building || null,
        floor: formData.floor || null,
        room_number: formData.room_number || null,
        location_description: formData.location_description || null,
        vision: formData.vision || null,
        mission: formData.mission || null,
        established_date: formData.established_date || null,
        accreditation_info: formData.accreditation_info || null,
        // Always save settings per college, even if university settings are used as defaults
        academic_settings: academicSettings,
        financial_settings: financialSettings,
        email_settings: emailSettings,
        onboarding_settings: onboardingSettings,
        system_settings: systemSettings,
        examination_settings: examinationSettings,
        use_university_settings: useUniversitySettings, // This flag indicates if university settings were used as defaults
      }

      let data
      if (isEditMode) {
        // Update existing college
        const { data: updateData, error: updateError } = await supabase
          .from('colleges')
          .update(collegeData)
          .eq('id', id)
          .select()
          .single()

        if (updateError) throw updateError
        data = updateData
      } else {
        // Create new college
        collegeData.status = 'active'
        const { data: insertData, error: insertError } = await supabase
          .from('colleges')
          .insert(collegeData)
          .select()
          .single()

        if (insertError) throw insertError
        data = insertData

        // New colleges automatically see university-wide content (academic years, semesters, departments, majors)
        // via query filters - no import/copy needed.

        // Create college admin login account if requested (only for new colleges)
        if (formData.create_admin_account !== false && formData.admin_password) {
          try {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const serviceRoleKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY
            
            // Try using Edge Function first
            try {
              // Use Supabase functions.invoke for proper CORS handling
              // Note: The function has verify_jwt = false, so anon key works
              const { data: functionResult, error: functionError } = await supabase.functions.invoke('create-auth-user', {
                body: {
                  email: formData.admin_email || formData.contact_email || formData.official_email || formData.dean_email,
                  password: formData.admin_password,
                  role: 'user',
                  college_id: data.id,
                  name: formData.admin_name || formData.dean_name || formData.name_en + ' Admin',
                  menu_permissions: formData.admin_menu_permissions?.length
                    ? formData.admin_menu_permissions
                    : null,
                },
              })

              if (functionError) {
                throw functionError
              }

              if (functionResult?.success) {
                console.log('✅ College admin account created successfully')
              } else {
                throw new Error(functionResult?.error || 'Unknown error')
              }
            } catch (edgeError) {
              console.warn('⚠️  Edge Function failed, trying direct method:', edgeError)
              // Fallback: Use service role key if available
              if (serviceRoleKey) {
                await createAdminAccountDirectly(data.id, formData, serviceRoleKey, supabaseUrl)
              } else {
                console.warn('⚠️  Service role key not available. Please create admin account manually using:')
                console.warn(`   npm run create:login college ${data.id} "${formData.admin_email || formData.contact_email || formData.official_email}" "${formData.admin_password}" "${formData.admin_name || formData.dean_name || formData.name_en + ' Admin'}"`)
              }
            }
          } catch (err) {
            console.error('Error creating admin account:', err)
            // Don't fail the college creation if account creation fails
          }
        }
      }

      setSuccess(true)
      setTimeout(() => {
        navigate('/admin/colleges')
      }, 2000)
    } catch (err) {
      setError(err.message || (isEditMode ? 'Failed to update college' : 'Failed to create college'))
    } finally {
      setLoading(false)
    }
  }


  // Due to length, I'll create a simplified version that shows the structure
  // The full form would have all sections. Let me create a more manageable component structure.
  
  if (loadingData) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600">{t('common.loading')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => navigate(-1)}
            className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} text-gray-600 hover:text-gray-900 mb-4`}
          >
            <ArrowLeft className="w-5 h-5" />
            <span>{t('colleges.back')}</span>
          </button>
          <h1 className="text-3xl font-bold text-gray-900">{isEditMode ? t('colleges.editCollege') : t('colleges.createNewCollege')}</h1>
          <p className="text-gray-600 mt-1">{isEditMode ? t('colleges.editSubtitle') : t('colleges.createSubtitle')}</p>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6">
          <div className="border-b border-gray-200">
            <nav className={`flex ${isRTL ? 'space-x-reverse space-x-1' : 'space-x-1'} px-6 overflow-x-auto`}>
              {tabs.map((tab) => {
                const Icon = tab.icon
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} px-4 py-4 border-b-2 transition-colors ${
                      activeTab === tab.id
                        ? 'border-primary-600 text-primary-600'
                        : 'border-transparent text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="font-medium whitespace-nowrap">{tab.label}</span>
                  </button>
                )
              })}
            </nav>
          </div>

          {/* Use University Settings Checkbox - At the top before tabs */}
          <div className="p-6 border-b border-gray-200">
            <div className="p-5 bg-blue-50 border border-blue-200 rounded-xl">
              <label className={`flex items-start ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-3'} cursor-pointer`}>
                <input
                  type="checkbox"
                  checked={useUniversitySettings}
                  onChange={(e) => {
                    setUseUniversitySettings(e.target.checked)
                    if (e.target.checked && !universitySettings) {
                      fetchUniversitySettings()
                    }
                  }}
                  className="mt-1 w-5 h-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <div>
                  <div className="text-sm font-semibold text-gray-900 mb-1">
                    {t('colleges.generalSettings.useUniversitySettings') || 'Use University Settings'}
                  </div>
                  <div className="text-xs text-gray-600">
                    {t('colleges.generalSettings.useUniversitySettingsDesc') || 'If checked, this college will use the university-wide settings instead of custom settings. When enabled, all settings will be fetched from university settings at runtime.'}
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Form Content */}
          <form onSubmit={handleSubmit}>
            <div className="p-6">
              {activeTab === 'general' && (
                <GeneralSettings 
                  formData={formData} 
                  handleChange={handleChange}
                  useUniversitySettings={useUniversitySettings}
                  setUseUniversitySettings={setUseUniversitySettings}
                  collegeTypes={collegeTypes}
                />
              )}
              {activeTab === 'academic' && (
                <div>
                  {useUniversitySettings && (
                    <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-sm text-blue-800">
                        {t('colleges.universitySettingsNote') || 'University settings were used as defaults. All settings are saved per college and can be customized below.'}
                      </p>
                    </div>
                  )}
                  <AcademicSettings 
                    formData={formData} 
                    handleChange={handleChange} 
                    handleGradingScaleChange={handleGradingScaleChange}
                    readOnlyCreditsAndGrading={true}
                  />
                </div>
              )}
              {activeTab === 'financial' && (
                <div>
                  {useUniversitySettings && (
                    <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-sm text-blue-800">
                        {t('colleges.universitySettingsNote') || 'University settings were used as defaults. All settings are saved per college and can be customized below.'}
                      </p>
                    </div>
                  )}
                  <FinancialSettings formData={formData} handleChange={handleChange} />
                </div>
              )}
              {activeTab === 'email' && (
                <div>
                  {useUniversitySettings && (
                    <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-sm text-blue-800">
                        {t('colleges.universitySettingsNote') || 'University settings were used as defaults. All settings are saved per college and can be customized below.'}
                      </p>
                    </div>
                  )}
                  <EmailSettings
                    formData={formData}
                    handleChange={handleChange}
                    onSendTestEmail={handleSendTestEmail}
                    testEmailSending={testEmailSending}
                    testEmailFeedback={testEmailFeedback}
                  />
                </div>
              )}
              {activeTab === 'onboarding' && (
                <div>
                  {useUniversitySettings && (
                    <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-sm text-blue-800">
                        {t('colleges.universitySettingsNote') || 'University settings were used as defaults. All settings are saved per college and can be customized below.'}
                      </p>
                    </div>
                  )}
                  <OnboardingSettings formData={formData} handleChange={handleChange} />
                </div>
              )}
              {activeTab === 'system' && (
                <div>
                  {useUniversitySettings && (
                    <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-sm text-blue-800">
                        {t('colleges.universitySettingsNote') || 'University settings were used as defaults. All settings are saved per college and can be customized below.'}
                      </p>
                    </div>
                  )}
                  <SystemSettings formData={formData} handleChange={handleChange} />
                </div>
              )}
              {activeTab === 'examination' && (
                <div>
                  {useUniversitySettings && (
                    <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-sm text-blue-800">
                        {t('colleges.universitySettingsNote') || 'University settings were used as defaults. All settings are saved per college and can be customized below.'}
                      </p>
                    </div>
                  )}
                  <ExaminationSettings formData={formData} handleChange={handleChange} />
                </div>
              )}

              {/* Info: New colleges automatically see university-wide content */}
              {!isEditMode && (
                <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-sm text-blue-800">
                    {t('colleges.universityWideAutoVisible', 'University-wide academic years, semesters, departments, and majors are automatically visible to all colleges—no import needed. New colleges will see them immediately.')}
                  </p>
                </div>
              )}
            </div>

            {/* Error/Success Messages */}
            {error && (
              <div className="mx-6 mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
                {error}
              </div>
            )}
            {success && (
              <div className={`mx-6 mb-6 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700 flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'}`}>
                <Check className="w-5 h-5" />
                <span>{isEditMode ? t('colleges.updatedSuccess') : t('colleges.createdSuccess')}</span>
              </div>
            )}

            {/* Submit Button */}
            <div className={`px-6 py-4 bg-gray-50 border-t border-gray-200 flex ${isRTL ? 'justify-start space-x-reverse space-x-4' : 'justify-end space-x-4'}`}>
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                {t('colleges.cancel')}
              </button>
              <button
                type="submit"
                disabled={loading || loadingData}
                className={`flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} px-6 py-2 bg-primary-gradient text-white rounded-lg font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <Save className="w-5 h-5" />
                <span>{loading ? (isEditMode ? t('colleges.updating') : t('colleges.creating')) : (isEditMode ? t('colleges.update') : t('colleges.create'))}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

