import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { ensureProfile, getMyRole, getProfile } from '../services/profile'
import type { Profile, UserRole } from '../types/database'
import { AuthContext, type AuthContextValue } from './authContext'

/**
 * Mantém a sessão do Supabase Auth, o perfil e o papel do usuário.
 * A autorização (cliente × administrador) vem sempre da tabela
 * `user_roles` no banco — nunca de e-mail, metadata ou localStorage.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [role, setRole] = useState<UserRole>('customer')
  // Sem cliente Supabase, não há sessão para carregar: loading já nasce falso.
  const [loading, setLoading] = useState(() => supabase !== null)
  const requestRef = useRef(0)

  const loadUserData = useCallback(async (currentUser: User | null) => {
    const requestId = ++requestRef.current
    if (!currentUser) {
      setProfile(null)
      setRole('customer')
      return
    }
    try {
      const [loadedProfile, loadedRole] = await Promise.all([
        ensureProfile(currentUser),
        getMyRole(currentUser.id),
      ])
      if (requestRef.current !== requestId) return
      setProfile(loadedProfile)
      setRole(loadedRole)
    } catch {
      if (requestRef.current !== requestId) return
      setProfile(null)
      setRole('customer')
    }
  }, [])

  useEffect(() => {
    if (!supabase) return
    let active = true

    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!active) return
        setSession(data.session)
        setUser(data.session?.user ?? null)
        await loadUserData(data.session?.user ?? null)
      })
      .catch(() => {
        // Sem sessão válida: segue como visitante.
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!active) return
      setSession(newSession)
      setUser(newSession?.user ?? null)
      // Adia consultas ao banco para fora do callback de auth (evita travar a sessão).
      setTimeout(() => {
        if (active) {
          void loadUserData(newSession?.user ?? null).then(() => {
            if (active) setLoading(false)
          })
        }
      }, 0)
    })

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [loadUserData])

  const signOut = useCallback(async () => {
    if (!supabase) return
    await supabase.auth.signOut()
    setUser(null)
    setSession(null)
    setProfile(null)
    setRole('customer')
  }, [])

  const refreshProfile = useCallback(async () => {
    if (!user) return
    const fresh = await getProfile(user.id)
    setProfile(fresh)
  }, [user])

  const value: AuthContextValue = {
    user,
    session,
    profile,
    role,
    isAdmin: role === 'admin',
    loading,
    signOut,
    refreshProfile,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
