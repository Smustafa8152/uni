/**
 * IBU neat data import
 * - Colleges 01 Sharia, 02 Business
 * - Majors from program PDFs
 * - Instructors + Students from docs preview sources
 * - Auth password for every instructor/student: 123456
 *
 * Usage: node scripts/import-ibu-data.cjs
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { createClient } = require('@supabase/supabase-js');

const PASSWORD = '123456';
const docsDir = path.join(__dirname, '..', 'docs');
const PREVIEW =
  [
    'IBU_import_preview.xlsx',
    'IBU_import_preview_v7.xlsx',
    'IBU_import_preview_v6.xlsx',
  ]
    .map((f) => path.join(docsDir, f))
    .find((p) => fs.existsSync(p));

if (!PREVIEW) {
  console.error('Preview Excel not found. Run: node scripts/generate-import-preview.cjs');
  process.exit(1);
}

const url = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function clean(s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function readSheetRows(wb, sheetName) {
  const ws = wb.getWorksheet(sheetName);
  if (!ws) return [];
  const headerRow = ws.getRow(3);
  const headers = [];
  headerRow.eachCell((cell, col) => {
    headers[col] = cellToString(cell.value);
  });
  const rows = [];
  ws.eachRow((row, n) => {
    if (n <= 3) return;
    const obj = {};
    let any = false;
    headers.forEach((h, col) => {
      if (!h) return;
      const v = row.getCell(col).value;
      // Keep raw for Code so majorCodeFromCell can pad numbers
      if (h === 'Code' || h === 'Major code') {
        obj[h] = v;
        obj[`${h}__str`] = majorCodeFromCell(v) || cellToString(v);
      } else if (h === 'College code') {
        obj[h] = v;
        obj[`${h}__str`] = collegeCodeFromCell(v) || cellToString(v);
      } else {
        obj[h] = cellToString(v);
      }
      if (cellToString(obj[h]) || (obj[`${h}__str`] && clean(obj[`${h}__str`]))) any = true;
    });
    if (any) rows.push(obj);
  });
  return rows;
}

function degreeToEnum(d) {
  const x = clean(d).toLowerCase();
  if (x === 'master') return 'master';
  if (x === 'phd' || x === 'doctorate') return 'phd';
  if (x === 'diploma') return 'diploma';
  return 'bachelor';
}

function cellToString(v) {
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v.text != null) return clean(v.text);
    if (v.result != null) return cellToString(v.result);
    if (v.richText) return clean(v.richText.map((t) => t.text).join(''));
  }
  // Preserve leading zeros for codes like 0111 stored as numbers in Excel
  return clean(v);
}

function digitCodeFromCell(v, width) {
  if (v == null || v === '') return '';
  if (typeof v === 'number' && Number.isFinite(v)) {
    return String(Math.trunc(v)).padStart(width, '0');
  }
  const s = cellToString(v);
  if (/^\d+$/.test(s)) return s.padStart(width, '0');
  return s;
}

function majorCodeFromCell(v) {
  return digitCodeFromCell(v, 4);
}

function collegeCodeFromCell(v) {
  return digitCodeFromCell(v, 2);
}

function safeEmail(email, fallbackLocal) {
  let e = clean(email).toLowerCase().replace(/\s+/g, '');
  // Fix common typos: namegmail@.com / name@.com
  e = e.replace(/@+/, '@');
  if (/^[^@]+gmail\.com$/.test(e)) e = e.replace(/gmail\.com$/, '@gmail.com');
  if (/^[^@]+@.+\..+/.test(e) && !e.includes('..') && !/@\.|@$/.test(e)) return e;
  const local = clean(fallbackLocal)
    .toLowerCase()
    .replace(/[^a-z0-9._+-]/g, '')
    .slice(0, 40);
  return `${local || 'user'}@ibu.edu.gm`;
}

function truncate(s, n) {
  const t = clean(s);
  return t.length > n ? t.slice(0, n) : t;
}

async function ensureAuthUser({ email, password, role, college_id, name, kind, record_id }) {
  const emailTrim = clean(email).toLowerCase();
  // Find existing public.users
  let { data: existing } = await sb.from('users').select('*').ilike('email', emailTrim).maybeSingle();

  let authId = existing?.openId || null;
  let userPk = existing?.id || null;

  if (authId) {
    const { error } = await sb.auth.admin.updateUserById(authId, {
      password,
      email_confirm: true,
      user_metadata: { name: name || emailTrim, role },
    });
    if (error) throw new Error(`auth update ${emailTrim}: ${error.message}`);
    await sb
      .from('users')
      .update({ role, college_id: college_id ?? null, name: name || emailTrim, email: emailTrim })
      .eq('id', userPk);
  } else {
    // try create
    const { data: created, error: createErr } = await sb.auth.admin.createUser({
      email: emailTrim,
      password,
      email_confirm: true,
      user_metadata: { name: name || emailTrim, role },
    });
    if (createErr) {
      // maybe auth exists without public.users
      const listed = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const found = (listed.data?.users || []).find((u) => u.email?.toLowerCase() === emailTrim);
      if (!found) throw new Error(`auth create ${emailTrim}: ${createErr.message}`);
      authId = found.id;
      await sb.auth.admin.updateUserById(authId, { password, email_confirm: true });
    } else {
      authId = created.user.id;
    }

    if (existing) {
      userPk = existing.id;
      await sb
        .from('users')
        .update({ openId: authId, role, college_id: college_id ?? null, name: name || emailTrim, email: emailTrim })
        .eq('id', userPk);
    } else {
      const { data: inserted, error: insErr } = await sb
        .from('users')
        .insert({
          openId: authId,
          email: emailTrim,
          name: name || emailTrim,
          role,
          college_id: college_id ?? null,
          loginMethod: 'email',
        })
        .select('id')
        .single();
      if (insErr) {
        // race: fetch again
        const again = await sb.from('users').select('id').ilike('email', emailTrim).maybeSingle();
        if (!again.data) throw new Error(`users insert ${emailTrim}: ${insErr.message}`);
        userPk = again.data.id;
      } else {
        userPk = inserted.id;
      }
    }
  }

  if (kind && record_id && userPk) {
    const table = kind === 'instructor' ? 'instructors' : 'students';
    await sb.from(table).update({ user_id: userPk }).eq('id', record_id);
  }
  return { userPk, authId, email: emailTrim };
}

async function upsertCollege(row) {
  const code = clean(row.code);
  const payload = {
    code,
    name_en: clean(row.name_en),
    name_ar: clean(row.name_ar),
    abbreviation: code,
    type: 'college',
    status: 'active',
    official_email: `college${code}@ibu.edu.gm`,
    student_id_prefix: '',
    student_id_format: '{year}{college_code}{sequence:D3}',
    student_id_starting_number: 1,
    instructor_id_prefix: 'IBU',
    instructor_id_format: '{prefix}-{year}{sequence:D3}',
    primary_color: code === '01' ? '#1F4E79' : '#548235',
    secondary_color: code === '01' ? '#D6E3F0' : '#E2EFDA',
    description_en: clean(row.note) || null,
  };
  const { data: existing } = await sb.from('colleges').select('id').eq('code', code).maybeSingle();
  if (existing) {
    const { data, error } = await sb.from('colleges').update(payload).eq('id', existing.id).select('*').single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await sb.from('colleges').insert(payload).select('*').single();
  if (error) throw error;
  return data;
}

async function upsertDepartment({ code, name_en, name_ar, college_id }) {
  const { data: existing } = await sb
    .from('departments')
    .select('id')
    .eq('code', code)
    .eq('college_id', college_id)
    .maybeSingle();
  const payload = {
    code,
    name_en,
    name_ar,
    college_id,
    is_university_wide: false,
    status: 'active',
    faculty_id: null,
  };
  if (existing) {
    const { data, error } = await sb.from('departments').update(payload).eq('id', existing.id).select('*').single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await sb.from('departments').insert(payload).select('*').single();
  if (error) throw error;
  return data;
}

async function upsertMajor(row, college_id, department_id) {
  const code = majorCodeFromCell(row.Code ?? row.code) || clean(row.Code__str || row.code);
  if (!code) throw new Error(`Major missing code: ${JSON.stringify(row['Name (EN)'] || row.name_en)}`);
  const degree_level = degreeToEnum(row.Degree || row.degree);
  const credits = Number(cellToString(row['Total credits'] || row.total_credits)) || 120;
  const payload = {
    code,
    name_en: cellToString(row['Name (EN)'] || row.name_en),
    name_ar: cellToString(row['Name (AR)'] || row.name_ar),
    degree_level,
    degree_title_en: cellToString(row.Degree || row.degree),
    degree_title_ar: cellToString(row.Degree || row.degree),
    college_id,
    department_id: department_id || null,
    faculty_id: null,
    is_university_wide: false,
    total_credits: credits,
    core_credits: Math.round(credits * 0.7),
    elective_credits: Math.round(credits * 0.3),
    min_semesters: degree_level === 'phd' ? 6 : degree_level === 'master' ? 4 : 8,
    max_semesters: degree_level === 'phd' ? 12 : degree_level === 'master' ? 8 : 16,
    min_gpa: 2.0,
    status: 'active',
    major_status: 'active',
    description: cellToString(row.Note || row.note) || null,
  };

  const { data: existing } = await sb
    .from('majors')
    .select('id')
    .eq('code', code)
    .eq('college_id', college_id)
    .maybeSingle();
  if (existing) {
    const { data, error } = await sb.from('majors').update(payload).eq('id', existing.id).select('*').single();
    if (error) throw error;
    return data;
  }
  // also try global code match (unique may be composite)
  const { data: byCode } = await sb.from('majors').select('id, college_id').eq('code', code).maybeSingle();
  if (byCode) {
    const { data, error } = await sb.from('majors').update(payload).eq('id', byCode.id).select('*').single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await sb.from('majors').insert(payload).select('*').single();
  if (error) throw error;
  return data;
}

async function upsertInstructor(row, college_id, department_id) {
  const employee_id = truncate(row['Employee ID'] || row.employee_id, 50) || `IBU-${Date.now()}`;
  const name_ar = cellToString(row['Name (AR)'] || row.name_ar);
  const email = safeEmail(row.Email || row.email, employee_id.replace(/[^a-zA-Z0-9]/g, '').toLowerCase());
  const payload = {
    employee_id,
    name_en: truncate(name_ar, 255),
    name_ar: truncate(name_ar, 255),
    email,
    phone: truncate(row.Phone || row.phone, 50) || null,
    college_id,
    department_id: department_id || null,
    specialization: truncate(row.Specialization || row.specialization, 255) || null,
    nationality: truncate(row.Nationality || row.nationality, 50) || null,
    title: 'lecturer',
    status: 'active',
    academic_title: truncate(row['Job title (AR)'] || row.job_title_ar, 50) || null,
  };

  const { data: byEmp } = await sb.from('instructors').select('id, email').eq('employee_id', employee_id).maybeSingle();
  const { data: byEmail } = await sb.from('instructors').select('id, email').ilike('email', email).maybeSingle();
  const existing = byEmp || byEmail;
  let rowOut;
  if (existing) {
    const { data, error } = await sb.from('instructors').update(payload).eq('id', existing.id).select('*').single();
    if (error) throw error;
    rowOut = data;
  } else {
    const { data, error } = await sb.from('instructors').insert(payload).select('*').single();
    if (error) throw error;
    rowOut = data;
  }

  await ensureAuthUser({
    email: rowOut.email,
    password: PASSWORD,
    role: 'instructor',
    college_id,
    name: name_ar,
    kind: 'instructor',
    record_id: rowOut.id,
  });
  return rowOut;
}

async function upsertStudent(row, college_id, major_id) {
  const student_id = clean(row['Student number'] || row.student_number);
  if (!student_id) throw new Error('Student missing roll number');
  const name_ar = clean(row['Name (AR)'] || row.name_ar);
  const email = safeEmail(row.Email || row.email, student_id);
  const enrollYear = clean(row['Enrollment year'] || row.enrollment_year) || student_id.slice(0, 4);
  const enrollment_date = `${enrollYear}-09-01`;
  const payload = {
    student_id,
    name_en: name_ar,
    name_ar,
    email,
    phone: clean(row.Phone || row.phone) || null,
    college_id,
    major_id,
    enrollment_date,
    nationality: clean(row.Nationality || row.nationality) || null,
    national_id: clean(row['Passport/ID'] || row.passport_or_id) || null,
    date_of_birth: clean(row.DOB || row.date_of_birth) || null,
    status: 'active',
    study_type: 'full_time',
    study_load: 'normal',
    study_approach: 'on_campus',
    notes: clean(row.Evidence || row.evidence) || null,
  };
  if (payload.date_of_birth) {
    const d = payload.date_of_birth;
    const ok = /^\d{4}-\d{2}-\d{2}$/.test(d);
    const parts = ok ? d.split('-').map(Number) : null;
    if (!ok || !parts || parts[1] < 1 || parts[1] > 12 || parts[2] < 1 || parts[2] > 31) {
      payload.date_of_birth = null;
    }
  }

  const { data: bySid } = await sb.from('students').select('id').eq('student_id', student_id).maybeSingle();
  const { data: byEmail } = await sb.from('students').select('id').ilike('email', email).maybeSingle();
  const existing = bySid || byEmail;
  let rowOut;
  if (existing) {
    const { data, error } = await sb.from('students').update(payload).eq('id', existing.id).select('*').single();
    if (error) throw error;
    rowOut = data;
  } else {
    const { data, error } = await sb.from('students').insert(payload).select('*').single();
    if (error) throw error;
    rowOut = data;
  }

  await ensureAuthUser({
    email: rowOut.email,
    password: PASSWORD,
    role: 'student',
    college_id,
    name: name_ar,
    kind: 'student',
    record_id: rowOut.id,
  });
  return rowOut;
}

async function main() {
  console.log('Reading preview:', path.basename(PREVIEW));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(PREVIEW);

  const majorsRaw = await readSheetRows(wb, 'Majors');
  const instructorsRaw = await readSheetRows(wb, 'Instructors');
  const studentsRaw = await readSheetRows(wb, 'Students');

  console.log(
    `Preview rows → majors ${majorsRaw.length}, instructors ${instructorsRaw.length}, students ${studentsRaw.length}`
  );

  // ---- Colleges ----
  console.log('\n=== Colleges ===');
  const collegeDefs = [
    {
      code: '01',
      name_en: 'College of Islamic Sharia',
      name_ar: 'كلية الشريعة',
      note: 'IBU Sharia — Hadith, Creed, Fiqh',
    },
    {
      code: '02',
      name_en: 'College of Business',
      name_ar: 'كلية إدارة الأعمال',
      note: 'IBU Business — Economics and Financial Systems',
    },
  ];
  const collegeByCode = {};
  for (const c of collegeDefs) {
    const row = await upsertCollege(c);
    collegeByCode[c.code] = row;
    console.log(`  ✓ ${row.code} — ${row.name_en} (id=${row.id})`);
  }

  // ---- Departments ----
  console.log('\n=== Departments ===');
  const deptDefs = [
    { code: 'HADITH', name_en: 'Hadith and Its Sciences', name_ar: 'الحديث وعلومه', college: '01' },
    {
      code: 'CREED',
      name_en: 'Creed and Fundamentals of Religion',
      name_ar: 'العقيدة وأصول الدين',
      college: '01',
    },
    {
      code: 'FIQH',
      name_en: 'Jurisprudence and Its Fundamentals',
      name_ar: 'الفقه وأصوله',
      college: '01',
    },
    {
      code: 'ECON',
      name_en: 'Economics and Financial Systems',
      name_ar: 'الاقتصاد والنظم المالية',
      college: '02',
    },
  ];
  const deptByCode = {};
  for (const d of deptDefs) {
    const row = await upsertDepartment({
      ...d,
      college_id: collegeByCode[d.college].id,
    });
    deptByCode[d.code] = row;
    console.log(`  ✓ ${row.code} — ${row.name_en}`);
  }

  // ---- Majors ----
  console.log('\n=== Majors ===');
  const majorCodeToDept = {
    '0111': 'HADITH',
    '0113': 'HADITH',
    '0131': 'CREED',
    '0141': 'FIQH',
    '0143': 'FIQH',
    '0144': 'FIQH',
    '0411': 'ECON',
  };
  const majorByCode = {};
  const programRows = majorsRaw.filter((r) => {
    const deg = clean(r.Degree || r.degree);
    return deg && deg.toLowerCase() !== 'college';
  });

  for (const m of programRows) {
    const code = majorCodeFromCell(m.Code ?? m.code) || cellToString(m.Code__str);
    const cc =
      collegeCodeFromCell(m['College code'] ?? m.college_code) ||
      cellToString(m['College code__str']) ||
      (code.startsWith('04') ? '02' : '01');
    const collegeRow = collegeByCode[cc];
    if (!collegeRow) {
      console.warn('  skip major (no college)', code, cc);
      continue;
    }
    const dept = deptByCode[majorCodeToDept[code]] || null;
    const row = await upsertMajor({ ...m, Code: code }, collegeRow.id, dept?.id);
    majorByCode[code] = row;
    console.log(`  ✓ ${row.code} [${row.degree_level}] — ${row.name_en}`);
  }

  // Remove broken empty-code major from earlier import (if still present)
  const { data: brokenMajors } = await sb.from('majors').select('id, code, name_en').eq('code', '');
  for (const bm of brokenMajors || []) {
    // Remap any students still on this major after we finish student upsert
    console.log(`  ⚠ found broken major id=${bm.id} code="" (${bm.name_en}) — will remap after students`);
  }

  // ---- Instructors (assign to Sharia by default; Business if specialization hints economy) ----
  console.log('\n=== Instructors ===');
  let instrOk = 0;
  let instrFail = 0;
  for (const raw of instructorsRaw) {
    try {
      const spec = clean(raw.Specialization || raw.specialization || raw['Courses (from Excel)']);
      const collegeCode = /اقتصاد|business|مالية/i.test(spec) ? '02' : '01';
      const dept =
        collegeCode === '02'
          ? deptByCode.ECON
          : /عقيدة|دعوة|توحيد/i.test(spec)
            ? deptByCode.CREED
            : /فقه/i.test(spec)
              ? deptByCode.FIQH
              : deptByCode.HADITH;
      await upsertInstructor(raw, collegeByCode[collegeCode].id, dept?.id);
      instrOk++;
      process.stdout.write(`  ✓ instructors ${instrOk}/${instructorsRaw.length}\r`);
      await sleep(120);
    } catch (e) {
      instrFail++;
      console.error(`\n  ✗ instructor ${clean(raw['Name (AR)'])}: ${e.message}`);
    }
  }
  console.log(`\n  Done instructors: ok=${instrOk} fail=${instrFail}`);

  // ---- Students ----
  console.log('\n=== Students ===');
  let stuOk = 0;
  let stuFail = 0;
  let stuSkip = 0;
  for (const raw of studentsRaw) {
    const majorCode =
      majorCodeFromCell(raw['Major code'] ?? raw.major_code) || cellToString(raw['Major code__str']);
    const collegeCode =
      collegeCodeFromCell(raw['College code'] ?? raw.college_code) ||
      cellToString(raw['College code__str']) ||
      '01';
    const college = collegeByCode[collegeCode];
    let major = majorByCode[majorCode];
    if (!major && collegeCode === '01') major = majorByCode['0111'];
    if (!major && collegeCode === '02') major = majorByCode['0411'];
    if (!college || !major) {
      stuSkip++;
      console.warn(
        `  skip student ${cellToString(raw['Student number'])}: college=${collegeCode} major=${majorCode}`
      );
      continue;
    }
    try {
      await upsertStudent(raw, college.id, major.id);
      stuOk++;
      if (stuOk % 10 === 0) process.stdout.write(`  ✓ students ${stuOk}/${studentsRaw.length}\r`);
      await sleep(100);
    } catch (e) {
      stuFail++;
      console.error(
        `\n  ✗ student ${clean(raw['Student number'])} ${clean(raw['Name (AR)'])}: ${e.message}`
      );
    }
  }
  console.log(`\n  Done students: ok=${stuOk} fail=${stuFail} skip=${stuSkip}`);

  // ---- Cleanup broken empty-code majors ----
  console.log('\n=== Cleanup ===');
  const defaultSharia = majorByCode['0111'];
  const defaultBiz = majorByCode['0411'];
  const { data: emptyCodeMajors } = await sb.from('majors').select('id, college_id').eq('code', '');
  for (const bm of emptyCodeMajors || []) {
    const fallback =
      bm.college_id === collegeByCode['02']?.id ? defaultBiz : defaultSharia;
    if (fallback) {
      const { error: remapErr } = await sb
        .from('students')
        .update({ major_id: fallback.id })
        .eq('major_id', bm.id);
      if (remapErr) console.warn('  remap students failed:', remapErr.message);
      else console.log(`  remapped students from broken major ${bm.id} → ${fallback.code}`);
    }
    const { error: delErr } = await sb.from('majors').delete().eq('id', bm.id);
    if (delErr) console.warn('  could not delete broken major:', delErr.message);
    else console.log(`  deleted broken major id=${bm.id}`);
  }

  // ---- Summary ----
  const [{ count: cCount }, { count: mCount }, { count: iCount }, { count: sCount }] = await Promise.all([
    sb.from('colleges').select('*', { count: 'exact', head: true }),
    sb.from('majors').select('*', { count: 'exact', head: true }),
    sb.from('instructors').select('*', { count: 'exact', head: true }),
    sb.from('students').select('*', { count: 'exact', head: true }),
  ]);

  const { data: majorList } = await sb
    .from('majors')
    .select('code, name_en, degree_level, college_id')
    .in('code', Object.keys(majorByCode));

  console.log('\n========== IMPORT COMPLETE ==========');
  console.log(`Password for all instructor/student logins: ${PASSWORD}`);
  console.log(`DB totals → colleges=${cCount} majors=${mCount} instructors=${iCount} students=${sCount}`);
  console.log('Colleges: 01 Sharia, 02 Business');
  console.log('Majors:', Object.keys(majorByCode).sort().join(', '));
  for (const m of majorList || []) {
    console.log(`  ${m.code} [${m.degree_level}] ${m.name_en}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
