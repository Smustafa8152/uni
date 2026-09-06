import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Video, GraduationCap, Loader2, Save } from 'lucide-react'
import { supabase } from '../../lib/supabase'

/**
 * Staff: schedule interview (RVIV) / entrance exam (RVEX) and email invite.
 */
export default function InterviewExamInvitePanel({
  application,
  applicationId,
  onUpdated,
  sendAdmissionNotification,
  staffUserId,
  isArabicLayout = false,
  alignStart = 'text-left',
  iconRow = 'flex-row',
}) {
  const { t } = useTranslation()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [form, setForm] = useState({
    interview_at: '',
    interview_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    interview_meeting_url: '',
    interview_instructions: '',
    exam_at: '',
    exam_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    exam_location_or_link: '',
    exam_instructions: '',
    setStatusInterview: false,
    setStatusExam: false,
    emailInterview: true,
    emailExam: true,
  })

  useEffect(() => {
    if (!application) return
    const toLocalInput = (iso) => {
      if (!iso) return ''
      const d = new Date(iso)
      if (Number.isNaN(d.getTime())) return ''
      const pad = (n) => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
    }
    setForm((f) => ({
      ...f,
      interview_at: toLocalInput(application.interview_at),
      interview_timezone: application.interview_timezone || f.interview_timezone,
      interview_meeting_url: application.interview_meeting_url || '',
      interview_instructions: application.interview_instructions || '',
      exam_at: toLocalInput(application.exam_at),
      exam_timezone: application.exam_timezone || f.exam_timezone,
      exam_location_or_link: application.exam_location_or_link || '',
      exam_instructions: application.exam_instructions || '',
    }))
  }, [application])

  const localToIso = (local) => {
    if (!local) return null
    const d = new Date(local)
    if (Number.isNaN(d.getTime())) return null
    return d.toISOString()
  }

  const handleSave = async (kind) => {
    setSaving(true)
    setError('')
    setOk('')
    try {
      const update = {}
      let nextStatus = null
      if (kind === 'interview' || kind === 'both') {
        update.interview_at = localToIso(form.interview_at)
        update.interview_timezone = form.interview_timezone || null
        update.interview_meeting_url = form.interview_meeting_url.trim() || null
        update.interview_instructions = form.interview_instructions.trim() || null
        if (form.setStatusInterview) nextStatus = 'RVIV'
      }
      if (kind === 'exam' || kind === 'both') {
        update.exam_at = localToIso(form.exam_at)
        update.exam_timezone = form.exam_timezone || null
        update.exam_location_or_link = form.exam_location_or_link.trim() || null
        update.exam_instructions = form.exam_instructions.trim() || null
        if (form.setStatusExam) nextStatus = 'RVEX'
      }
      if (nextStatus) {
        update.status_code = nextStatus
        update.status_changed_at = new Date().toISOString()
        if (staffUserId) update.status_changed_by = staffUserId
      }

      const { error: uErr } = await supabase.from('applications').update(update).eq('id', applicationId)
      if (uErr) throw uErr

      if (nextStatus && staffUserId) {
        await supabase.from('status_change_audit_log').insert({
          entity_type: 'application',
          entity_id: applicationId,
          from_status_code: application?.status_code || null,
          to_status_code: nextStatus,
          trigger_code: nextStatus === 'RVIV' ? 'TRIV' : 'TREX',
          triggered_by: staffUserId,
          notes: kind === 'interview' ? 'Interview scheduled' : 'Entrance exam scheduled',
        })
      }

      if ((kind === 'interview' || kind === 'both') && form.emailInterview && sendAdmissionNotification) {
        const when = form.interview_at ? new Date(form.interview_at).toLocaleString() : 'TBA'
        const link = form.interview_meeting_url.trim()
        await sendAdmissionNotification({
          type: 'interview_invite',
          subject: t('admissions.interview.emailSubject', 'Interview invitation for your admission application'),
          message: [
            t('admissions.interview.emailIntro', 'You are invited to an admission interview.'),
            `${t('admissions.interview.when', 'When')}: ${when} (${form.interview_timezone || 'local'})`,
            link ? `${t('admissions.interview.link', 'Meeting link')}: ${link}` : '',
            form.interview_instructions.trim() || '',
            t('admissions.interview.emailFooter', 'Please join on time. Details are also in your applicant portal.'),
          ]
            .filter(Boolean)
            .join('\n\n'),
        })
      }

      if ((kind === 'exam' || kind === 'both') && form.emailExam && sendAdmissionNotification) {
        const when = form.exam_at ? new Date(form.exam_at).toLocaleString() : 'TBA'
        await sendAdmissionNotification({
          type: 'exam_invite',
          subject: t('admissions.exam.emailSubject', 'Entrance exam / admission test details'),
          message: [
            t('admissions.exam.emailIntro', 'Please note your entrance exam / admission test details.'),
            `${t('admissions.exam.when', 'When')}: ${when} (${form.exam_timezone || 'local'})`,
            form.exam_location_or_link.trim()
              ? `${t('admissions.exam.location', 'Location / link')}: ${form.exam_location_or_link.trim()}`
              : '',
            form.exam_instructions.trim() || '',
            t('admissions.exam.emailFooter', 'Details are also available in your applicant portal.'),
          ]
            .filter(Boolean)
            .join('\n\n'),
        })
      }

      setOk(t('admissions.interview.saved', 'Saved and notified (if email enabled).'))
      setTimeout(() => setOk(''), 4000)
      if (onUpdated) onUpdated()
    } catch (e) {
      setError(e?.message || t('admissions.interview.saveFailed', 'Failed to save'))
    } finally {
      setSaving(false)
    }
  }

  const field = (label, children) => (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  )

  const inputCls = `w-full px-3 py-2 border border-gray-300 rounded-xl text-sm ${alignStart}`

  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-gray-200 p-6 space-y-6 ${alignStart}`}>
      <div>
        <div className={`flex items-center gap-2 mb-3 ${iconRow}`}>
          <Video className="w-5 h-5 text-violet-600 shrink-0" />
          <h2 className="text-base font-bold text-gray-900">
            {t('admissions.interview.title', 'Online interview')}
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {field(
            t('admissions.interview.when', 'When'),
            <input
              type="datetime-local"
              value={form.interview_at}
              onChange={(e) => setForm((f) => ({ ...f, interview_at: e.target.value }))}
              className={inputCls}
              disabled={saving}
            />,
          )}
          {field(
            t('admissions.interview.timezone', 'Timezone'),
            <input
              type="text"
              value={form.interview_timezone}
              onChange={(e) => setForm((f) => ({ ...f, interview_timezone: e.target.value }))}
              className={inputCls}
              disabled={saving}
            />,
          )}
          <div className="md:col-span-2">
            {field(
              t('admissions.interview.link', 'Meeting link'),
              <input
                type="url"
                value={form.interview_meeting_url}
                onChange={(e) => setForm((f) => ({ ...f, interview_meeting_url: e.target.value }))}
                placeholder="https://…"
                className={inputCls}
                disabled={saving}
              />,
            )}
          </div>
          <div className="md:col-span-2">
            {field(
              t('admissions.interview.instructions', 'Instructions'),
              <textarea
                rows={3}
                value={form.interview_instructions}
                onChange={(e) => setForm((f) => ({ ...f, interview_instructions: e.target.value }))}
                className={inputCls}
                disabled={saving}
              />,
            )}
          </div>
        </div>
        <div className={`flex flex-wrap gap-4 mt-3 text-sm ${isArabicLayout ? 'flex-row-reverse' : ''}`}>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.setStatusInterview}
              onChange={(e) => setForm((f) => ({ ...f, setStatusInterview: e.target.checked }))}
              disabled={saving}
            />
            {t('admissions.interview.setRviv', 'Set status to Interview Required (RVIV)')}
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.emailInterview}
              onChange={(e) => setForm((f) => ({ ...f, emailInterview: e.target.checked }))}
              disabled={saving}
            />
            {t('admissions.interview.emailApplicant', 'Email invite to applicant')}
          </label>
        </div>
        <button
          type="button"
          onClick={() => handleSave('interview')}
          disabled={saving}
          className={`mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 ${iconRow}`}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {t('admissions.interview.saveInterview', 'Save interview')}
        </button>
      </div>

      <div className="border-t border-gray-100 pt-6">
        <div className={`flex items-center gap-2 mb-3 ${iconRow}`}>
          <GraduationCap className="w-5 h-5 text-amber-600 shrink-0" />
          <h2 className="text-base font-bold text-gray-900">
            {t('admissions.exam.title', 'Entrance exam / test')}
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {field(
            t('admissions.exam.when', 'When'),
            <input
              type="datetime-local"
              value={form.exam_at}
              onChange={(e) => setForm((f) => ({ ...f, exam_at: e.target.value }))}
              className={inputCls}
              disabled={saving}
            />,
          )}
          {field(
            t('admissions.exam.timezone', 'Timezone'),
            <input
              type="text"
              value={form.exam_timezone}
              onChange={(e) => setForm((f) => ({ ...f, exam_timezone: e.target.value }))}
              className={inputCls}
              disabled={saving}
            />,
          )}
          <div className="md:col-span-2">
            {field(
              t('admissions.exam.location', 'Location / link'),
              <input
                type="text"
                value={form.exam_location_or_link}
                onChange={(e) => setForm((f) => ({ ...f, exam_location_or_link: e.target.value }))}
                className={inputCls}
                disabled={saving}
              />,
            )}
          </div>
          <div className="md:col-span-2">
            {field(
              t('admissions.exam.instructions', 'Instructions'),
              <textarea
                rows={3}
                value={form.exam_instructions}
                onChange={(e) => setForm((f) => ({ ...f, exam_instructions: e.target.value }))}
                className={inputCls}
                disabled={saving}
              />,
            )}
          </div>
        </div>
        <div className={`flex flex-wrap gap-4 mt-3 text-sm ${isArabicLayout ? 'flex-row-reverse' : ''}`}>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.setStatusExam}
              onChange={(e) => setForm((f) => ({ ...f, setStatusExam: e.target.checked }))}
              disabled={saving}
            />
            {t('admissions.exam.setRvex', 'Set status to Entrance Exam Required (RVEX)')}
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.emailExam}
              onChange={(e) => setForm((f) => ({ ...f, emailExam: e.target.checked }))}
              disabled={saving}
            />
            {t('admissions.exam.emailApplicant', 'Email details to applicant')}
          </label>
        </div>
        <button
          type="button"
          onClick={() => handleSave('exam')}
          disabled={saving}
          className={`mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 ${iconRow}`}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {t('admissions.exam.saveExam', 'Save exam details')}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm px-3 py-2">{error}</div>
      )}
      {ok && (
        <div className="rounded-lg border border-green-200 bg-green-50 text-green-700 text-sm px-3 py-2">{ok}</div>
      )}
    </div>
  )
}
