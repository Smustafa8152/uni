import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { useAuth } from '../../contexts/AuthContext'
import { getLocalizedName } from '../../utils/localizedName'
import { supabase } from '../../lib/supabase'
import { getNationalityLabel } from '../../utils/nationalities'

const ADMITTED_CODES = new Set(['DCFA', 'ENAC', 'ENCF', 'ACAC', 'ACPR'])

const STUDENT_SELECT = `
  id, student_id, enrollment_date, status, gpa, email, college_id, major_id,
  first_name, middle_name, last_name, first_name_ar, middle_name_ar, last_name_ar, name_en, name_ar,
  date_of_birth, gender, nationality, religion, national_id, passport_number,
  phone, mobile_phone, address, city, state, country, postal_code,
  emergency_contact_name, emergency_contact_relation, emergency_phone,
  high_school_name, high_school_country, graduation_year, high_school_gpa,
  colleges(id, name_en, name_ar),
  majors(id, name_en, name_ar, degree_level)
`

const APPLICATION_SELECT = `
  id, application_number, status_code, created_at, study_type,
  title, first_name, last_name, first_name_ar, middle_name_ar, last_name_ar,
  date_of_birth, gender, religion, nationality,
  id_type, id_number, id_issue_country, id_issue_date, id_expiry_date,
  phone, home_phone, country, state_province, city, postal_code, street_address,
  highest_education_level, certificate_type, high_school_name, high_school_country, graduation_year, gpa,
  specialization, language_of_study, language_certificate_name, language_certificate_result,
  semesters!semester_id(id, name_en, name_ar, start_date)
`

/** The application the student was admitted from (latest admitted one, else the latest one). */
async function loadAdmittedApplication(email) {
  const { data } = await supabase
    .from('applications')
    .select(APPLICATION_SELECT)
    .ilike('email', email)
    .order('created_at', { ascending: false })
  const list = data || []
  return list.find((app) => ADMITTED_CODES.has(String(app.status_code || '').toUpperCase())) || list[0] || null
}

async function resolveStudentSemester(studentRow, application) {
  const { data: enrolled } = await supabase
    .from('enrollments')
    .select('semesters!semester_id(id, name_en, name_ar, start_date)')
    .eq('student_id', studentRow.id)
    .eq('status', 'enrolled')
  const fromEnrollment = (enrolled || [])
    .map((row) => row.semesters)
    .filter(Boolean)
    .sort((a, b) => String(b.start_date || '').localeCompare(String(a.start_date || '')))[0]
  return fromEnrollment || application?.semesters || null
}

const firstFilled = (...values) => values.find((v) => v !== null && v !== undefined && String(v).trim() !== '') ?? ''

const inputClass = 'w-full px-3 py-2.5 rounded-md border border-[#dde3ef] bg-white'

function ReadField({ label, value, ltr = false, rtl = false, wide = false }) {
  const shown = String(value ?? '').trim()
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <div className="block text-sm font-semibold mb-1">{label}</div>
      <div className="min-h-[2.75rem] w-full px-3 py-2.5 rounded-md border border-[#dde3ef] bg-[#f8fafd] text-[#1e2a3a] break-words">
        {shown ? <span dir={ltr ? 'ltr' : rtl ? 'rtl' : undefined}>{shown}</span> : <span className="text-[#9aa5bd]">—</span>}
      </div>
    </div>
  )
}

