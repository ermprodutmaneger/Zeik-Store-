import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { KeyRound, MailCheck } from 'lucide-react'
import { Alert } from '../components/Alert'
import { translateAuthError } from '../lib/authErrors'
import { passwordResetUrl, requireSupabase } from '../lib/supabase'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    const supabase = requireSupabase()
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: passwordResetUrl(),
    })
    setSubmitting(false)
    if (resetError) {
      setError(translateAuthError(resetError))
      return
    }
    setSent(true)
  }

  if (sent) {
    return (
      <div className="container auth-wrap">
        <div className="card auth-card animate-in" style={{ textAlign: 'center' }}>
          <div className="success-icon" style={{ marginBottom: 14 }}>
            <MailCheck size={42} aria-hidden />
          </div>
          <h1>Verifique seu e-mail</h1>
          <p className="muted" style={{ margin: '10px 0 20px' }}>
            Se houver uma conta com <strong>{email.trim()}</strong>, enviamos um link
            para você criar uma nova senha. O link expira em pouco tempo — confira
            também a pasta de spam.
          </p>
          <Link to="/entrar" className="btn btn-primary btn-block">
            Voltar para Entrar
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
        <h1>Recuperar senha</h1>
        <p className="muted" style={{ margin: '8px 0 22px' }}>
          Informe o e-mail da sua conta e enviaremos um link seguro para você
          criar uma nova senha.
        </p>

        {error ? <Alert variant="error">{error}</Alert> : null}

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
          <button
            type="submit"
            className="btn btn-primary btn-lg btn-block"
            disabled={submitting || !email}
          >
            {submitting ? (
              <>
                <span className="spinner" aria-hidden />
                Enviando…
              </>
            ) : (
              'Enviar link de recuperação'
            )}
          </button>
        </form>

        <p className="auth-alt">
          Lembrou a senha? <Link to="/entrar">Entrar</Link>
        </p>
      </div>
    </div>
  )
}
