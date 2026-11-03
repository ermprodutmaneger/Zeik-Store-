import { createContext } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import type { Profile, UserRole } from '../types/database'

export interface AuthContextValue {
  user: User | null
  session: Session | null
  profile: Profile | null
  /** Papel vindo da tabela user_roles do banco ('customer' por padrão). */
  role: UserRole
  isAdmin: boolean
  /** Verdadeiro enquanto a sessão inicial e o perfil estão carregando. */
  loading: boolean
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
