import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-requested-with',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
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
      data: { user: authUser },
      error: authErr,
    } = await supabaseAdmin.auth.getUser(jwt)
    if (authErr || !authUser?.id) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const openId = authUser.id
    const email = (authUser.email || '').trim().toLowerCase()
    if (!email) {
      return new Response(JSON.stringify({ error: 'Auth user has no email' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let body: { name?: string } = {}
    try {
      body = await req.json()
    } catch {
      body = {}
    }
    const displayName = (typeof body.name === 'string' && body.name.trim()) ? body.name.trim() : email

    const { data: sameEmail, error: seErr } = await supabaseAdmin
      .from('users')
      .select('id, openId, role')
      .ilike('email', email)
      .maybeSingle()

    if (seErr) {
      return new Response(JSON.stringify({ error: seErr.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (sameEmail?.openId && sameEmail.openId !== openId) {
      return new Response(
        JSON.stringify({ error: 'This email is already linked to another account. Use the correct login.' }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (sameEmail?.role && ['student', 'instructor', 'admin', 'user'].includes(sameEmail.role as string)) {
      return new Response(
        JSON.stringify({
          error: 'This email is registered as a staff or enrolled student account. Use the appropriate login page.',
          detail: {
            user_id: sameEmail.id,
            role: sameEmail.role,
            hint:
              'This record is in public.users. Deleting only the Auth user is not enough. If you intend to re-register this email as an applicant, remove/disable the public.users record (and any linked students/instructors row) for this email.',
          },
        }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: byOpen, error: boErr } = await supabaseAdmin
      .from('users')
      .select('id, role')
      .eq('openId', openId)
      .maybeSingle()

    if (boErr) {
      return new Response(JSON.stringify({ error: boErr.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (byOpen) {
      if (['student', 'instructor', 'admin', 'user'].includes(byOpen.role as string)) {
        return new Response(JSON.stringify({ success: true, skipped: true }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const { error: upErr } = await supabaseAdmin
        .from('users')
        .update({
          email,
          name: displayName,
          role: 'applicant',
          college_id: null,
        })
        .eq('openId', openId)

      if (upErr) {
        return new Response(JSON.stringify({ error: upErr.message }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    } else {
      const { error: insErr } = await supabaseAdmin.from('users').insert({
        openId,
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
