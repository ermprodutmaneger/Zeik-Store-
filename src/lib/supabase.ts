import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Cliente público do Supabase.
 *
 * Usa SOMENTE a URL do projeto e a chave publicável (sb_publishable_...),
 * que são seguras para o navegador porque todo o acesso é controlado por
 * Row Level Security (RLS) no banco. Nunca coloque service_role, sb_secret
 * ou senha do banco no frontend.
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

/** Verdadeiro somente quando as duas variáveis públicas estão preenchidas. */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey)

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl as string, supabasePublishableKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null

/**
 * Retorna o cliente ou lança um erro claro de configuração pendente.
 * Usado pelos serviços para nunca simular sucesso sem banco conectado.
 */
export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      'Supabase não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY e reinicie o servidor.',
    )
  }
  return supabase
}

/** Origem atual (ex.: http://localhost:5173 ou https://sua-loja.vercel.app). */
export function appOrigin(): string {
  return window.location.origin
}

/** URL de retorno da confirmação de e-mail (autorize no Supabase: Authentication → URL Configuration). */
export function authCallbackUrl(): string {
  return `${appOrigin()}/auth/callback`
}

/** URL de retorno da recuperação de senha (autorize no Supabase: Authentication → URL Configuration). */
export function passwordResetUrl(): string {
  return `${appOrigin()}/redefinir-senha`
}
