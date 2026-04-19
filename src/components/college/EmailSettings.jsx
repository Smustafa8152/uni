import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../contexts/LanguageContext'
import { Send } from 'lucide-react'

export default function EmailSettings({
  formData,
  handleChange,
  onSendTestEmail,
  testEmailSending = false,
  testEmailFeedback = null,
  /** When true, explains that Supabase Auth emails use Dashboard SMTP, not only these saved settings. */
  showSupabaseAuthSmtpHint = false,
}) {
  const { t } = useTranslation()
  const { isRTL } = useLanguage()

  const testAddress = formData.test_email_address ?? ''
  const smtpPort = Number(formData.smtp_port)
  const smtpPortLooksLikeTypo586 = Number.isFinite(smtpPort) && smtpPort === 586

  return (
    <div className="space-y-8">
      {showSupabaseAuthSmtpHint && (
        <div
          className={`rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 ${isRTL ? 'text-right' : ''}`}
          role="note"
        >
          <p className="font-semibold text-amber-950">{t('colleges.emailSettings.supabaseAuthSmtpHintTitle')}</p>
          <p className="mt-2 text-amber-900/95 leading-relaxed">{t('colleges.emailSettings.supabaseAuthSmtpHintBody')}</p>
          <p className="mt-2">
            <a
              href="https://supabase.com/docs/guides/auth/auth-smtp"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary-700 underline hover:text-primary-800"
            >
              {t('colleges.emailSettings.supabaseAuthSmtpHintLink')}
            </a>
          </p>
          <p className="mt-4 font-semibold text-amber-950">{t('colleges.emailSettings.supabaseOtpEmailHintTitle')}</p>
          <p className="mt-2 text-amber-900/95 leading-relaxed">{t('colleges.emailSettings.supabaseOtpEmailHintBody')}</p>
          <p className="mt-2">
            <a
              href="https://supabase.com/docs/guides/auth/auth-email-templates"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-primary-700 underline hover:text-primary-800"
            >
              {t('colleges.emailSettings.supabaseOtpEmailHintLink')}
            </a>
          </p>
        </div>
      )}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('colleges.emailSettings.smtpConfiguration')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('colleges.emailSettings.smtpHost')}</label>
            <input
              type="text"
              value={formData.smtp_host}
              onChange={(e) => handleChange('smtp_host', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="smtp.gmail.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('colleges.emailSettings.smtpPort')}</label>
            <input
              type="number"
              value={formData.smtp_port}
              onChange={(e) => handleChange('smtp_port', parseInt(e.target.value, 10))}
              className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
                smtpPortLooksLikeTypo586 ? 'border-red-400' : 'border-gray-300'
              }`}
              placeholder="587"
            />
            {smtpPortLooksLikeTypo586 && (
              <p className="mt-1 text-xs text-red-700">{t('colleges.emailSettings.smtpPortTypo586')}</p>
            )}
          </div>
          <div className={`flex items-center ${isRTL ? 'flex-row-reverse' : 'justify-between'} p-4 bg-gray-50 rounded-lg`}>
            <div>
              <label className="text-sm font-medium text-gray-700">{t('colleges.emailSettings.enableSslTls')}</label>
            </div>
            <input
              type="checkbox"
              checked={formData.enable_ssl}
              onChange={(e) => handleChange('enable_ssl', e.target.checked)}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('colleges.emailSettings.smtpUsername')}</label>
            <input
              type="text"
              value={formData.smtp_username}
              onChange={(e) => handleChange('smtp_username', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('colleges.emailSettings.smtpPassword')}</label>
            <input
              type="password"
              value={formData.smtp_password}
              onChange={(e) => handleChange('smtp_password', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('colleges.emailSettings.fromEmailAddress')}</label>
            <input
              type="email"
              value={formData.from_email}
              onChange={(e) => handleChange('from_email', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder={t('colleges.emailSettings.fromEmailAddressPlaceholder')}
            />
            <p className="text-xs text-gray-500 mt-1">{t('colleges.emailSettings.fromEmailAddressHint')}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('colleges.emailSettings.fromName')}</label>
            <input
              type="text"
              value={formData.from_name}
              onChange={(e) => handleChange('from_name', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder={t('colleges.emailSettings.fromNamePlaceholder')}
            />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('colleges.emailSettings.notificationSettings')}</h3>
        <div className={`flex items-center ${isRTL ? 'flex-row-reverse' : 'justify-between'} p-4 bg-gray-50 rounded-lg`}>
          <div>
            <label className="text-sm font-medium text-gray-700">{t('colleges.emailSettings.enableEmailNotifications')}</label>
            <p className="text-xs text-gray-500">{t('colleges.emailSettings.enableEmailNotificationsDesc')}</p>
          </div>
          <input
            type="checkbox"
            checked={formData.enable_email_notifications}
            onChange={(e) => handleChange('enable_email_notifications', e.target.checked)}
            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('colleges.emailSettings.testEmailConfiguration')}</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('colleges.emailSettings.testEmailAddress')}</label>
            <input
              type="email"
              value={testAddress}
              onChange={(e) => handleChange('test_email_address', e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder={t('colleges.emailSettings.testEmailAddressPlaceholder')}
            />
          </div>
          {onSendTestEmail && (
            <div className={`flex flex-wrap items-center gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <button
                type="button"
                onClick={onSendTestEmail}
                disabled={testEmailSending}
                className={`inline-flex items-center ${isRTL ? 'flex-row-reverse space-x-reverse' : 'space-x-2'} px-4 py-2 rounded-lg font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <Send className="w-4 h-4" />
                <span>{t('colleges.emailSettings.sendTestEmail')}</span>
              </button>
              {testEmailFeedback?.kind === 'success' && (
                <p className="text-sm text-green-700">{testEmailFeedback.text}</p>
              )}
              {testEmailFeedback?.kind === 'error' && (
                <p className="text-sm text-red-700">{testEmailFeedback.text}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}




