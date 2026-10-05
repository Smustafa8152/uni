export function escapeHtml(s: string) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

const DEFAULT_LOGO_URL = 'https://qalam.nuzum.tech/assets/IBU%20Logo.png'

/** System fonts only. Embedded web fonts push the message over Gmail's ~102KB clip limit. */
const FONT_STACK = "Tahoma, 'Segoe UI', Arial, sans-serif"

export type EmailDetail = { label: string; value: string }

function hasArabicScript(text: string) {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(String(text || ''))
}

function normalizeDetails(details?: EmailDetail[]) {
  if (!Array.isArray(details)) return []
  return details
    .map((d) => ({
      label: String(d?.label || '').trim(),
      value: String(d?.value || '').trim(),
    }))
    .filter((d) => d.label && d.value)
    .slice(0, 12)
}

function detailValueHtml(value: string) {
  const safe = escapeHtml(value).replaceAll('\n', '<br/>')
  if (/^https?:\/\//i.test(value.trim())) {
    const href = escapeHtml(value.trim())
    return `<a href="${href}" style="color:#1a3a6b;word-break:break-all;">${safe}</a>`
  }
  return safe
}

export function buildPlainTextEmail(params: {
  subject: string
  message: string
  metaLine?: string
  details?: EmailDetail[]
}) {
  const subject = String(params.subject || '').trim()
  const msg = String(params.message || '').trim()
  const meta = params.metaLine ? String(params.metaLine).trim() : ''
  const detailLines = normalizeDetails(params.details)
    .map((d) => `${d.label}: ${d.value}`)
    .join('\n')
  return [subject, msg, detailLines, meta].filter(Boolean).join('\n\n').trim() + '\n'
}

export function buildBrandedEmailHtml(params: {
  brandName?: string
  brandEmail?: string
  logoUrl?: string
  subject: string
  message: string
  metaLabel?: string
  metaValue?: string
  footerLines?: string[]
  isArabic?: boolean
  details?: EmailDetail[]
}) {
  const brandName = String(params.brandName || '').trim()
  const brandEmail = String(params.brandEmail || '').trim()
  const logoUrl = String(params.logoUrl || DEFAULT_LOGO_URL).trim()
  const subject = String(params.subject || '').trim()
  const message = String(params.message || '').trim()
  const metaLabel = String(params.metaLabel || '').trim()
  const metaValue = String(params.metaValue || '').trim()
  const footerLines = Array.isArray(params.footerLines) ? params.footerLines.filter(Boolean).map(String) : []
  const details = normalizeDetails(params.details)

  const isArabic =
    typeof params.isArabic === 'boolean' ? params.isArabic : hasArabicScript(`${subject}\n${message}`)
  const dir = isArabic ? 'rtl' : 'ltr'
  const align = isArabic ? 'right' : 'left'
  const lang = isArabic ? 'ar' : 'en'

  const preheader = escapeHtml((message || subject).replace(/\s+/g, ' ').slice(0, 140))
  const msgHtml = escapeHtml(message).replaceAll('\n', '<br/>')
  const safeBrand = escapeHtml(brandName || 'University Admissions')
  const logoAlt = escapeHtml(brandName || 'University logo')

  const metaHtml =
    metaLabel && metaValue
      ? `<p style="margin:8px 0 0;text-align:center;color:#6b7a99;font-size:13px;font-family:${FONT_STACK};">${escapeHtml(metaLabel)}: <span style="display:inline-block;padding:4px 10px;border-radius:999px;background:#e6f7ef;color:#1a7a4a;font-weight:700;font-size:12px;">${escapeHtml(metaValue)}</span></p>`
      : `<p style="margin:8px 0 0;text-align:center;color:#6b7a99;font-size:13px;font-family:${FONT_STACK};">${escapeHtml(
          isArabic ? 'إشعار تلقائي' : 'Automated notification',
        )}</p>`

  const detailsHtml = details.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;border-collapse:collapse;font-family:${FONT_STACK};">
        ${details
          .map(
            (d) => `<tr>
              <td style="width:36%;padding:10px 12px;background:#f4f6fb;border:1px solid #e6ebf5;font-weight:700;font-size:13px;color:#1a3a6b;vertical-align:top;text-align:${align};font-family:${FONT_STACK};">${escapeHtml(d.label)}</td>
              <td style="padding:10px 12px;border:1px solid #e6ebf5;font-size:14px;line-height:1.6;color:#1e2a3a;vertical-align:top;text-align:${align};font-family:${FONT_STACK};">${detailValueHtml(d.value)}</td>
            </tr>`,
          )
          .join('')}
      </table>`
    : ''

  const footerDefault: string[] = isArabic
    ? [
        brandName ? `أُرسلت بواسطة ${brandName}.` : 'أُرسلت بواسطة نظام القبول الجامعي.',
        'هذه رسالة تلقائية. قد لا تتم مراقبة الردود.',
        brandEmail ? `من: ${brandEmail}` : '',
      ].filter(Boolean)
    : [
        brandName ? `Sent by ${brandName}.` : 'Sent by the university admissions system.',
        'This is an automated message. Replies may not be monitored.',
        brandEmail ? `From: ${brandEmail}` : '',
      ].filter(Boolean)

  const footer = (footerLines.length ? footerLines : footerDefault)
    .map((l) => `<div style="font-family:${FONT_STACK};">${escapeHtml(l)}</div>`)
    .join('')

  return `<!doctype html>
<html lang="${lang}" dir="${dir}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body dir="${dir}" style="margin:0;padding:0;background:#f4f6fb;color:#1e2a3a;direction:${dir};text-align:${align};font-family:${FONT_STACK};">
    <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6fb;">
      <tr>
        <td align="center" style="padding:28px 16px;">
          <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;background:#ffffff;border:1px solid #dde3ef;border-radius:12px;">
            <tr>
              <td style="padding:28px 24px;direction:${dir};text-align:${align};font-family:${FONT_STACK};">
                <div style="text-align:center;margin-bottom:12px;">
                  <img src="${escapeHtml(logoUrl)}" height="64" alt="${logoAlt}" style="height:64px;width:auto;max-width:240px;border:0;" />
                </div>
                <h1 style="margin:0;font-family:${FONT_STACK};font-weight:700;color:#1a3a6b;font-size:20px;line-height:1.45;text-align:center;">
                  ${escapeHtml(subject)}
                </h1>
                ${metaHtml}
                <div style="margin-top:18px;font-family:${FONT_STACK};direction:${dir};text-align:${align};font-size:15px;line-height:1.8;color:#1e2a3a;">
                  ${msgHtml}
                </div>
                ${detailsHtml}
                <div style="margin-top:18px;padding-top:12px;border-top:1px solid #eef2fb;color:#6b7a99;font-size:12px;line-height:1.7;font-family:${FONT_STACK};direction:${dir};text-align:${align};">
                  ${footer}
                </div>
              </td>
            </tr>
          </table>
          <p style="margin:12px 0 0;text-align:center;color:#9aa7bf;font-size:11px;font-family:${FONT_STACK};">${safeBrand}</p>
        </td>
      </tr>
    </table>
  </body>
</html>`
}
