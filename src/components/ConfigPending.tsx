import { DatabaseZap } from 'lucide-react'

/**
 * Exibida quando VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY não estão
 * definidos. Nada é simulado: sem o banco, a loja não inventa login nem pedidos.
 */
export function ConfigPending() {
  return (
    <div className="config-screen">
      <div className="config-card animate-in">
        <div className="auth-icon-badge">
          <DatabaseZap size={26} aria-hidden />
        </div>
        <p className="logo" style={{ marginBottom: 6 }}>
          <span className="logo-zeik">Zeik</span> Store
        </p>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800 }}>
          Quase lá: falta conectar o Supabase
        </h1>
        <p className="muted" style={{ marginTop: 8 }}>
          Esta loja funciona com um banco de dados real, então nada é simulado.
          Para ligar a vitrine, as contas e os pedidos de teste, configure as
          variáveis públicas do seu projeto Supabase:
        </p>

        <ol className="steps">
          <li>
            Crie um projeto de testes em <strong>supabase.com</strong> e execute{' '}
            <code>supabase/schema.sql</code> e depois <code>supabase/seed.sql</code> no
            SQL Editor.
          </li>
          <li>
            No painel <strong>Connect</strong>, copie a URL do projeto e a chave
            publicável (<code>sb_publishable_…</code>).
          </li>
          <li>
            Crie o arquivo <code>.env.local</code> (a partir de <code>.env.example</code>)
            com <code>VITE_SUPABASE_URL</code> e{' '}
            <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> — ou defina as mesmas variáveis na
            Vercel e faça um novo deploy.
          </li>
          <li>Reinicie o servidor (<code>npm run dev</code>) e recarregue esta página.</li>
        </ol>

        <p className="small muted">
          Passo a passo completo em <code>docs/HOSPEDAGEM.md</code>. Nunca coloque
          chaves secretas (<code>service_role</code>, <code>sb_secret</code>) no
          frontend: a proteção dos dados é feita por Row Level Security no banco.
        </p>
      </div>
    </div>
  )
}
