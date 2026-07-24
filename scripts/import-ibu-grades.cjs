/**
 * Import IBU grades from docs/IBU_import_preview.xlsx → subjects, classes, enrollments, grade_components
 *
 * Usage: node scripts/import-ibu-grades.cjs
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { createClient } = require('@supabase/supabase-js');

const docsDir = path.join(__dirname, '..', 'docs');
const PREVIEW = ['IBU_import_preview.xlsx', 'IBU_import_preview_v7.xlsx', 'IBU_import_preview_v6.xlsx']
  .map((f) => path.join(docsDir, f))
  .find((p) => fs.existsSync(p));

if (!PREVIEW) {
  console.error('Preview Excel not found');
  process.exit(1);
}

const url = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing Supabase env');
  process.exit(1);
}

const sb = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SEM_CODE = 'IBU-GRADES';
const BATCH = 80;

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

function majorCodeFromCell(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'number' && Number.isFinite(v)) return String(Math.trunc(v)).padStart(4, '0');
  const s = cellToString(v);
  if (/^\d+$/.test(s)) return s.padStart(4, '0');
  return s;
}

function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36).toUpperCase().slice(0, 6);
}

function scoreToLetter(n) {
  if (n == null || Number.isNaN(n)) return null;
  if (n >= 90) return 'A+';
  if (n >= 80) return 'A';
  if (n >= 70) return 'A-';
  if (n >= 67) return 'B+';
  if (n >= 64) return 'B';
  if (n >= 60) return 'B-';
  if (n >= 57) return 'C+';
  if (n >= 54) return 'C';
  if (n >= 50) return 'C-';
  if (n >= 40) return 'D';
  return 'F';
}

function scoreToGpa(n) {
  if (n == null || Number.isNaN(n)) return null;
  if (n >= 90) return 4.3;
  if (n >= 80) return 4.0;
  if (n >= 70) return 3.7;
  if (n >= 67) return 3.3;
  if (n >= 64) return 3.0;
  if (n >= 60) return 2.7;
  if (n >= 57) return 2.3;
  if (n >= 54) return 2.0;
  if (n >= 50) return 1.7;
  if (n >= 40) return 1.0;
  return 0.0;
}

function collegeKeyFromRow(collegeEn, majorCode) {
  const c = clean(collegeEn).toLowerCase();
  if (c.includes('business') || majorCode?.startsWith('04')) return '02';
  return '01';
}

async function readGrades(wb) {
  const ws = wb.getWorksheet('Grades');
  if (!ws) throw new Error('Grades sheet missing');
  const headers = [];
  ws.getRow(3).eachCell((cell, col) => {
    headers[col] = cellToString(cell.value);
  });
  const rows = [];
  ws.eachRow((row, n) => {
    if (n <= 3) return;
    const obj = {};
    headers.forEach((h, col) => {
      if (!h) return;
      obj[h] = row.getCell(col).value;
    });
    const student_number = cellToString(obj['Student number']);
    const course = cellToString(obj['Course (AR)']);
    if (!student_number || !course) return;
    const scoreRaw = obj.Score;
    const score =
      typeof scoreRaw === 'number'
        ? scoreRaw
        : Number(cellToString(scoreRaw).replace(',', '.'));
    rows.push({
      student_number,
      course,
      score: Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : null,
      college_en: cellToString(obj['College (EN)']),
      major_code: majorCodeFromCell(obj['Major code']),
      academic_year: cellToString(obj['Academic year']) || 'imported',
      level: cellToString(obj.Level),
    });
  });
  return rows;
}

async function ensureSemester(collegeIds) {
  const { data: ay } = await sb
    .from('academic_years')
    .select('id')
    .eq('is_current', true)
    .maybeSingle();
  const academic_year_id = ay?.id;
  if (!academic_year_id) throw new Error('No current academic year');

  const { data: existing } = await sb.from('semesters').select('*').eq('code', SEM_CODE).maybeSingle();
  const payload = {
    academic_year_id,
    code: SEM_CODE,
    name_en: 'IBU Imported Grades',
    name_ar: 'درجات IBU المستوردة',
    start_date: '2022-09-01',
    end_date: '2025-06-30',
    registration_start_date: '2022-08-01',
    registration_end_date: '2025-06-01',
    status: 'in_progress',
    is_current: false,
    college_id: null,
    is_university_wide: true,
    academic_year_number: 2025,
    season: 'fall',
    description: 'Historical IBU course grades imported from grade sheets',
    description_ar: 'درجات المقررات التاريخية المستوردة من كشوف الدرجات',
    course_registration_allowed: false,
    add_drop_allowed: false,
    withdrawal_allowed: false,
    grade_entry_allowed: true,
    attendance_editing_allowed: false,
    late_registration_allowed: false,
    min_credit_hours: 0,
    max_credit_hours: 30,
  };

  if (existing) {
    const { data, error } = await sb.from('semesters').update(payload).eq('id', existing.id).select('*').single();
    if (error) throw error;
    console.log(`  ✓ semester ${data.code} (id=${data.id}) updated`);
    return data;
  }
  const { data, error } = await sb.from('semesters').insert(payload).select('*').single();
  if (error) throw error;
  console.log(`  ✓ semester ${data.code} (id=${data.id}) created`);
  return data;
}

async function ensureSubject({ code, name_ar, college_id, major_id }) {
  const { data: existing } = await sb
    .from('subjects')
    .select('id')
    .eq('code', code)
    .eq('college_id', college_id)
    .maybeSingle();
  const payload = {
    code,
    name_en: name_ar,
    name_ar,
    type: 'core',
    credit_hours: 3,
    theory_hours: 3,
    lab_hours: 0,
    tutorial_hours: 0,
    is_elective: false,
    status: 'active',
    college_id,
    is_university_wide: false,
    major_id: major_id || null,
    grade_configuration: [
      {
        grade_type_code: 'FINAL',
        grade_type_name_en: 'Final',
        weight: 100,
        max_score: 100,
      },
    ],
    grades_visibility_status: 'GV_SHW',
  };
  if (existing) {
    const { data, error } = await sb.from('subjects').update(payload).eq('id', existing.id).select('id, code').single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await sb.from('subjects').insert(payload).select('id, code').single();
  if (error) throw error;
  return data;
}

async function ensureClass({ subject_id, semester_id, code, college_id }) {
  const { data: existing } = await sb
    .from('classes')
    .select('id')
    .eq('code', code)
    .eq('semester_id', semester_id)
    .maybeSingle();
  const payload = {
    subject_id,
    semester_id,
    code,
    section: 'A',
    capacity: 500,
    enrolled: 0,
    type: 'on_campus',
    status: 'active',
    college_id,
    is_university_wide: false,
    notes: 'IBU imported grades class',
  };
  if (existing) {
    const { data, error } = await sb.from('classes').update(payload).eq('id', existing.id).select('id, code').single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await sb.from('classes').insert(payload).select('id, code').single();
  if (error) throw error;
  return data;
}

async function loadStudentMap() {
  const map = new Map();
  let from = 0;
  const page = 1000;
  for (;;) {
    const { data, error } = await sb.from('students').select('id, student_id, college_id').range(from, from + page - 1);
    if (error) throw error;
    if (!data?.length) break;
    for (const s of data) map.set(clean(s.student_id), s);
    if (data.length < page) break;
    from += page;
  }
  return map;
}

async function main() {
  console.log('Reading:', path.basename(PREVIEW));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(PREVIEW);
  const gradeRows = await readGrades(wb);
  console.log(`Grade rows: ${gradeRows.length}`);

  const { data: colleges } = await sb.from('colleges').select('id, code').in('code', ['01', '02']);
  const collegeByCode = Object.fromEntries((colleges || []).map((c) => [c.code, c]));
  if (!collegeByCode['01'] || !collegeByCode['02']) {
    throw new Error('Colleges 01/02 missing — run import-ibu-data.cjs first');
  }

  const { data: majors } = await sb.from('majors').select('id, code').in('code', ['0111', '0131', '0141', '0411']);
  const majorByCode = Object.fromEntries((majors || []).map((m) => [m.code, m]));

  console.log('\n=== Semester ===');
  const semester = await ensureSemester([collegeByCode['01'].id, collegeByCode['02'].id]);

  // Unique courses per college
  const courseKeys = new Map(); // key → { collegeCode, course, major_code }
  for (const r of gradeRows) {
    const collegeCode = collegeKeyFromRow(r.college_en, r.major_code);
    const key = `${collegeCode}||${r.course}`;
    if (!courseKeys.has(key)) {
      courseKeys.set(key, {
        collegeCode,
        course: r.course,
        major_code: r.major_code,
      });
    }
  }
  console.log(`\n=== Subjects & classes (${courseKeys.size}) ===`);
  const classByKey = new Map();
  let i = 0;
  for (const [key, meta] of courseKeys) {
    i++;
    const college = collegeByCode[meta.collegeCode];
    const subjCode = `IBU${meta.collegeCode}-${hashCode(meta.course)}`;
    const major =
      majorByCode[meta.major_code] ||
      (meta.collegeCode === '02' ? majorByCode['0411'] : majorByCode['0111']);
    const subject = await ensureSubject({
      code: subjCode,
      name_ar: meta.course,
      college_id: college.id,
      major_id: major?.id,
    });
    const classCode = `${subjCode}-A`;
    const cls = await ensureClass({
      subject_id: subject.id,
      semester_id: semester.id,
      code: classCode,
      college_id: college.id,
    });
    classByKey.set(key, { class_id: cls.id, college_id: college.id });
    if (i % 10 === 0 || i === courseKeys.size) {
      process.stdout.write(`  subjects/classes ${i}/${courseKeys.size}\r`);
    }
  }
  console.log(`\n  Done subjects/classes`);

  console.log('\n=== Load students ===');
  const students = await loadStudentMap();
  console.log(`  students in DB: ${students.size}`);

  console.log('\n=== Enrollments + grades ===');

  // Deduplicate: last score wins for same student+course
  const deduped = new Map();
  for (const r of gradeRows) {
    const collegeCode = collegeKeyFromRow(r.college_en, r.major_code);
    const key = `${r.student_number}||${collegeCode}||${r.course}`;
    deduped.set(key, r);
  }
  const uniqueRows = [...deduped.values()];
  console.log(`  unique student×course: ${uniqueRows.length}`);

  // Build enrollment payloads
  const enrollPayloads = [];
  let skipNoStudent = 0;
  let skipNoClass = 0;
  for (const r of uniqueRows) {
    const collegeCode = collegeKeyFromRow(r.college_en, r.major_code);
    const classKey = `${collegeCode}||${r.course}`;
    const cls = classByKey.get(classKey);
    if (!cls) {
      skipNoClass++;
      continue;
    }
    const stu = students.get(r.student_number);
    if (!stu) {
      skipNoStudent++;
      continue;
    }
    enrollPayloads.push({
      student_id: stu.id,
      class_id: cls.class_id,
      semester_id: semester.id,
      college_id: cls.college_id,
      status: 'enrolled',
      numeric_grade: r.score,
      grade: scoreToLetter(r.score),
      grade_points: scoreToGpa(r.score),
      _score: r.score,
      _year: r.academic_year,
      _level: r.level,
      _stu: stu.id,
      _cls: cls.class_id,
      _col: cls.college_id,
    });
  }
  console.log(`  to enroll: ${enrollPayloads.length} (skipStu=${skipNoStudent} skipClass=${skipNoClass})`);

  // Upsert enrollments in batches (insert, then update conflicts via lookup)
  let enrollOk = 0;
  let enrollFail = 0;
  const enrollmentByPair = new Map(); // `${student_id}:${class_id}` → enrollment id

  for (let start = 0; start < enrollPayloads.length; start += BATCH) {
    const chunk = enrollPayloads.slice(start, start + BATCH);
    const insertRows = chunk.map(({ student_id, class_id, semester_id, college_id, status, numeric_grade, grade, grade_points }) => ({
      student_id,
      class_id,
      semester_id,
      college_id,
      status,
      numeric_grade,
      grade,
      grade_points,
    }));

    const { data: inserted, error } = await sb.from('enrollments').insert(insertRows).select('id, student_id, class_id');
    if (!error && inserted) {
      for (const en of inserted) {
        enrollmentByPair.set(`${en.student_id}:${en.class_id}`, en.id);
      }
      enrollOk += inserted.length;
    } else {
      // Fallback row-by-row for this chunk (duplicates / constraints)
      for (const row of chunk) {
        try {
          let { data: en } = await sb
            .from('enrollments')
            .select('id')
            .eq('student_id', row.student_id)
            .eq('class_id', row.class_id)
            .maybeSingle();
          if (en) {
            await sb
              .from('enrollments')
              .update({
                numeric_grade: row.numeric_grade,
                grade: row.grade,
                grade_points: row.grade_points,
                status: 'enrolled',
              })
              .eq('id', en.id);
          } else {
            const { data: ins, error: insErr } = await sb
              .from('enrollments')
              .insert({
                student_id: row.student_id,
                class_id: row.class_id,
                semester_id: row.semester_id,
                college_id: row.college_id,
                status: 'enrolled',
                numeric_grade: row.numeric_grade,
                grade: row.grade,
                grade_points: row.grade_points,
              })
              .select('id')
              .single();
            if (insErr) throw insErr;
            en = ins;
          }
          enrollmentByPair.set(`${row.student_id}:${row.class_id}`, en.id);
          enrollOk++;
        } catch (e) {
          enrollFail++;
          if (enrollFail <= 10) console.error(`\n  ✗ enroll: ${e.message}`);
        }
      }
    }
    process.stdout.write(`  enrollments ${Math.min(start + BATCH, enrollPayloads.length)}/${enrollPayloads.length}\r`);
  }
  console.log(`\n  enrollments ok=${enrollOk} fail=${enrollFail}`);

  // Load any missing enrollment ids
  const classIds = [...new Set(enrollPayloads.map((p) => p.class_id))];
  for (const classId of classIds) {
    const { data: ens } = await sb.from('enrollments').select('id, student_id, class_id').eq('class_id', classId);
    for (const en of ens || []) {
      enrollmentByPair.set(`${en.student_id}:${en.class_id}`, en.id);
    }
  }

  // grade_components batches
  let gcOk = 0;
  let gcFail = 0;
  const gcPayloads = [];
  for (const row of enrollPayloads) {
    const enId = enrollmentByPair.get(`${row.student_id}:${row.class_id}`);
    if (!enId) continue;
    gcPayloads.push({
      enrollment_id: enId,
      class_id: row.class_id,
      student_id: row.student_id,
      semester_id: semester.id,
      college_id: row.college_id,
      final: row._score,
      numeric_grade: row._score,
      letter_grade: scoreToLetter(row._score),
      gpa_points: scoreToGpa(row._score),
      status: 'final',
      record_status: 'complete',
      notes: `Imported IBU ${row._year || ''} L${row._level || ''}`.trim(),
      graded_at: new Date().toISOString(),
    });
  }

  for (let start = 0; start < gcPayloads.length; start += BATCH) {
    const chunk = gcPayloads.slice(start, start + BATCH);
    const { error } = await sb.from('grade_components').upsert(chunk, {
      onConflict: 'enrollment_id',
      ignoreDuplicates: false,
    });
    if (!error) {
      gcOk += chunk.length;
    } else {
      for (const row of chunk) {
        try {
          const { data: existing } = await sb
            .from('grade_components')
            .select('id')
            .eq('enrollment_id', row.enrollment_id)
            .maybeSingle();
          if (existing) {
            const { error: uErr } = await sb.from('grade_components').update(row).eq('id', existing.id);
            if (uErr) throw uErr;
          } else {
            const { error: iErr } = await sb.from('grade_components').insert(row);
            if (iErr) throw iErr;
          }
          gcOk++;
        } catch (e) {
          gcFail++;
          if (gcFail <= 10) console.error(`\n  ✗ grade: ${e.message}`);
        }
      }
    }
    process.stdout.write(`  grades ${Math.min(start + BATCH, gcPayloads.length)}/${gcPayloads.length}\r`);
  }
  console.log(`\n  grades ok=${gcOk} fail=${gcFail}`);

  // Update enrolled counts
  console.log('\n=== Update class enrolled counts ===');
  for (const meta of classByKey.values()) {
    const { count } = await sb
      .from('enrollments')
      .select('*', { count: 'exact', head: true })
      .eq('class_id', meta.class_id)
      .eq('status', 'enrolled');
    await sb.from('classes').update({ enrolled: count || 0 }).eq('id', meta.class_id);
  }

  const { count: classCount } = await sb
    .from('classes')
    .select('*', { count: 'exact', head: true })
    .eq('semester_id', semester.id)
    .eq('status', 'active');

  console.log('\n========== GRADES IMPORT COMPLETE ==========');
  console.log(`Semester: ${semester.name_en} (${semester.code}) id=${semester.id}`);
  console.log(`Active classes in semester: ${classCount}`);
  console.log('In Grade Management:');
  console.log('  1. Select College of Islamic Sharia (or Business)');
  console.log(`  2. Select semester "${semester.name_en}" / "${semester.name_ar}"`);
  console.log('  3. Open a class to see imported scores');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
