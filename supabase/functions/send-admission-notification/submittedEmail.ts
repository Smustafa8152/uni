/**
 * "We received your application" email, in Arabic or English.
 *
 * The whole message is built here from the saved application, so the applicant always
 * gets the real number, program and date, in the language they applied in.
 * Tables and inline styles only, system fonts, one remote image (the logo):
 * that is what Gmail, Outlook and phone mail apps render the same way.
 */
import { escapeHtml } from './email.ts'

export type SubmittedLang = 'ar' | 'en'

export type SubmittedEmailInput = {
  lang: SubmittedLang
  applicantName?: string
  applicationNumber: string
  program?: string
  college?: string
  semester?: string
  submittedAt?: string | Date | null
  recipientEmail?: string
  portalUrl: string
  brandName?: string
  brandEmail?: string
  logoUrl?: string
  timeZone?: string
}

const DEFAULT_LOGO_URL = 'https://qalam.nuzum.tech/assets/IBU%20Logo.png'
/** System fonts only: they carry Arabic well and keep the message small. */
const FONT = "Tahoma, 'Segoe UI', Arial, sans-serif"
const MONO = "'Courier New', Consolas, monospace"

const NAVY = '#1a3a6b'
const GOLD = '#c8a84b'
const INK = '#1e2a3a'
const MUTED = '#6b7a99'
const LINE = '#dde3ef'
const PAGE = '#f4f6fb'

const STRINGS = {
  en: {
    subject: (no: string) => `We received your application ${no}`.trim(),
    preheader: (no: string) => `Application ${no} is with the admissions team. Keep this email for your records.`,
    badge: 'Application received',
    title: 'We received your application',
    hello: (name: string) => (name ? `Hello ${name},` : 'Hello,'),
    intro: 'Thank you for applying. Your application reached the admissions team and is waiting for review.',
    numberLabel: 'Your application number',
    numberHint: 'Keep this number. You will need it whenever you contact admissions.',
    program: 'Program',
    college: 'College',
    semester: 'Semester',
    submitted: 'Submitted on',
    nextTitle: 'What happens next',
    steps: [
      'The admissions team reviews your application and documents.',
      'If a document is missing, or an interview or entrance exam is needed, we email you at this address.',
      'You receive the decision by email, and it also appears in the applicant portal.',
    ],
    button: 'Follow your application',
    signIn: (email: string) => (email ? `Sign in with ${email} to see the status at any time.` : 'Sign in to see the status at any time.'),
    notYou: 'If you did not submit this application, you can ignore this email.',
    automated: 'This is an automated message. Replies to it may not be read.',
    contact: (email: string) => `Questions? Write to ${email}`,
    fallbackBrand: 'University Admissions',
  },
  ar: {
    subject: (no: string) => `استلمنا طلبك رقم ${no}`.trim(),
    preheader: (no: string) => `طلبك رقم ${no} لدى فريق القبول. احتفظ بهذه الرسالة للرجوع إليها.`,
    badge: 'تم استلام الطلب',
    title: 'استلمنا طلبك',
    hello: (name: string) => (name ? `مرحباً ${name}،` : 'مرحباً،'),
    intro: 'شكراً لتقديمك. وصل طلبك إلى فريق القبول وهو الآن بانتظار المراجعة.',
    numberLabel: 'رقم طلبك',
    numberHint: 'احتفظ بهذا الرقم، فستحتاجه عند كل تواصل مع القبول.',
    program: 'البرنامج',
    college: 'الكلية',
    semester: 'الفصل الدراسي',
    submitted: 'تاريخ التقديم',
    nextTitle: 'ماذا بعد',
    steps: [
      'يراجع فريق القبول طلبك ومستنداتك.',
      'إذا نقص مستند، أو لزمت مقابلة أو اختبار قبول، نراسلك على هذا البريد.',
      'يصلك القرار على البريد، ويظهر كذلك في بوابة المتقدم.',
    ],
    button: 'متابعة الطلب',
    signIn: (email: string) => (email ? `سجّل الدخول بالبريد ${email} لمعرفة حالة الطلب في أي وقت.` : 'سجّل الدخول لمعرفة حالة الطلب في أي وقت.'),
    notYou: 'إن لم تكن أنت من قدّم هذا الطلب فتجاهل هذه الرسالة.',
    automated: 'هذه رسالة آلية، وقد لا تُقرأ الردود عليها.',
    contact: (email: string) => `للاستفسار راسلنا على ${email}`,
    fallbackBrand: 'القبول والتسجيل',
  },
}