function Section({ title, hint, action, children }) {
  return (
    <div className="bg-white rounded-xl border border-[#dde3ef] shadow-sm p-6">
      <div className="flex items-start justify-between gap-3 pb-4 mb-5 border-b border-[#dde3ef]">
        <div>
          <div className="text-base font-extrabold text-[#1a3a6b]">{title}</div>
          {hint && <div className="text-xs text-[#6b7a99] mt-1">{hint}</div>}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

export default function StudentProfile() {
  const { t } = useTranslation()
  const { isRTL, language } = useLanguage()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [student, setStudent] = useState(null)
  const [application, setApplication] = useState(null)
  const [semester, setSemester] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveState, setSaveState] = useState('')
  const [contactForm, setContactForm] = useState({
    mobile_phone: '',
    country: '',
    state: '',
    city: '',
    postal_code: '',
    address: '',
    emergency_contact_name: '',
    emergency_contact_relation: '',
    emergency_phone: '',
  })

  useEffect(() => {
    if (user?.email) fetchProfile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email])

  const fetchProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('students')
        .select(STUDENT_SELECT)
        .eq('email', user.email)
        .eq('status', 'active')
        .single()
      if (error || !data) return
      const app = await loadAdmittedApplication(data.email)
      setStudent(data)
      setApplication(app)
      setSemester(await resolveStudentSemester(data, app))
      setContactForm({
        mobile_phone: firstFilled(data.mobile_phone, data.phone, app?.phone),
        country: firstFilled(data.country, app?.country),
        state: firstFilled(data.state, app?.state_province),
        city: firstFilled(data.city, app?.city),
        postal_code: firstFilled(data.postal_code, app?.postal_code),
        address: firstFilled(data.address, app?.street_address),
        emergency_contact_name: data.emergency_contact_name || '',
        emergency_contact_relation: data.emergency_contact_relation || '',
        emergency_phone: data.emergency_phone || '',
      })
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveContact = async (e) => {
    e?.preventDefault?.()
    if (!student?.id) return
    const clean = (v) => String(v || '').trim() || null
    try {
      setSaving(true)
      setSaveState('')
      const { error } = await supabase
        .from('students')
        .update({
          mobile_phone: clean(contactForm.mobile_phone),
          phone: clean(contactForm.mobile_phone),
          country: clean(contactForm.country),
          state: clean(contactForm.state),
          city: clean(contactForm.city),
          postal_code: clean(contactForm.postal_code),
          address: clean(contactForm.address),
          emergency_contact_name: clean(contactForm.emergency_contact_name),
          emergency_contact_relation: clean(contactForm.emergency_contact_relation),
          emergency_phone: clean(contactForm.emergency_phone),
        })
        .eq('id', student.id)
      if (error) throw error
      setSaveState('saved')
      await fetchProfile()
    } catch (err) {
      console.error('Save profile contact error:', err)
      setSaveState('error')
    } finally {
      setSaving(false)
    }
  }

  if (loading && !student) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-slate-600 border-t-transparent" />
      </div>
    )
  }

  if (!student) {
    return (
      <div className="rounded-xl bg-amber-50 border border-amber-200 p-6 text-center">
        <p className="text-amber-800">{t('studentPortal.noStudentData')}</p>
      </div>
    )
  }

  const app = application || {}
  const isArabic = isRTL || language === 'ar'
  const college = getLocalizedName(student.colleges, isRTL)
  const major = getLocalizedName(student.majors, isRTL)
  const semesterName = getLocalizedName(semester, isRTL)
  const degreeCode = student.majors?.degree_level
  const degree = degreeCode ? t(`academic.majors.${degreeCode}`, { defaultValue: degreeCode }) : ''
  const displayName = getLocalizedName(student, isRTL) || [student.first_name, student.middle_name, student.last_name].filter(Boolean).join(' ') || student.email
  const avatarLetter = (displayName || 'م').trim().charAt(0) || 'م'
  const programLine = [major, [degree, semesterName].filter(Boolean).join(' | ')].filter(Boolean).join(' — ') || '—'

  const arabicName = firstFilled(
    [student.first_name_ar, student.middle_name_ar, student.last_name_ar].filter(Boolean).join(' '),
    [app.first_name_ar, app.middle_name_ar, app.last_name_ar].filter(Boolean).join(' ')
  )
  const dateText = (value) =>
    value
      ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString(isArabic ? 'ar-u-nu-latn' : 'en-GB', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : ''
  const countryText = (value) => (value ? getNationalityLabel(value, isArabic) || value : '')
  const option = (prefix, value) => (value ? t(`${prefix}.${value}`, { defaultValue: value }) : '')
  const gender = firstFilled(student.gender, app.gender)
  const gpa = firstFilled(app.gpa, student.high_school_gpa)

  return (
    <div className="space-y-6 text-start" dir={isArabic ? 'rtl' : 'ltr'}>
      <nav className="flex flex-wrap items-center gap-2 text-sm text-[#6b7a99]" aria-label={t('studentPortal.myProfile', { defaultValue: 'My profile' })}>
        <Link to="/" className="hover:text-[#1a3a6b] no-underline">
          {t('studentPortal.profile.breadcrumbHome', { defaultValue: 'Home' })}
        </Link>
        <span className="text-[#dde3ef]">/</span>
        <Link to="/dashboard" className="hover:text-[#1a3a6b] no-underline">
          {t('studentPortal.studentPortal', { defaultValue: 'Student Portal' })}
        </Link>
        <span className="text-[#dde3ef]">/</span>
        <span className="text-[#1a3a6b] font-semibold">{t('studentPortal.myProfile', { defaultValue: 'My profile' })}</span>
      </nav>

      <div>
        <h1 className="text-2xl font-extrabold text-[#1a3a6b]">{t('studentPortal.profile.title', { defaultValue: 'My profile' })}</h1>
        <p className="text-sm text-[#6b7a99]">{t('studentPortal.profile.subtitle', { defaultValue: 'Manage your personal and academic information' })}</p>
      </div>

      <div className="rounded-xl border border-[#dde3ef] shadow-sm p-8 text-white" style={{ background: 'linear-gradient(135deg,#1a3a6b 0%,#2a5298 100%)' }}>
        <div className="flex items-center gap-6 flex-wrap">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-extrabold flex-shrink-0"
            style={{ backgroundColor: 'rgba(255,255,255,.2)', border: '3px solid #c8a84b' }}
          >
            {avatarLetter}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[22px] font-extrabold mb-1">{displayName}</div>
            {arabicName && !isArabic && (
              <div className="text-base font-bold opacity-90 mb-1" dir="rtl">
                {arabicName}
              </div>
            )}
            <div className="text-sm opacity-80 mb-2">{programLine}</div>
            <div className="flex gap-4 flex-wrap text-[13px] opacity-80">
              <span>
                {t('studentPortal.profile.universityIdLabel', { defaultValue: 'University ID' })}:{' '}
                <strong dir="ltr">{student.student_id || '—'}</strong>
              </span>
              <span>
                {t('studentPortal.profile.campusLabel', { defaultValue: 'Campus' })}:{' '}
                <strong>{t('studentPortal.profile.campusMain', { defaultValue: 'Main' })}</strong>
              </span>
              <span>
                {t('studentPortal.profile.gpaLabel', { defaultValue: 'GPA' })}:{' '}
                <strong dir="ltr">{(student.gpa != null ? Number(student.gpa) : 0).toFixed(2)}</strong>
              </span>
            </div>
          </div>
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold" style={{ backgroundColor: '#e6f7ef', color: '#1a7a4a' }}>
            {t('studentPortal.profile.activeStudent', { defaultValue: 'Active student' })}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-6">
        <div className="space-y-6">
          <Section title={t('applyForm.steps.personal', 'Personal details')} hint={t('studentPortal.profile.fromApplication')}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <ReadField label={t('applyForm.fields.title', 'Title')} value={option('applyForm.titles', app.title)} />
              <div className="hidden sm:block" />
              <ReadField label={t('applyForm.fields.firstName')} value={firstFilled(student.first_name, app.first_name)} ltr />
              <ReadField label={t('applyForm.fields.lastName')} value={firstFilled(student.last_name, app.last_name)} ltr />
              <ReadField label={t('applyForm.fields.nameAr', 'Full name in Arabic')} value={arabicName} rtl wide />
              <ReadField label={t('applyForm.fields.dateOfBirth', 'Date of birth')} value={dateText(firstFilled(student.date_of_birth, app.date_of_birth))} />
              <ReadField label={t('applyForm.fields.gender', 'Gender')} value={gender ? t(`registerApplication.gender.${gender}`, { defaultValue: gender }) : ''} />
              <ReadField label={t('applyForm.fields.religion', 'Religion')} value={firstFilled(student.religion, app.religion)} />
              <ReadField label={t('applyForm.fields.citizenship', 'Citizenship')} value={countryText(firstFilled(student.nationality, app.nationality))} />
            </div>
            <div className="mt-4 rounded-md border-s-4 border-blue-700 bg-[#dbeafe] text-blue-700 px-4 py-3 text-sm">
              ℹ️ {t('studentPortal.profile.personalInfoNotePrefix', { defaultValue: 'To change your name, date of birth, or nationality, please submit a' })}{' '}
              <Link to="/student/requests" className="underline">
                {t('studentPortal.profile.dataChangeRequest', { defaultValue: 'data change request' })}
              </Link>{' '}
              {t('studentPortal.profile.personalInfoNoteSuffix', { defaultValue: 'with supporting documents.' })}
            </div>
          </Section>

          <Section title={t('applyForm.steps.identity', 'Identity information')} hint={t('studentPortal.profile.fromApplication')}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <ReadField label={t('applyForm.fields.idType', 'Identity type')} value={option('applyForm.idTypes', app.id_type)} />
              <ReadField label={t('applyForm.fields.idNumber', 'Passport / ID number')} value={firstFilled(app.id_number, student.national_id, student.passport_number)} ltr />
              <ReadField label={t('applyForm.fields.idIssueCountry', 'Country of issue')} value={countryText(app.id_issue_country)} />
              <div className="hidden sm:block" />
              <ReadField label={t('applyForm.fields.idIssueDate', 'Date of issue')} value={dateText(app.id_issue_date)} />
              <ReadField label={t('applyForm.fields.idExpiryDate', 'Expiry date')} value={dateText(app.id_expiry_date)} />
            </div>
          </Section>

          <Section title={t('applyForm.steps.education', 'Education background')} hint={t('studentPortal.profile.fromApplication')}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <ReadField label={t('applyForm.fields.highestEducationLevel', 'Highest education level')} value={option('applyForm.educationLevels', app.highest_education_level)} />
              <ReadField label={t('applyForm.fields.certificateName', 'Certificate name')} value={app.certificate_type} />
              <ReadField label={t('applyForm.fields.institutionName', 'Institution name')} value={firstFilled(app.high_school_name, student.high_school_name)} />
              <ReadField label={t('applyForm.fields.educationCountry', 'Country')} value={countryText(firstFilled(app.high_school_country, student.high_school_country))} />
              <ReadField label={t('applyForm.fields.graduationYear', 'Year of graduation')} value={firstFilled(app.graduation_year, student.graduation_year)} ltr />
              <ReadField label={t('applyForm.fields.gpa', 'Grade / GPA')} value={gpa !== '' ? Number(gpa).toFixed(2) : ''} ltr />
              <ReadField label={t('applyForm.fields.specialization', 'Specialization')} value={app.specialization} />
              <ReadField label={t('applyForm.fields.languageOfStudy', 'Language of study')} value={option('applyForm.languages', app.language_of_study)} />
              <ReadField label={t('applyForm.sections.languageCert', 'Language certificate')} value={option('applyForm.languageCertificates', app.language_certificate_name)} />
              <ReadField label={t('applyForm.fields.languageCertificateResult', 'Certificate result')} value={app.language_certificate_result} ltr />
            </div>
          </Section>

          <Section
            title={t('applyForm.steps.contact', 'Contact details')}
            action={
              <button
                type="button"
                className="shrink-0 px-4 py-2 rounded-md text-sm font-extrabold text-white disabled:opacity-60"
                style={{ backgroundColor: '#1a3a6b' }}
                onClick={handleSaveContact}
                disabled={saving}
              >
                {saving ? t('studentPortal.profile.saving', { defaultValue: 'Saving…' }) : t('studentPortal.profile.saveChanges', { defaultValue: 'Save changes' })}
              </button>
            }
          >
            <form onSubmit={handleSaveContact}>
              {saveState && (
                <div
                  className={`mb-4 rounded-md px-4 py-2.5 text-sm ${
                    saveState === 'saved' ? 'bg-[#e6f7ef] text-[#1a7a4a]' : 'bg-red-50 text-red-700'
                  }`}
                >
                  {saveState === 'saved' ? t('studentPortal.profile.saved') : t('studentPortal.profile.saveError')}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <ReadField label={t('studentPortal.profile.universityEmail', { defaultValue: 'University email' })} value={student.email} ltr />
                  <div className="text-xs text-[#6b7a99] mt-1">{t('studentPortal.profile.universityEmailHint', { defaultValue: 'University email cannot be changed' })}</div>
                </div>
                <label className="block">
                  <span className="block text-sm font-semibold mb-1">{t('applyForm.fields.mobile', 'Mobile number')}</span>
                  <input
                    className={inputClass}
                    dir="ltr"
                    value={contactForm.mobile_phone}
                    onChange={(e) => setContactForm((p) => ({ ...p, mobile_phone: e.target.value }))}
                  />
                </label>
                <ReadField label={t('applyForm.fields.homePhone', 'Home phone number')} value={app.home_phone} ltr />
                <div className="hidden sm:block" />
                {[
                  ['country', 'applyForm.fields.country', 'Country'],
                  ['state', 'applyForm.fields.state', 'State / province'],
                  ['city', 'applyForm.fields.city', 'City'],
                  ['postal_code', 'applyForm.fields.postCode', 'Post code'],
                ].map(([key, labelKey, fallback]) => (
                  <label key={key} className="block">
                    <span className="block text-sm font-semibold mb-1">{t(labelKey, fallback)}</span>
                    <input className={inputClass} value={contactForm[key]} onChange={(e) => setContactForm((p) => ({ ...p, [key]: e.target.value }))} />
                  </label>
                ))}
                <label className="block sm:col-span-2">
                  <span className="block text-sm font-semibold mb-1">{t('applyForm.fields.address', 'Street address')}</span>
                  <input className={inputClass} value={contactForm.address} onChange={(e) => setContactForm((p) => ({ ...p, address: e.target.value }))} />
                </label>
              </div>

              <fieldset className="border border-[#dde3ef] rounded-xl p-5 mt-5">
                <legend className="px-2 text-sm font-extrabold text-[#1a3a6b]">{t('studentPortal.profile.emergencyContact', { defaultValue: 'Emergency contact' })}</legend>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-2">
                  <label className="block">
                    <span className="block text-sm font-semibold mb-1">{t('studentPortal.profile.emergencyName', { defaultValue: 'Name' })}</span>
                    <input
                      className={inputClass}
                      value={contactForm.emergency_contact_name}
                      onChange={(e) => setContactForm((p) => ({ ...p, emergency_contact_name: e.target.value }))}
                    />
                  </label>
                  <label className="block">
                    <span className="block text-sm font-semibold mb-1">{t('studentPortal.profile.emergencyRelation', { defaultValue: 'Relationship' })}</span>
                    <input
                      className={inputClass}
                      value={contactForm.emergency_contact_relation}
                      onChange={(e) => setContactForm((p) => ({ ...p, emergency_contact_relation: e.target.value }))}
                    />
                  </label>
                  <label className="block">
                    <span className="block text-sm font-semibold mb-1">{t('studentPortal.profile.emergencyPhone', { defaultValue: 'Mobile number' })}</span>
                    <input
                      className={inputClass}
                      dir="ltr"
                      value={contactForm.emergency_phone}
                      onChange={(e) => setContactForm((p) => ({ ...p, emergency_phone: e.target.value }))}
                    />
                  </label>
                </div>
              </fieldset>

              <button type="submit" className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-md font-extrabold text-white disabled:opacity-60" style={{ backgroundColor: '#1a3a6b' }} disabled={saving}>
                {t('studentPortal.profile.saveChanges', { defaultValue: 'Save changes' })}
              </button>
            </form>
          </Section>
        </div>

        <div className="space-y-6">
          <Section title={t('studentPortal.profile.academicInfo', { defaultValue: 'Academic information' })}>
            <div className="space-y-3 text-sm">
              {[
                [t('studentPortal.profile.universityIdLabel', { defaultValue: 'University ID' }), student.student_id, true],
                [t('studentPortal.profile.applicationNumber'), app.application_number, true],
                [t('studentPortal.profile.college', { defaultValue: 'College' }), college],
                [t('studentPortal.profile.major', { defaultValue: 'Major' }), major],
                [t('studentPortal.profile.academicLevel', { defaultValue: 'Academic level' }), degree],
                [t('studentPortal.profile.studyMode'), option('applyForm.workload', app.study_type)],
                [t('studentPortal.profile.semester', { defaultValue: 'Semester' }), semesterName],
                [t('studentPortal.profile.admissionDate'), dateText(student.enrollment_date)],
              ].map(([label, value, ltr]) => (
                <div key={label}>
                  <div className="text-[#6b7a99]">{label}</div>
                  <div className="font-extrabold" dir={ltr ? 'ltr' : undefined}>
                    {value || '—'}
                  </div>
                </div>
              ))}
              <div>
                <div className="text-[#6b7a99]">{t('studentPortal.profile.academicStatus', { defaultValue: 'Academic status' })}</div>
                <div className="mt-1">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-extrabold" style={{ backgroundColor: '#e6f7ef', color: '#1a7a4a' }}>
                    {t('studentPortal.profile.activeStudent', { defaultValue: 'Active student' })}
                  </span>
                </div>
              </div>
              <div>
                <div className="text-[#6b7a99]">{t('studentPortal.cumulativeGpa', { defaultValue: 'Cumulative GPA' })}</div>
                <div className="text-xl font-extrabold text-emerald-700" dir="ltr">
                  {(student.gpa != null ? Number(student.gpa) : 0).toFixed(2)} / 4.30
                </div>
              </div>
            </div>
          </Section>
        </div>
      </div>
    </div>
  )
}
