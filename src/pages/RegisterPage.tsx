import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { MailCheck, UserPlus } from 'lucide-react'
import { Alert } from '../components/Alert'
import { LoadingScreen } from '../components/LoadingScreen'
import { useAuth } from '../hooks/useAuth'
import { translateAuthError } from '../lib/authErrors'
import { authCallbackUrl, requireSupabase } from '../lib/supabase'

export function RegisterPage() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false)
  const [resending, setResending] = useState(false)
  const [resent, setResent] = useState(false)

  if (loading) return <LoadingScreen />
  if (user) return <Navigate to="/conta" replace />

  function validate(): boolean {
    const errors: Record<string, string> = {}
    if (fullName.trim().length < 2) errors.fullName = 'Informe seu nome (mínimo 2 letras).'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'Informe um e-mail válido.'
    if (password.length < 6) errors.password = 'A senha deve ter pelo menos 6 caracteres.'
    if (confirmPassword !== password) errors.confirmPassword = 'As senhas não coincidem.'
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!validate()) return

    setSubmitting(true)
    const supabase = requireSupabase()
    // O nome vai em options.data apenas para semear o perfil (trigger no banco).
    // Autorização nunca depende disso: o papel nasce 'customer' em user_roles.
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: fullName.trim() },
        emailRedirectTo: authCallbackUrl(),
      },
    })
    setSubmitting(false)

    if (signUpError) {
      setError(translateAuthError(signUpError))
      return
    }

    if (data.session) {
      // Projeto com confirmação de e-mail desligada: sessão imediata.
      navigate('/conta', {
        replace: true,
        state: { notice: 'Conta criada com sucesso. Bem-vindo(a) à Zeik Store!' },
      })
      return
    }
    setAwaitingConfirmation(true)
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
    if (resendError) setError(translateAuthError(resendError))
    else setResent(true)
  }

  if (awaitingConfirmation) {
    return (
      <div className="container auth-wrap">
        <div className="card auth-card animate-in" style={{ textAlign: 'center' }}>
          <div className="success-icon" style={{ marginBottom: 14 }}>
            <MailCheck size={42} aria-hidden />
          </div>
          <h1>Confirme seu e-mail</h1>
          <p className="muted" style={{ margin: '10px 0 18px' }}>
            Enviamos um link de confirmação para <strong>{email.trim()}</strong>.
            Abra o e-mail e toque no link para ativar sua conta e voltar para a loja.
          </p>
          {error ? <Alert variant="error">{error}</Alert> : null}
          {resent ? (
            <Alert variant="success">Novo e-mail enviado. Confira também a pasta de spam.</Alert>
          ) : null}
          <button
            type="button"
            className="btn btn-outline btn-block"
            onClick={handleResend}
            disabled={resending}
          >
            {resending ? 'Reenviando…' : 'Reenviar e-mail de confirmação'}
          </button>
          <Link to="/entrar" className="btn btn-ghost btn-block" style={{ marginTop: 8 }}>
            Já confirmei — entrar
          </Link>
          <p className="small muted" style={{ marginTop: 14 }}>
            Se este e-mail já tinha cadastro, nenhum e-mail novo chega: use
            “Entrar” ou “Recuperar senha”.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="container auth-wrap">
      <div className="card auth-card animate-in">
        <div className="auth-icon-badge">
          <UserPlus size={26} aria-hidden />
        </div>
        <h1>Criar sua conta</h1>
        <p className="muted" style={{ margin: '8px 0 22px' }}>
          Grátis e rapidinho. Você confirma o e-mail e já pode fazer pedidos de teste.
        </p>

        {error ? <Alert variant="error">{error}</Alert> : null}

        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="nome">Nome completo</label>
            <input
              id="nome"
              className="input"
              type="text"
              autoComplete="name"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Como devemos te chamar?"
              aria-invalid={Boolean(fieldErrors.fullName)}
            />
            {fieldErrors.fullName ? (
              <span className="field-error">{fieldErrors.fullName}</span>
            ) : null}
          </div>

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
              aria-invalid={Boolean(fieldErrors.email)}
            />
            {fieldErrors.email ? <span className="field-error">{fieldErrors.email}</span> : null}
          </div>

          <div className="field">
            <label htmlFor="senha">Senha</label>
            <input
              id="senha"
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
            ) : (
              <span className="field-hint">
                A senha fica guardada com segurança no Supabase Auth — nunca neste site.
              </span>
            )}
          </div>

          <div className="field">
            <label htmlFor="confirmar">Confirmar senha</label>
            <input
              id="confirmar"
              className="input"
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repita a senha"
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
                Criando conta…
              </>
            ) : (
              'Criar conta'
            )}
          </button>
        </form>

        <p className="auth-alt">
          Já tem conta? <Link to="/entrar">Entrar</Link>
        </p>
      </div>
    </div>
  )
}
