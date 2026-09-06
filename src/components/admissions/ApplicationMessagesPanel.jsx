import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MessageSquare, Send, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { ADMISSION_MESSAGE_TEMPLATES, getAdmissionTemplate } from '../../utils/admissionMessageTemplates'

/**
 * Staff ↔ applicant message thread for one application.
 * mode: 'staff' | 'applicant'
 */
export default function ApplicationMessagesPanel({
  application,
  mode = 'staff',
  staffUserId = null,
  isArabicLayout = false,
  alignStart = 'text-left',
  iconRow = 'flex-row',
}) {
  const { t } = useTranslation()
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [body, setBody] = useState('')
  const [subject, setSubject] = useState('')
  const [templateKey, setTemplateKey] = useState('')
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')

  const applicationId = application?.id

  const loadMessages = useCallback(async () => {
    if (!applicationId) return
    setLoading(true)
    setError('')
    try {
      const { data, error: qErr } = await supabase
        .from('application_messages')
        .select('id, sender_role, body, template_key, created_at, read_at')
        .eq('application_id', applicationId)
        .order('created_at', { ascending: true })
      if (qErr) throw qErr
      setMessages(data || [])

      // Mark opposite-party messages as read
      const opposite = mode === 'staff' ? 'applicant' : 'staff'
      const unread = (data || []).filter((m) => m.sender_role === opposite && !m.read_at)
      if (unread.length) {
        await supabase
          .from('application_messages')
          .update({ read_at: new Date().toISOString() })
          .in(
            'id',
            unread.map((m) => m.id),
          )
      }
    } catch (e) {
      setError(e?.message || t('admissions.messages.loadFailed', 'Failed to load messages'))
    } finally {
      setLoading(false)
    }
  }, [applicationId, mode, t])

  useEffect(() => {
    loadMessages()
  }, [loadMessages])

  const applyTemplate = (key) => {
    setTemplateKey(key)
    if (!key) return
    const tpl = getAdmissionTemplate(key, isArabicLayout)
    setSubject(tpl.subject)
    setBody(tpl.body)
  }

  const sendEmail = async ({ type, to, emailSubject, emailBody }) => {
    try {
      await supabase.functions.invoke('send-admission-notification', {
        body: {
          scope: 'college',
          collegeId: application?.college_id ?? null,
          to,
          type,
          subject: emailSubject,
          message: emailBody,
          applicationId: application.id,
          application: {
            id: application.id,
            application_number: application.application_number,
          },
        },
      })
    } catch (e) {
      console.warn('Message email failed:', e?.message || e)
    }
  }

  const handleSend = async () => {
    const text = body.trim()
    if (!text || !applicationId) return
    setSending(true)
    setError('')
    setOk('')
    try {
      const { data: inserted, error: insErr } = await supabase
        .from('application_messages')
        .insert({
          application_id: applicationId,
          sender_role: mode === 'staff' ? 'staff' : 'applicant',
          body: text,
          template_key: templateKey || null,
          created_by: mode === 'staff' ? staffUserId : null,
        })
        .select('id')
        .single()
      if (insErr) throw insErr

      if (mode === 'staff' && application?.email) {
        const emailSubject =
          subject.trim() ||
          t('admissions.messages.defaultSubject', 'Message from Admissions')
        await sendEmail({
          type: 'application_message',
          to: application.email,
          emailSubject,
          emailBody: text,
        })
      }

      setBody('')
      setSubject('')
      setTemplateKey('')
      setOk(t('admissions.messages.sent', 'Message sent'))
      setTimeout(() => setOk(''), 3000)
      await loadMessages()
      void inserted
    } catch (e) {
      setError(e?.message || t('admissions.messages.sendFailed', 'Failed to send message'))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className={`bg-white rounded-2xl shadow-sm border border-gray-200 p-6 ${alignStart}`}>
      <div className={`flex items-center gap-2 mb-4 ${iconRow}`}>
        <MessageSquare className="w-5 h-5 text-indigo-600 shrink-0" />
        <h2 className="text-base font-bold text-gray-900">
          {t('admissions.messages.title', 'Messages')}
        </h2>
      </div>
      <p className="text-xs text-gray-500 mb-3">
        {mode === 'staff'
          ? t(
              'admissions.messages.staffHint',
              'Message the applicant. They receive an email and can reply in the portal.',
            )
          : t(
              'admissions.messages.applicantHint',
              'Messages from admissions appear here. Replies are saved on your application.',
            )}
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500 py-6">
          <Loader2 className="w-4 h-4 animate-spin" />
          {t('common.loading', 'Loading…')}
        </div>
      ) : (
        <div className="space-y-3 max-h-72 overflow-y-auto mb-4 rounded-xl border border-gray-100 bg-gray-50/50 p-3">
          {messages.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">
              {t('admissions.messages.empty', 'No messages yet.')}
            </p>
          ) : (
            messages.map((m) => {
              const mine =
                (mode === 'staff' && m.sender_role === 'staff') ||
                (mode === 'applicant' && m.sender_role === 'applicant')
              return (
                <div
                  key={m.id}
                  className={`rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
                    mine
                      ? 'bg-indigo-600 text-white ms-8'
                      : 'bg-white border border-gray-200 text-gray-800 me-8'
                  }`}
                >
                  <div className={`text-[10px] mb-1 opacity-80 ${mine ? 'text-indigo-100' : 'text-gray-500'}`}>
                    {m.sender_role === 'staff'
                      ? t('admissions.messages.fromStaff', 'Admissions')
                      : t('admissions.messages.fromApplicant', 'Applicant')}
                    {' · '}
                    {m.created_at ? new Date(m.created_at).toLocaleString() : ''}
                  </div>
                  {m.body}
                </div>
              )
            })
          )}
        </div>
      )}

      {mode === 'staff' && (
        <div className="mb-3 space-y-2">
          <label className="block text-xs font-semibold text-gray-600">
            {t('admissions.messages.template', 'Template')}
          </label>
          <select
            value={templateKey}
            onChange={(e) => applyTemplate(e.target.value)}
            className={`w-full px-3 py-2 border border-gray-300 rounded-xl text-sm ${alignStart}`}
            dir={isArabicLayout ? 'rtl' : 'ltr'}
            disabled={sending}
          >
            <option value="">{t('admissions.messages.templateNone', 'Custom message')}</option>
            {ADMISSION_MESSAGE_TEMPLATES.map((tpl) => (
              <option key={tpl.key} value={tpl.key}>
                {isArabicLayout ? tpl.labelAr : tpl.labelEn}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={t('admissions.messages.emailSubject', 'Email subject')}
            className={`w-full px-3 py-2 border border-gray-300 rounded-xl text-sm ${alignStart}`}
            dir={isArabicLayout ? 'rtl' : 'ltr'}
            disabled={sending}
          />
        </div>
      )}

      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        placeholder={t('admissions.messages.placeholder', 'Write your message…')}
        className={`w-full px-3 py-2 border border-gray-300 rounded-xl text-sm mb-3 ${alignStart}`}
        dir={isArabicLayout ? 'rtl' : 'ltr'}
        disabled={sending}
      />

      {error && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm px-3 py-2">{error}</div>
      )}
      {ok && (
        <div className="mb-3 rounded-lg border border-green-200 bg-green-50 text-green-700 text-sm px-3 py-2">{ok}</div>
      )}

      <button
        type="button"
        onClick={handleSend}
        disabled={sending || !body.trim()}
        className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 ${iconRow}`}
      >
        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        {t('admissions.messages.send', 'Send')}
      </button>
    </div>
  )
}
