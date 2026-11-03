/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL do projeto Supabase (ex.: https://abcd.supabase.co). Configuração pública. */
  readonly VITE_SUPABASE_URL?: string
  /** Chave publicável do projeto Supabase (sb_publishable_...). Nunca use chaves secretas no frontend. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
