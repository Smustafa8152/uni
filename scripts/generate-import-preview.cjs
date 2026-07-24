const ExcelJS = require('exceljs');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const docsDir = path.join(__dirname, '..', 'docs');

function clean(s) {
  return String(s || '')
    .replace(/\r\n/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// --- Instructors from staff Excel ---
const staffFile = fs
  .readdirSync(docsDir)
  .find((f) => f.includes('قاعدة') || f.includes('مدرسين'));
if (!staffFile) {
  console.error('Staff Excel not found in docs/');
  process.exit(1);
}

const staffWb = XLSX.readFile(path.join(docsDir, staffFile));
const staffRows = XLSX.utils.sheet_to_json(staffWb.Sheets[staffWb.SheetNames[0]], {
  header: 1,
  defval: '',
});

const instructors = [];
for (let i = 3; i < staffRows.length; i++) {
  const r = staffRows[i];
  const name = clean(r[1]);
  if (!name) continue;
  const courses = clean(r[14]);
  const willTeach =
    courses &&
    !/^لا\s*يدر/.test(courses) &&
    !/^إداري\s*$/i.test(courses) &&
    courses !== 'إداري';
  instructors.push({
    employee_id: clean(r[10]),
    name_ar: name,
    nationality: clean(r[2]),
    phone: clean(r[5]),
    email: clean(r[6]) || '',
    qualification: clean(r[7]),
    specialization: clean(r[8]),
    job_title_ar: clean(r[13]),
    courses_from_excel: courses,
    will_teach: willTeach ? 'yes' : 'no',
    status: 'active',
  });
}

const courseMap = [
  [1, 'تاريخ السنة', 'عمر جغنا', ''],
  [1, 'التحرير العربي', 'الأمين مانجا', ''],
  [1, 'الإنجليزية 1', 'Drammeh', ''],
  [1, 'مدخل إلى علوم القرآن', 'إبراهيم الشربيني', 'طالبات: أم عبد الرحمن'],
  [1, 'المدخل إلى علوم الحديث', 'إبراهيم واغي', ''],
  [1, 'المدخل إلى الحديث التحليلي', 'سليمان كويتا', ''],
  [1, 'النحو', 'الأمين ماني', ''],
  [1, 'مناهج البحث', 'شيخ جيتي', ''],
  [1, 'الفقه 1', 'معاذ كاه', ''],
  [1, 'التجويد', 'عبد الله باه', ''],
  [1, 'القرآن الكريم 1', 'أبوبكر توري', ''],
  [1, 'التوحيد', 'عمر باجي', ''],
  [2, 'الحاسوب 1', 'عبد الرحمن جيبو', ''],
  [2, 'التفسير 1', 'محمد سيكا', ''],
  [2, 'القرآن الكريم 2', 'محمد سيكا', ''],
  [2, 'مصطلح الحديث 1', 'إبراهيم واغي', ''],
  [2, 'الفقه 2', 'إبراهيم الشربيني', 'طالبات: فاطمة الشربيني'],
  [2, 'النحو 2', 'الأمين ماني', ''],
  [2, 'الحديث التحليلي 1', 'محمد سيال', 'طالبات: عبد الجليل'],
  [2, 'رواة الحديث 1', 'الأمين درامي', ''],
  [2, 'مناهج المحدثين', 'عمر جغنا', ''],
  [2, 'الإنجليزية 2', 'Drammeh', ''],
  [3, 'مصطلح الحديث 2', 'محمود جغنا', ''],
  [3, 'الإنجليزية 3', 'Mbay', ''],
  [3, 'رواة الحديث 2', 'عبد الجليل', ''],
  [3, 'دراسات غامبيا', 'إمام انجاي', ''],
  [3, 'القرآن الكريم 3', 'أبوبكر توري', 'طالبات: فاطمة الشربيني'],
  [3, 'كتب السنة 1', 'سليمان كويتا', ''],
  [3, 'النحو 3', 'الأمين ماني', ''],
  [3, 'الحديث التحليلي 2', 'محمد سيال', ''],
  [3, 'أصول الفقه 1', 'أبوبكر توري', ''],
  [3, 'التوحيد 2', 'عمر باجي', ''],
  [4, 'الجرح والتعديل 1', 'محمود جغنا', ''],
  [4, 'القرآن الكريم 4', 'إبراهيم الشربيني', 'طالبات: فاطمة الشربيني'],
  [4, 'الفقه 3', 'إبراهيم الشربيني', 'طالبات: فاطمة الشربيني'],
  [4, 'الإنجليزية 4', 'Mbay', ''],
  [4, 'التوحيد 3', 'الحاج جاوال', ''],
  [4, 'مصطلح الحديث 3', 'خليل جاتا', ''],
  [4, 'أصول الفقه 2', 'أبوبكر توري', ''],
  [4, 'كتب السنة 2', 'عبد الجليل', ''],
  [4, 'التفسير 2', 'عبد الله باه', ''],
  [4, 'الحديث التحليلي 3', 'محمد سيال', 'طالبات: سليمان كويتا'],
  [5, 'الجرح والتعديل 2', 'علي جغنا', ''],
  [5, 'الدعوة والحسبة', 'عمر باجي', ''],
  [5, 'الإنجليزية 5', 'Saidyleigh', ''],
  [5, 'الفقه 4', 'إبراهيم الشربيني', 'طالبات: أم عبد الرحمن'],
  [5, 'الصرف', 'الأمين ماني', ''],
  [5, 'القرآن الكريم 5', 'أبوبكر توري', 'طالبات: فاطمة الشربيني'],
  [5, 'السيرة النبوية', 'الحاج جاوال', ''],
  [5, 'التوحيد 4', 'ساجو فديرا', ''],
  [5, 'مصطلح الحديث 4', 'عبد الجليل', ''],
  [5, 'كتب السنة 3', 'سليمان كويتا', ''],
  [5, 'الحديث التحليلي 4', 'محمد سيال', ''],
  [6, 'التقانة في خدمة السنة', 'علي جغنا', ''],
  [6, 'الحديث التحليلي 5', 'محمد سيال', ''],
  [6, 'قاعدة البيانات', 'ساجو جالو', ''],
  [6, 'الرياضيات التطبيقية', 'Raifu Kazeem', 'Saidyleigh'],
  [6, 'الإنجليزية 6', 'Raifu Kazeem', ''],
  [6, 'كتب السنة 4', 'سليمان كويتا', ''],
  [6, 'الصرف', 'الأمين ماني', ''],
  [6, 'الحديث الموضوعي', 'محمد سيال', 'طالبات: عبد الجليل'],
  [6, 'مكانة السنة', 'سليمان كويتا', ''],
  [6, 'القرآن الكريم 6', 'أبوبكر توري', 'طالبات: معاذ كاه'],
  [6, 'أصول دراسة الأسانيد', 'عبد الجليل', ''],
].map(([level, course_ar, lecturer_ar, section_note]) => ({
  level,
  course_ar,
  lecturer_ar_raw: lecturer_ar,
  lecturer_ar,
  section_note,
  college_en: 'Sharia',
  college_ar: 'كلية الشريعة',
  major_en: 'Hadith and Its Sciences',
  major_ar: 'بكالوريوس الحديث وعلومه',
  evidence: 'Courses & Lecturers PDF — Hadith track under College of Sharia',
  action: 'map to classes.instructor_id after subject match',
}));

function softInstructorName(s) {
  return clean(s)
    .replace(/[()（）\[\]«».,]/g, ' ')
    .replace(/أ|إ|آ/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/\bد\.?\b|\bأ\.?\b|\bأ\.?\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const LECTURER_ALIASES = {
  drammeh: 'أحمد دارمي',
  mbay: 'محمد كبير إمباي',
  saidyleigh: 'إبراهيم سيدي لي',
  'raifu kazeem': '', // no exact staff match
  'ابراهيم الشربيني': 'إبراهيم حسين الشربيني',
  'ابراهيم حسين الشربيني': 'إبراهيم حسين الشربيني',
  'سليمان كويتا': 'سليمان الحاج كويتا',
  'الامين ماني': 'الأمين موسى ماني',
  'شيخ جيتي': 'شيخ كبير جيتي',
  'معاذ كاه': 'معاذ امباي كاه',
  'عبد الله باه': 'عبد الله يوسف باه',
  'ابوبكر توري': 'أبو بكر دمبو توري',
  'ابو بكر توري': 'أبو بكر دمبو توري',
  'عمر باجي': 'عمر ألمام باجي',
  'عبد الرحمن جيبو': 'عبد الرحمن إبراهيم جيبو',
  'محمد سيال': 'محمد بن الحسن سيلا',
  'عبد الجليل': 'عبد الجليل فوفنا',
  'امام انجاي': 'إمام الحسن انجاي',
  'امام الحسن انجاي': 'إمام الحسن انجاي',
  'الحاج جاوال': 'الحاج دومبيا جولا',
  'ساجو جالو': 'الحسن جالو',
  'الامين درامي': 'أحمد دارمي',
  'الامين مانجا': 'الأمين مانجا',
  'فاطمه الشربيني': 'فاطمة الشربيني',
  'محمود جغنا': 'عمر جغنا', // closest staff match (same family)
};

function matchInstructorName(raw, instructorNames) {
  const rawClean = clean(raw);
  if (!rawClean) return { name: '', match: 'empty' };
  const softRaw = softInstructorName(rawClean);

  // Exact
  for (const n of instructorNames) {
    if (clean(n) === rawClean) return { name: n, match: 'exact' };
  }
  for (const n of instructorNames) {
    if (softInstructorName(n) === softRaw) return { name: n, match: 'exact_soft' };
  }

  // Alias table
  const alias = LECTURER_ALIASES[softRaw];
  if (alias) {
    const hit = instructorNames.find((n) => softInstructorName(n) === softInstructorName(alias));
    if (hit) return { name: hit, match: 'alias' };
  }
  if (alias === '') return { name: rawClean, match: 'unmatched_alias' };

  // Token overlap / contains
  let best = null;
  let bestScore = 0;
  const rawTokens = softRaw.split(' ').filter((t) => t.length > 1);
  for (const n of instructorNames) {
    const softN = softInstructorName(n);
    if (softN.includes(softRaw) || softRaw.includes(softN)) {
      const score = Math.min(softRaw.length, softN.length) / Math.max(softRaw.length, softN.length);
      if (score > bestScore) {
        bestScore = score;
        best = n;
      }
      continue;
    }
    const nTokens = softN.split(' ').filter((t) => t.length > 1);
    const overlap = rawTokens.filter((t) => nTokens.includes(t)).length;
    const score = overlap / Math.max(rawTokens.length, nTokens.length);
    if (overlap >= 2 && score > bestScore) {
      bestScore = score;
      best = n;
    }
  }
  if (best && bestScore >= 0.4) return { name: best, match: 'fuzzy' };
  return { name: rawClean, match: 'unmatched' };
}

{
  const instructorNames = instructors.map((i) => i.name_ar);
  for (const row of courseMap) {
    const m = matchInstructorName(row.lecturer_ar_raw, instructorNames);
    row.lecturer_ar = m.name;
    row.lecturer_match = m.match;
    // Also rewrite known instructor snippets inside section notes when possible
    if (row.section_note) {
      let note = row.section_note;
      const noteNames = [
        'فاطمة الشربيني',
        'أم عبد الرحمن',
        'عبد الجليل',
        'سليمان كويتا',
        'معاذ كاه',
        'Saidyleigh',
      ];
      for (const nn of noteNames) {
        if (note.includes(nn)) {
          const mm = matchInstructorName(nn, instructorNames);
          if (mm.match !== 'unmatched' && mm.match !== 'unmatched_alias' && mm.match !== 'empty') {
            note = note.split(nn).join(mm.name);
          }
        }
      }
      row.section_note = note;
    }
  }
  const unmatched = courseMap.filter((r) =>
    ['unmatched', 'unmatched_alias'].includes(r.lecturer_match)
  );
  console.log(
    'Lecturer name match → exact/alias/fuzzy',
    courseMap.length - unmatched.length,
    '/',
    courseMap.length,
    '| unmatched',
    unmatched.map((u) => u.lecturer_ar_raw)
  );
}

const subjects = [
  {
    code: 'IQS1211',
    name_en: 'Introduction to Quranic Sciences',
    name_ar: 'مقدمة في علوم القرآن',
    credits: 3,
    semester: 1,
    major_code: '0131',
    major_ar: 'بكالوريوس العقيدة وأصول الدين',
    prereq: '',
  },
  {
    code: 'HOL1411',
    name_en: 'History of Legislation',
    name_ar: 'تاريخ التشريع',
    credits: 2,
    semester: 1,
    major_code: '0131',
    major_ar: 'بكالوريوس العقيدة وأصول الدين',
    prereq: '',
  },
  {
    code: 'INV1312',
    name_en: 'Intellectual Invasion',
    name_ar: 'الغزو الفكري',
    credits: 2,
    semester: 1,
    major_code: '0131',
    major_ar: 'بكالوريوس العقيدة وأصول الدين',
    prereq: '',
  },
  {
    code: 'ALG2113',
    name_en: 'Grammar 1',
    name_ar: 'النحو (1)',
    credits: 3,
    semester: 1,
    major_code: '0131',
    major_ar: 'بكالوريوس العقيدة وأصول الدين',
    prereq: '',
  },
  {
    code: 'ISC1313',
    name_en: 'Introduction to Islamic Creed',
    name_ar: 'مقدمة في العقيدة الإسلامية',
    credits: 3,
    semester: 1,
    major_code: '0131',
    major_ar: 'بكالوريوس العقيدة وأصول الدين',
    prereq: '',
  },
  {
    code: 'DTS1114',
    name_en: 'Hadith Compilation / Year Recording',
    name_ar: 'تدوين السنة',
    credits: 2,
    semester: 1,
    major_code: '0131',
    major_ar: 'بكالوريوس العقيدة وأصول الدين',
    prereq: '',
  },
  {
    code: 'IHS1121',
    name_en: 'Introduction to Hadith Sciences',
    name_ar: 'مقدمة في علوم الحديث',
    credits: 3,
    semester: 2,
    major_code: '0131',
    major_ar: 'بكالوريوس العقيدة وأصول الدين',
    prereq: '',
  },
  {
    code: 'ISD2121',
    name_en: 'Islamic Education',
    name_ar: 'التربية الإسلامية',
    credits: 2,
    semester: 2,
    major_code: '0131',
    major_ar: 'بكالوريوس العقيدة وأصول الدين',
    prereq: '',
  },
  {
    code: 'TPB1325',
    name_en: 'Prophetic Biography 1',
    name_ar: 'السيرة النبوية (1)',
    credits: 3,
    semester: 2,
    major_code: '0131',
    major_ar: 'بكالوريوس العقيدة وأصول الدين',
    prereq: '',
  },
  {
    code: 'ALG2123',
    name_en: 'Grammar 2',
    name_ar: 'النحو (2)',
    credits: 3,
    semester: 2,
    major_code: '0131',
    major_ar: 'بكالوريوس العقيدة وأصول الدين',
    prereq: 'ALG2113',
  },
  {
    code: 'RMS1121',
    name_en: 'Research Methodologies',
    name_ar: 'مناهج البحث',
    credits: 3,
    semester: 2,
    major_code: '0131',
    major_ar: 'بكالوريوس العقيدة وأصول الدين',
    prereq: '',
  },
  {
    code: 'ENL2222',
    name_en: 'English Language 1',
    name_ar: 'اللغة الإنجليزية (1)',
    credits: 2,
    semester: 2,
    major_code: '0131',
    major_ar: 'بكالوريوس العقيدة وأصول الدين',
    prereq: '',
  },
  {
    code: 'DAH1321',
    name_en: 'History of the Call',
    name_ar: 'تاريخ الدعوة',
    credits: 2,
    semester: 2,
    major_code: '0131',
    major_ar: 'بكالوريوس العقيدة وأصول الدين',
    prereq: '',
  },
  {
    code: 'TPB1335',
    name_en: 'Prophetic Biography 2',
    name_ar: 'السيرة النبوية (2)',
    credits: 3,
    semester: 3,
    major_code: '0131',
    major_ar: 'بكالوريوس العقيدة وأصول الدين',
    prereq: 'TPB1325',
  },
  {
    code: 'JUG1431',
    name_en: 'Jurisprudence (General) 1',
    name_ar: 'الفقه العام (1)',
    credits: 3,
    semester: 3,
    major_code: '0131',
    major_ar: 'بكالوريوس العقيدة وأصول الدين',
    prereq: '',
  },
  {
    code: 'IHQ1236',
    name_en: 'Tafsir (General) 1',
    name_ar: 'التفسير العام (1)',
    credits: 3,
    semester: 3,
    major_code: '0131',
    major_ar: 'بكالوريوس العقيدة وأصول الدين',
    prereq: '',
  },
  {
    code: 'ICS1331',
    name_en: 'Creed (Special) 1',
    name_ar: 'العقيدة التخصصية (1)',
    credits: 3,
    semester: 3,
    major_code: '0131',
    major_ar: 'بكالوريوس العقيدة وأصول الدين',
    prereq: 'ISC1313',
  },
  {
    code: 'ALG2133',
    name_en: 'Grammar 3',
    name_ar: 'النحو (3)',
    credits: 3,
    semester: 3,
    major_code: '0131',
    major_ar: 'بكالوريوس العقيدة وأصول الدين',
    prereq: 'ALG2123',
  },
  {
    code: 'GHA1141',
    name_en: 'Hadith (General) 1',
    name_ar: 'الحديث العام (1)',
    credits: 3,
    semester: 4,
    major_code: '0131',
    major_ar: 'بكالوريوس العقيدة وأصول الدين',
    prereq: 'IHS1121',
  },
  {
    code: 'PMD1242',
    name_en: "Fundamentals of Da'wah 1",
    name_ar: 'أصول الدعوة ومناهجها (1)',
    credits: 3,
    semester: 4,
    major_code: '0131',
    major_ar: 'بكالوريوس العقيدة وأصول الدين',
    prereq: '',
  },
  {
    code: 'ICS1341',
    name_en: 'Aqeedah (Special) 2',
    name_ar: 'العقيدة التخصصية (2)',
    credits: 3,
    semester: 4,
    major_code: '0131',
    major_ar: 'بكالوريوس العقيدة وأصول الدين',
    prereq: 'ICS1331',
  },
  {
    code: 'ICRH1375',
    name_en: 'Islamic Creed Research Hall',
    name_ar: 'قاعة بحث العقيدة الإسلامية',
    credits: 3,
    semester: 7,
    major_code: '0131',
    major_ar: 'بكالوريوس العقيدة وأصول الدين',
    prereq: '',
  },
  {
    code: 'DRH1383',
    name_en: "Islamic Da'wah Research Hall",
    name_ar: 'قاعة بحث الدعوة الإسلامية',
    credits: 3,
    semester: 8,
    major_code: '0131',
    major_ar: 'بكالوريوس العقيدة وأصول الدين',
    prereq: '',
  },
  {
    code: 'IHS1121',
    name_en: 'Introduction to Hadith Sciences',
    name_ar: 'مقدمة في علوم الحديث',
    credits: 4,
    semester: 2,
    major_code: '0111',
    major_ar: 'بكالوريوس الحديث وعلومه',
    prereq: '',
  },
  {
    code: 'HTS1142',
    name_en: 'Hadith Terminology 1',
    name_ar: 'مصطلح الحديث (1)',
    credits: 4,
    semester: 4,
    major_code: '0111',
    major_ar: 'بكالوريوس الحديث وعلومه',
    prereq: 'IHS1121',
  },
  {
    code: 'STB1154',
    name_en: 'Studies in Books of Hadith 1',
    name_ar: 'دراسات في كتب السنة (1)',
    credits: 4,
    semester: 5,
    major_code: '0111',
    major_ar: 'بكالوريوس الحديث وعلومه',
    prereq: '',
  },
  {
    code: 'NOH1153',
    name_en: 'Narrators of Hadith 1',
    name_ar: 'رواة الحديث وطبقاتهم (1)',
    credits: 3,
    semester: 5,
    major_code: '0111',
    major_ar: 'بكالوريوس الحديث وعلومه',
    prereq: '',
  },
  {
    code: 'CAJ1182',
    name_en: "Al-Jarh wa al-Ta'dil",
    name_ar: 'الجرح والتعديل',
    credits: 4,
    semester: 8,
    major_code: '0111',
    major_ar: 'بكالوريوس الحديث وعلومه',
    prereq: '',
  },
  {
    code: 'HRH1171',
    name_en: 'Hadith Sciences Research Hall',
    name_ar: 'قاعة بحث علوم الحديث',
    credits: 3,
    semester: 7,
    major_code: '0111',
    major_ar: 'بكالوريوس الحديث وعلومه',
    prereq: '',
  },
];

const majors = [
  {
    code: '01',
    college_code: '01',
    degree: 'College',
    name_en: 'College of Islamic Sharia',
    name_ar: 'كلية الشريعة',
    college_en: 'Sharia',
    college_ar: 'كلية الشريعة',
    total_credits: '',
    track: '',
    note: 'PDF: College of Islamic Sharia / Shariah Faculty',
  },
  {
    code: '0111',
    college_code: '01',
    degree: 'Bachelor',
    name_en: 'Hadith and Its Sciences',
    name_ar: 'بكالوريوس الحديث وعلومه',
    college_en: 'Sharia',
    college_ar: 'كلية الشريعة',
    total_credits: 131,
    track: '',
    note: 'PDF Bachelor Hadith — program code 0111',
  },
  {
    code: '0131',
    college_code: '01',
    degree: 'Bachelor',
    name_en: 'Creed and Fundamentals of Religion',
    name_ar: 'بكالوريوس العقيدة وأصول الدين',
    college_en: 'Sharia',
    college_ar: 'كلية الشريعة',
    total_credits: 135,
    track: '',
    note: 'PDF Creed/Theology — program code 0131',
  },
  {
    code: '0141',
    college_code: '01',
    degree: 'Bachelor',
    name_en: 'Jurisprudence and Its Fundamentals',
    name_ar: 'بكالوريوس الفقه وأصوله',
    college_en: 'Sharia',
    college_ar: 'كلية الشريعة',
    total_credits: 126,
    track: '',
    note: 'PDF Bachelor Fiqh — program code 0141',
  },
  {
    code: '0113',
    college_code: '01',
    degree: 'Master',
    name_en: 'Hadith and Its Sciences',
    name_ar: 'ماجستير الحديث وعلومه',
    college_en: 'Sharia',
    college_ar: 'كلية الشريعة',
    total_credits: '',
    track: 'Comprehensive',
    note: 'PDF Master Hadith — program code 0113 — Deanship of Graduate Studies',
  },
  {
    code: '0143',
    college_code: '01',
    degree: 'Master',
    name_en: 'Jurisprudence and Its Fundamentals',
    name_ar: 'ماجستير الفقه وأصوله',
    college_en: 'Sharia',
    college_ar: 'كلية الشريعة',
    total_credits: '',
    track: 'Comprehensive',
    note: 'PDF Master Fiqh — program code 0143 — Faculty Shariah (cover mislabels Business)',
  },
  {
    code: '0144',
    college_code: '01',
    degree: 'PhD',
    name_en: 'Jurisprudence and Its Fundamentals',
    name_ar: 'دكتوراه الفقه وأصوله',
    college_en: 'Sharia',
    college_ar: 'كلية الشريعة',
    total_credits: '',
    track: 'Thesis',
    note: 'PDF PhD Fiqh — program code 0144 — Thesis track',
  },
  {
    code: '02',
    college_code: '02',
    degree: 'College',
    name_en: 'College of Business',
    name_ar: 'كلية إدارة الأعمال',
    college_en: 'Business',
    college_ar: 'كلية إدارة الأعمال',
    total_credits: '',
    track: '',
    note: 'PDF: College of Business / Business Faculty',
  },
  {
    code: '0411',
    college_code: '02',
    degree: 'Bachelor',
    name_en: 'Economics and Financial Systems',
    name_ar: 'بكالوريوس الاقتصاد والنظم المالية',
    college_en: 'Business',
    college_ar: 'كلية إدارة الأعمال',
    total_credits: '',
    track: '',
    note: 'PDF Bachelor Economics — program code 0411',
  },
];

const PROGRAMS = {
  hadith: {
    college_code: '01',
    college_en: 'Sharia',
    college_ar: 'كلية الشريعة',
    major_code: '0111',
    major_en: 'Hadith and Its Sciences',
    major_ar: 'بكالوريوس الحديث وعلومه',
    evidence: 'PDF Bachelor Hadith 0111 + Hadith-specialization courses',
  },
  creed: {
    college_code: '01',
    college_en: 'Sharia',
    college_ar: 'كلية الشريعة',
    major_code: '0131',
    major_en: 'Creed and Fundamentals of Religion',
    major_ar: 'بكالوريوس العقيدة وأصول الدين',
    evidence: 'PDF Creed 0131 + التراكمي العقيدة والدعوة',
  },
  economics: {
    college_code: '02',
    college_en: 'Business',
    college_ar: 'كلية إدارة الأعمال',
    major_code: '0411',
    major_en: 'Economics and Financial Systems',
    major_ar: 'بكالوريوس الاقتصاد والنظم المالية',
    evidence: 'PDF Economics 0411 + التراكمي الاقتصاد',
  },
};

function inferProgramFromCourses(courseNames) {
  const joined = courseNames.map(clean).join(' | ');
  if (/اقتصاد|مهارات تقنية|مقدمة في الاقتصاد/i.test(joined)) return PROGRAMS.economics;
  if (/تدوين في علم\s*العقيدة|أصول العقيدة|العقيدة التخصص|التوحيد 1(?!\d)/i.test(joined)) {
    return PROGRAMS.creed;
  }
  if (/كتب السنة|رواة|روة الحديث|مصطلح الحديث|الجرح|الحديث التحليلي|مناهج المحدث/i.test(joined)) {
    return PROGRAMS.hadith;
  }
  return null;
}

function programFromCumulFilename(fileName) {
  if (/اقتصاد/i.test(fileName)) return PROGRAMS.economics;
  if (/عقيدة|دعوة/i.test(fileName)) return PROGRAMS.creed;
  if (/حديث|حدديث/i.test(fileName)) return PROGRAMS.hadith;
  return null;
}

// --- Students + grades from كشف الدرجات + التراكمي ---
const SKIP_HEADERS = new Set([
  'المجموع',
  'الترتيب',
  'النسبة',
  'التقدير',
  'مواد الرسوب',
  'النتيجة',
  'الساعات',
  'الساعة',
  'الوزن',
  'الرمز',
  'النقاط',
]);

function normalizeHeader(h) {
  return clean(h).replace(/\s+/g, ' ');
}

function isSkipHeader(h) {
  const c = normalizeHeader(h);
  if (!c) return true;
  if (SKIP_HEADERS.has(c)) return true;
  if (/^(الساعات|الساعة|الوزن|الرمز|النقاط)/.test(c)) return true;
  if (/معدل|مجموع الساعات|مجموع النقاط/.test(c)) return true;
  return false;
}

function normalizeAcademicYear(raw) {
  if (!raw) return '';
  const range = String(raw).replace(/\s+/g, '').match(/(\d{4})\s*[-–]\s*(\d{4})/);
  if (range) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    return `${Math.min(a, b)}-${Math.max(a, b)}`;
  }
  const y = String(raw).match(/(20\d{2})/);
  if (y) {
    const start = Number(y[1]);
    return `${start}-${start + 1}`;
  }
  return String(raw).replace(/\s+/g, '');
}

function parseSheetMeta(sheetName, titleRowText = '') {
  const levelMatch = sheetName.match(/المستوى\s+(\S+)|مستوى\s+(\S+)/);
  const yearFromTitle = titleRowText.match(/(\d{4}\s*[-–]\s*\d{4})|(20\d{2})/);
  const yearFromName = sheetName.match(/(\d{4}\s*[-–]\s*\d{4})|(20\d{2})/);
  const levelWord = levelMatch ? levelMatch[1] || levelMatch[2] : '';
  const levelMap = {
    الأول: 1,
    الاول: 1,
    الثاني: 2,
    الثاين: 2,
    الثالث: 3,
    الرابع: 4,
    الخامس: 5,
    السادس: 6,
  };
  const yearToken = (yearFromTitle || yearFromName || [])[0] || '';
  return {
    sheet_name: sheetName,
    level: levelMap[levelWord] || levelWord || '',
    academic_year: normalizeAcademicYear(yearToken),
    term_note: /ف\s*1|فصل/.test(sheetName) ? 'فصل 1' : '',
  };
}

function isStudentId(v) {
  return /^\d{6,}$/.test(clean(v));
}

function parseGradesWorkbook(filePath, programHint = null, sourceLabel = '') {
  const gwb = XLSX.readFile(filePath);
  const gradeRows = [];
  const summaryRows = [];
  const studentMap = new Map();

  for (const sheetName of gwb.SheetNames) {
    // Skip reference / single-transcript template sheets
    if (/مرجع|مصدر|^ورقة/i.test(sheetName) && !/مستوى|مستوي/i.test(sheetName)) continue;
    if (/^كشف|^كسف|كشف م|كشف الد/i.test(sheetName)) continue;

    const rows = XLSX.utils.sheet_to_json(gwb.Sheets[sheetName], { header: 1, defval: '' });
    if (rows.length < 3) continue;

    let headerIdx = 0;
    for (let i = 0; i < Math.min(5, rows.length); i++) {
      const joined = rows[i].map((c) => clean(c)).join('|');
      if (/اسم|إسم|أسماء|رقم/.test(joined) && rows[i].filter((c) => clean(c)).length >= 5) {
        headerIdx = i;
        break;
      }
    }
    const titleText = rows
      .slice(0, headerIdx + 1)
      .map((r) => r.map((c) => clean(c)).join(' '))
      .join(' ');
    const meta = parseSheetMeta(sheetName, titleText);
    const headers = rows[headerIdx].map(normalizeHeader);

    const idCol = headers.findIndex((h) => /رقم|تسلسل|^م$/.test(h));
    const nameCol = headers.findIndex((h) => /اسم|إسم|أسماء|Names/i.test(h));
    if (idCol < 0 || nameCol < 0) continue;

    const courseCols = [];
    let totalCol = -1;
    let pctCol = -1;
    let rankCol = -1;
    let gradeCol = -1;
    let resultCol = -1;
    let failCol = -1;

    headers.forEach((h, idx) => {
      if (!h || idx === idCol || idx === nameCol) return;
      if (h === 'المجموع') totalCol = idx;
      else if (h === 'النسبة' || h.startsWith('النسبة')) pctCol = idx;
      else if (h === 'الترتيب' || h.startsWith('الترتيب')) rankCol = idx;
      else if (h === 'التقدير') gradeCol = idx;
      else if (h === 'النتيجة') resultCol = idx;
      else if (h === 'مواد الرسوب') failCol = idx;
      else if (!isSkipHeader(h)) courseCols.push({ idx, course_ar: h });
    });

    const sheetProgram =
      programHint ||
      inferProgramFromCourses(courseCols.map((c) => c.course_ar)) ||
      PROGRAMS.hadith;

    for (let r = headerIdx + 1; r < rows.length; r++) {
      const row = rows[r];
      const student_number = clean(row[idCol]);
      const name_ar = clean(row[nameCol]);
      if (!isStudentId(student_number) || !name_ar) continue;

      if (!studentMap.has(student_number)) {
        studentMap.set(student_number, {
          student_number,
          name_ar,
          levels: new Set(),
          years: new Set(),
          sheets: new Set(),
          program: sheetProgram,
        });
      }
      const stu = studentMap.get(student_number);
      if (name_ar.length > stu.name_ar.length) stu.name_ar = name_ar;
      if (meta.level) stu.levels.add(String(meta.level));
      if (meta.academic_year) stu.years.add(meta.academic_year);
      stu.sheets.add(sheetName);
      // Prefer non-hadith explicit program if later source is more specific
      if (sheetProgram && sheetProgram.major_code !== '0111') stu.program = sheetProgram;

      const prog = stu.program || sheetProgram;

      for (const { idx, course_ar } of courseCols) {
        const raw = row[idx];
        if (raw === '' || raw == null) continue;
        const score = Number(raw);
        // Skip non-numeric junk in cumulative sheets (letter grades in wrong cols)
        if (!Number.isFinite(score) && !/^\d+(\.\d+)?$/.test(clean(raw))) continue;
        gradeRows.push({
          student_number,
          name_ar,
          college_code: prog.college_code,
          college_en: prog.college_en,
          college_ar: prog.college_ar,
          major_code: prog.major_code,
          major_en: prog.major_en,
          major_ar: prog.major_ar,
          level: meta.level,
          academic_year: meta.academic_year,
          term_note: meta.term_note,
          course_ar,
          score: Number.isFinite(score) ? score : clean(raw),
          source_file: sourceLabel || path.basename(filePath),
          source_sheet: sheetName,
          evidence: prog.evidence,
          action: 'import into gradebook / enrollments scores',
        });
      }

      if (totalCol >= 0 || pctCol >= 0 || rankCol >= 0 || gradeCol >= 0) {
        summaryRows.push({
          student_number,
          name_ar,
          college_code: prog.college_code,
          college_en: prog.college_en,
          college_ar: prog.college_ar,
          major_code: prog.major_code,
          major_en: prog.major_en,
          major_ar: prog.major_ar,
          level: meta.level,
          academic_year: meta.academic_year,
          term_note: meta.term_note,
          total: totalCol >= 0 ? row[totalCol] ?? '' : '',
          percentage: pctCol >= 0 ? row[pctCol] ?? '' : '',
          rank: rankCol >= 0 ? row[rankCol] ?? '' : '',
          grade_label: gradeCol >= 0 ? clean(row[gradeCol]) : '',
          result: resultCol >= 0 ? clean(row[resultCol]) : '',
          fail_count: failCol >= 0 ? row[failCol] ?? '' : '',
          source_file: sourceLabel || path.basename(filePath),
          source_sheet: sheetName,
        });
      }
    }
  }

  const students = [...studentMap.values()].map((s) => {
    const prog = s.program || PROGRAMS.hadith;
    return {
      student_number: s.student_number,
      name_ar: s.name_ar,
      college_code: prog.college_code,
      college_en: prog.college_en,
      college_ar: prog.college_ar,
      major_code: prog.major_code,
      major_en: prog.major_en,
      major_ar: prog.major_ar,
      levels_seen: [...s.levels].sort().join(', '),
      years_seen: [...s.years].sort().join(', '),
      sheets_count: s.sheets.size,
      evidence: prog.evidence,
      status: 'active',
      action: 'create public.students (+ user if needed)',
    };
  });

  return { students, gradeRows, summaryRows };
}

function mergeStudentRows(lists) {
  const map = new Map();
  for (const list of lists) {
    for (const s of list) {
      if (!map.has(s.student_number)) {
        map.set(s.student_number, { ...s });
        continue;
      }
      const cur = map.get(s.student_number);
      if ((s.name_ar || '').length > (cur.name_ar || '').length) cur.name_ar = s.name_ar;
      // Prefer Business/Creed over default Hadith when sources disagree
      if (s.major_code && s.major_code !== '0111') {
        cur.college_code = s.college_code;
        cur.college_en = s.college_en;
        cur.college_ar = s.college_ar;
        cur.major_code = s.major_code;
        cur.major_en = s.major_en;
        cur.major_ar = s.major_ar;
        cur.evidence = s.evidence;
      }
      const levels = new Set(
        [...String(cur.levels_seen || '').split(',').map((x) => x.trim()).filter(Boolean),
          ...String(s.levels_seen || '').split(',').map((x) => x.trim()).filter(Boolean)]
      );
      const years = new Set(
        [...String(cur.years_seen || '').split(',').map((x) => x.trim()).filter(Boolean),
          ...String(s.years_seen || '').split(',').map((x) => x.trim()).filter(Boolean)]
      );
      cur.levels_seen = [...levels].sort().join(', ');
      cur.years_seen = [...years].sort().join(', ');
      cur.sheets_count = (Number(cur.sheets_count) || 0) + (Number(s.sheets_count) || 0);
    }
  }
  return [...map.values()].sort((a, b) =>
    String(a.student_number).localeCompare(String(b.student_number))
  );
}

const gradesFile = fs.readdirSync(docsDir).find((f) => f.includes('كشف') || f.includes('الدرجات'));
if (!gradesFile) {
  console.error('Grades Excel not found in docs/');
  process.exit(1);
}

// كشف الدرجات العام → Hadith courses (Sharia) per Bachelor Hadith PDF
const fromKashf = parseGradesWorkbook(
  path.join(docsDir, gradesFile),
  PROGRAMS.hadith,
  gradesFile
);

const cumulFolder = fs.readdirSync(docsDir).find((d) => {
  try {
    return fs.statSync(path.join(docsDir, d)).isDirectory() && d.includes('تراكم');
  } catch {
    return false;
  }
});

const fromCumul = { students: [], gradeRows: [], summaryRows: [] };
if (cumulFolder) {
  const cumulFiles = fs
    .readdirSync(path.join(docsDir, cumulFolder))
    .filter((f) => f.endsWith('.xlsx') && !f.startsWith('~$'));
  for (const f of cumulFiles) {
    const prog = programFromCumulFilename(f) || PROGRAMS.hadith;
    const parsed = parseGradesWorkbook(path.join(docsDir, cumulFolder, f), prog, `${cumulFolder}/${f}`);
    fromCumul.students.push(...parsed.students);
    fromCumul.gradeRows.push(...parsed.gradeRows);
    fromCumul.summaryRows.push(...parsed.summaryRows);
  }
}

const studentsFromGrades = mergeStudentRows([fromKashf.students, fromCumul.students]);
const gradeRows = [...fromKashf.gradeRows, ...fromCumul.gradeRows];
const summaryRows = [...fromKashf.summaryRows, ...fromCumul.summaryRows];

function softName(s) {
  return clean(s)
    .replace(/[()（）\[\]«»]/g, '')
    .replace(/أ|إ|آ/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function programFromCollegeLabel(label) {
  const t = clean(label);
  if (!t) return null;
  if (/اقتصاد|نظم مالية|إدارة الأعمال|business/i.test(t)) return PROGRAMS.economics;
  if (/عقيدة|دعوة|creed/i.test(t)) return PROGRAMS.creed;
  if (/حديث|دراسات إسلام|دراسات اسلام|hadith|شريعة/i.test(t)) return PROGRAMS.hadith;
  return null;
}

function excelDateToIso(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'number' && Number.isFinite(v)) {
    // Excel serial date
    const utc = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
    return utc.toISOString().slice(0, 10);
  }
  const s = clean(v);
  const m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return s;
}

function findHeaderIndex(headers, patterns) {
  for (let i = 0; i < headers.length; i++) {
    const h = clean(headers[i]);
    if (!h) continue;
    for (const re of patterns) {
      if (re.test(h)) return i;
    }
  }
  return -1;
}

function parseStuFolder() {
  const stuDir = path.join(docsDir, 'stu');
  if (!fs.existsSync(stuDir)) return [];
  const files = fs.readdirSync(stuDir).filter((f) => f.endsWith('.xlsx') && !f.startsWith('~$'));
  const roster = [];

  for (const file of files) {
    const yearHint = /الأولى|الاولى|سنه اول|سنة أولى/i.test(file)
      ? 1
      : /الثانية/i.test(file)
        ? 2
        : /الثالثة/i.test(file)
          ? 3
          : '';
    const wb = XLSX.readFile(path.join(stuDir, file));
    for (const sn of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, defval: '' });
      if (rows.length < 2) continue;
      const headers = rows[0].map(clean);
      // skip empty sheets
      if (!headers.some(Boolean)) continue;

      const idCol = findHeaderIndex(headers, [/رقم الطالب.*جامع/, /الرقم الجامعي/, /^رقم الجامعي$/]);
      const nameCol = findHeaderIndex(headers, [
        /اسم الطالب.*عربي/,
        /الاسم باللغة العربية/,
        /اسم الطالب \(الطالبة\) باللغة العربية/,
        /^اسم الطالب/,
      ]);
      if (nameCol < 0) continue;

      const dobCol = findHeaderIndex(headers, [/تاريخ الميلاد/]);
      const nationalityCol = findHeaderIndex(headers, [/الجنسية/]);
      const passCol = headers.findIndex((h) => {
        const t = clean(h);
        return t && /جواز|رقم.*هوي|رقم الهوية/.test(t) && !/نوع الهوية/.test(t);
      });
      const idTypeCol = findHeaderIndex(headers, [/نوع الهوية/]);
      const emailCol = findHeaderIndex(headers, [/بريد|email/i]);
      const phoneCol = findHeaderIndex(headers, [/^رقم الهاتف/, /رقم الهاتف/]);
      const whatsappCol = findHeaderIndex(headers, [/واتس/]);
      const countryCol = findHeaderIndex(headers, [/الدولة المقيم/]);
      const addressCol = findHeaderIndex(headers, [/محل الإقامة|عنوان محل/]);
      const priorEduCol = findHeaderIndex(headers, [/أعلى مستوى تعليمي/]);
      const certificateCol = findHeaderIndex(headers, [/الشهادة التي حصل/, /^اسم الشهادة$/, /اسم الشهادة/]);
      const schoolCol = findHeaderIndex(headers, [/اسم الجهة الدراسية/]);
      const gradYearCol = findHeaderIndex(headers, [/سنة التخرج|تاريخ أو سنة التخرج|تاريخ.*التخرج/]);
      const secondaryGpaCol = headers.findIndex((h) => {
        const t = clean(h);
        return t && /معدل/.test(t) && !/للسنة/.test(t) && (/عام|ثانوية|قبل الجامعة|المواد الدراسية/.test(t));
      });
      const certCountryCol = findHeaderIndex(headers, [/الدولة التي حصل/]);
      const collegeCol = findHeaderIndex(headers, [/^الكلية$/, /الكلية التي/, /الكلية/]);
      const statusCol = findHeaderIndex(headers, [/حالة الطالب/]);
      const levelCol = findHeaderIndex(headers, [/المستوى أو الفصل|المستوى الدراسي الحالي/]);
      const gradesL1Col = findHeaderIndex(headers, [/درجات.*المستوى الدراسي الأول/]);
      const gradesL2Col = findHeaderIndex(headers, [/درجات.*المستوى الدراسي الثاني/]);
      const gradesL3Col = findHeaderIndex(headers, [/درجات.*المستوى الدراسي الثالث/]);
      const gradesL4Col = findHeaderIndex(headers, [/درجات.*المستوى الدراسي الرابع/]);
      const gpaY1Col = findHeaderIndex(headers, [/المعدل التراكمي للسنة الأولى/]);
      const gpaY2Col = findHeaderIndex(headers, [/المعدل التراكمي للسنة الثانية/]);
      const notesCol = findHeaderIndex(headers, [/ملاحظات الشئون الطلابية/]);
      // Some files have two photo columns (old + recent) — keep both
      const photoCols = headers
        .map((h, i) => ({ i, h: clean(h) }))
        .filter((x) => x.h && /صورة شخصية/.test(x.h))
        .map((x) => x.i);
      const photoCol = photoCols[0] ?? -1;
      const photoCol2 = photoCols[1] ?? -1;
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r];
        const name_ar = clean(row[nameCol]);
        if (!name_ar) continue;
        const student_number = idCol >= 0 ? clean(row[idCol]) : '';
        const validId = /^\d{6,}$/.test(student_number) ? student_number : '';
        const college_raw = collegeCol >= 0 ? clean(row[collegeCol]) : '';
        const prog = programFromCollegeLabel(college_raw);
        const level_raw = levelCol >= 0 ? clean(row[levelCol]) : '';
        const levelMap = {
          الأول: 1,
          الاول: 1,
          الثاني: 2,
          الثالث: 3,
          الرابع: 4,
          الخامس: 5,
          السادس: 6,
        };
        let level = '';
        for (const [k, v] of Object.entries(levelMap)) {
          if (level_raw.includes(k)) {
            level = v;
            break;
          }
        }
        if (!level && yearHint) level = yearHint;

        roster.push({
          student_number: validId,
          name_ar,
          name_key: softName(name_ar),
          date_of_birth: dobCol >= 0 ? excelDateToIso(row[dobCol]) : '',
          nationality: nationalityCol >= 0 ? clean(row[nationalityCol]) : '',
          passport_or_id: passCol >= 0 ? clean(row[passCol]) : '',
          id_type: idTypeCol >= 0 ? clean(row[idTypeCol]) : '',
          email: emailCol >= 0 ? clean(row[emailCol]) : '',
          phone: phoneCol >= 0 ? clean(row[phoneCol]) : '',
          whatsapp: whatsappCol >= 0 ? clean(row[whatsappCol]) : '',
          residence_country: countryCol >= 0 ? clean(row[countryCol]) : '',
          address: addressCol >= 0 ? clean(row[addressCol]) : '',
          prior_education_level: priorEduCol >= 0 ? clean(row[priorEduCol]) : '',
          certificate_name: certificateCol >= 0 ? clean(row[certificateCol]) : '',
          school_name: schoolCol >= 0 ? clean(row[schoolCol]) : '',
          graduation_year: gradYearCol >= 0 ? clean(row[gradYearCol]) : '',
          secondary_gpa: secondaryGpaCol >= 0 ? clean(row[secondaryGpaCol]) : '',
          certificate_country: certCountryCol >= 0 ? clean(row[certCountryCol]) : '',
          college_raw,
          college_code: prog ? prog.college_code : '',
          college_en: prog ? prog.college_en : '',
          college_ar: prog ? prog.college_ar : '',
          major_code: prog ? prog.major_code : '',
          major_en: prog ? prog.major_en : '',
          major_ar: prog ? prog.major_ar : '',
          status_raw: statusCol >= 0 ? clean(row[statusCol]) : '',
          level,
          level_raw,
          grades_level_1: gradesL1Col >= 0 ? clean(row[gradesL1Col]) : '',
          grades_level_2: gradesL2Col >= 0 ? clean(row[gradesL2Col]) : '',
          grades_level_3: gradesL3Col >= 0 ? clean(row[gradesL3Col]) : '',
          grades_level_4: gradesL4Col >= 0 ? clean(row[gradesL4Col]) : '',
          cumulative_gpa_year_1: gpaY1Col >= 0 ? clean(row[gpaY1Col]) : '',
          cumulative_gpa_year_2: gpaY2Col >= 0 ? clean(row[gpaY2Col]) : '',
          student_affairs_notes: notesCol >= 0 ? clean(row[notesCol]) : '',
          photo_ref: photoCol >= 0 ? clean(row[photoCol]) : '',
          photo_ref_recent: photoCol2 >= 0 ? clean(row[photoCol2]) : '',
          source_file: `stu/${file}`,
          source_sheet: sn,
          cohort_year_file: yearHint,
          evidence: prog
            ? `docs/stu college label → ${prog.evidence}`
            : 'docs/stu roster (college blank/unmapped)',
        });
      }
    }
  }
  return roster;
}

