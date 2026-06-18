const CATEGORY_STYLES = {
  general: { bg: '#e8eef8', color: '#1a3a6b', labelEn: 'General Announcement', labelAr: 'إعلان عام' },
  assignment: { bg: '#fff4e5', color: '#9a5b00', labelEn: 'Assignment', labelAr: 'واجب' },
  exam: { bg: '#fde8e8', color: '#9b1c1c', labelEn: 'Exam', labelAr: 'اختبار' },
  live_lecture: { bg: '#e6f7ef', color: '#1a7a4a', labelEn: 'Live Lecture', labelAr: 'محاضرة مباشرة' },
  urgent: { bg: '#fee2e2', color: '#b91c1c', labelEn: 'Urgent Alert', labelAr: 'تنبيه عاجل' },
}

export const ANNOUNCEMENT_CATEGORIES = [
  { value: 'general', labelKey: 'instructorPortal.commCatGeneral' },
  { value: 'assignment', labelKey: 'instructorPortal.commCatAssignment' },
  { value: 'exam', labelKey: 'instructorPortal.commCatExam' },
  { value: 'live_lecture', labelKey: 'instructorPortal.commCatLiveLecture' },
  { value: 'urgent', labelKey: 'instructorPortal.commCatUrgent' },
]

export const ALLOWED_ATTACHMENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]

export const ALLOWED_ATTACHMENT_EXT = '.pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.webp'

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function categoryLabel(category, isArabic = true) {
  const c = CATEGORY_STYLES[category] || CATEGORY_STYLES.general
  return isArabic ? c.labelAr : c.labelEn
}

export function buildInstructorCommunicationEmailHtml({
  logoUrl,
  brandName = 'جامعة الإمام البخاري',
  courseCode,
  instructorName,
  title,
  body,
  category = 'general',
  isArabic = true,
}) {
  const dir = isArabic ? 'rtl' : 'ltr'
  const align = isArabic ? 'right' : 'left'
  const catStyle = CATEGORY_STYLES[category] || CATEGORY_STYLES.general
  const catLabel = categoryLabel(category, isArabic)
  const bodyHtml = escapeHtml(body).replace(/\n/g, '<br/>')

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

  return `<!doctype html>
<html lang="${isArabic ? 'ar' : 'en'}" dir="${dir}">
<head>
<meta charset="utf-8"/>
<style>
  body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;margin:0;padding:0;background:#f0f4fa;color:#1e293b;direction:${dir}}
  .wrap{max-width:640px;margin:0 auto;padding:32px 16px}
  .card{background:#fff;border:1px solid #d8e0ef;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(26,58,107,.08)}
  .header{background:#fff;padding:28px 24px 16px;text-align:center;border-bottom:3px solid #1a3a6b}
  .logo img{height:64px;width:auto;max-width:320px;display:inline-block;object-fit:contain}
  .brand{color:#1a3a6b;font-size:13px;font-weight:700;margin-top:10px}
  .body{padding:28px;text-align:${align}}
  .category{display:inline-block;padding:5px 14px;border-radius:999px;font-size:12px;font-weight:700;background:${catStyle.bg};color:${catStyle.color};margin-bottom:14px}
  .title{font-size:22px;font-weight:800;color:#1a3a6b;margin:0 0 12px;line-height:1.35}
  .meta{display:flex;flex-wrap:wrap;gap:12px 20px;font-size:13px;color:#64748b;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid #eef2fb}
  .content{font-size:15px;line-height:1.75;color:#334155}
  .foot{padding:16px 28px 22px;background:#f8fafc;border-top:1px solid #eef2fb;font-size:12px;color:#94a3b8;text-align:center}
</style>
</head>
<body>
<div class="wrap"><div class="card">
<div class="header"><div class="logo"><img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(brandName)}"/></div><div class="brand">${escapeHtml(brandName)}</div></div>
<div class="body">
<div class="category">${escapeHtml(catLabel)}</div>
<h1 class="title">${escapeHtml(title)}</h1>
${metaParts.length ? `<div class="meta">${metaParts.join('')}</div>` : ''}
<div class="content">${bodyHtml}</div>
</div>
<div class="foot">${isArabic ? 'أُرسلت من بوابة المدرسين' : 'Sent from the instructor portal'}</div>
</div></div>
</body></html>`
}

export function parseManualEmails(text) {
  return [
    ...new Set(
      String(text || '')
        .split(/[,;]+/)
        .map((e) => e.trim().toLowerCase())
        .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)),
    ),
  ]
}

export async function fileToAttachment(file) {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return {
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    contentBase64: btoa(binary),
    size: file.size,
  }
}
