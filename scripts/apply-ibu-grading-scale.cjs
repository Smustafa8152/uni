/**
 * Bulk-apply IBU 4.3 grading scale via Postgres.
 * Usage: node scripts/apply-ibu-grading-scale.cjs
 */
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { Client } = require('pg');

const SCALE = [
  { letter: 'A+', minPercent: 90, maxPercent: 100, points: 4.3, passing: true },
  { letter: 'A', minPercent: 80, maxPercent: 89, points: 4.0, passing: true },
  { letter: 'A-', minPercent: 70, maxPercent: 79, points: 3.7, passing: true },
  { letter: 'B+', minPercent: 67, maxPercent: 69, points: 3.3, passing: true },
  { letter: 'B', minPercent: 64, maxPercent: 66, points: 3.0, passing: true },
  { letter: 'B-', minPercent: 60, maxPercent: 63, points: 2.7, passing: true },
  { letter: 'C+', minPercent: 57, maxPercent: 59, points: 2.3, passing: true },
  { letter: 'C', minPercent: 54, maxPercent: 56, points: 2.0, passing: true },
  { letter: 'C-', minPercent: 50, maxPercent: 53, points: 1.7, passing: true },
  { letter: 'D', minPercent: 40, maxPercent: 49, points: 1.0, passing: true },
  { letter: 'F', minPercent: 0, maxPercent: 39, points: 0.0, passing: false },
];

const FUNCTION_SQL = `
CREATE OR REPLACE FUNCTION calculate_grade_from_numeric(numeric_grade numeric)
RETURNS TABLE(letter_grade varchar(5), gpa_points numeric(3, 2)) AS $$
BEGIN
  RETURN QUERY
  SELECT
    CASE
      WHEN numeric_grade >= 90 THEN 'A+'::varchar(5)
      WHEN numeric_grade >= 80 THEN 'A'::varchar(5)
      WHEN numeric_grade >= 70 THEN 'A-'::varchar(5)
      WHEN numeric_grade >= 67 THEN 'B+'::varchar(5)
      WHEN numeric_grade >= 64 THEN 'B'::varchar(5)
      WHEN numeric_grade >= 60 THEN 'B-'::varchar(5)
      WHEN numeric_grade >= 57 THEN 'C+'::varchar(5)
      WHEN numeric_grade >= 54 THEN 'C'::varchar(5)
      WHEN numeric_grade >= 50 THEN 'C-'::varchar(5)
      WHEN numeric_grade >= 40 THEN 'D'::varchar(5)
      ELSE 'F'::varchar(5)
    END AS letter_grade,
    CASE
      WHEN numeric_grade >= 90 THEN 4.30::numeric(3, 2)
      WHEN numeric_grade >= 80 THEN 4.00::numeric(3, 2)
      WHEN numeric_grade >= 70 THEN 3.70::numeric(3, 2)
      WHEN numeric_grade >= 67 THEN 3.30::numeric(3, 2)
      WHEN numeric_grade >= 64 THEN 3.00::numeric(3, 2)
      WHEN numeric_grade >= 60 THEN 2.70::numeric(3, 2)
      WHEN numeric_grade >= 57 THEN 2.30::numeric(3, 2)
      WHEN numeric_grade >= 54 THEN 2.00::numeric(3, 2)
      WHEN numeric_grade >= 50 THEN 1.70::numeric(3, 2)
      WHEN numeric_grade >= 40 THEN 1.00::numeric(3, 2)
      ELSE 0.00::numeric(3, 2)
    END AS gpa_points;
END;
$$ LANGUAGE plpgsql;
`;

const RECOMPUTE_SQL = `
UPDATE grade_components AS gc
SET
  letter_grade = calc.letter_grade,
  gpa_points = calc.gpa_points,
  updated_at = NOW()
FROM (
  SELECT
    id,
    (calculate_grade_from_numeric(COALESCE(numeric_grade, final))).letter_grade AS letter_grade,
    (calculate_grade_from_numeric(COALESCE(numeric_grade, final))).gpa_points AS gpa_points
  FROM grade_components
  WHERE numeric_grade IS NOT NULL OR final IS NOT NULL
) AS calc
WHERE gc.id = calc.id;

UPDATE enrollments e
SET
  grade = gc.letter_grade,
  grade_points = gc.gpa_points,
  numeric_grade = COALESCE(gc.numeric_grade, gc.final),
  updated_at = NOW()
FROM grade_components gc
WHERE gc.enrollment_id = e.id
  AND (gc.numeric_grade IS NOT NULL OR gc.final IS NOT NULL);
`;

async function getPgClient() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const ref = url.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1];
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!ref || !password) throw new Error('Missing SUPABASE URL or SUPABASE_DB_PASSWORD');

  const candidates = [
    process.env.DATABASE_URL,
    `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`,
    `postgresql://postgres.${ref}:${encodeURIComponent(password)}@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`,
  ].filter(Boolean);

  let lastErr;
  for (const cs of candidates) {
    const client = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
    try {
      await client.connect();
      return client;
    } catch (e) {
      lastErr = e;
      try {
        await client.end();
      } catch (_) {}
    }
  }
  throw lastErr || new Error('Could not connect to Postgres');
}

async function main() {
  const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log('=== University settings ===');
  const { data: settings, error } = await sb
    .from('university_settings')
    .select('id, academic_settings')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!settings) throw new Error('No university_settings');

  const academic = { ...(settings.academic_settings || {}) };
  academic.grading_scale = SCALE;
  academic.gpa = { ...(academic.gpa || {}), maxScale: 4.3, scale: 4.3 };
  academic.max_gpa_scale = 4.3;

  const { error: upErr } = await sb
    .from('university_settings')
    .update({ academic_settings: academic, updated_at: new Date().toISOString() })
    .eq('id', settings.id);
  if (upErr) throw upErr;
  console.log('  ✓ grading_scale + maxScale 4.3 saved');

  console.log('\n=== Postgres function + bulk recompute ===');
  const client = await getPgClient();
  try {
    await client.query(FUNCTION_SQL);
    console.log('  ✓ calculate_grade_from_numeric');
    const r1 = await client.query(RECOMPUTE_SQL);
    console.log('  ✓ bulk recompute done');
    const spot = await client.query(`
      SELECT numeric_grade, letter_grade, gpa_points
      FROM grade_components
      WHERE numeric_grade IS NOT NULL
      ORDER BY id DESC
      LIMIT 8
    `);
    console.log('  sample:', spot.rows);
    const check = await client.query(`SELECT * FROM calculate_grade_from_numeric(85)`);
    console.log('  85 →', check.rows[0]);
  } finally {
    await client.end();
  }

  console.log('\nDone. Scale is out of 4.30 (A+ = 90–100).');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