const stuRoster = parseStuFolder();

function enrichStudentsWithStu(gradeStudents, roster) {
  const byId = new Map();
  const byName = new Map();
  for (const r of roster) {
    if (r.student_number) byId.set(r.student_number, r);
    if (r.name_key) {
      if (!byName.has(r.name_key)) byName.set(r.name_key, []);
      byName.get(r.name_key).push(r);
    }
  }

  const usedRosterKeys = new Set();
  const enriched = gradeStudents.map((s) => {
    let match = s.student_number ? byId.get(s.student_number) : null;
    let match_method = '';
    if (match) {
      match_method = 'student_number';
    } else {
      const list = byName.get(softName(s.name_ar)) || [];
      if (list.length === 1) {
        match = list[0];
        match_method = 'name';
      } else if (list.length > 1) {
        match = list[0];
        match_method = 'name_ambiguous';
      }
    }

    if (!match) {
      return {
        ...s,
        email: '',
        phone: '',
        nationality: '',
        date_of_birth: '',
        passport_or_id: '',
        stu_match: 'unmatched',
        stu_source: '',
      };
    }

    usedRosterKeys.add(`${match.source_file}|${match.name_key}|${match.student_number}`);
    const out = {
      ...s,
      email: match.email || '',
      phone: match.phone || '',
      nationality: match.nationality || '',
      date_of_birth: match.date_of_birth || '',
      passport_or_id: match.passport_or_id || '',
      cohort_year_file: match.cohort_year_file || s.cohort_year_file || '',
      stu_match: match_method,
      stu_source: match.source_file,
    };
    // Prefer explicit college from stu forms when present
    if (match.major_code) {
      out.college_code = match.college_code;
      out.college_en = match.college_en;
      out.college_ar = match.college_ar;
      out.major_code = match.major_code;
      out.major_en = match.major_en;
      out.major_ar = match.major_ar;
      out.evidence = match.evidence;
    }
    if (match.student_number && !out.student_number) out.student_number = match.student_number;
    if (match.level) {
      const levels = new Set(
        String(out.levels_seen || '')
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean)
      );
      levels.add(String(match.level));
      out.levels_seen = [...levels].sort().join(', ');
    }
    return out;
  });

  // Add roster-only students (e.g. year 1 applicants not yet in grade sheets)
  for (const r of roster) {
    const key = `${r.source_file}|${r.name_key}|${r.student_number}`;
    if (usedRosterKeys.has(key)) continue;
    // skip if already enriched via same id/name
    const already = enriched.some(
      (s) =>
        (r.student_number && s.student_number === r.student_number) ||
        softName(s.name_ar) === r.name_key
    );
    if (already) continue;

    enriched.push({
      student_number: r.student_number || '',
      name_ar: r.name_ar,
      college_code: r.college_code || '',
      college_en: r.college_en || '',
      college_ar: r.college_ar || '',
      major_code: r.major_code || '',
      major_en: r.major_en || '',
      major_ar: r.major_ar || '',
      levels_seen: r.level ? String(r.level) : '',
      years_seen: '2025-2026',
      sheets_count: 0,
      email: r.email,
      phone: r.phone,
      nationality: r.nationality,
      date_of_birth: r.date_of_birth,
      passport_or_id: r.passport_or_id,
      evidence: r.evidence,
      status: r.status_raw || 'active',
      stu_match: 'roster_only',
      stu_source: r.source_file,
      action: 'create public.students from stu roster',
    });
  }

  return enriched.sort((a, b) => {
    const aid = a.student_number || '';
    const bid = b.student_number || '';
    if (aid && bid) return aid.localeCompare(bid);
    if (aid) return -1;
    if (bid) return 1;
    return softName(a.name_ar).localeCompare(softName(b.name_ar), 'ar');
  });
}

