/**
 * Best-effort confirmation email after an application is submitted.
 * Does not throw — failures are logged and returned for optional UI soft-warn.
 */
export async function notifyApplicationSubmitted(supabase, application, { isDraft = false } = {}) {
  if (isDraft || !application?.id || !application?.email) {
    return { sent: false, skipped: true }
  }

  const appNo = application.application_number || String(application.id)
  const subject = 'Application received'
  const message = [
    `Thank you for submitting your admission application${appNo ? ` (${appNo})` : ''}.`,
    '',
    'Our admissions team will review your application and contact you by email with any updates, document requests, or next steps (including interviews or entrance exams when required).',
    '',
    'You can track your application status in the applicant portal using the email address you provided.',
  ].join('\n')

  try {
    const { data, error } = await supabase.functions.invoke('send-admission-notification', {
      body: {
        scope: 'college',
        collegeId: application.college_id ?? null,
        to: application.email,
        type: 'submitted',
        subject,
        message,
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
    return { sent: true }
  } catch (e) {
    console.warn('Application submitted email failed:', e?.message || e)
    return { sent: false, error: e?.message || String(e) }
  }
}
