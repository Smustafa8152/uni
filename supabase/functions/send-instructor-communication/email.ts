export function escapeHtml(s: string) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

const CATEGORY_STYLES: Record<string, { bg: string; color: string; labelEn: string; labelAr: string }> = {
  general: { bg: '#e8eef8', color: '#1a3a6b', labelEn: 'General Announcement', labelAr: 'إعلان عام' },
  assignment: { bg: '#fff4e5', color: '#9a5b00', labelEn: 'Assignment', labelAr: 'واجب' },
  exam: { bg: '#fde8e8', color: '#9b1c1c', labelEn: 'Exam', labelAr: 'اختبار' },
  live_lecture: { bg: '#e6f7ef', color: '#1a7a4a', labelEn: 'Live Lecture', labelAr: 'محاضرة مباشرة' },
  urgent: { bg: '#fee2e2', color: '#b91c1c', labelEn: 'Urgent Alert', labelAr: 'تنبيه عاجل' },
}

export function categoryLabel(category: string, isArabic = true) {
  const c = CATEGORY_STYLES[category] || CATEGORY_STYLES.general
  return isArabic ? c.labelAr : c.labelEn
}

export function buildInstructorCommunicationPlainText(params: {
  courseCode?: string
  instructorName?: string
  title: string
  body: string
  category?: string
}) {
  const lines = [
    params.title,
    '',
    params.body,
    '',
    params.courseCode ? `Course: ${params.courseCode}` : '',
    params.instructorName ? `Instructor: ${params.instructorName}` : '',
    params.category ? `Category: ${categoryLabel(params.category, false)}` : '',
  ].filter(Boolean)
  return lines.join('\n')
}

export function buildInstructorCommunicationEmailHtml(params: {
  logoUrl: string
  brandName?: string
  courseCode?: string
  instructorName?: string
  title: string
  body: string
  category?: string
  isArabic?: boolean
  footerLines?: string[]
}) {
  const isArabic = params.isArabic !== false
  const dir = isArabic ? 'rtl' : 'ltr'
  const align = isArabic ? 'right' : 'left'
  const title = String(params.title || '').trim()
  const body = String(params.body || '').trim()
  const courseCode = String(params.courseCode || '').trim()
  const instructorName = String(params.instructorName || '').trim()
  const brandName = String(params.brandName || 'جامعة الإمام البخاري').trim()
  const logoUrl = String(params.logoUrl || '').trim()
  const category = params.category || 'general'
  const catStyle = CATEGORY_STYLES[category] || CATEGORY_STYLES.general
  const catLabel = categoryLabel(category, isArabic)

  const bodyHtml = escapeHtml(body).replaceAll('\n', '<br/>')
  const preheader = escapeHtml(body.slice(0, 140))

  const metaParts = []
  if (courseCode) {
    metaParts.push(
      isArabic
        ? `<span><strong>المقرر:</strong> ${escapeHtml(courseCode)}</span>`
        : `<span><strong>Course:</strong> ${escapeHtml(courseCode)}</span>`,
    )
  }
  if (instructorName) {
    metaParts.push(
      isArabic
        ? `<span><strong>المدرس:</strong> ${escapeHtml(instructorName)}</span>`
        : `<span><strong>Instructor:</strong> ${escapeHtml(instructorName)}</span>`,
    )
  }

  const footerDefault = isArabic
    ? [
        `أُرسلت هذه الرسالة من بوابة المدرسين — ${brandName}.`,
        'هذه رسالة تلقائية من نظام إدارة التعلم.',
      ]
    : [
        `Sent from the instructor portal — ${brandName}.`,
        'This is an automated message from the learning management system.',
      ]

  const footer = (params.footerLines?.length ? params.footerLines : footerDefault)
    .map((l) => `<div>${escapeHtml(l)}</div>`)
    .join('')

  return `<!doctype html>
<html lang="${isArabic ? 'ar' : 'en'}" dir="${dir}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>${escapeHtml(title)}</title>
    <style>
      body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; margin: 0; padding: 0; background: #f0f4fa; color: #1e293b; direction: ${dir}; }
      .preheader { display:none !important; visibility:hidden; opacity:0; height:0; width:0; overflow:hidden; }
      .wrap { max-width: 640px; margin: 0 auto; padding: 32px 16px; }
      .card { background: #ffffff; border: 1px solid #d8e0ef; border-radius: 14px; overflow: hidden; box-shadow: 0 4px 24px rgba(26,58,107,0.08); }
      .header { background: #ffffff; padding: 28px 24px 16px; text-align: center; border-bottom: 3px solid #1a3a6b; }
      .logo img { height: 64px; width: auto; max-width: 320px; display: inline-block; object-fit: contain; }
      .brand { color: #1a3a6b; font-size: 13px; font-weight: 700; margin-top: 10px; letter-spacing: 0.02em; }
      .body { padding: 28px 28px 20px; text-align: ${align}; }
      .category { display: inline-block; padding: 5px 14px; border-radius: 999px; font-size: 12px; font-weight: 700; background: ${catStyle.bg}; color: ${catStyle.color}; margin-bottom: 14px; }
      .title { font-size: 22px; font-weight: 800; color: #1a3a6b; margin: 0 0 12px; line-height: 1.35; }
      .meta { display: flex; flex-wrap: wrap; gap: 12px 20px; font-size: 13px; color: #64748b; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid #eef2fb; }
      .content { font-size: 15px; line-height: 1.75; color: #334155; }
      .foot { padding: 16px 28px 22px; background: #f8fafc; border-top: 1px solid #eef2fb; font-size: 12px; color: #94a3b8; line-height: 1.6; text-align: center; }
    </style>
  </head>
  <body>
    <div class="preheader">${preheader}</div>
    <div class="wrap">
      <div class="card">
        <div class="header">
          <div class="logo">
            <img src="${escapeHtml(logoUrl)}" height="56" alt="${escapeHtml(brandName)}" />
          </div>
          <div class="brand">${escapeHtml(brandName)}</div>
        </div>
        <div class="body">
          <div class="category">${escapeHtml(catLabel)}</div>
          <h1 class="title">${escapeHtml(title)}</h1>
          ${metaParts.length ? `<div class="meta">${metaParts.join('')}</div>` : ''}
          <div class="content">${bodyHtml}</div>
        </div>
        <div class="foot">${footer}</div>
      </div>
    </div>
  </body>
</html>`
}