const students = enrichStudentsWithStu(studentsFromGrades, stuRoster);

// Re-tag grade rows with authoritative college from enriched students when available
{
  const byId = new Map();
  const byName = new Map();
  for (const s of students) {
    if (s.student_number) byId.set(s.student_number, s);
    byName.set(softName(s.name_ar), s);
  }
  for (const g of gradeRows) {
    const s = byId.get(g.student_number) || byName.get(softName(g.name_ar));
    if (!s || !s.major_code) continue;
    g.college_code = s.college_code;
    g.college_en = s.college_en;
    g.college_ar = s.college_ar;
    g.major_code = s.major_code;
    g.major_en = s.major_en;
    g.major_ar = s.major_ar;
    if (s.evidence) g.evidence = s.evidence;
  }
  for (const g of summaryRows) {
    const s = byId.get(g.student_number) || byName.get(softName(g.name_ar));
    if (!s || !s.major_code) continue;
    g.college_code = s.college_code;
    g.college_en = s.college_en;
    g.college_ar = s.college_ar;
    g.major_code = s.major_code;
    g.major_en = s.major_en;
    g.major_ar = s.major_ar;
  }
}

function parseLegacyRoll(raw) {
  const s = clean(raw);
  // Already new format YYYY + CC + SEQ (9+ digits): 202301001
  const neu = s.match(/^(20\d{2})(\d{2})(\d{3,})$/);
  if (neu && (neu[2] === '01' || neu[2] === '02')) {
    return { year: neu[1], college: neu[2], seq: neu[3], kind: 'new' };
  }
  // Legacy YYYY + SEQ: 2023001
  const leg = s.match(/^(20\d{2})(\d{2,})$/);
  if (leg) return { year: leg[1], college: '', seq: leg[2].padStart(3, '0'), kind: 'legacy' };
  return null;
}

