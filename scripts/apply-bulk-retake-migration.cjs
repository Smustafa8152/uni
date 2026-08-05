require('dotenv').config()
const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

const url = process.env.VITE_SUPABASE_URL || ''
const ref = url.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1]
const password = process.env.SUPABASE_DB_PASSWORD
const sql = fs.readFileSync(
  path.join(__dirname, '../supabase/migrations/20260805220000_bulk_exam_retake_window.sql'),
  'utf8',
)

;(async () => {
  const c = new Client({
    connectionString: `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`,
    ssl: { rejectUnauthorized: false },
  })
  await c.connect()
  await c.query(sql)
  console.log('migration applied')
  await c.end()
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
