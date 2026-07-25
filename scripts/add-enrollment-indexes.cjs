/**
 * Indexes to speed student-grades-by-subject lookups.
 * Usage: node scripts/add-enrollment-indexes.cjs
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

  const stmts = [
    `CREATE INDEX IF NOT EXISTS idx_enrollments_status_class ON enrollments (status, class_id)`,
    `CREATE INDEX IF NOT EXISTS idx_enrollments_class_id ON enrollments (class_id)`,
    `CREATE INDEX IF NOT EXISTS idx_enrollments_student_status ON enrollments (student_id, status)`,
    `CREATE INDEX IF NOT EXISTS idx_classes_subject_id ON classes (subject_id)`,
    `CREATE INDEX IF NOT EXISTS idx_grade_components_enrollment_id ON grade_components (enrollment_id)`,
    `CREATE INDEX IF NOT EXISTS idx_subjects_major_id ON subjects (major_id)`,
  ];

  for (const sql of stmts) {
    await client.query(sql);
    console.log('✓', sql.slice(0, 70) + '...');
  }

  // Sanity: subject 31 path
  console.time('path');
  const { rows: classes } = await client.query(`SELECT id FROM classes WHERE subject_id = $1`, [31]);
  const ids = classes.map((r) => r.id);
  const { rows: counts } = await client.query(
    `SELECT COUNT(*)::int AS c FROM enrollments WHERE status = 'enrolled' AND class_id = ANY($1::int[])`,
    [ids]
  );
  console.timeEnd('path');
  console.log(`subject 31 → ${ids.length} classes, ${counts[0].c} enrollments`);

  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