function buildRollNumber(year, collegeCode, seq) {
  const y = String(year || '').padStart(4, '0');
  const cc = String(collegeCode || '01').padStart(2, '0');
  const sq = String(seq || '1').replace(/\D/g, '').padStart(3, '0');
  return `${y}${cc}${sq}`;
}

function applyRollNumbersAndEmails(studentList, grades, summaries) {
  const seqCounters = new Map(); // key year|college -> next seq int
  const oldToNew = new Map();

  // Seed counters from existing legacy rolls so we don't collide when assigning new ones
  for (const s of studentList) {
    const parsed = parseLegacyRoll(s.student_number);
    if (!parsed) continue;
    const cc = String(s.college_code || parsed.college || '01').padStart(2, '0');
    const key = `${parsed.year}|${cc}`;
    const n = parseInt(parsed.seq, 10);
    if (Number.isFinite(n)) {
      seqCounters.set(key, Math.max(seqCounters.get(key) || 0, n));
    }
  }

  for (const s of studentList) {
    const collegeCode = String(s.college_code || '01').padStart(2, '0');
    const oldId = clean(s.student_number);
    s.student_number_old = oldId;

    let year = '';
    let seq = '';
    const parsed = parseLegacyRoll(oldId);
    if (parsed) {
      year = parsed.year;
      seq = parsed.seq.padStart(3, '0');
    } else {
      if (String(s.cohort_year_file) === '1') year = '2025';
      else if (String(s.cohort_year_file) === '2') year = '2024';
      else if (String(s.cohort_year_file) === '3') year = '2023';
      else {
        const fromYears = String(s.years_seen || '').match(/(20\d{2})/);
        year = fromYears ? fromYears[1] : '2025';
      }
      const key = `${year}|${collegeCode}`;
      const next = (seqCounters.get(key) || 0) + 1;
      seqCounters.set(key, next);
      seq = String(next).padStart(3, '0');
    }

    const newId = buildRollNumber(year, collegeCode, seq);
    if (oldId) oldToNew.set(oldId, newId);
    oldToNew.set(`name:${softName(s.name_ar)}`, newId);

    s.student_number = newId;
    s.enrollment_year = year;
    s.roll_format = 'YYYY + college_code + sequence';

    const email = clean(s.email);
    if (!email || !email.includes('@')) {
      s.email = `${newId}@ibu.edu.gm`;
      s.email_source = 'generated_from_roll';
    } else {
      s.email_source = 'stu_or_source';
    }
  }

  const remap = (row) => {
    const old = clean(row.student_number);
    let neu = oldToNew.get(old);
    if (!neu) neu = oldToNew.get(`name:${softName(row.name_ar)}`);
    if (neu) {
      row.student_number_old = old;
      row.student_number = neu;
    }
  };
  for (const g of grades) remap(g);
  for (const g of summaries) remap(g);

  return oldToNew;
}

