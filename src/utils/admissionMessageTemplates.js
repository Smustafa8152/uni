/** Message / email templates for admissions communication */

export const ADMISSION_MESSAGE_TEMPLATES = [
  {
    key: 'finish_application',
    labelEn: 'Finish the application',
    labelAr: 'إكمال الطلب',
    subjectEn: 'Action required: finish your application',
    subjectAr: 'مطلوب إجراء: أكمل طلبك',
    bodyEn:
      'Dear applicant,\n\nYour application is still a draft. Please log in to the applicant portal and complete it so admissions can start the review.\n\nThank you.',
    bodyAr:
      'عزيزي المتقدم،\n\nطلبك ما زال مسودة. يرجى تسجيل الدخول إلى بوابة المتقدم وإكماله حتى تبدأ المراجعة.\n\nشكرًا لك.',
  },
  {
    key: 'correct_application',
    labelEn: 'Correct the application',
    labelAr: 'تصحيح الطلب',
    subjectEn: 'Action required: correct your application',
    subjectAr: 'مطلوب إجراء: صحّح طلبك',
    bodyEn:
      'Dear applicant,\n\nAdmissions could not accept the application as submitted. Please log in to the applicant portal and update the details that were requested.\n\nThank you.',
    bodyAr:
      'عزيزي المتقدم،\n\nتعذّر قبول الطلب كما هو. يرجى تسجيل الدخول إلى بوابة المتقدم وتحديث البيانات المطلوبة.\n\nشكرًا لك.',
  },
  {
    key: 'payment_due',
    labelEn: 'Registration fee due',
    labelAr: 'رسوم التسجيل مستحقة',
    subjectEn: 'Action required: registration fee',
    subjectAr: 'مطلوب إجراء: رسوم التسجيل',
    bodyEn:
      'Dear applicant,\n\nThe registration fee is due before the review can continue. Please log in to the applicant portal and complete the payment.\n\nThank you.',
    bodyAr:
      'عزيزي المتقدم،\n\nرسوم التسجيل مستحقة قبل متابعة المراجعة. يرجى تسجيل الدخول إلى بوابة المتقدم وإتمام الدفع.\n\nشكرًا لك.',
  },
  {
    key: 'missing_documents',
    labelEn: 'Request missing documents',
    labelAr: 'طلب مستندات ناقصة',
    subjectEn: 'Action required: additional documents needed',
    subjectAr: 'مطلوب إجراء: مستندات إضافية',
    bodyEn:
      'Dear applicant,\n\nAdmissions requires additional documents for your application. Please log in to the applicant portal and upload the requested items as soon as possible so we can continue reviewing your file.\n\nThank you.',
    bodyAr:
      'عزيزي المتقدم،\n\nتحتاج إدارة القبول إلى مستندات إضافية لاستكمال طلبك. يرجى تسجيل الدخول إلى بوابة المتقدم ورفع المستندات المطلوبة في أقرب وقت.\n\nشكرًا لك.',
  },
  {
    key: 'admission_decision',
    labelEn: 'Admission decision update',
    labelAr: 'تحديث قرار القبول',
    subjectEn: 'Update regarding your admission application',
    subjectAr: 'تحديث بخصوص طلب القبول',
    bodyEn:
      'Dear applicant,\n\nThere is an important update regarding your admission application. Please check your applicant portal for the latest status and any next steps.\n\nIf you have questions, reply in the portal messages or contact admissions.\n\nThank you.',
    bodyAr:
      'عزيزي المتقدم،\n\nيوجد تحديث مهم بخصوص طلب القبول. يرجى مراجعة بوابة المتقدم لمعرفة الحالة الحالية والخطوات التالية.\n\nشكرًا لك.',
  },
  {
    key: 'interview_invite',
    labelEn: 'Interview invitation',
    labelAr: 'دعوة مقابلة',
    subjectEn: 'Interview invitation for your admission application',
    subjectAr: 'دعوة لمقابلة بخصوص طلب القبول',
    bodyEn:
      'Dear applicant,\n\nYou are invited to an admission interview. Please see the date/time and meeting link in your applicant portal (and below if included).\n\nJoin on time and keep a stable internet connection for online interviews.\n\nThank you.',
    bodyAr:
      'عزيزي المتقدم،\n\nتمت دعوتك لمقابلة قبول. يرجى الاطلاع على الموعد ورابط الاجتماع في بوابة المتقدم.\n\nشكرًا لك.',
  },
  {
    key: 'exam_invite',
    labelEn: 'Entrance exam / test date',
    labelAr: 'موعد اختبار القبول',
    subjectEn: 'Entrance exam / admission test details',
    subjectAr: 'تفاصيل اختبار القبول',
    bodyEn:
      'Dear applicant,\n\nPlease find below / in your portal the date and details for your admission test or entrance exam. Attend on time and bring any required identification.\n\nApplicants in The Gambia: please confirm attendance and complete any remaining admission procedures as instructed.\n\nThank you.',
    bodyAr:
      'عزيزي المتقدم،\n\nيرجى الاطلاع على موعد وتفاصيل اختبار القبول في البوابة أو في هذه الرسالة. التزم بالموعد وأحضر إثبات الهوية المطلوب.\n\nشكرًا لك.',
  },
  {
    key: 'gambia_procedures',
    labelEn: 'Gambia: test / interview & procedures',
    labelAr: 'غامبيا: الاختبار/المقابلة والإجراءات',
    subjectEn: 'Important: admission test & interview arrangements (The Gambia)',
    subjectAr: 'هام: ترتيبات اختبار ومقابلة القبول (غامبيا)',
    bodyEn:
      'Dear applicant in The Gambia,\n\nPlease note the upcoming admission test and/or interview arrangements for your application. Check your portal for the exact date, time, and meeting/location details.\n\nComplete any remaining admission procedures promptly so you can begin studies on schedule.\n\nThank you.',
    bodyAr:
      'عزيزي المتقدم في غامبيا،\n\nيرجى ملاحظة ترتيبات اختبار و/أو مقابلة القبول القادمة. راجع البوابة لمعرفة الموعد والتفاصيل.\n\nأكمل أي إجراءات متبقية في أقرب وقت.\n\nشكرًا لك.',
  },
  {
    key: 'international_travel',
    labelEn: 'International: visa & travel checklist',
    labelAr: 'دولي: تأشيرة والسفر',
    subjectEn: 'Important updates: admission, visa, and travel',
    subjectAr: 'تحديثات هامة: القبول والتأشيرة والسفر',
    bodyEn:
      'Dear international applicant,\n\nPlease review the following checklist regarding your admission decision, visa, and travel arrangements:\n\n1) Confirm your admission status in the applicant portal.\n2) Prepare passport and any documents required for a student visa / embassy letter.\n3) Plan travel only after you receive official confirmation and fee/payment instructions.\n4) Contact admissions via portal messages if you need a supporting letter or clarification.\n\nWe look forward to welcoming you.\n\nThank you.',
    bodyAr:
      'عزيزي المتقدم الدولي،\n\nيرجى مراجعة قائمة التحقق التالية بخصوص قرار القبول والتأشيرة وترتيبات السفر:\n\n1) تأكيد حالة القبول في بوابة المتقدم.\n2) تجهيز جواز السفر والمستندات المطلوبة للتأشيرة.\n3) التخطيط للسفر بعد التأكيد الرسمي وتعليمات الرسوم.\n4) التواصل مع القبول عبر رسائل البوابة عند الحاجة.\n\nشكرًا لك.',
  },
  {
    key: 'complete_enrollment',
    labelEn: 'Complete enrollment',
    labelAr: 'إكمال التسجيل',
    subjectEn: 'Action required: complete your enrollment',
    subjectAr: 'مطلوب إجراء: أكمل التسجيل',
    bodyEn:
      'Dear applicant,\n\nYou have been accepted. Please log in and finish enrollment so your student account can be activated.\n\nThank you.',
    bodyAr:
      'عزيزي المتقدم،\n\nتم قبولك. يرجى تسجيل الدخول وإكمال التسجيل لتفعيل حساب الطالب.\n\nشكرًا لك.',
  },
  {
    key: 'general_update',
    labelEn: 'General application update',
    labelAr: 'تحديث عام للطلب',
    subjectEn: 'Update regarding your application',
    subjectAr: 'تحديث بخصوص طلبك',
    bodyEn: 'Dear applicant,\n\nPlease see this important update regarding your admission application.\n\nThank you.',
    bodyAr: 'عزيزي المتقدم،\n\nيرجى الاطلاع على هذا التحديث الهام بخصوص طلب القبول.\n\nشكرًا لك.',
  },
]

