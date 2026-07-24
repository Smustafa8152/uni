/**
 * Strip STU prefix from student IDs and college defaults.
 * Usage: node scripts/strip-stu-prefix.cjs
 */
require('dotenv').config();
const { Client } = require('pg');

async function main() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const ref = url.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1];
  const password = process.env.SUPABASE_DB_PASSWORD;
  if (!ref || !password) throw new Error('Missing Supabase URL or DB password');

  const cs = `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`;
  const client = new Client({ connectionString: cs, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const collisions = await client.query(`
    WITH stripped AS (
      SELECT id, student_id, regexp_replace(student_id, '^STU', '', 'i') AS new_id
      FROM students
      WHERE student_id ILIKE 'STU%'
    )
    SELECT s.new_id, COUNT(*)::int AS cnt
    FROM stripped s
    LEFT JOIN students existing
      ON existing.student_id = s.new_id
     AND existing.id <> s.id
    GROUP BY s.new_id
    HAVING COUNT(*) > 1 OR COUNT(existing.id) > 0
    LIMIT 20
  `);
  if (collisions.rows.length) {
    console.warn('Potential collisions:', collisions.rows);
  } else {
    console.log('No ID collisions detected');
  }

  const r1 = await client.query(`
    UPDATE students
    SET student_id = regexp_replace(student_id, '^STU', '', 'i'),
        updated_at = NOW()
    WHERE student_id ILIKE 'STU%'
    RETURNING id, student_id
  `);
  console.log(`Stripped STU from ${r1.rowCount} students`);
  console.log('Sample:', r1.rows.slice(0, 5));

  const r2 = await client.query(`
    UPDATE colleges
    SET
      student_id_prefix = '',
      student_id_format = replace(COALESCE(student_id_format, ''), '{prefix}', ''),
      updated_at = NOW()
    WHERE COALESCE(student_id_prefix, '') ILIKE 'STU'
    RETURNING id, code, student_id_prefix, student_id_format
  `);
  console.log('Colleges updated:', r2.rows);

  const r3 = await client.query(`
    UPDATE grade_components
    SET numeric_grade = final, updated_at = NOW()
    WHERE numeric_grade IS NULL AND final IS NOT NULL
  `);
  console.log(`Filled numeric_grade from final: ${r3.rowCount}`);

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