/** Anything that is not clearly Arabic is sent in English. */
export function normalizeLang(value: unknown): SubmittedLang {
  return String(value || '').trim().toLowerCase().startsWith('ar') ? 'ar' : 'en'
}

function formatDate(value: string | Date | null | undefined, lang: SubmittedLang, timeZone: string) {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const locale = lang === 'ar' ? 'ar-u-nu-latn' : 'en-GB'
  try {
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone }).format(date)
  } catch {
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
  }
}

const clean = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim()

export function buildApplicationSubmittedEmail(input: SubmittedEmailInput) {
  const lang = normalizeLang(input.lang)
  const s = STRINGS[lang]
  const rtl = lang === 'ar'
  const dir = rtl ? 'rtl' : 'ltr'
  const start = rtl ? 'right' : 'left'
  const end = rtl ? 'left' : 'right'

  const name = clean(input.applicantName)
  const number = clean(input.applicationNumber)
  const email = clean(input.recipientEmail)
  const brand = clean(input.brandName) || s.fallbackBrand
  const brandEmail = clean(input.brandEmail)
  const logoUrl = clean(input.logoUrl) || DEFAULT_LOGO_URL
  const portalUrl = clean(input.portalUrl)
  const when = formatDate(input.submittedAt, lang, input.timeZone || 'Asia/Kuwait')

  const details = [
    [s.program, clean(input.program)],
    [s.college, clean(input.college)],
    [s.semester, clean(input.semester)],
    [s.submitted, when],
  ].filter(([, value]) => value)

  const subject = s.subject(number)

  // ---- plain text (shown by clients that block HTML, and by screen readers) ----
  const text =
    [
      s.title,
      '',
      s.hello(name),
      s.intro,
      '',
      `${s.numberLabel}: ${number}`,
      ...details.map(([label, value]) => `${label}: ${value}`),
      '',
      `${s.nextTitle}:`,
      ...s.steps.map((step, i) => `${i + 1}. ${step}`),
      '',
      `${s.button}: ${portalUrl}`,
      s.signIn(email),
      '',
      s.notYou,
      s.automated,
      brandEmail ? s.contact(brandEmail) : '',
      brand,
    ]
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim() + '\n'

  // ---- html ----
  const cell = `font-family:${FONT};direction:${dir};text-align:${start};`

  const detailRows = details
    .map(
      ([label, value], i) => `
                <tr>
                  <td align="${start}" valign="top" style="${cell}padding:12px 0;${i ? `border-top:1px solid ${LINE};` : ''}font-size:13px;line-height:1.6;color:${MUTED};width:38%;">${escapeHtml(label)}</td>
                  <td align="${end}" valign="top" style="font-family:${FONT};direction:${dir};text-align:${end};padding:12px 0;${i ? `border-top:1px solid ${LINE};` : ''}font-size:15px;line-height:1.6;font-weight:700;color:${INK};">${escapeHtml(value)}</td>
                </tr>`
    )
    .join('')

  const stepRows = s.steps
    .map(
      (step, i) => `
                <tr>
                  <td width="40" valign="top" align="${start}" style="padding:0 0 14px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                      <td width="28" height="28" align="center" valign="middle" bgcolor="${GOLD}" style="width:28px;height:28px;border-radius:14px;font-family:${FONT};font-size:14px;line-height:28px;font-weight:700;color:#12284c;">${i + 1}</td>
                    </tr></table>
                  </td>
                  <td valign="top" style="${cell}padding:3px 0 14px;font-size:15px;line-height:1.7;color:${INK};">${escapeHtml(step)}</td>
                </tr>`
    )
    .join('')

  const html = `<!doctype html>
<html lang="${lang}" dir="${dir}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body dir="${dir}" style="margin:0;padding:0;background:${PAGE};color:${INK};direction:${dir};font-family:${FONT};-webkit-text-size-adjust:100%;">
    <div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(s.preheader(number))}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAGE}" style="background:${PAGE};">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" dir="${dir}" style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${LINE};border-radius:14px;">

            <tr>
              <td align="center" style="padding:28px 24px 0;">
                <img src="${escapeHtml(logoUrl)}" height="60" alt="${escapeHtml(brand)}" style="display:block;height:60px;width:auto;max-width:220px;border:0;outline:none;font-family:${FONT};font-size:16px;font-weight:700;color:${NAVY};" />
              </td>
            </tr>

            <tr>
              <td align="center" style="padding:20px 24px 0;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                  <td bgcolor="#e6f7ef" style="background:#e6f7ef;border-radius:999px;padding:6px 14px;font-family:${FONT};direction:${dir};font-size:13px;line-height:1.4;font-weight:700;color:#1a7a4a;">&#10003;&nbsp; ${escapeHtml(s.badge)}</td>
                </tr></table>
                <h1 style="margin:14px 0 0;font-family:${FONT};direction:${dir};text-align:center;font-size:24px;line-height:1.4;font-weight:700;color:${NAVY};">${escapeHtml(s.title)}</h1>
              </td>
            </tr>

            <tr>
              <td style="${cell}padding:18px 28px 0;font-size:15px;line-height:1.8;color:${INK};">
                <p style="margin:0 0 6px;font-weight:700;">${escapeHtml(s.hello(name))}</p>
                <p style="margin:0;">${escapeHtml(s.intro)}</p>
              </td>
            </tr>

            <tr>
              <td style="padding:22px 28px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${NAVY}" style="background:${NAVY};border-radius:12px;border-top:4px solid ${GOLD};">
                  <tr>
                    <td align="center" style="padding:20px 16px 18px;font-family:${FONT};">
                      <div style="direction:${dir};font-size:13px;line-height:1.5;color:#c9d4e8;">${escapeHtml(s.numberLabel)}</div>
                      <div dir="ltr" style="direction:ltr;unicode-bidi:embed;margin-top:6px;font-family:${MONO};font-size:22px;line-height:1.4;font-weight:700;letter-spacing:0.5px;white-space:nowrap;color:#ffffff;">${escapeHtml(number)}</div>
                      <div style="direction:${dir};margin-top:8px;font-size:13px;line-height:1.6;color:#c9d4e8;">${escapeHtml(s.numberHint)}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
${
  details.length
    ? `
            <tr>
              <td style="padding:14px 28px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" dir="${dir}">${detailRows}
                </table>
              </td>
            </tr>`
    : ''
}
            <tr>
              <td style="padding:22px 28px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAGE}" style="background:${PAGE};border-radius:12px;">
                  <tr>
                    <td style="padding:18px 18px 4px;">
                      <h2 style="margin:0 0 14px;${cell}font-size:16px;line-height:1.5;font-weight:700;color:${NAVY};">${escapeHtml(s.nextTitle)}</h2>
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" dir="${dir}">${stepRows}
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td align="center" style="padding:24px 28px 0;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                  <td align="center" bgcolor="${NAVY}" style="background:${NAVY};border-radius:10px;">
                    <a href="${escapeHtml(portalUrl)}" target="_blank" style="display:inline-block;padding:14px 30px;font-family:${FONT};direction:${dir};font-size:16px;line-height:1.3;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">${escapeHtml(s.button)}</a>
                  </td>
                </tr></table>
                <p style="margin:12px 0 0;font-family:${FONT};direction:${dir};text-align:center;font-size:13px;line-height:1.7;color:${MUTED};">${escapeHtml(s.signIn(email))}</p>
              </td>
            </tr>

            <tr>
              <td style="padding:24px 28px 26px;">
                <div style="border-top:1px solid ${LINE};padding-top:16px;${cell}font-size:12px;line-height:1.8;color:${MUTED};">
                  <div>${escapeHtml(s.notYou)}</div>
                  <div>${escapeHtml(s.automated)}</div>${brandEmail ? `\n                  <div>${escapeHtml(s.contact(brandEmail))}</div>` : ''}
                </div>
              </td>
            </tr>

          </table>
          <p style="margin:14px 0 0;font-family:${FONT};text-align:center;font-size:12px;line-height:1.6;color:#8f9bb5;">${escapeHtml(brand)}</p>
        </td>
      </tr>
    </table>
  </body>
</html>`

  return { subject, html, text, lang }
}
