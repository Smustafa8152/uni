import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { getEmailLookupCandidates } from '../utils/emailLookup'

const defaultAuthValue = {
  user: null,
  session: null,
  userRole: null,
  collegeId: null,
  departmentId: null,
  menuPermissions: null,
  loading: true,
  signIn: async () => {
    throw new Error('useAuth must be used within an AuthProvider')
  },
  signUp: async () => {
    throw new Error('useAuth must be used within an AuthProvider')
  },
  signOut: async () => {},
  refreshUserRole: async () => {},
}

const AuthContext = createContext(defaultAuthValue)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  if (typeof context.signIn !== 'function') {
    throw new Error('useAuth: signIn is not available. Ensure you are inside AuthProvider.')
  }
  return context
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [session, setSession] = useState(null)
  const [userRole, setUserRole] = useState(null)
  const [collegeId, setCollegeId] = useState(null)
  const [departmentId, setDepartmentId] = useState(null)
  const [menuPermissions, setMenuPermissions] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchUserRole = async (email) => {
    if (!email) {
      setUserRole(null)
      setCollegeId(null)
      setDepartmentId(null)
      setMenuPermissions(null)
      return null
    }
    try {
      let data = null
      let error = null
      let matchedEmail = null
      for (const candidate of getEmailLookupCandidates(email)) {
        let res = await supabase
          .from('users')
          .select('role, college_id, menu_permissions')
          .eq('email', candidate)
          .maybeSingle()
        // Older DBs before menu_permissions migration
        if (res.error && /menu_permissions/i.test(res.error.message || '')) {
          res = await supabase.from('users').select('role, college_id').eq('email', candidate).maybeSingle()
          if (res.data) res = { ...res, data: { ...res.data, menu_permissions: null } }
        }
        if (res.data) {
          data = res.data
          matchedEmail = candidate
          error = null
          break
        }
        error = res.error
      }

      if (!error && data) {
        setUserRole(data.role)
        setMenuPermissions(data.menu_permissions ?? null)
        // Null college_id on role=user is intentional for university-wide staff
        // (admissions/finance/etc. on the admin portal). Do not auto-bind a college.
        const finalCollegeId = data.college_id ?? null

        setCollegeId(finalCollegeId)
        console.log('User role fetched:', data.role, 'College ID:', finalCollegeId)
        
        // If user is an instructor, fetch their department_id
        if (data.role === 'instructor' && finalCollegeId) {
          try {
            const { data: instructorData, error: instructorError } = await supabase
              .from('instructors')
              .select('department_id, college_id')
              .ilike('email', matchedEmail)
              .eq('college_id', finalCollegeId)
              .limit(1)
            
            if (!instructorError && instructorData && instructorData.length > 0) {
              setDepartmentId(instructorData[0].department_id)
            } else {
              setDepartmentId(null)
            }
          } catch (instructorErr) {
            console.error('Error fetching instructor department:', instructorErr)
            setDepartmentId(null)
          }
        } else {
          setDepartmentId(null)
        }
        
        return data.role
      } else {
        // Fallback for instructor accounts: sometimes auth exists but `public.users` is not populated.
        // In that case, try resolving role + scope from `instructors` by email.
        try {
          let inst = null
          for (const candidate of getEmailLookupCandidates(email)) {
            const res = await supabase
              .from('instructors')
              .select('id, college_id, department_id, email')
              .eq('status', 'active')
              .ilike('email', candidate)
              .maybeSingle()
            if (res.data) {
              inst = res.data
              break
            }
          }

          if (inst) {
            setUserRole('instructor')
            setCollegeId(inst.college_id ?? null)
            setDepartmentId(inst.department_id ?? null)
            setMenuPermissions(null)
            return 'instructor'
          }
        } catch (fallbackErr) {
          console.warn('Fallback instructor lookup failed:', fallbackErr)
        }

        // User not found in users table, but has auth session
        // Set role to null but don't block the app
        console.warn('User not found in users table:', email, 'Error:', error)
        setUserRole(null)
        setCollegeId(null)
        setDepartmentId(null)
        setMenuPermissions(null)
        return null
      }
    } catch (err) {
      console.error('Error fetching user role:', err)
      setUserRole(null)
      setCollegeId(null)
      setDepartmentId(null)
      setMenuPermissions(null)
      return null
    }
  }

  const refreshUserRole = async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const email = sessionData?.session?.user?.email
      if (email) {
        await fetchUserRole(email)
      } else {
        setUserRole(null)
        setCollegeId(null)
        setDepartmentId(null)
        setMenuPermissions(null)
      }
    } catch (e) {
      console.warn('refreshUserRole failed:', e)
    }
  }

  useEffect(() => {
    let mounted = true
    let initComplete = false

    // Set a timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      if (mounted && !initComplete) {
        console.warn('Auth initialization timeout, setting loading to false')
        setLoading(false)
        initComplete = true
      }
    }, 2000) // 2 second timeout - don't block the UI

    // Get initial session - but don't block if it's slow
    const initializeAuth = async () => {
      try {
        // PKCE email links land as /?code=... — must exchange before a short getSession() race
        // gives up; otherwise the user stays on the home page with no session.
        if (typeof window !== 'undefined') {
          const url = new URL(window.location.href)
          if (url.searchParams.get('code')) {
            const { data: exchanged, error: exchangeErr } = await supabase.auth.exchangeCodeForSession(
              window.location.href,
            )
            if (exchangeErr) {
              console.error('Auth PKCE code exchange failed:', exchangeErr)
            } else if (exchanged?.session && mounted) {
              setSession(exchanged.session)
              setUser(exchanged.session.user)
              if (exchanged.session.user?.email) {
                supabase.rpc('sync_user_openid').then(() => {}, () => {})
                fetchUserRole(exchanged.session.user.email).catch(() => {})
              }
              try {
                sessionStorage.setItem('ums_auth_pkce_exchange', '1')
              } catch (_) {
                /* ignore */
              }
            }
            url.searchParams.delete('code')
            const rest = url.searchParams.toString()
            window.history.replaceState({}, '', url.pathname + (rest ? `?${rest}` : '') + url.hash)
          }
        }

        // Try to get session with a timeout
        const getSessionWithTimeout = () => {
          return Promise.race([
            supabase.auth.getSession(),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Timeout')), 1500)
            )
          ])
        }

        let currentSession = null
        let sessionError = null

        try {
          const result = await getSessionWithTimeout()
          if (result && result.data !== undefined) {
            currentSession = result.data.session
            sessionError = result.error
          }
        } catch (timeoutErr) {
          console.warn('Session fetch timed out, will rely on auth state change listener')
          // Don't block - let onAuthStateChange handle it
          if (mounted && !initComplete) {
            setLoading(false)
            initComplete = true
          }
          return
        }
        
        if (!mounted || initComplete) return

        if (sessionError) {
          console.error('Error getting session:', sessionError)
          setSession(null)
          setUser(null)
          setUserRole(null)
          setCollegeId(null)
          setDepartmentId(null)
          if (mounted && !initComplete) {
            clearTimeout(timeoutId)
            setLoading(false)
            initComplete = true
          }
          return
        }

        // Process session if we got one
        if (currentSession) {
          setSession(currentSession)
          setUser(currentSession?.user ?? null)
          
          if (currentSession?.user?.email) {
            // Fetch role in background, don't block
            fetchUserRole(currentSession.user.email).catch(() => {})
          } else {
            setUserRole(null)
            setCollegeId(null)
            setDepartmentId(null)
          }
        } else {
          // No session
          setSession(null)
          setUser(null)
          setUserRole(null)
          setCollegeId(null)
          setDepartmentId(null)
        }
      } catch (err) {
        console.error('Error initializing auth:', err)
        if (mounted) {
          setSession(null)
          setUser(null)
          setUserRole(null)
          setCollegeId(null)
          setDepartmentId(null)
        }
      } finally {
        if (mounted && !initComplete) {
          clearTimeout(timeoutId)
          setLoading(false)
          initComplete = true
        }
      }
    }

    // Start initialization
    initializeAuth()

    // Listen for auth changes - this is the primary way we get session updates
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return

      try {
        console.log('Auth state changed:', event, session ? 'has session' : 'no session')
        
        // Handle all events
        if (event === 'SIGNED_OUT' || !session) {
          setSession(null)
          setUser(null)
          setUserRole(null)
          setCollegeId(null)
          setDepartmentId(null)
        } else {
          // We have a session — sync users.openId with auth.uid() so RLS policies pass
          supabase.rpc('sync_user_openid').then(() => {}, () => {})
          setSession(session)
          setUser(session?.user ?? null)
          
          if (session?.user?.email) {
            // Fetch role, but don't block if it fails
            fetchUserRole(session.user.email).catch((err) => {
              console.warn('Failed to fetch user role:', err)
              setUserRole(null)
              setCollegeId(null)
              setDepartmentId(null)
            })
          } else {
            setUserRole(null)
            setCollegeId(null)
            setDepartmentId(null)
          }
        }
      } catch (err) {
        console.error('Error in auth state change:', err)
        setUserRole(null)
        setCollegeId(null)
        setDepartmentId(null)
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    })

    return () => {
      mounted = false
      if (timeoutId) clearTimeout(timeoutId)
      subscription.unsubscribe()
    }
  }, [])

  const signIn = async (email, password, expectedRole = null) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    
    if (error) {
      return { data, error }
    }

    // Sync users.openId with auth.uid() so grade_components and other RLS policies pass
    try {
      await supabase.rpc('sync_user_openid')
    } catch (_) {
      // ignore if RPC missing or fails
    }

    // If role is specified, verify user has that role
    if (expectedRole && data?.user) {
      try {
        const sessionEmail = data.user.email || email
        let userData = null
        let userError = null
        for (const candidate of getEmailLookupCandidates(sessionEmail)) {
          const res = await supabase.from('users').select('role, college_id').eq('email', candidate).maybeSingle()
          if (res.data) {
            userData = res.data
            userError = null
            break
          }
          userError = res.error
        }

        if (userError || !userData) {
          // Allow instructor login even if `public.users` row is missing:
          // verify against `instructors` table instead of blocking sign-in.
          let inst = null
          for (const candidate of getEmailLookupCandidates(sessionEmail)) {
            const res = await supabase
              .from('instructors')
              .select('id, college_id, department_id, email')
              .eq('status', 'active')
              .ilike('email', candidate)
              .maybeSingle()
            if (res.data) {
              inst = res.data
              break
            }
          }

          if (expectedRole === 'instructor' && inst) {
            if (data.session) {
              data.session.user.user_metadata = {
                ...data.session.user.user_metadata,
                role: 'instructor',
                college_id: inst.college_id ?? null,
              }
            }
            return { data, error: null }
          }

          if (expectedRole === 'applicant' && inst) {
            await supabase.auth.signOut()
            return {
              data: null,
              error: {
                code: 'ROLE_INSTRUCTOR',
                message:
                  'This email belongs to an instructor account. Please sign in through the Instructor Portal, not the Applicant Portal.',
              },
            }
          }

          await supabase.auth.signOut()
          return {
            data: null,
            error: { message: 'User not found in system' },
          }
        }

        // Map 'user' role to 'college' for clarity
        const userRole = userData.role === 'user' ? 'college' : userData.role

        // Allow 'college' to match 'user' role in database
        if (expectedRole === 'college' && userData.role === 'user') {
          // This is valid - college admin uses 'user' role
        } else if (expectedRole === 'admin' && (userData.role === 'admin' || userData.role === 'user')) {
          // Super admin + staff users (menu-limited) share the admin portal login
        } else if (expectedRole === 'applicant' && userData.role === 'applicant') {
          // Pre-enrollment applicant portal
        } else if (expectedRole !== userRole) {
          await supabase.auth.signOut()
          if (expectedRole === 'applicant' && userRole === 'instructor') {
            return {
              data: null,
              error: {
                code: 'ROLE_INSTRUCTOR',
                message:
                  'This email belongs to an instructor account. Please sign in through the Instructor Portal, not the Applicant Portal.',
              },
            }
          }
          if (expectedRole === 'instructor' && userRole === 'applicant') {
            return {
              data: null,
              error: {
                code: 'ROLE_APPLICANT',
                message:
                  'This email belongs to an applicant account. Please use Applicant Portal sign-in, not the Instructor Portal.',
              },
            }
          }
          return {
            data: null,
            error: { message: `Access denied. This login is for ${expectedRole}s only.` },
          }
        }

        // Store role and college_id in session metadata
        if (data.session) {
          data.session.user.user_metadata = {
            ...data.session.user.user_metadata,
            role: userData.role,
            college_id: userData.college_id,
          }
        }
      } catch (err) {
        console.error('Error verifying user role:', err)
      }
    }

    return { data, error }
  }

  const signUp = async (email, password, metadata = {}) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: metadata,
      },
    })
    return { data, error }
  }

  const signOut = async () => {
    const { error } = await supabase.auth.signOut()
    return { error }
  }

  const value = {
    user,
    session,
    userRole,
    collegeId,
    departmentId,
    menuPermissions,
    loading,
    signIn,
    signUp,
    signOut,
    refreshUserRole,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

