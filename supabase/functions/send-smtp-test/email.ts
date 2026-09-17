import { CAIRO_AR_400, CAIRO_AR_700, CAIRO_LAT_400, CAIRO_LAT_700 } from './cairoFonts.ts'

export function escapeHtml(s: string) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

const DEFAULT_LOGO_URL = 'https://qalam.nuzum.tech/assets/IBU%20Logo.png'

/** Cairo first — embedded via @font-face so Gmail/Outlook cannot strip the CDN link. */
const FONT_STACK = "'Cairo', Tahoma, 'Segoe UI', Arial, sans-serif"

function hasArabicScript(text: string) {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(String(text || ''))
}

function cairoFontFaceCss() {
  const face = (weight: number, ar: string, lat: string) => `
@font-face {
  font-family: 'Cairo';
  font-style: normal;
  font-weight: ${weight};
  font-display: swap;
  src: url(data:font/woff2;base64,${ar}) format('woff2');
  unicode-range: U+0600-06FF, U+0750-077F, U+08A0-08FF, U+FB50-FDFF, U+FE70-FEFC;
}
@font-face {
  font-family: 'Cairo';
  font-style: normal;
  font-weight: ${weight};
  font-display: swap;
  src: url(data:font/woff2;base64,${lat}) format('woff2');
  unicode-range: U+0000-00FF, U+0100-024F, U+2000-206F, U+20AC, U+2122;
}`
  return (
    face(400, CAIRO_AR_400, CAIRO_LAT_400) +
    face(500, CAIRO_AR_400, CAIRO_LAT_400) +
    face(600, CAIRO_AR_700, CAIRO_LAT_700) +
    face(700, CAIRO_AR_700, CAIRO_LAT_700) +
    face(800, CAIRO_AR_700, CAIRO_LAT_700)
  )
}

