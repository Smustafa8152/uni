/**
 * Confirmation email after an application is submitted, in the language the applicant used.
 * Best effort: it never throws, so a mail problem cannot undo a saved application.
 *
 * The email itself (wording, layout, details) is built by the send-admission-notification
 * function from the saved application. The subject and message below are only used by an
 * older copy of that function that does not have the template yet.
 */
const FALLBACK = {
  en: {
    subject: (no) => `We received your application ${no}`.trim(),
    message: (no) =>
      [
        `Thank you for applying. Your application${no ? ` (${no})` : ''} reached the admissions team and is waiting for review.`,
        '',
        'If a document is missing, or an interview or entrance exam is needed, we email you at this address. You receive the decision by email as well.',
        '',
        'You can follow your application in the applicant portal using this email address.',
      ].join('\n'),
  },
  ar: {
    subject: (no) => `استلمنا طلبك رقم ${no}`.trim(),
    message: (no) =>
      [
        `شكراً لتقديمك. وصل طلبك${no ? ` رقم ${no}` : ''} إلى فريق القبول وهو الآن بانتظار المراجعة.`,
        '',
        'إذا نقص مستند، أو لزمت مقابلة أو اختبار قبول، نراسلك على هذا البريد. ويصلك القرار على البريد كذلك.',
        '',
        'يمكنك متابعة طلبك في بوابة المتقدم باستخدام هذا البريد.',
      ].join('\n'),
  },
}

export async function notifyApplicationSubmitted(supabase, application, { isDraft = false, language = 'en' } = {}) {
  if (isDraft || !application?.id || !application?.email) {
    return { sent: false, skipped: true }
  }

  const lang = String(language || '').toLowerCase().startsWith('ar') ? 'ar' : 'en'
  const appNo = application.application_number || String(application.id)

  try {
    const { data, error } = await supabase.functions.invoke('send-admission-notification', {
      body: {
        scope: 'college',
        collegeId: application.college_id ?? null,
        to: application.email,
        type: 'submitted',
        language: lang,
        subject: FALLBACK[lang].subject(appNo),
        message: FALLBACK[lang].message(appNo),
        applicationId: application.id,
        application: {
          id: application.id,
          application_number: application.application_number,
        },
      },
    })
    if (error) {
      console.warn('Application submitted email failed:', error.message || error)
      return { sent: false, error: error.message || String(error) }
    }
    if (data?.error) {
      console.warn('Application submitted email rejected:', data.error)
      return { sent: false, error: data.error }
    }
    if (data?.skipped) return { sent: false, skipped: true }
    return { sent: true, language: lang }
  } catch (e) {
    console.warn('Application submitted email failed:', e?.message || e)
    return { sent: false, error: e?.message || String(e) }
  }
}