export function getAdmissionTemplate(key, isArabic = false) {
  const tpl = ADMISSION_MESSAGE_TEMPLATES.find((t) => t.key === key) || ADMISSION_MESSAGE_TEMPLATES[ADMISSION_MESSAGE_TEMPLATES.length - 1]
  return {
    key: tpl.key,
    label: isArabic ? tpl.labelAr : tpl.labelEn,
    subject: isArabic ? tpl.subjectAr : tpl.subjectEn,
    body: isArabic ? tpl.bodyAr : tpl.bodyEn,
  }
}

/** Statuses where the applicant must do something. Each one has an email template. */
export const ACTION_STATUS_TEMPLATE = {
  APDR: 'finish_application',
  APIV: 'correct_application',
  APPN: 'payment_due',
  RVRI: 'missing_documents',
  RVIV: 'interview_invite',
  RVEX: 'exam_invite',
  ENPN: 'complete_enrollment',
}

export function emailForActionStatus(statusCode, isArabic = false, extraNote = '') {
  const key = ACTION_STATUS_TEMPLATE[String(statusCode || '').toUpperCase()]
  if (!key) return null
  const tpl = getAdmissionTemplate(key, isArabic)
  const note = String(extraNote || '').trim()
  return {
    ...tpl,
    body: note && note !== tpl.body.trim() ? `${tpl.body}\n\n${note}` : tpl.body,
  }
}
