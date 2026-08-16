import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-requested-with',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

function isDuplicateAuthUserError(err: { message?: string } | null): boolean {
  if (!err?.message) return false
  const m = err.message.toLowerCase()
  return (
    m.includes('already') ||
    m.includes('registered') ||
    m.includes('exists') ||
    m.includes('duplicate')
  )
}

/** Find auth user id by email (pagination; small deployments). */
async function getAuthUserIdByEmail(
  supabaseAdmin: ReturnType<typeof createClient>,
  searchEmail: string
): Promise<string | null> {
  const normalized = searchEmail.trim().toLowerCase()
  let page = 1
  const perPage = 200
  for (let i = 0; i < 50; i++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage })
    if (error) return null
    const found = data.users.find((u) => u.email?.toLowerCase() === normalized)
    if (found) return found.id
    if (data.users.length < perPage) break
    page++
  }
  return null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    })
  }

  try {
    let requestData: {
      email?: string
      password?: string
      role?: string
      college_id?: number | null
      name?: string
      kind?: 'student' | 'instructor'
      record_id?: number | string
      menu_permissions?: string[] | null
    }
    try {
      requestData = await req.json()
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON in request body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { email, password, role, college_id, name, kind, record_id, menu_permissions } = requestData

    const normalizedMenuPermissions = Array.isArray(menu_permissions)
      ? [...new Set(menu_permissions.map(String).filter(Boolean))]
      : menu_permissions === null
        ? null
        : undefined

    const menuPermissionPatch =
      normalizedMenuPermissions !== undefined
        ? {
            menu_permissions:
              normalizedMenuPermissions && normalizedMenuPermissions.length
                ? normalizedMenuPermissions
                : null,
          }
        : {}

    if (!email || !password || !role) {
      return new Response(JSON.stringify({ error: 'Missing required fields: email, password, role' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'Server configuration error: Missing environment variables' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const emailTrim = email.trim()

    async function linkUserToRecord(userId: number) {
      if (!kind || record_id == null) return { linked: false }
      const idNum = typeof record_id === 'number' ? record_id : Number(record_id)
      if (!Number.isFinite(idNum)) return { linked: false }
      const table = kind === 'instructor' ? 'instructors' : 'students'
      const { error: linkErr } = await supabaseAdmin.from(table).update({ user_id: userId }).eq('id', idNum)
      if (linkErr) return { linked: false, link_error: linkErr.message }
      return { linked: true }
    }

    // 1) Existing row in public.users (same email) → update password + sync profile fields
    let existingByEmail: Record<string, unknown> | null = null
    const byExact = await supabaseAdmin.from('users').select('*').eq('email', emailTrim).maybeSingle()
    if (byExact.data) existingByEmail = byExact.data as Record<string, unknown>
    else {
      const byIlike = await supabaseAdmin.from('users').select('*').ilike('email', emailTrim).maybeSingle()
      if (byIlike.data) existingByEmail = byIlike.data as Record<string, unknown>
    }

    const openId = existingByEmail?.openId as string | undefined
    const userPk = existingByEmail?.id as number | undefined

    if (existingByEmail && openId && userPk != null) {
      const { error: updAuthErr } = await supabaseAdmin.auth.admin.updateUserById(openId, {
        password,
        user_metadata: {
          name: name || emailTrim,
          role,
        },
      })
      if (updAuthErr) {
        return new Response(JSON.stringify({ error: updAuthErr.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: updatedRow, error: updRowErr } = await supabaseAdmin
        .from('users')
        .update({
          name: name || emailTrim,
          role,
          college_id: college_id ?? null,
          ...menuPermissionPatch,
        })
        .eq('id', userPk)
        .select()
        .single()

      if (updRowErr) {
        return new Response(JSON.stringify({ error: updRowErr.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const linkResult = await linkUserToRecord(Number(updatedRow.id))
      return new Response(
        JSON.stringify({
          success: true,
          user: updatedRow,
          auth_user_id: openId,
          reused: true,
          ...linkResult,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 1b) users row exists but openId missing — link to existing Auth user and set password
    if (existingByEmail && userPk != null && !openId) {
      const authId = await getAuthUserIdByEmail(supabaseAdmin, emailTrim)
      if (authId) {
        const { error: updAuthErr } = await supabaseAdmin.auth.admin.updateUserById(authId, {
          password,
          user_metadata: {
            name: name || emailTrim,
            role,
          },
        })
        if (updAuthErr) {
          return new Response(JSON.stringify({ error: updAuthErr.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        const { data: updatedRow, error: updRowErr } = await supabaseAdmin
          .from('users')
          .update({
            openId: authId,
            name: name || emailTrim,
            role,
            college_id: college_id ?? null,
            email: emailTrim,
            ...menuPermissionPatch,
          })
          .eq('id', userPk)
          .select()
          .single()

        if (updRowErr) {
          return new Response(JSON.stringify({ error: updRowErr.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        const linkResult = await linkUserToRecord(Number(updatedRow.id))
        return new Response(
          JSON.stringify({
            success: true,
            user: updatedRow,
            auth_user_id: authId,
            reused: true,
            ...linkResult,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // 2) Try to create new auth user + users row
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: emailTrim,
      password,
      email_confirm: true,
      user_metadata: {
        name: name || emailTrim,
        role,
      },
    })

    if (authError) {
      // 3) Email already registered in Auth but no (matching) public.users row, or race
      if (!isDuplicateAuthUserError(authError)) {
        return new Response(JSON.stringify({ error: authError.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const authUserId = await getAuthUserIdByEmail(supabaseAdmin, emailTrim)
      if (!authUserId) {
        return new Response(
          JSON.stringify({ error: authError.message || 'Could not resolve existing auth user' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const { error: pwdErr } = await supabaseAdmin.auth.admin.updateUserById(authUserId, {
        password,
        user_metadata: {
          name: name || emailTrim,
          role,
        },
      })
      if (pwdErr) {
        return new Response(JSON.stringify({ error: pwdErr.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const { data: byOpenId } = await supabaseAdmin.from('users').select('*').eq('openId', authUserId).maybeSingle()

      if (byOpenId) {
        const { data: updatedRow, error: updRowErr } = await supabaseAdmin
          .from('users')
          .update({
            name: name || emailTrim,
            role,
            college_id: college_id ?? null,
            email: emailTrim,
            ...menuPermissionPatch,
          })
          .eq('id', byOpenId.id)
          .select()
          .single()

        if (updRowErr) {
          return new Response(JSON.stringify({ error: updRowErr.message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        const linkResult = await linkUserToRecord(Number(updatedRow.id))
        return new Response(
          JSON.stringify({
            success: true,
            user: updatedRow,
            auth_user_id: authUserId,
            reused: true,
            ...linkResult,
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const { data: insertedUser, error: insErr } = await supabaseAdmin
        .from('users')
        .insert({
          openId: authUserId,
          email: emailTrim,
          name: name || emailTrim,
          role,
          college_id: college_id ?? null,
          loginMethod: 'email',
          ...menuPermissionPatch,
        })
        .select()
        .single()

      if (insErr) {
        return new Response(JSON.stringify({ error: insErr.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      const linkResult = await linkUserToRecord(Number(insertedUser.id))
      return new Response(
        JSON.stringify({
          success: true,
          user: insertedUser,
          auth_user_id: authUserId,
          reused: true,
          ...linkResult,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .insert({
        openId: authData.user.id,
        email: emailTrim,
        name: name || emailTrim,
        role,
        college_id: college_id ?? null,
        loginMethod: 'email',
        ...menuPermissionPatch,
      })
      .select()
      .single()

    if (userError) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id)
      return new Response(JSON.stringify({ error: userError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const linkResult = await linkUserToRecord(Number(userData.id))
    return new Response(
      JSON.stringify({
        success: true,
        user: userData,
        auth_user_id: authData.user.id,
        reused: false,
        ...linkResult,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