applyRollNumbersAndEmails(students, gradeRows, summaryRows);
console.log(
  'Roll numbers rebuilt (YYYY+CC+SEQ). Sample:',
  students
    .slice(0, 3)
    .map((s) => `${s.student_number_old || '∅'} → ${s.student_number} / ${s.email}`)
);
console.log(
  'Generated emails:',
  students.filter((s) => s.email_source === 'generated_from_roll').length
);

// Attach college to curriculum sample subjects (from PDF major codes)
for (const s of subjects) {
  const prog =
    s.major_code === '0111'
      ? PROGRAMS.hadith
      : s.major_code === '0411'
        ? PROGRAMS.economics
        : PROGRAMS.creed;
  s.college_en = prog.college_en;
  s.college_ar = prog.college_ar;
  s.major_en = prog.major_en;
}

console.log(
  'Grades sources → Kashf students',
  fromKashf.students.length,
  'grades',
  fromKashf.gradeRows.length,
  '| Cumul students',
  fromCumul.students.length,
  'grades',
  fromCumul.gradeRows.length,
  '| Merged grade-students',
  studentsFromGrades.length
);
console.log(
  'stu roster',
  stuRoster.length,
  '| final students',
  students.length,
  '| matched',
  students.filter((s) => s.stu_match && s.stu_match !== 'unmatched' && s.stu_match !== 'roster_only')
    .length,
  '| roster_only',
  students.filter((s) => s.stu_match === 'roster_only').length,
  '| unmatched',
  students.filter((s) => s.stu_match === 'unmatched').length
);

