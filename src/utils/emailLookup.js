/**
 * Unique email strings to try when matching public.users / students.email to Supabase Auth.
 * Auth normalizes case; legacy rows may use different casing — strict .eq() would miss.
 * Values are also safe to drop into a PostgREST `or` filter: `+` must stay quoted or the
 * query string treats it as a space and the login lookup misses the account.
 */
export function getEmailLookupCandidates(email) {
  const raw = String(email ?? '').trim()
  if (!raw) return []
  const lower = raw.toLowerCase()
  const out = []
  const seen = new Set()
  for (const c of [raw, lower]) {
    if (c && !seen.has(c)) {
      seen.add(c)
      out.push(c)
    }
  }
  return out
}

export function postgrestQuoted(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}
