import { useMemo, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { useAuth } from '../../contexts/AuthContext'
import { getLocalizedName } from '../../utils/localizedName'
import { supabase } from '../../lib/supabase'

export default function StudentProfile() {
  const { t } = useTranslation()
  const { isRTL, language } = useLanguage()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [student, setStudent] = useState(null)
  const [saving, setSaving] = useState(false)
  const [contactForm, setContactForm] = useState({
    personal_email: '',
    mobile_phone: '',
    alt_phone: '',
    city: '',
    district: '',
    street: '',
    postal_code: '',
    emergency_contact_name: '',
    emergency_contact_relation: '',
    emergency_phone: '',
  })

  useEffect(() => {
    if (user?.email) fetchProfile()
  }, [user?.email])

  const fetchProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('students')
        .select(`
          id,
          student_id,
          first_name,
          middle_name,
          last_name,
          name_en,
          name_ar,
          date_of_birth,
          email,
          phone,
          mobile_phone,
          gpa,
          college_id,
          major_id,
          status,
          national_id,
          nationality,
          gender,
          city,
          postal_code,
          emergency_contact_name,
          emergency_contact_relation,
          emergency_phone,
          colleges(id, name_en, name_ar),
          majors(id, name_en, name_ar)
        `)
        .eq('email', user.email)
        .eq('status', 'active')
        .single()
      if (error || !data) return
      setStudent(data)
      setContactForm((prev) => ({
        ...prev,
        mobile_phone: data.mobile_phone || data.phone || '',
        city: data.city || '',
        postal_code: data.postal_code || '',
        emergency_contact_name: data.emergency_contact_name || '',
        emergency_contact_relation: data.emergency_contact_relation || '',
        emergency_phone: data.emergency_phone || '',
      }))
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const handleSaveContact = async (e) => {
    e?.preventDefault?.()
    if (!student?.id) return
    try {
      setSaving(true)
      const payload = {
        mobile_phone: contactForm.mobile_phone || null,
        phone: contactForm.mobile_phone || null,
        city: contactForm.city || null,
        postal_code: contactForm.postal_code || null,
        emergency_contact_name: contactForm.emergency_contact_name || null,
        emergency_contact_relation: contactForm.emergency_contact_relation || null,
        emergency_phone: contactForm.emergency_phone || null,
      }
      const { error } = await supabase.from('students').update(payload).eq('id', student.id)
      if (error) throw error
      await fetchProfile()
    } catch (err) {
      console.error('Save profile contact error:', err)
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

  const college = getLocalizedName(student.colleges, isRTL)
  const major = getLocalizedName(student.majors, isRTL)
  const displayName = getLocalizedName(student, isRTL) || [student.first_name, student.middle_name, student.last_name].filter(Boolean).join(' ') || student.email
  const avatarLetter = (displayName || 'م').trim().charAt(0) || 'م'
  const isArabic = isRTL || language === 'ar'
  const programLine = t('studentPortal.profile.programLine', {
    defaultValue: '{{major}} — Bachelor’s | Semester 3',
    major: major || '—',
    degree: t('studentPortal.profile.bachelors', { defaultValue: "Bachelor’s" }),
    semester: t('studentPortal.profile.semester3', { defaultValue: 'Semester 3' }),
  })

  return (
    <div className={`space-y-6 ${isRTL ? 'text-right' : 'text-left'}`} dir={isArabic ? 'rtl' : 'ltr'}>
      {/* Breadcrumb */}
      <nav className="flex flex-wrap items-center gap-2 text-sm text-[#6b7a99]" aria-label="مسار التنقل">
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

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-[#1a3a6b]">{t('studentPortal.profile.title', { defaultValue: 'My profile' })}</h1>
          <p className="text-sm text-[#6b7a99]">{t('studentPortal.profile.subtitle', { defaultValue: 'Manage your personal and academic information' })}</p>
        </div>
      </div>

      {/* Profile Header Card */}
      <div
        className="rounded-xl border border-[#dde3ef] shadow-sm p-8 text-white"
        style={{ background: 'linear-gradient(135deg,#1a3a6b 0%,#2a5298 100%)' }}
      >
        <div className="flex items-center gap-6 flex-wrap">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-extrabold flex-shrink-0"
            style={{ backgroundColor: 'rgba(255,255,255,.2)', border: '3px solid #c8a84b' }}
          >
            {avatarLetter}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[22px] font-extrabold mb-1" data-field="full_name">
              {displayName}
            </div>
            <div className="text-sm opacity-80 mb-2" data-field="program">
              {programLine}
            </div>
            <div className="flex gap-4 flex-wrap text-[13px] opacity-80">
              <span>
                {t('studentPortal.profile.universityIdLabel', { defaultValue: 'University ID' })}:{' '}
                <strong data-field="student_id">{student.student_id || '—'}</strong>
              </span>
              <span>
                {t('studentPortal.profile.campusLabel', { defaultValue: 'Campus' })}:{' '}
                <strong data-field="campus">{t('studentPortal.profile.campusMain', { defaultValue: 'Main' })}</strong>
              </span>
              <span>
                {t('studentPortal.profile.gpaLabel', { defaultValue: 'GPA' })}:{' '}
                <strong data-field="cgpa">{(student.gpa != null ? Number(student.gpa) : 0).toFixed(2)}</strong>
              </span>
            </div>
          </div>
          <div>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold" style={{ backgroundColor: '#e6f7ef', color: '#1a7a4a' }}>
              {t('studentPortal.profile.activeStudent', { defaultValue: 'Active student' })}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-6">
        <div className="space-y-6">
          {/* Personal Info */}
          <div className="bg-white rounded-xl border border-[#dde3ef] shadow-sm p-6">
            <div className="flex items-center justify-between pb-4 mb-5 border-b border-[#dde3ef]">
              <div className="text-base font-extrabold text-[#1a3a6b]">{t('studentPortal.profile.personalInfo', { defaultValue: 'Personal information' })}</div>
              <button type="button" className="px-3 py-1.5 rounded-md border text-sm font-semibold bg-[#f4f6fb] border-[#dde3ef] text-[#1e2a3a]">
                ✏️ {t('studentPortal.profile.edit', { defaultValue: 'Edit' })}
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-semibold mb-1">{t('studentPortal.profile.firstName', { defaultValue: 'First name' })}</label>
                <input className="w-full px-3 py-2.5 rounded-md border border-[#dde3ef] bg-white" readOnly value={student.first_name || ''} />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">{t('studentPortal.profile.fatherName', { defaultValue: "Father's name" })}</label>
                <input className="w-full px-3 py-2.5 rounded-md border border-[#dde3ef] bg-white" readOnly value="" />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">{t('studentPortal.profile.grandfatherName', { defaultValue: "Grandfather's name" })}</label>
                <input className="w-full px-3 py-2.5 rounded-md border border-[#dde3ef] bg-white" readOnly value="" />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">{t('studentPortal.profile.familyName', { defaultValue: 'Family name' })}</label>
                <input className="w-full px-3 py-2.5 rounded-md border border-[#dde3ef] bg-white" readOnly value={student.last_name || ''} />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">{t('studentPortal.profile.nationalId', { defaultValue: 'National ID' })}</label>
                <input className="w-full px-3 py-2.5 rounded-md border border-[#dde3ef] bg-white" readOnly value={student.national_id || ''} />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">{t('studentPortal.profile.dob', { defaultValue: 'Date of birth' })}</label>
                <input className="w-full px-3 py-2.5 rounded-md border border-[#dde3ef] bg-white" readOnly value={student.date_of_birth || ''} />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">{t('studentPortal.profile.gender', { defaultValue: 'Gender' })}</label>
                <input className="w-full px-3 py-2.5 rounded-md border border-[#dde3ef] bg-white" readOnly value={student.gender || ''} />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">{t('studentPortal.profile.nationality', { defaultValue: 'Nationality' })}</label>
                <input className="w-full px-3 py-2.5 rounded-md border border-[#dde3ef] bg-white" readOnly value={student.nationality || ''} />
              </div>
            </div>

            <div className="mt-4 rounded-md border-r-4 border-blue-700 bg-[#dbeafe] text-blue-700 px-4 py-3 text-sm">
              ℹ️ {t('studentPortal.profile.personalInfoNotePrefix', { defaultValue: 'To change your name, date of birth, or nationality, please submit a' })}{' '}
              <Link to="/student/coming-soon" className="underline">
                {t('studentPortal.profile.dataChangeRequest', { defaultValue: 'data change request' })}
              </Link>{' '}
              {t('studentPortal.profile.personalInfoNoteSuffix', { defaultValue: 'with supporting documents.' })}
            </div>
          </div>

          {/* Contact Info */}
          <div className="bg-white rounded-xl border border-[#dde3ef] shadow-sm p-6">
            <div className="flex items-center justify-between pb-4 mb-5 border-b border-[#dde3ef]">
              <div className="text-base font-extrabold text-[#1a3a6b]">{t('studentPortal.profile.contactInfo', { defaultValue: 'Contact information' })}</div>
              <button
                type="button"
                className="px-4 py-2 rounded-md text-sm font-extrabold text-white"
                style={{ backgroundColor: '#1a3a6b' }}
                onClick={handleSaveContact}
                disabled={saving}
              >
                💾 {saving ? t('studentPortal.profile.saving', { defaultValue: 'Saving…' }) : t('studentPortal.profile.saveChanges', { defaultValue: 'Save changes' })}
              </button>
            </div>

            <form onSubmit={handleSaveContact}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-semibold mb-1">{t('studentPortal.profile.universityEmail', { defaultValue: 'University email' })}</label>
                  <input className="w-full px-3 py-2.5 rounded-md border border-[#dde3ef] bg-white" readOnly value={student.email || ''} />
                  <div className="text-xs text-[#6b7a99] mt-1">{t('studentPortal.profile.universityEmailHint', { defaultValue: 'University email cannot be changed' })}</div>
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1">{t('studentPortal.profile.personalEmail', { defaultValue: 'Personal email' })}</label>
                  <input
                    className="w-full px-3 py-2.5 rounded-md border border-[#dde3ef] bg-white"
                    value={contactForm.personal_email}
                    onChange={(e) => setContactForm((p) => ({ ...p, personal_email: e.target.value }))}
                    placeholder=""
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1">
                    {t('studentPortal.profile.mobile', { defaultValue: 'Mobile number' })} <span className="text-red-600">*</span>
                  </label>
                  <input
                    className="w-full px-3 py-2.5 rounded-md border border-[#dde3ef] bg-white"
                    required
                    value={contactForm.mobile_phone}
                    onChange={(e) => setContactForm((p) => ({ ...p, mobile_phone: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1">{t('studentPortal.profile.altPhone', { defaultValue: 'Alternative phone' })}</label>
                  <input
                    className="w-full px-3 py-2.5 rounded-md border border-[#dde3ef] bg-white"
                    value={contactForm.alt_phone}
                    onChange={(e) => setContactForm((p) => ({ ...p, alt_phone: e.target.value }))}
                    placeholder={t('studentPortal.profile.optional', { defaultValue: 'Optional' })}
                  />
                </div>
              </div>

              <fieldset className="border border-[#dde3ef] rounded-xl p-5 mt-5">
                <legend className="px-2 text-sm font-extrabold text-[#1a3a6b]">{t('studentPortal.profile.permanentAddress', { defaultValue: 'Permanent address' })}</legend>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-2">
                  <div>
                    <label className="block text-sm font-semibold mb-1">{t('studentPortal.profile.city', { defaultValue: 'City' })}</label>
                    <input
                      className="w-full px-3 py-2.5 rounded-md border border-[#dde3ef] bg-white"
                      value={contactForm.city}
                      onChange={(e) => setContactForm((p) => ({ ...p, city: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-1">{t('studentPortal.profile.district', { defaultValue: 'District' })}</label>
                    <input
                      className="w-full px-3 py-2.5 rounded-md border border-[#dde3ef] bg-white"
                      value={contactForm.district}
                      onChange={(e) => setContactForm((p) => ({ ...p, district: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-1">{t('studentPortal.profile.street', { defaultValue: 'Street' })}</label>
                    <input
                      className="w-full px-3 py-2.5 rounded-md border border-[#dde3ef] bg-white"
                      value={contactForm.street}
                      onChange={(e) => setContactForm((p) => ({ ...p, street: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-1">{t('studentPortal.profile.postalCode', { defaultValue: 'Postal code' })}</label>
                    <input
                      className="w-full px-3 py-2.5 rounded-md border border-[#dde3ef] bg-white"
                      value={contactForm.postal_code}
                      onChange={(e) => setContactForm((p) => ({ ...p, postal_code: e.target.value }))}
                    />
                  </div>
                </div>
              </fieldset>

              <fieldset className="border border-[#dde3ef] rounded-xl p-5 mt-5">
                <legend className="px-2 text-sm font-extrabold text-[#1a3a6b]">{t('studentPortal.profile.emergencyContact', { defaultValue: 'Emergency contact' })}</legend>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mt-2">
                  <div>
                    <label className="block text-sm font-semibold mb-1">
                      {t('studentPortal.profile.emergencyName', { defaultValue: 'Name' })} <span className="text-red-600">*</span>
                    </label>
                    <input
                      className="w-full px-3 py-2.5 rounded-md border border-[#dde3ef] bg-white"
                      required
                      value={contactForm.emergency_contact_name}
                      onChange={(e) => setContactForm((p) => ({ ...p, emergency_contact_name: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-1">{t('studentPortal.profile.emergencyRelation', { defaultValue: 'Relationship' })}</label>
                    <input
                      className="w-full px-3 py-2.5 rounded-md border border-[#dde3ef] bg-white"
                      value={contactForm.emergency_contact_relation}
                      onChange={(e) => setContactForm((p) => ({ ...p, emergency_contact_relation: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-1">
                      {t('studentPortal.profile.emergencyPhone', { defaultValue: 'Mobile number' })} <span className="text-red-600">*</span>
                    </label>
                    <input
                      className="w-full px-3 py-2.5 rounded-md border border-[#dde3ef] bg-white"
                      required
                      value={contactForm.emergency_phone}
                      onChange={(e) => setContactForm((p) => ({ ...p, emergency_phone: e.target.value }))}
                    />
                  </div>
                </div>
              </fieldset>

              <button type="submit" className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-md font-extrabold text-white" style={{ backgroundColor: '#1a3a6b' }} disabled={saving}>
                💾 {t('studentPortal.profile.saveChanges', { defaultValue: 'Save changes' })}
              </button>
            </form>
          </div>
        </div>

        <div className="space-y-6">
          {/* Academic Info (read-only) */}
          <div className="bg-white rounded-xl border border-[#dde3ef] shadow-sm p-6">
            <div className="flex items-center justify-between pb-4 mb-5 border-b border-[#dde3ef]">
              <div className="text-base font-extrabold text-[#1a3a6b]">{t('studentPortal.profile.academicInfo', { defaultValue: 'Academic information' })}</div>
            </div>
            <div className="space-y-3 text-sm">
              <div>
                <div className="text-[#6b7a99]">{t('studentPortal.profile.universityIdLabel', { defaultValue: 'University ID' })}</div>
                <div className="font-extrabold">{student.student_id || '—'}</div>
              </div>
              <div>
                <div className="text-[#6b7a99]">{t('studentPortal.profile.college', { defaultValue: 'College' })}</div>
                <div className="font-extrabold">{college || '—'}</div>
              </div>
              <div>
                <div className="text-[#6b7a99]">{t('studentPortal.profile.major', { defaultValue: 'Major' })}</div>
                <div className="font-extrabold">{major || '—'}</div>
              </div>
              <div>
                <div className="text-[#6b7a99]">{t('studentPortal.profile.academicLevel', { defaultValue: 'Academic level' })}</div>
                <div className="font-extrabold">{t('studentPortal.profile.semester3', { defaultValue: 'Semester 3' })}</div>
              </div>
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
                <div className="text-xl font-extrabold text-emerald-700">{(student.gpa != null ? Number(student.gpa) : 0).toFixed(2)} / 4.00</div>
              </div>
              <div>
                <div className="text-[#6b7a99]">{t('studentPortal.profile.completedHours', { defaultValue: 'Completed hours' })}</div>
                <div className="font-extrabold">— / 120</div>
              </div>
              <div>
                <div className="text-[#6b7a99]">{t('studentPortal.profile.advisor', { defaultValue: 'Academic advisor' })}</div>
                <div className="font-extrabold">—</div>
              </div>
            </div>
          </div>

          {/* Change Password (UI only for now) */}
          <div className="bg-white rounded-xl border border-[#dde3ef] shadow-sm p-6">
            <div className="flex items-center justify-between pb-4 mb-5 border-b border-[#dde3ef]">
              <div className="text-base font-extrabold text-[#1a3a6b]">{t('studentPortal.profile.securityPassword', { defaultValue: 'Security & password' })}</div>
            </div>
            <form onSubmit={(e) => e.preventDefault()}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold mb-1">{t('studentPortal.profile.currentPassword', { defaultValue: 'Current password' })}</label>
                  <input className="w-full px-3 py-2.5 rounded-md border border-[#dde3ef] bg-white" type="password" placeholder="••••••••" />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1">{t('studentPortal.profile.newPassword', { defaultValue: 'New password' })}</label>
                  <input className="w-full px-3 py-2.5 rounded-md border border-[#dde3ef] bg-white" type="password" placeholder="••••••••" />
                  <div className="text-xs text-[#6b7a99] mt-1">{t('studentPortal.profile.passwordHint', { defaultValue: 'At least 8 characters, including letters and numbers' })}</div>
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1">{t('studentPortal.profile.confirmPassword', { defaultValue: 'Confirm password' })}</label>
                  <input className="w-full px-3 py-2.5 rounded-md border border-[#dde3ef] bg-white" type="password" placeholder="••••••••" />
                </div>
                <button type="submit" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md font-extrabold text-white" style={{ backgroundColor: '#1a3a6b' }}>
                  🔒 {t('studentPortal.profile.changePassword', { defaultValue: 'Change password' })}
                </button>
              </div>
            </form>
          </div>

          {/* Active Sessions (UI only for now) */}
          <div className="bg-white rounded-xl border border-[#dde3ef] shadow-sm p-6">
            <div className="flex items-center justify-between pb-4 mb-5 border-b border-[#dde3ef]">
              <div className="text-base font-extrabold text-[#1a3a6b]">{t('studentPortal.profile.activeSessions', { defaultValue: 'Active sessions' })}</div>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between p-3 rounded-md" style={{ backgroundColor: '#e6f7ef' }}>
                <div>
                  <div className="font-extrabold">{t('studentPortal.profile.sessionCurrentTitle', { defaultValue: 'Chrome — Windows' })}</div>
                  <div className="text-[#6b7a99]">{t('studentPortal.profile.sessionCurrentMeta', { defaultValue: 'Riyadh • Current session' })}</div>
                </div>
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-extrabold" style={{ backgroundColor: '#e6f7ef', color: '#1a7a4a' }}>
                  {t('studentPortal.profile.sessionCurrentBadge', { defaultValue: 'Current' })}
                </span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-md" style={{ backgroundColor: '#f4f6fb' }}>
                <div>
                  <div className="font-extrabold">{t('studentPortal.profile.sessionOtherTitle', { defaultValue: 'Safari — iPhone' })}</div>
                  <div className="text-[#6b7a99]">{t('studentPortal.profile.sessionOtherMeta', { defaultValue: '2 days ago' })}</div>
                </div>
                <button type="button" className="px-3 py-1.5 rounded-md text-xs font-extrabold text-white" style={{ backgroundColor: '#b91c1c' }}>
                  {t('studentPortal.profile.endSession', { defaultValue: 'End' })}
                </button>
              </div>
            </div>
            <button type="button" className="mt-4 px-4 py-2 rounded-md text-xs font-extrabold text-white" style={{ backgroundColor: '#b91c1c' }}>
              {t('studentPortal.profile.signOutAll', { defaultValue: 'Sign out of all devices' })}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