const collegeBreakdown = {};
for (const s of students) {
  const k = `${s.college_en || '?'} / ${s.major_en || '?'}`;
  collegeBreakdown[k] = (collegeBreakdown[k] || 0) + 1;
}
console.log('Students by college/major:', collegeBreakdown);

const THEMES = {
  instructors: { fill: '1F4E79', light: 'D6E3F0', table: 'TableStyleMedium2' },
  courseMap: { fill: '548235', light: 'E2EFDA', table: 'TableStyleMedium7' },
  subjects: { fill: '833C0C', light: 'FCE4D6', table: 'TableStyleMedium4' },
  majors: { fill: '7030A0', light: 'E2D5F1', table: 'TableStyleMedium9' },
  students: { fill: 'C65911', light: 'F8CBAD', table: 'TableStyleMedium3' },
  stuRoster: { fill: '2F5496', light: 'D6DCE4', table: 'TableStyleMedium2' },
  grades: { fill: '385723', light: 'C6EFCE', table: 'TableStyleMedium10' },
  gradesSummary: { fill: '833C0C', light: 'FFF2CC', table: 'TableStyleMedium5' },
  readme: { fill: '1F4E79', accent: 'C00000' },
};

function colLetter(n) {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function autoWidth(ws, rows, keys, min = 10, max = 42) {
  keys.forEach((key, i) => {
    let w = String(key).length + 2;
    for (const row of rows) {
      const v = row[key];
      const len = String(v == null ? '' : v).length + 2;
      if (len > w) w = len;
    }
    ws.getColumn(i + 1).width = Math.min(max, Math.max(min, w));
  });
}

function styleHeaderRow(row, fillHex) {
  row.height = 22;
  row.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF' + fillHex },
    };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFB0B0B0' } },
      left: { style: 'thin', color: { argb: 'FFB0B0B0' } },
      bottom: { style: 'thin', color: { argb: 'FFB0B0B0' } },
      right: { style: 'thin', color: { argb: 'FFB0B0B0' } },
    };
  });
}

function styleDataRows(ws, startRow, endRow, colCount, lightHex) {
  for (let r = startRow; r <= endRow; r++) {
    const row = ws.getRow(r);
    const band = (r - startRow) % 2 === 1;
    for (let c = 1; c <= colCount; c++) {
      const cell = row.getCell(c);
      cell.font = { name: 'Calibri', size: 10 };
      cell.alignment = { vertical: 'middle', wrapText: true };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        right: { style: 'thin', color: { argb: 'FFE0E0E0' } },
      };
      if (band) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF' + lightHex },
        };
      }
    }
  }
}

