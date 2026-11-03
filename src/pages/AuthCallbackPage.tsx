import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { EmailOtpType } from '@supabase/supabase-js'
import { TriangleAlert } from 'lucide-react'
import { LoadingScreen } from '../components/LoadingScreen'
import { requireSupabase } from '../lib/supabase'

/**
 * Rota /auth/callback — destino do link de confirmação de e-mail.
 * Aceita os formatos que o Supabase pode enviar (code PKCE, token_hash ou
 * tokens no hash processados pelo cliente) e trata links expirados.
 * Autorize esta URL em Authentication → URL Configuration no painel.
 */
/** Lê um eventual erro presente já na URL do link (ex.: link expirado). */
function readInitialLinkError(): string | null {
  const query = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const code = query.get('error_code') ?? hash.get('error_code')
  const description =
    query.get('error_description') ??
    hash.get('error_description') ??
    query.get('error') ??
    hash.get('error')
  if (!code && !description) return null
  return code === 'otp_expired'
    ? 'Este link de confirmação expirou ou já foi usado. Entre na loja e peça um novo e-mail de confirmação.'
    : 'Não foi possível validar este link. Peça um novo e-mail de confirmação na tela de entrada.'
}

export function AuthCallbackPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(readInitialLinkError)
  const handledRef = useRef(false)

  useEffect(() => {
    // Se o próprio link já chegou com erro, só mostramos a mensagem.
    if (error) return
    if (handledRef.current) return
    handledRef.current = true

    const supabase = requireSupabase()
    const query = new URLSearchParams(window.location.search)

    let active = true

    const goToAccount = () => {
      if (!active) return
      navigate('/conta', {
        replace: true,
        state: { notice: 'E-mail confirmado! Bem-vindo(a) à Zeik Store.' },
      })
    }

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) goToAccount()
    })

    async function finishFromLink() {
      const tokenHash = query.get('token_hash')
      const type = query.get('type') as EmailOtpType | null
      const code = query.get('code')

      try {
        if (tokenHash && type) {
          const { error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type,
          })
          if (verifyError) throw verifyError
        } else if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          if (exchangeError) {
            // A troca pode já ter sido feita automaticamente pelo cliente.
            const { data } = await supabase.auth.getSession()
            if (!data.session) throw exchangeError
          }
        }
        const { data } = await supabase.auth.getSession()
        if (data.session) {
          goToAccount()
          return
        }
        // Tokens no hash (fluxo implícito): o cliente processa sozinho e o
        // onAuthStateChange acima redireciona. Damos um tempo antes de desistir.
        window.setTimeout(async () => {
          if (!active) return
          const { data: later } = await supabase.auth.getSession()
          if (later.session) {
            goToAccount()
          } else if (active) {
            setError(
              'Não conseguimos concluir a confirmação. O link pode ter expirado — entre na loja e peça um novo e-mail.',
            )
          }
        }, 2500)
      } catch {
        if (active) {
          setError(
            'Não conseguimos concluir a confirmação. O link pode ter expirado ou já ter sido usado — peça um novo e-mail na tela de entrada.',
          )
        }
      }
    }

    void finishFromLink()

    return () => {
      active = false
      listener.subscription.unsubscribe()
    }
  }, [navigate, error])

  if (error) {
    return (
      <div className="container auth-wrap">
        <div className="card auth-card animate-in" style={{ textAlign: 'center' }}>
          <div
            className="success-icon"
            style={{ background: 'var(--danger-bg)', color: 'var(--danger)', marginBottom: 14 }}
          >
            <TriangleAlert size={42} aria-hidden />
          </div>
          <h1>Confirmação não concluída</h1>
          <p className="muted" style={{ margin: '10px 0 20px' }}>
            {error}
          </p>
          <Link to="/entrar" className="btn btn-primary btn-block">
            Ir para Entrar
          </Link>
          <Link to="/" className="btn btn-ghost btn-block" style={{ marginTop: 8 }}>
            Voltar para a loja
          </Link>
        </div>
      </div>
    )
  }

  return <LoadingScreen message="Confirmando seu e-mail…" />
}
