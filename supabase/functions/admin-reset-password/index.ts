import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Inline CORS: deploy bundler only includes this folder (../_shared is not bundled).
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-requested-with',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

const STAFF_ROLES = ['admin', 'user', 'instructor']

function isDuplicateAuthUserError(err: { message?: string } | null): boolean {
  if (!err?.message) return false
  const message = err.message.toLowerCase()
  return message.includes('already') || message.includes('registered') || message.includes('exists') || message.includes('duplicate')
}

/** Auth list filter misses some addresses (notably emails with +), so page through users too. */
async function findAuthIdByEmail(
  supabaseAdmin: ReturnType<typeof createClient>,
  supabaseUrl: string,
  serviceRoleKey: string,
  email: string,
): Promise<string | null> {
  const lookup = await fetch(
    `${supabaseUrl}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`,
    {
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
    },
  )
  let filterAnswered = false
  if (lookup.ok) {
    filterAnswered = true
    const payload = await lookup.json()
    const users = Array.isArray(payload) ? payload : payload?.users || []
    const match = users.find((row: { email?: string; id?: string }) =>
      String(row.email || '').trim().toLowerCase() === email
    )
    if (match?.id) return match.id
  }

  // A successful filter is enough, except for plus-addresses, which the filter can miss.
  if (filterAnswered && !email.includes('+')) return null

  let page = 1
  const perPage = 200
  for (let i = 0; i < 50; i++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage })
    if (error) return null
    const found = data.users.find((user) => user.email?.trim().toLowerCase() === email)
    if (found?.id) return found.id
    if (data.users.length < perPage) break
    page++
  }
  return null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const jwt = authHeader.replace('Bearer ', '')
    const {
      data: { user: callerAuth },
      error: authErr,
    } = await supabaseAdmin.auth.getUser(jwt)
    if (authErr || !callerAuth) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: callerRow, error: callerErr } = await supabaseAdmin
      .from('users')
      .select('id, role, college_id')
      .eq('openId', callerAuth.id)
      .maybeSingle()

    if (callerErr || !callerRow) {
      return new Response(JSON.stringify({ error: 'Caller not found in users table' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (callerRow.role !== 'admin' && callerRow.role !== 'user') {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let body: { studentId?: number; instructorId?: number; applicationId?: number; newPassword?: string }
    try {
      body = await req.json()
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { studentId, instructorId, applicationId, newPassword } = body
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
      return new Response(JSON.stringify({ error: 'Password must be at least 6 characters' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const hasStudent = studentId != null && Number.isFinite(Number(studentId))
    const hasInstructor = instructorId != null && Number.isFinite(Number(instructorId))
    const hasApplication = applicationId != null && Number.isFinite(Number(applicationId))
    const targetCount = [hasStudent, hasInstructor, hasApplication].filter(Boolean).length
    if (targetCount !== 1) {
      return new Response(JSON.stringify({ error: 'Provide exactly one of studentId, instructorId, or applicationId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (hasApplication) {
      const { data: app, error: appErr } = await supabaseAdmin
        .from('applications')
        .select('id, email, first_name, last_name, applicant_user_id, college_id')
        .eq('id', Number(applicationId))
        .single()

      if (appErr || !app) {
        return new Response(JSON.stringify({ error: 'Application not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (callerRow.role === 'user' && app.college_id !== callerRow.college_id) {
        return new Response(JSON.stringify({ error: 'Not allowed for this college' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const email = String(app.email || '').trim().toLowerCase()
      if (!email && !app.applicant_user_id) {
        return new Response(JSON.stringify({ error: 'This application has no email, so there is no login to reset.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      let authId: string | null = app.applicant_user_id || null
      if (authId) {
        const { data: linkedAuth, error: linkedErr } = await supabaseAdmin.auth.admin.getUserById(authId)
        const linkedEmail = linkedAuth?.user?.email?.trim().toLowerCase()
        if (linkedErr || !linkedAuth?.user || (email && linkedEmail && linkedEmail !== email)) {
          authId = null
        }
      }

      if (!authId && email) {
        const { data: userRow, error: userRowErr } = await supabaseAdmin
          .from('users')
          .select('openId, role')
          .ilike('email', email)
          .maybeSingle()

        if (userRowErr) {
          return new Response(JSON.stringify({ error: userRowErr.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        if (userRow?.role && STAFF_ROLES.includes(userRow.role)) {
          return new Response(JSON.stringify({ error: 'This email belongs to a staff account and cannot be reset from an application.' }), {
            status: 403,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        if (userRow?.openId) authId = userRow.openId
      }

      if (!authId && email) {
        authId = await findAuthIdByEmail(supabaseAdmin, supabaseUrl, serviceRoleKey, email)
      }

      const displayName = [app.first_name, app.last_name].filter(Boolean).join(' ').trim() || email
      let createdAccount = false
      if (!authId && email) {
        const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
          email,
          password: newPassword,
          email_confirm: true,
          user_metadata: { role: 'applicant', name: displayName },
        })
        if (created?.user?.id) {
          authId = created.user.id
          createdAccount = true
        } else if (isDuplicateAuthUserError(createErr)) {
          authId = await findAuthIdByEmail(supabaseAdmin, supabaseUrl, serviceRoleKey, email)
        } else {
          return new Response(JSON.stringify({ error: createErr?.message || 'Could not create the applicant login.' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      }

      if (!authId) {
        return new Response(
          JSON.stringify({ error: 'No applicant login was found for this email, and a new login could not be created.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      const { data: linkedRow } = await supabaseAdmin
        .from('users')
        .select('id, role')
        .eq('openId', authId)
        .maybeSingle()
      if (linkedRow?.role && STAFF_ROLES.includes(linkedRow.role)) {
        return new Response(JSON.stringify({ error: 'This login belongs to a staff account and cannot be reset from an application.' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      if (!createdAccount) {
        const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(authId, {
          password: newPassword,
        })
        if (updErr) {
          return new Response(JSON.stringify({ error: updErr.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      }

      if (!linkedRow) {
        const { error: insErr } = await supabaseAdmin.from('users').insert({
          openId: authId,
          email,
          name: displayName,
          role: 'applicant',
          college_id: null,
          loginMethod: 'email',
        })
        if (insErr) {
          return new Response(JSON.stringify({ error: insErr.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      }

      if (app.applicant_user_id !== authId) {
        const { error: linkErr } = await supabaseAdmin
          .from('applications')
          .update({ applicant_user_id: authId })
          .eq('id', app.id)
        if (linkErr) {
          return new Response(JSON.stringify({ error: linkErr.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let targetUserId: number | null = null
    let collegeId: number | null = null

    if (hasStudent) {
      const { data: st, error: stErr } = await supabaseAdmin
        .from('students')
        .select('id, student_id, college_id, user_id')
        .eq('id', Number(studentId))
        .single()

      if (stErr || !st) {
        return new Response(JSON.stringify({ error: 'Student not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      collegeId = st.college_id
      targetUserId = st.user_id
    } else {
      const { data: ins, error: insErr } = await supabaseAdmin
        .from('instructors')
        .select('id, employee_id, college_id, user_id')
        .eq('id', Number(instructorId))
        .single()

      if (insErr || !ins) {
        return new Response(JSON.stringify({ error: 'Instructor not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      collegeId = ins.college_id
      targetUserId = ins.user_id
    }

    if (callerRow.role === 'user' && collegeId !== callerRow.college_id) {
      return new Response(JSON.stringify({ error: 'Not allowed for this college' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!targetUserId) {
      return new Response(
        JSON.stringify({ error: 'No linked login account (user_id). Create one in Upload users or user management.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: targetUser, error: tuErr } = await supabaseAdmin
      .from('users')
      .select('openId')
      .eq('id', targetUserId)
      .single()

    if (tuErr || !targetUser?.openId) {
      return new Response(JSON.stringify({ error: 'Target user row missing openId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(targetUser.openId, {
      password: newPassword,
    })

    if (updErr) {
      return new Response(JSON.stringify({ error: updErr.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message || 'Server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