function addDataSheet(wb, { name, title, subtitle, theme, columns, rows, tableName }) {
  const ws = wb.addWorksheet(name, {
    views: [{ state: 'frozen', ySplit: 3 }],
  });

  // Title banner
  ws.mergeCells(1, 1, 1, columns.length);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' }, name: 'Calibri' };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF' + theme.fill },
  };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(1).height = 28;

  ws.mergeCells(2, 1, 2, columns.length);
  const subCell = ws.getCell(2, 1);
  subCell.value = subtitle;
  subCell.font = { italic: true, size: 10, color: { argb: 'FF555555' }, name: 'Calibri' };
  subCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF' + theme.light },
  };
  subCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(2).height = 20;

  const headerRowIndex = 3;
  const keys = columns.map((c) => c.key);
  const lastDataRow = headerRowIndex + Math.max(rows.length, 1);

  // Seed header cells so the table ref is valid even before rows are written
  columns.forEach((c, i) => {
    ws.getCell(headerRowIndex, i + 1).value = c.header;
  });

  if (rows.length) {
    ws.addTable({
      name: tableName,
      ref: `A${headerRowIndex}:${colLetter(columns.length)}${lastDataRow}`,
      headerRow: true,
      totalsRow: false,
      style: {
        theme: theme.table,
        showRowStripes: true,
      },
      columns: columns.map((c) => ({ name: c.header, filterButton: true })),
      rows: rows.map((row) => keys.map((k) => (row[k] == null ? '' : row[k]))),
    });
  }

  // Re-apply brand header colours on top of the table theme
  styleHeaderRow(ws.getRow(headerRowIndex), theme.fill);
  if (rows.length) {
    styleDataRows(ws, headerRowIndex + 1, lastDataRow, columns.length, theme.light);
  }

  autoWidth(ws, rows, keys);
  columns.forEach((c, i) => {
    if (c.width) ws.getColumn(i + 1).width = c.width;
  });

  return ws;
}

