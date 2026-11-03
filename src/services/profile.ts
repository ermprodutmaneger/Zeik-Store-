import { requireSupabase } from '../lib/supabase'
import type { Profile, UserRole } from '../types/database'

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message)
}

/** Perfil do usuário (RLS: cada cliente lê apenas o próprio; admin lê todos). */
export async function getProfile(userId: string): Promise<Profile | null> {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle<Profile>()
  throwIfError(error)
  return data ?? null
}

/**
 * Papel do usuário vindo da tabela `user_roles` do banco.
 * É a ÚNICA fonte de autorização: nunca decida por e-mail, user_metadata
 * ou localStorage. Sem linha na tabela, o usuário é cliente comum.
 */
export async function getMyRole(userId: string): Promise<UserRole> {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle<{ role: UserRole }>()
  throwIfError(error)
  return data?.role === 'admin' ? 'admin' : 'customer'
}

/**
 * Atualiza o nome de exibição do próprio perfil.
 * O banco concede UPDATE somente na coluna full_name (e-mail e id são fixos).
 */
export async function updateMyName(userId: string, fullName: string): Promise<Profile> {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from('profiles')
    .update({ full_name: fullName.trim() })
    .eq('id', userId)
    .select('*')
    .single<Profile>()
  throwIfError(error)
  return data as Profile
}
