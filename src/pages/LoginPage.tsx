import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { LogIn, MailCheck } from 'lucide-react'
import { Alert } from '../components/Alert'
import { LoadingScreen } from '../components/LoadingScreen'
import { useAuth } from '../hooks/useAuth'
import { translateAuthError } from '../lib/authErrors'
import { authCallbackUrl, requireSupabase } from '../lib/supabase'

interface LocationState {
  from?: string
}

export function LoginPage() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsConfirmation, setNeedsConfirmation] = useState(false)
  const [resending, setResending] = useState(false)
  const [resent, setResent] = useState(false)

  const state = location.state as LocationState | null
  const from =
    state?.from && state.from.startsWith('/') && !state.from.startsWith('//')
      ? state.from
      : '/conta'

  if (loading) return <LoadingScreen />
  if (user) return <Navigate to="/conta" replace />

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    setNeedsConfirmation(false)
    setResent(false)

    const supabase = requireSupabase()
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    setSubmitting(false)
    if (signInError) {
      setError(translateAuthError(signInError))
      if (
        signInError.code === 'email_not_confirmed' ||
        /email not confirmed/i.test(signInError.message)
      ) {
        setNeedsConfirmation(true)
      }
      return
    }
    navigate(from, { replace: true })
  }

  async function handleResend() {
    setResending(true)
    setError(null)
    const supabase = requireSupabase()
    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: authCallbackUrl() },
    })
    setResending(false)
    if (resendError) {
      setError(translateAuthError(resendError))
    } else {
      setResent(true)
    }
  }

  return (
    <div className="container auth-wrap">
      <div className="card auth-card animate-in">
        <div className="auth-icon-badge">
          <LogIn size={26} aria-hidden />
        </div>
        <h1>Entrar na Zeik Store</h1>
        <p className="muted" style={{ margin: '8px 0 22px' }}>
          Acesse para finalizar pedidos de teste e ver seu histórico.
        </p>

        {error ? <Alert variant="error">{error}</Alert> : null}
        {resent ? (
          <Alert variant="success">
            Enviamos um novo e-mail de confirmação. Confira sua caixa de entrada
            (e a pasta de spam).
          </Alert>
        ) : null}

        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              className="input"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@exemplo.com"
            />
          </div>
          <div className="field">
            <label htmlFor="senha">Senha</label>
            <input
              id="senha"
              className="input"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Sua senha"
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-lg btn-block"
            disabled={submitting || !email || !password}
          >
            {submitting ? (
              <>
                <span className="spinner" aria-hidden />
                Entrando…
              </>
            ) : (
              'Entrar'
            )}
          </button>
        </form>

        {needsConfirmation ? (
          <button
            type="button"
            className="btn btn-outline btn-block"
            style={{ marginTop: 12 }}
            onClick={handleResend}
            disabled={resending}
          >
            <MailCheck size={18} aria-hidden />
            {resending ? 'Reenviando…' : 'Reenviar e-mail de confirmação'}
          </button>
        ) : null}

        <p className="auth-alt">
          <Link to="/recuperar-senha">Esqueci minha senha</Link>
        </p>
        <p className="auth-alt" style={{ marginTop: 8 }}>
          Ainda não tem conta? <Link to="/cadastro">Criar conta grátis</Link>
        </p>
      </div>
    </div>
  )
}