async function main() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'IBU University Management System';
  wb.created = new Date();
  wb.modified = new Date();

  // --- README cover ---
  const readme = wb.addWorksheet('README', {
    views: [{ showGridLines: false }],
  });
  readme.getColumn(1).width = 3;
  readme.getColumn(2).width = 58;
  readme.getColumn(3).width = 42;
  readme.getColumn(4).width = 12;

  readme.mergeCells('B2:D2');
  const h = readme.getCell('B2');
  h.value = 'IBU Import Preview — Instructors, Courses, Students & Grades';
  h.font = { bold: true, size: 18, color: { argb: 'FFFFFFFF' }, name: 'Calibri' };
  h.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF' + THEMES.readme.fill },
  };
  h.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  readme.getRow(2).height = 36;

  readme.mergeCells('B3:D3');
  const badge = readme.getCell('B3');
  badge.value = 'PREVIEW ONLY — not imported into the database yet';
  badge.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' }, name: 'Calibri' };
  badge.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF' + THEMES.readme.accent },
  };
  badge.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  readme.getRow(3).height = 22;

  readme.getCell('B5').value = 'Generated';
  readme.getCell('C5').value = new Date().toISOString().slice(0, 10);
  readme.getCell('B6').value = 'Sources';
  readme.getCell('C6').value =
    'Staff Excel · Lecturers PDF · Program PDFs · كشف الدرجات · التراكمي · docs/stu roster';

  ['B5', 'B6'].forEach((addr) => {
    readme.getCell(addr).font = { bold: true, color: { argb: 'FF1F4E79' } };
  });

  readme.getCell('B7').value = 'Colleges (from PDFs + stu)';
  readme.getCell('B7').font = { bold: true, color: { argb: 'FF1F4E79' } };
  readme.getCell('C7').value =
    '01 Sharia (Hadith 0111, Creed 0131) · 02 Business (Economics 0411) — stu college labels preferred';

  const tocHeaders = ['Sheet', 'Maps to', 'Rows'];
  const tocRows = [
    ['Instructors', 'public.instructors', instructors.length],
    ['Course_Lecturer_Map', 'classes.instructor_id (Sharia / Hadith)', courseMap.length],
    ['Subjects_Curriculum', 'subjects + degree plan (sample)', subjects.length],
    ['Majors', 'colleges + majors (PDF codes)', majors.length],
    ['Students_Roster', 'raw docs/stu profiles', stuRoster.length],
    ['Students', 'public.students (grades ∩ stu mapped)', students.length],
    ['Grades', 'gradebook scores (college/major tagged)', gradeRows.length],
    ['Grades_Summary', 'level totals / rank / تقدير', summaryRows.length],
  ];
  const tocColors = [
    THEMES.instructors.fill,
    THEMES.courseMap.fill,
    THEMES.subjects.fill,
    THEMES.majors.fill,
    THEMES.stuRoster.fill,
    THEMES.students.fill,
    THEMES.grades.fill,
    THEMES.gradesSummary.fill,
  ];

  readme.getCell('B8').value = 'Workbook contents';
  readme.getCell('B8').font = { bold: true, size: 13, color: { argb: 'FF1F4E79' } };

  tocHeaders.forEach((label, i) => {
    const cell = readme.getCell(9, i + 2);
    cell.value = label;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F4E79' },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFB0B0B0' } },
      left: { style: 'thin', color: { argb: 'FFB0B0B0' } },
      bottom: { style: 'thin', color: { argb: 'FFB0B0B0' } },
      right: { style: 'thin', color: { argb: 'FFB0B0B0' } },
    };
  });

  tocRows.forEach((row, ri) => {
    row.forEach((val, ci) => {
      const cell = readme.getCell(10 + ri, ci + 2);
      cell.value = val;
      cell.font = { name: 'Calibri', size: 10 };
      cell.alignment = { vertical: 'middle', horizontal: ci === 2 ? 'center' : 'left' };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        right: { style: 'thin', color: { argb: 'FFE0E0E0' } },
      };
      if (ci === 0) {
        cell.font = { bold: true, color: { argb: 'FF' + tocColors[ri] }, name: 'Calibri' };
      }
    });
  });

  const legendStart = 10 + tocRows.length + 2;
  readme.getCell(legendStart, 2).value = 'Colour key';
  readme.getCell(legendStart, 2).font = { bold: true, size: 13, color: { argb: 'FF1F4E79' } };

  const legend = [
    ['Instructors', THEMES.instructors.fill],
    ['Course_Lecturer_Map', THEMES.courseMap.fill],
    ['Subjects_Curriculum', THEMES.subjects.fill],
    ['Majors', THEMES.majors.fill],
    ['Students_Roster', THEMES.stuRoster.fill],
    ['Students', THEMES.students.fill],
    ['Grades', THEMES.grades.fill],
    ['Grades_Summary', THEMES.gradesSummary.fill],
  ];
  legend.forEach(([label, color], i) => {
    const cell = readme.getCell(legendStart + 1 + i, 2);
    cell.value = label;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + color } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    readme.getRow(legendStart + 1 + i).height = 20;
  });

  const tipRow = legendStart + legend.length + 2;
  readme.getCell(tipRow, 2).value =
    'Tip: each data sheet is an Excel Table with filters. Use the header dropdowns to filter/sort.';
  readme.getCell(tipRow, 2).font = { italic: true, size: 10, color: { argb: 'FF666666' } };
  readme.mergeCells(tipRow, 2, tipRow, 4);

  // --- Data sheets ---
  addDataSheet(wb, {
    name: 'Instructors',
    title: 'Instructors — staff to create',
    subtitle: `Source: ${staffFile}  ·  ${instructors.length} people  ·  → public.instructors`,
    theme: THEMES.instructors,
    tableName: 'InstructorsTable',
    columns: [
      { header: 'Employee ID', key: 'employee_id', width: 14 },
      { header: 'Name (AR)', key: 'name_ar', width: 28 },
      { header: 'Nationality', key: 'nationality', width: 14 },
      { header: 'Phone', key: 'phone', width: 16 },
      { header: 'Email', key: 'email', width: 28 },
      { header: 'Qualification', key: 'qualification', width: 16 },
      { header: 'Specialization', key: 'specialization', width: 22 },
      { header: 'Job title (AR)', key: 'job_title_ar', width: 22 },
      { header: 'Courses (from Excel)', key: 'courses_from_excel', width: 36 },
      { header: 'Will teach?', key: 'will_teach', width: 12 },
      { header: 'Status', key: 'status', width: 10 },
    ],
    rows: instructors,
  });

  addDataSheet(wb, {
    name: 'Course_Lecturer_Map',
    title: 'Course ↔ Lecturer map — levels 1–6 (Sharia / Hadith)',
    subtitle: `Source: Courses and Lecturers PDF  ·  ${courseMap.length} assignments  ·  College of Sharia / Hadith`,
    theme: THEMES.courseMap,
    tableName: 'CourseLecturerTable',
    columns: [
      { header: 'Level', key: 'level', width: 8 },
      { header: 'Course (AR)', key: 'course_ar', width: 28 },
      { header: 'Lecturer (raw PDF)', key: 'lecturer_ar_raw', width: 22 },
      { header: 'Lecturer (AR)', key: 'lecturer_ar', width: 28 },
      { header: 'Lecturer match', key: 'lecturer_match', width: 14 },
      { header: 'Section note', key: 'section_note', width: 36 },
      { header: 'College (EN)', key: 'college_en', width: 12 },
      { header: 'College (AR)', key: 'college_ar', width: 16 },
      { header: 'Major (EN)', key: 'major_en', width: 28 },
      { header: 'Evidence', key: 'evidence', width: 40 },
      { header: 'Import action', key: 'action', width: 36 },
    ],
    rows: courseMap,
  });

  addDataSheet(wb, {
    name: 'Subjects_Curriculum',
    title: 'Subjects / curriculum sample (EN + AR)',
    subtitle: `Source: program PDFs  ·  ${subjects.length} courses  ·  tagged with college/major from PDF codes`,
    theme: THEMES.subjects,
    tableName: 'SubjectsTable',
    columns: [
      { header: 'Code', key: 'code', width: 12 },
      { header: 'Name (EN)', key: 'name_en', width: 36 },
      { header: 'Name (AR)', key: 'name_ar', width: 28 },
      { header: 'Credits', key: 'credits', width: 10 },
      { header: 'Semester', key: 'semester', width: 10 },
      { header: 'College (EN)', key: 'college_en', width: 12 },
      { header: 'College (AR)', key: 'college_ar', width: 16 },
      { header: 'Major code', key: 'major_code', width: 12 },
      { header: 'Major (EN)', key: 'major_en', width: 28 },
      { header: 'Major (AR)', key: 'major_ar', width: 30 },
      { header: 'Prerequisite', key: 'prereq', width: 14 },
    ],
    rows: subjects,
  });

  addDataSheet(wb, {
    name: 'Majors',
    title: 'Colleges & programs (Bachelor / Master / PhD from PDFs)',
    subtitle: `Sharia + Business  ·  ${majors.length} rows  ·  includes Master 0113/0143 and PhD 0144`,
    theme: THEMES.majors,
    tableName: 'MajorsTable',
    columns: [
      { header: 'Code', key: 'code', width: 10 },
      { header: 'College code', key: 'college_code', width: 12 },
      { header: 'Degree', key: 'degree', width: 12 },
      { header: 'Track', key: 'track', width: 14 },
      { header: 'Name (EN)', key: 'name_en', width: 42 },
      { header: 'Name (AR)', key: 'name_ar', width: 34 },
      { header: 'College (EN)', key: 'college_en', width: 14 },
      { header: 'College (AR)', key: 'college_ar', width: 18 },
      { header: 'Total credits', key: 'total_credits', width: 14 },
      { header: 'Note', key: 'note', width: 52 },
    ],
    rows: majors,
  });

  addDataSheet(wb, {
    name: 'Students_Roster',
    title: 'Students roster — full fields from docs/stu',
    subtitle: `Year 1–3 forms  ·  ${stuRoster.length} rows  ·  all source columns mapped`,
    theme: THEMES.stuRoster,
    tableName: 'StudentsRosterTable',
    columns: [
      { header: 'Student number', key: 'student_number', width: 14 },
      { header: 'Name (AR)', key: 'name_ar', width: 28 },
      { header: 'DOB', key: 'date_of_birth', width: 12 },
      { header: 'Nationality', key: 'nationality', width: 14 },
      { header: 'Passport/ID', key: 'passport_or_id', width: 16 },
      { header: 'ID type', key: 'id_type', width: 14 },
      { header: 'Email', key: 'email', width: 28 },
      { header: 'Phone', key: 'phone', width: 16 },
      { header: 'WhatsApp', key: 'whatsapp', width: 16 },
      { header: 'Residence country', key: 'residence_country', width: 16 },
      { header: 'Address', key: 'address', width: 22 },
      { header: 'Prior education', key: 'prior_education_level', width: 16 },
      { header: 'Certificate', key: 'certificate_name', width: 24 },
      { header: 'School', key: 'school_name', width: 28 },
      { header: 'Graduation year', key: 'graduation_year', width: 14 },
      { header: 'Secondary GPA', key: 'secondary_gpa', width: 12 },
      { header: 'Certificate country', key: 'certificate_country', width: 16 },
      { header: 'College (raw)', key: 'college_raw', width: 28 },
      { header: 'College (EN)', key: 'college_en', width: 12 },
      { header: 'Major code', key: 'major_code', width: 12 },
      { header: 'Major (EN)', key: 'major_en', width: 28 },
      { header: 'Status', key: 'status_raw', width: 14 },
      { header: 'Level', key: 'level', width: 8 },
      { header: 'Level (raw)', key: 'level_raw', width: 16 },
      { header: 'Grades L1', key: 'grades_level_1', width: 12 },
      { header: 'Grades L2', key: 'grades_level_2', width: 12 },
      { header: 'GPA year 1', key: 'cumulative_gpa_year_1', width: 12 },
      { header: 'Grades L3', key: 'grades_level_3', width: 12 },
      { header: 'Grades L4', key: 'grades_level_4', width: 12 },
      { header: 'GPA year 2', key: 'cumulative_gpa_year_2', width: 12 },
      { header: 'Affairs notes', key: 'student_affairs_notes', width: 28 },
      { header: 'Photo ref', key: 'photo_ref', width: 20 },
      { header: 'Photo ref (recent)', key: 'photo_ref_recent', width: 20 },
      { header: 'Cohort file year', key: 'cohort_year_file', width: 12 },
      { header: 'Source file', key: 'source_file', width: 36 },
    ],
    rows: stuRoster,
  });

  addDataSheet(wb, {
    name: 'Students',
    title: 'Students — roll = Year + college code + sequence',
    subtitle: `${students.length} rows  ·  enrollment_year from roll  ·  missing email → roll@ibu.edu.gm`,
    theme: THEMES.students,
    tableName: 'StudentsTable',
    columns: [
      { header: 'Student number', key: 'student_number', width: 14 },
      { header: 'Old student number', key: 'student_number_old', width: 14 },
      { header: 'Enrollment year', key: 'enrollment_year', width: 14 },
      { header: 'Name (AR)', key: 'name_ar', width: 28 },
      { header: 'College code', key: 'college_code', width: 12 },
      { header: 'College (EN)', key: 'college_en', width: 12 },
      { header: 'College (AR)', key: 'college_ar', width: 18 },
      { header: 'Major code', key: 'major_code', width: 12 },
      { header: 'Major (EN)', key: 'major_en', width: 32 },
      { header: 'Major (AR)', key: 'major_ar', width: 30 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Email source', key: 'email_source', width: 18 },
      { header: 'Phone', key: 'phone', width: 16 },
      { header: 'Nationality', key: 'nationality', width: 14 },
      { header: 'DOB', key: 'date_of_birth', width: 12 },
      { header: 'Passport/ID', key: 'passport_or_id', width: 16 },
      { header: 'Levels seen', key: 'levels_seen', width: 14 },
      { header: 'Years seen', key: 'years_seen', width: 22 },
      { header: 'stu match', key: 'stu_match', width: 14 },
      { header: 'stu source', key: 'stu_source', width: 36 },
      { header: 'Evidence', key: 'evidence', width: 40 },
      { header: 'Status', key: 'status', width: 10 },
      { header: 'Import action', key: 'action', width: 36 },
    ],
    rows: students,
  });
  addDataSheet(wb, {
    name: 'Grades',
    title: 'Grades — student × course (college / major tagged)',
    subtitle: `Kashf + التراكمي  ·  ${gradeRows.length} score rows  ·  roll = Year+college+seq`,
    theme: THEMES.grades,
    tableName: 'GradesTable',
    columns: [
      { header: 'Student number', key: 'student_number', width: 14 },
      { header: 'Old student number', key: 'student_number_old', width: 14 },
      { header: 'Name (AR)', key: 'name_ar', width: 26 },
      { header: 'College (EN)', key: 'college_en', width: 12 },
      { header: 'College (AR)', key: 'college_ar', width: 16 },
      { header: 'Major code', key: 'major_code', width: 12 },
      { header: 'Major (EN)', key: 'major_en', width: 28 },
      { header: 'Level', key: 'level', width: 8 },
      { header: 'Academic year', key: 'academic_year', width: 14 },
      { header: 'Term note', key: 'term_note', width: 12 },
      { header: 'Course (AR)', key: 'course_ar', width: 26 },
      { header: 'Score', key: 'score', width: 10 },
      { header: 'Source file', key: 'source_file', width: 28 },
      { header: 'Source sheet', key: 'source_sheet', width: 24 },
      { header: 'Evidence', key: 'evidence', width: 36 },
      { header: 'Import action', key: 'action', width: 32 },
    ],
    rows: gradeRows,
  });

  addDataSheet(wb, {
    name: 'Grades_Summary',
    title: 'Grades summary — totals / rank / تقدير (with college)',
    subtitle: `From كشف where available  ·  ${summaryRows.length} rows`,
    theme: THEMES.gradesSummary,
    tableName: 'GradesSummaryTable',
    columns: [
      { header: 'Student number', key: 'student_number', width: 14 },
      { header: 'Name (AR)', key: 'name_ar', width: 26 },
      { header: 'College (EN)', key: 'college_en', width: 12 },
      { header: 'Major code', key: 'major_code', width: 12 },
      { header: 'Major (EN)', key: 'major_en', width: 28 },
      { header: 'Level', key: 'level', width: 8 },
      { header: 'Academic year', key: 'academic_year', width: 14 },
      { header: 'Term note', key: 'term_note', width: 12 },
      { header: 'Total', key: 'total', width: 10 },
      { header: 'Percentage', key: 'percentage', width: 12 },
      { header: 'Rank', key: 'rank', width: 8 },
      { header: 'Grade (تقدير)', key: 'grade_label', width: 14 },
      { header: 'Result', key: 'result', width: 12 },
      { header: 'Fail count', key: 'fail_count', width: 10 },
      { header: 'Source file', key: 'source_file', width: 28 },
      { header: 'Source sheet', key: 'source_sheet', width: 24 },
    ],
    rows: summaryRows,
  });
  const out = path.join(docsDir, 'IBU_import_preview.xlsx');
  const legacy = [
    path.join(docsDir, 'IBU_import_preview_instructors_courses.xlsx'),
    path.join(docsDir, 'IBU_import_preview_instructors_courses_styled.xlsx'),
    path.join(docsDir, 'IBU_import_preview_v2.xlsx'),
  ];

  let written = null;
  const candidates = [
    out,
    path.join(docsDir, 'IBU_import_preview_v2.xlsx'),
    path.join(docsDir, 'IBU_import_preview_v3.xlsx'),
    path.join(docsDir, 'IBU_import_preview_v4.xlsx'),
    path.join(docsDir, 'IBU_import_preview_v5.xlsx'),
    path.join(docsDir, 'IBU_import_preview_v6.xlsx'),
    path.join(docsDir, 'IBU_import_preview_v7.xlsx'),
  ];
  for (const candidate of candidates) {
    try {
      await wb.xlsx.writeFile(candidate);
      written = candidate;
      console.log('Wrote', candidate);
      break;
    } catch (err) {
      if (err && err.code === 'EBUSY') {
        console.log('Locked:', path.basename(candidate));
        continue;
      }
      throw err;
    }
  }
  if (!written) {
    throw new Error('Could not write preview Excel — close open copies in Excel and retry');
  }

  for (const p of legacy) {
    if (p === written) continue;
    try {
      if (fs.existsSync(p)) {
        fs.unlinkSync(p);
        console.log('Removed', path.basename(p));
      }
    } catch (err) {
      if (err && err.code === 'EBUSY') {
        console.log('Could not remove locked file:', path.basename(p), '(close it in Excel)');
      } else {
        throw err;
      }
    }
  }

  console.log(
    'Instructors',
    instructors.length,
    '| Course map',
    courseMap.length,
    '| Subjects',
    subjects.length,
    '| Majors',
    majors.length,
    '| Students',
    students.length,
    '| Grades',
    gradeRows.length,
    '| Grades summary',
    summaryRows.length
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