export function buildPlainTextEmail(params: { subject: string; message: string; metaLine?: string }) {
  const subject = String(params.subject || '').trim()
  const msg = String(params.message || '').trim()
  const meta = params.metaLine ? String(params.metaLine).trim() : ''
  return `${subject}\n\n${msg}${meta ? `\n\n${meta}` : ''}`.trim() + '\n'
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
}) {
  const brandName = String(params.brandName || '').trim()
  const brandEmail = String(params.brandEmail || '').trim()
  const logoUrl = String(params.logoUrl || DEFAULT_LOGO_URL).trim()
  const subject = String(params.subject || '').trim()
  const message = String(params.message || '').trim()
  const metaLabel = String(params.metaLabel || '').trim()
  const metaValue = String(params.metaValue || '').trim()
  const footerLines = Array.isArray(params.footerLines) ? params.footerLines.filter(Boolean).map(String) : []

  const isArabic =
    typeof params.isArabic === 'boolean' ? params.isArabic : hasArabicScript(`${subject}\n${message}`)
  const dir = isArabic ? 'rtl' : 'ltr'
  const align = isArabic ? 'right' : 'left'
  const lang = isArabic ? 'ar' : 'en'

  const preheader = escapeHtml(message.slice(0, 140))
  const msgHtml = escapeHtml(message).replaceAll('\n', '<br/>')
  const safeBrand = escapeHtml(brandName || 'University Admissions')
  const logoAlt = escapeHtml(brandName || 'University logo')

  const metaHtml =
    metaLabel && metaValue
      ? `<div class="meta" dir="ltr" style="text-align:center;font-family:${FONT_STACK};">${escapeHtml(metaLabel)}: <span class="pill">${escapeHtml(metaValue)}</span></div>`
      : `<div class="meta" style="text-align:center;font-family:${FONT_STACK};">${escapeHtml(
          isArabic ? 'إشعار تلقائي' : 'Automated notification',
        )}</div>`

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

  const fontFaces = cairoFontFaceCss()

  return `<!doctype html>
<html lang="${lang}" dir="${dir}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <title>${escapeHtml(subject)}</title>
    <style type="text/css">
${fontFaces}
      body, table, td, div, p, a, span, h1, h2, h3 {
        font-family: ${FONT_STACK} !important;
      }
      body {
        margin: 0;
        padding: 0;
        background: #f4f6fb;
        color: #1e2a3a;
        direction: ${dir};
        text-align: ${align};
        -webkit-text-size-adjust: 100%;
        font-family: ${FONT_STACK} !important;
      }
      .preheader { display:none !important; visibility:hidden; opacity:0; color:transparent; height:0; width:0; overflow:hidden; mso-hide:all; }
      .wrap { max-width: 640px; margin: 0 auto; padding: 28px 16px; direction: ${dir}; }
      .card {
        background: #ffffff;
        border: 1px solid #dde3ef;
        border-radius: 12px;
        padding: 22px;
        direction: ${dir};
        text-align: ${align};
        font-family: ${FONT_STACK} !important;
      }
      .logo { text-align:center; margin-bottom: 10px; }
      .logo img { height: 64px; width: auto; max-width: 520px; display:inline-block; object-fit: contain; }
      .title {
        font-family: ${FONT_STACK} !important;
        font-size: 18px;
        font-weight: 800;
        color: #1a3a6b;
        margin: 0;
        line-height: 1.45;
        direction: ${dir};
        text-align: center;
      }
      .meta { margin-top: 6px; color: #6b7a99; font-size: 13px; font-family: ${FONT_STACK} !important; }
      .pill {
        display:inline-block;
        padding: 4px 10px;
        border-radius: 999px;
        background: #e6f7ef;
        color: #1a7a4a;
        font-weight: 700;
        font-size: 12px;
        direction: ltr;
        unicode-bidi: isolate;
        font-family: ${FONT_STACK} !important;
      }
      .msg {
        margin-top: 14px;
        font-size: 15px;
        line-height: 1.85;
        color: #1e2a3a;
        font-family: ${FONT_STACK} !important;
        direction: ${dir};
        text-align: ${align};
      }
      .foot {
        margin-top: 18px;
        padding-top: 12px;
        border-top: 1px solid #eef2fb;
        color: #6b7a99;
        font-size: 12px;
        line-height: 1.7;
        font-family: ${FONT_STACK} !important;
        direction: ${dir};
        text-align: ${align};
      }
    </style>
  </head>
  <body dir="${dir}" style="margin:0;padding:0;background:#f4f6fb;color:#1e2a3a;direction:${dir};text-align:${align};font-family:${FONT_STACK};">
    <div class="preheader">${preheader}</div>
    <div class="wrap" dir="${dir}" style="direction:${dir};font-family:${FONT_STACK};">
      <div class="card" dir="${dir}" style="direction:${dir};text-align:${align};font-family:${FONT_STACK};">
        <div class="logo">
          <img src="${escapeHtml(logoUrl)}" height="64" alt="${logoAlt}" />
        </div>
        <div style="text-align:center;direction:${dir};font-family:${FONT_STACK};">
          <p class="title" style="font-family:${FONT_STACK};font-weight:800;color:#1a3a6b;font-size:18px;margin:0;direction:${dir};text-align:center;">
            ${escapeHtml(subject)}
          </p>
          ${metaHtml}
        </div>
        <div class="msg" dir="${dir}" style="font-family:${FONT_STACK};direction:${dir};text-align:${align};font-size:15px;line-height:1.85;color:#1e2a3a;margin-top:14px;">
          ${msgHtml}
        </div>
        <div class="foot" dir="${dir}" style="font-family:${FONT_STACK};direction:${dir};text-align:${align};">
          ${footer}
        </div>
      </div>
      <div style="text-align:center;color:#9aa7bf;font-size:11px;margin-top:10px;font-family:${FONT_STACK};">
        ${safeBrand}
      </div>
    </div>
  </body>
</html>`
}
