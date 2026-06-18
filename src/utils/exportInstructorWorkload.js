import html2pdf from 'html2pdf.js'
import {
  TIMETABLE_DAY_KEYS,
  schedulesForClass,
  normalizeTime,
} from './instructorTimetable'

const DAY_AR = {
  sunday: 'الأحد',
  monday: 'الاثنين',
  tuesday: 'الثلاثاء',
  wednesday: 'الأربعاء',
  thursday: 'الخميس',
  friday: 'الجمعة',
  saturday: 'السبت',
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatPdfDate() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}/${m}/${day}`
}

function courseNameAr(subj) {
  if (!subj) return '—'
  return (subj.name_ar || subj.name_en || '—').trim()
}

function activityLabel(classType) {
  const t = String(classType || '').toLowerCase()
  if (t === 'online') return 'الكتروني'
  if (t === 'hybrid') return 'مختلط'
  return 'نظري'
}

function deliveryMode(classType) {
  const t = String(classType || '').toLowerCase()
  if (t === 'online') return 'الكتروني'
  return 'وجاهي'
}

function formatSemesterLine(semesterLabel, academicYear) {
  let yearPart = ''
  if (academicYear?.code) {
    const match = String(academicYear.code).match(/(\d{4})\D+(\d{4})/)
    if (match) yearPart = ` ${match[2]}/${match[1]}`
    else yearPart = ` ${academicYear.code}`
  }
  return `${semesterLabel || '—'}${yearPart}`
}

function sortSchedulesByDay(schedules) {
  return [...schedules].sort((a, b) => {
    const ai = TIMETABLE_DAY_KEYS.indexOf(String(a.day_of_week || '').toLowerCase())
    const bi = TIMETABLE_DAY_KEYS.indexOf(String(b.day_of_week || '').toLowerCase())
    return ai - bi
  })
}

function buildTimeCell(schedules, classType) {
  if (!schedules?.length) return '—'
  const sorted = sortSchedulesByDay(schedules)
  const timeRange = `${normalizeTime(sorted[0].start_time)}_${normalizeTime(sorted[0].end_time)}`
  const dayParts = sorted.map((s) => {
    const dayKey = String(s.day_of_week || '').toLowerCase()
    const day = DAY_AR[dayKey] || dayKey
    const mode = deliveryMode(classType)
    return `${day} ${mode}`
  })
  return `( ${timeRange} , ${dayParts.join(' ، ')} )`
}

function buildRoomCell(schedules, classType, clsLocation) {
  const rooms = [...new Set(schedules.map((s) => (s.location || '').trim()).filter(Boolean))]
  if (!rooms.length && clsLocation) rooms.push(String(clsLocation).trim())
  const lines = [...rooms]
  if (String(classType).toLowerCase() === 'online' && !lines.some((l) => l === 'الكتروني')) {
    lines.push('الكتروني')
  }
  return lines.length ? lines.map(escapeHtml).join('<br/>') : '—'
}

function buildCourseRows(courses, scheduleRows) {
  return (courses || []).map((cls) => {
    const subj = cls.subjects
    const schedules = schedulesForClass(scheduleRows, cls.id)
    return {
      code: escapeHtml(subj?.code || cls.code || '—'),
      name: escapeHtml(courseNameAr(subj)),
      section: escapeHtml(cls.section || '—'),
      activity: escapeHtml(activityLabel(cls.type)),
      room: buildRoomCell(schedules, cls.type, cls.location),
      time: escapeHtml(buildTimeCell(schedules, cls.type)),
    }
  })
}

async function loadLogoDataUrl() {
  const src = `${window.location.origin}/assets/Logo.png`
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        canvas.getContext('2d').drawImage(img, 0, 0)
        resolve(canvas.toDataURL('image/png'))
      } catch {
        resolve(src)
      }
    }
    img.onerror = () => resolve(src)
    img.src = src
  })
}

function buildPdfHtml({
  logoSrc,
  instructorNameAr,
  employeeId,
  collegeNameAr,
  departmentNameAr,
  semesterLine,
  courseRows,
}) {
  const tableBody = courseRows.length
    ? courseRows
        .map(
          (row) => `
        <tr>
          <td style="border: 1px solid #000; padding: 8px 6px; text-align: center; vertical-align: middle;">${row.code}</td>
          <td style="border: 1px solid #000; padding: 8px 6px; text-align: center; vertical-align: middle;">${row.name}</td>
          <td style="border: 1px solid #000; padding: 8px 6px; text-align: center; vertical-align: middle;">${row.section}</td>
          <td style="border: 1px solid #000; padding: 8px 6px; text-align: center; vertical-align: middle;">${row.activity}</td>
          <td style="border: 1px solid #000; padding: 8px 6px; text-align: center; vertical-align: middle;">${row.room}</td>
          <td style="border: 1px solid #000; padding: 8px 6px; text-align: center; vertical-align: middle; white-space: pre-wrap;">${row.time}</td>
        </tr>`,
        )
        .join('')
    : `<tr><td colspan="6" style="text-align:center;padding:14px;">لا يوجد جدول تدريس مسجل لهذا الفصل</td></tr>`

  return `
    <div id="instructor-schedule-pdf" dir="rtl" style="
      font-family: Arial, 'Traditional Arabic', Tahoma, sans-serif;
      color: #000;
      background: #fff;
      width: 190mm;
      box-sizing: border-box;
      padding: 8mm 10mm 12mm;
      line-height: 1.6;
    ">
      <div style="display: flex; justify-content: center; align-items: center; width: 100%; margin-bottom: 6mm;">
        <img src="${logoSrc}" alt="IBU" style="display: block; height: 22mm; max-width: 70mm; object-fit: contain; margin: 0 auto;" />
      </div>

      <div style="text-align: center; font-size: 20pt; font-weight: 700; text-decoration: underline; margin: 4mm 0 6mm;">
        جدول المدرس
      </div>

      <div style="text-align: right; direction: rtl; font-size: 11pt; margin-bottom: 5mm;">
        التاريخ : ${formatPdfDate()}
      </div>

      <table style="width: 100%; border: 1px solid #000; border-collapse: collapse; margin-bottom: 8mm; font-size: 11pt;">
        <tr>
          <td style="width: 50%; padding: 10px 14px; vertical-align: top; border: none;">
            <div style="margin-bottom: 6px;"><strong>الاسم :</strong> ${escapeHtml(instructorNameAr)}</div>
            <div style="margin-bottom: 6px;"><strong>الكلية :</strong> ${escapeHtml(collegeNameAr)}</div>
            <div><strong>الفصل :</strong> ${escapeHtml(semesterLine)}</div>
          </td>
          <td style="width: 50%; padding: 10px 14px; vertical-align: top; border-right: 1px solid #000;">
            <div style="margin-bottom: 6px;"><strong>رقم المدرس :</strong> ${escapeHtml(employeeId || '—')}</div>
            <div><strong>القسم :</strong> ${escapeHtml(departmentNameAr)}</div>
          </td>
        </tr>
      </table>

      <table style="width: 100%; border-collapse: collapse; border: 1px solid #000; font-size: 10.5pt;">
        <thead>
          <tr style="background: #b8cce4;">
            <th style="border: 1px solid #000; padding: 8px 6px; font-weight: 700; text-align: center;">رمز المقرر</th>
            <th style="border: 1px solid #000; padding: 8px 6px; font-weight: 700; text-align: center;">اسم المقرر</th>
            <th style="border: 1px solid #000; padding: 8px 6px; font-weight: 700; text-align: center;">الشعبة</th>
            <th style="border: 1px solid #000; padding: 8px 6px; font-weight: 700; text-align: center;">النشاط</th>
            <th style="border: 1px solid #000; padding: 8px 6px; font-weight: 700; text-align: center;">القاعة</th>
            <th style="border: 1px solid #000; padding: 8px 6px; font-weight: 700; text-align: center;">الوقت</th>
          </tr>
        </thead>
        <tbody>
          ${tableBody}
        </tbody>
      </table>
    </div>
  `
}

/**
 * Download instructor teaching schedule as PDF matching the official layout.
 */
export async function downloadInstructorWorkloadSchedule({
  instructorNameAr,
  employeeId,
  collegeNameAr,
  departmentNameAr,
  semesterLabel,
  academicYear,
  courses,
  scheduleRows,
  filename = 'instructor-schedule.pdf',
}) {
  const logoSrc = await loadLogoDataUrl()
  const semesterLine = formatSemesterLine(semesterLabel, academicYear)
  const courseRows = buildCourseRows(courses, scheduleRows)
  const html = buildPdfHtml({
    logoSrc,
    instructorNameAr,
    employeeId,
    collegeNameAr,
    departmentNameAr,
    semesterLine,
    courseRows,
  })

  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.left = '-10000px'
  container.style.top = '0'
  container.innerHTML = html
  document.body.appendChild(container)

  const element = container.querySelector('#instructor-schedule-pdf')

  try {
    await html2pdf()
      .set({
        margin: [8, 8, 8, 8],
        filename: filename.endsWith('.pdf') ? filename : `${filename}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          letterRendering: true,
          logging: false,
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
      })
      .from(element)
      .save()
  } finally {
    document.body.removeChild(container)
  }
}
