/**
 * Create IBU academic years from Excel (2022-2023 … 2025-2026)
 * and move imported grades/enrollments under matching year semesters.
 *
 * Usage: node scripts/create-ibu-academic-years.cjs
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { createClient } = require('@supabase/supabase-js');
const { Client } = require('pg');

const docsDir = path.join(__dirname, '..', 'docs');
const PREVIEW = ['IBU_import_preview.xlsx', 'IBU_import_preview_v6.xlsx']
  .map((f) => path.join(docsDir, f))
  .find((p) => fs.existsSync(p));

const YEAR_DEFS = [
  { code: '2022-2023', start: '2022-09-01', end: '2023-06-30', status: 'closed' },
  { code: '2023-2024', start: '2023-09-01', end: '2024-06-30', status: 'closed' },
  { code: '2024-2025', start: '2024-09-01', end: '2025-06-30', status: 'closed' },
  { code: '2025-2026', start: '2025-09-01', end: '2026-06-30', status: 'closing' },
];

const OLD_SEM_CODE = 'IBU-GRADES';

function clean(s) {
  return String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cellToString(v) {
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v.text != null) return clean(v.text);
    if (v.result != null) return cellToString(v.result);
    if (v.richText) return clean(v.richText.map((t) => t.text).join(''));
  }
  return clean(v);
}

function collegeKey(collegeEn, majorCode) {
  const c = clean(collegeEn).toLowerCase();
  if (c.includes('business') || String(majorCode || '').startsWith('04')) return '02';
  return '01';
}

function yearFromEnrollmentYear(y) {
  const n = parseInt(String(y).slice(0, 4), 10);
  if (!Number.isFinite(n)) return '2023-2024';
  if (n <= 2022) return '2022-2023';
  if (n === 2023) return '2023-2024';
  if (n === 2024) return '2024-2025';
  return '2025-2026';
}

function normalizeAcademicYear(raw, studentNumber) {
  const s = clean(raw);
  if (/^\d{4}-\d{4}$/.test(s)) return s;
  return yearFromEnrollmentYear(studentNumber);
}

async function getPg() {
  const url = process.env.VITE_SUPABASE_URL || '';
  const ref = url.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1];
  const password = process.env.SUPABASE_DB_PASSWORD;
  const cs = `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`;
  const client = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
  await client.connect();
  return client;
}

async function main() {
  if (!PREVIEW) throw new Error('Preview Excel not found');
  const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const pg = await getPg();

  console.log('=== Academic years ===');
  const yearByCode = {};
  for (const def of YEAR_DEFS) {
    const payload = {
      code: def.code,
      name_en: `Academic Year ${def.code}`,
      name_ar: `العام الدراسي ${def.code}`,
      start_date: def.start,
      end_date: def.end,
      status: def.status,
      is_current: false,
      description: `IBU academic year from import (${def.code})`,
      description_ar: `العام الدراسي لجامعة الإمام البخاري — مستورد (${def.code})`,
      college_id: null,
      is_university_wide: true,
      registration_open: false,
      grade_entry_allowed: true,
      attendance_editing_allowed: false,
      financial_posting_allowed: false,
      created_by: 'ibu-import',
    };
    const { data: existing } = await sb.from('academic_years').select('id').eq('code', def.code).maybeSingle();
    let row;
    if (existing) {
      const { data, error } = await sb.from('academic_years').update(payload).eq('id', existing.id).select('*').single();
      if (error) throw error;
      row = data;
      console.log(`  ✓ updated ${row.code} (id=${row.id})`);
    } else {
      const { data, error } = await sb.from('academic_years').insert(payload).select('*').single();
      if (error) throw error;
      row = data;
      console.log(`  ✓ created ${row.code} (id=${row.id})`);
    }
    yearByCode[def.code] = row;
  }

  console.log('\n=== Semesters per year ===');
  const semByYear = {};
  for (const def of YEAR_DEFS) {
    const ay = yearByCode[def.code];
    const code = `IBU-${def.code}`;
    const payload = {
      academic_year_id: ay.id,
      code,
      name_en: `IBU Grades ${def.code}`,
      name_ar: `درجات IBU ${def.code}`,
      start_date: def.start,
      end_date: def.end,
      registration_start_date: def.start,
      registration_end_date: def.end,
      status: def.status === 'closed' ? 'closed' : 'in_progress',
      is_current: false,
      college_id: null,
      is_university_wide: true,
      academic_year_number: parseInt(def.code.slice(0, 4), 10),
      season: 'fall',
      description: `Imported IBU grades for ${def.code}`,
      description_ar: `درجات مستوردة للعام ${def.code}`,
      course_registration_allowed: false,
      add_drop_allowed: false,
      withdrawal_allowed: false,
      grade_entry_allowed: true,
      attendance_editing_allowed: false,
      late_registration_allowed: false,
      min_credit_hours: 0,
      max_credit_hours: 30,
    };
    const { data: existing } = await sb.from('semesters').select('id').eq('code', code).maybeSingle();
    let row;
    if (existing) {
      const { data, error } = await sb.from('semesters').update(payload).eq('id', existing.id).select('*').single();
      if (error) throw error;
      row = data;
    } else {
      const { data, error } = await sb.from('semesters').insert(payload).select('*').single();
      if (error) throw error;
      row = data;
    }
    semByYear[def.code] = row;
    console.log(`  ✓ semester ${row.code} (id=${row.id}) → AY ${def.code}`);
  }

  // Old dump semester
  const { data: oldSem } = await sb.from('semesters').select('id').eq('code', OLD_SEM_CODE).maybeSingle();
  if (!oldSem) {
    console.log('\nNo legacy IBU-GRADES semester — years created only.');
    await pg.end();
    return;
  }

  console.log('\n=== Read Excel year map ===');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(PREVIEW);
  const ws = wb.getWorksheet('Grades');
  const headers = [];
  ws.getRow(3).eachCell((c, i) => {
    headers[i] = cellToString(c.value);
  });
  // key: student||college||course → academic year code
  const yearMap = new Map();
  ws.eachRow((row, n) => {
    if (n <= 3) return;
    const get = (h) => {
      const i = headers.indexOf(h);
      return i > 0 ? row.getCell(i).value : null;
    };
    const sid = cellToString(get('Student number'));
    const course = cellToString(get('Course (AR)'));
    if (!sid || !course) return;
    const college = collegeKey(get('College (EN)'), get('Major code'));
    const ay = normalizeAcademicYear(get('Academic year'), sid);
    yearMap.set(`${sid}||${college}||${course}`, ay);
  });
  console.log(`  mapped ${yearMap.size} student×course → year`);

  console.log('\n=== Clone classes into year semesters ===');
  const { data: oldClasses } = await sb
    .from('classes')
    .select('id, subject_id, code, section, capacity, type, status, college_id, is_university_wide, notes, subjects(name_ar, code)')
    .eq('semester_id', oldSem.id);

  // yearCode → oldClassId → newClassId
  const classMap = {};
  for (const def of YEAR_DEFS) {
    classMap[def.code] = {};
    const sem = semByYear[def.code];
    for (const cls of oldClasses || []) {
      const newCode = `${cls.code}-${def.code.slice(2, 4)}${def.code.slice(7, 9)}`; // e.g. -2223
      const { data: existing } = await sb
        .from('classes')
        .select('id')
        .eq('code', newCode)
        .eq('semester_id', sem.id)
        .maybeSingle();
      let newId;
      if (existing) {
        newId = existing.id;
        await sb
          .from('classes')
          .update({
            subject_id: cls.subject_id,
            status: 'active',
            college_id: cls.college_id,
            is_university_wide: false,
          })
          .eq('id', newId);
      } else {
        const { data: inserted, error } = await sb
          .from('classes')
          .insert({
            subject_id: cls.subject_id,
            semester_id: sem.id,
            code: newCode,
            section: cls.section || 'A',
            capacity: cls.capacity || 500,
            enrolled: 0,
            type: cls.type || 'on_campus',
            status: 'active',
            college_id: cls.college_id,
            is_university_wide: false,
            notes: `IBU ${def.code}`,
          })
          .select('id')
          .single();
        if (error) throw error;
        newId = inserted.id;
      }
      classMap[def.code][cls.id] = newId;
    }
    console.log(`  ✓ ${def.code}: ${Object.keys(classMap[def.code]).length} classes`);
  }

  console.log('\n=== Move enrollments + grade_components ===');
  // Load students id → student_id
  const stuMap = new Map();
  let from = 0;
  for (;;) {
    const { data } = await sb.from('students').select('id, student_id, college_id').range(from, from + 999);
    if (!data?.length) break;
    for (const s of data) stuMap.set(s.id, s);
    if (data.length < 1000) break;
    from += 1000;
  }

  const collegeCodeById = {};
  const { data: cols } = await sb.from('colleges').select('id, code').in('code', ['01', '02']);
  for (const c of cols || []) collegeCodeById[c.id] = c.code;

  const enrollments = [];
  let enFrom = 0;
  for (;;) {
    const { data, error: enErr } = await sb
      .from('enrollments')
      .select('id, student_id, class_id, semester_id, college_id, numeric_grade, grade, grade_points')
      .eq('semester_id', oldSem.id)
      .range(enFrom, enFrom + 999);
    if (enErr) throw enErr;
    if (!data?.length) break;
    enrollments.push(...data);
    if (data.length < 1000) break;
    enFrom += 1000;
  }
  console.log(`  enrollments still on legacy semester: ${enrollments.length}`);

  // subject name by old class
  const subjectNameByOldClass = {};
  for (const cls of oldClasses || []) {
    subjectNameByOldClass[cls.id] = clean(cls.subjects?.name_ar || '');
  }

  let moved = 0;
  let fallback = 0;
  const enrolledCount = {}; // newClassId → count

  for (const en of enrollments || []) {
    const stu = stuMap.get(en.student_id);
    if (!stu) continue;
    const course = subjectNameByOldClass[en.class_id] || '';
    const college =
      collegeCodeById[en.college_id] ||
      collegeCodeById[stu.college_id] ||
      '01';
    const key = `${stu.student_id}||${college}||${course}`;
    let ay = yearMap.get(key);
    if (!ay) {
      ay = yearFromEnrollmentYear(stu.student_id);
      fallback++;
    }
    if (!YEAR_DEFS.find((d) => d.code === ay)) ay = '2023-2024';

    const newClassId = classMap[ay]?.[en.class_id];
    const newSemId = semByYear[ay]?.id;
    if (!newClassId || !newSemId) continue;

    await pg.query(
      `UPDATE enrollments
       SET class_id = $1, semester_id = $2, updated_at = NOW()
       WHERE id = $3`,
      [newClassId, newSemId, en.id]
    );
    await pg.query(
      `UPDATE grade_components
       SET class_id = $1, semester_id = $2, updated_at = NOW()
       WHERE enrollment_id = $3`,
      [newClassId, newSemId, en.id]
    );
    enrolledCount[newClassId] = (enrolledCount[newClassId] || 0) + 1;
    moved++;
    if (moved % 500 === 0) process.stdout.write(`  moved ${moved}/${enrollments.length}\r`);
  }
  console.log(`\n  ✓ moved ${moved} enrollments (fallback year for ${fallback})`);

  // Update enrolled counts
  for (const [classId, count] of Object.entries(enrolledCount)) {
    await sb.from('classes').update({ enrolled: count }).eq('id', classId);
  }

  // Deactivate empty legacy semester classes
  await pg.query(`UPDATE classes SET status = 'inactive', updated_at = NOW() WHERE semester_id = $1`, [
    oldSem.id,
  ]);
  await pg.query(
    `UPDATE semesters
     SET status = 'archived', name_en = CASE WHEN name_en LIKE '%(legacy)%' THEN name_en ELSE name_en || ' (legacy)' END, updated_at = NOW()
     WHERE id = $1`,
    [oldSem.id]
  );

  console.log('\n========== DONE ==========');
  console.log('Academic years now:');
  for (const def of YEAR_DEFS) {
    const ay = yearByCode[def.code];
    const sem = semByYear[def.code];
    const { rows } = await pg.query(
      `SELECT COUNT(*)::int AS c FROM enrollments WHERE semester_id = $1 AND status = 'enrolled'`,
      [sem.id]
    );
    console.log(`  ${ay.code} → semester ${sem.code}: ${rows[0].c} enrollments`);
  }
  console.log('Refresh Academic Years page — you should see 2022-2023 … 2025-2026 (+ current 2026-2027).');

  await pg.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
