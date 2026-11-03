import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, KeyRound, TriangleAlert } from 'lucide-react'
import { Alert } from '../components/Alert'
import { LoadingScreen } from '../components/LoadingScreen'
import { translateAuthError } from '../lib/authErrors'
import { requireSupabase } from '../lib/supabase'

type Phase = 'checking' | 'ready' | 'invalid' | 'done'

function readLinkError(): string | null {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const query = new URLSearchParams(window.location.search)
  const code = hash.get('error_code') ?? query.get('error_code')
  const description =
    hash.get('error_description') ?? query.get('error_description') ?? hash.get('error')
  if (!code && !description) return null
  if (code === 'otp_expired') {
    return 'Este link de recuperação expirou ou já foi usado. Solicite um novo.'
  }
  return description
    ? `Não foi possível validar o link (${description}). Solicite um novo.`
    : 'Não foi possível validar o link. Solicite um novo.'
}

/**
 * Página de destino do link de recuperação enviado por e-mail.
 * O Supabase valida o link e cria uma sessão temporária de recuperação;
 * só então o formulário de nova senha aparece.
 */
export function ResetPasswordPage() {
  // O erro do link (se houver) já vem na URL: lemos na inicialização,
  // sem precisar de efeito para sincronizar estado.
  const [initialLinkError] = useState<string | null>(readLinkError)
  const [linkError, setLinkError] = useState<string | null>(initialLinkError)
  const [phase, setPhase] = useState<Phase>(initialLinkError ? 'invalid' : 'checking')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (initialLinkError) return
    const supabase = requireSupabase()

    let active = true
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return
      if (event === 'PASSWORD_RECOVERY' || session) setPhase('ready')
    })

    const code = new URLSearchParams(window.location.search).get('code')
    if (code) {
      supabase.auth
        .exchangeCodeForSession(code)
        .then(({ data, error: exchangeError }) => {
          if (!active) return
          if (!exchangeError && data.session) setPhase('ready')
        })
        .catch(() => {})
    } else {
      supabase.auth
        .getSession()
        .then(({ data }) => {
          if (active && data.session) setPhase('ready')
        })
        .catch(() => {})
    }

    const timeout = window.setTimeout(() => {
      if (!active) return
      setPhase((current) => (current === 'checking' ? 'invalid' : current))
      setLinkError(
        (current) =>
          current ??
          'Não encontramos uma sessão de recuperação. O link pode ter expirado — solicite um novo.',
      )
    }, 6000)

    return () => {
      active = false
      window.clearTimeout(timeout)
      listener.subscription.unsubscribe()
    }
  }, [initialLinkError])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    const errors: Record<string, string> = {}
    if (password.length < 6) errors.password = 'A senha deve ter pelo menos 6 caracteres.'
    if (confirmPassword !== password) errors.confirmPassword = 'As senhas não coincidem.'
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) return

    setSubmitting(true)
    setError(null)
    const supabase = requireSupabase()
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setSubmitting(false)
    if (updateError) {
      setError(translateAuthError(updateError))
      return
    }
    setPhase('done')
  }

  if (phase === 'checking') {
    return <LoadingScreen message="Validando o link de recuperação…" />
  }

  if (phase === 'invalid') {
    return (
      <div className="container auth-wrap">
        <div className="card auth-card animate-in" style={{ textAlign: 'center' }}>
          <div
            className="success-icon"
            style={{ background: 'var(--danger-bg)', color: 'var(--danger)', marginBottom: 14 }}
          >
            <TriangleAlert size={42} aria-hidden />
          </div>
          <h1>Link inválido ou expirado</h1>
          <p className="muted" style={{ margin: '10px 0 20px' }}>
            {linkError ?? 'Não foi possível validar o link de recuperação.'}
          </p>
          <Link to="/recuperar-senha" className="btn btn-primary btn-block">
            Solicitar novo link
          </Link>
          <Link to="/entrar" className="btn btn-ghost btn-block" style={{ marginTop: 8 }}>
            Voltar para Entrar
          </Link>
        </div>
      </div>
    )
  }

  if (phase === 'done') {
    return (
      <div className="container auth-wrap">
        <div className="card auth-card animate-in" style={{ textAlign: 'center' }}>
          <div className="success-icon" style={{ marginBottom: 14 }}>
            <CheckCircle2 size={42} aria-hidden />
          </div>
          <h1>Senha atualizada!</h1>
          <p className="muted" style={{ margin: '10px 0 20px' }}>
            Sua nova senha já está valendo e você está conectado(a).
          </p>
          <Link to="/conta" className="btn btn-primary btn-block">
            Ir para Minha conta
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="container auth-wrap">
      <div className="card auth-card animate-in">
        <div className="auth-icon-badge">
          <KeyRound size={26} aria-hidden />
        </div>
        <h1>Criar nova senha</h1>
        <p className="muted" style={{ margin: '8px 0 22px' }}>
          Escolha uma senha nova para a sua conta Zeik Store.
        </p>

        {error ? <Alert variant="error">{error}</Alert> : null}

        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="nova-senha">Nova senha</label>
            <input
              id="nova-senha"
              className="input"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo de 6 caracteres"
              aria-invalid={Boolean(fieldErrors.password)}
            />
            {fieldErrors.password ? (
              <span className="field-error">{fieldErrors.password}</span>
            ) : null}
          </div>
          <div className="field">
            <label htmlFor="confirmar-nova">Confirmar nova senha</label>
            <input
              id="confirmar-nova"
              className="input"
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repita a nova senha"
              aria-invalid={Boolean(fieldErrors.confirmPassword)}
            />
            {fieldErrors.confirmPassword ? (
              <span className="field-error">{fieldErrors.confirmPassword}</span>
            ) : null}
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-lg btn-block"
            disabled={submitting}
          >
            {submitting ? (
              <>
                <span className="spinner" aria-hidden />
                Salvando…
              </>
            ) : (
              'Salvar nova senha'
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
