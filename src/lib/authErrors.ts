import type { AuthError } from '@supabase/supabase-js'

/** Traduz erros do Supabase Auth para mensagens claras em português. */
export function translateAuthError(error: AuthError | Error | null | undefined): string {
  if (!error) return 'Algo deu errado. Tente novamente.'

  const code = 'code' in error ? (error.code ?? '') : ''
  const message = error.message ?? ''

  if (code === 'invalid_credentials' || /invalid login credentials/i.test(message)) {
    return 'E-mail ou senha incorretos. Verifique os dados e tente novamente.'
  }
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(message)) {
    return 'Seu e-mail ainda não foi confirmado. Verifique sua caixa de entrada ou reenvie a confirmação abaixo.'
  }
  if (code === 'user_already_exists' || /already registered/i.test(message)) {
    return 'Este e-mail já está cadastrado. Entre na sua conta ou recupere a senha.'
  }
  if (code === 'weak_password' || /at least 6 characters/i.test(message)) {
    return 'A senha deve ter pelo menos 6 caracteres.'
  }
  if (code === 'same_password' || /should be different from the old password/i.test(message)) {
    return 'A nova senha deve ser diferente da senha anterior.'
  }
  if (
    code === 'over_email_send_rate_limit' ||
    code === 'over_request_rate_limit' ||
    /rate limit|once every|too many/i.test(message)
  ) {
    return 'Muitas tentativas em pouco tempo. Aguarde alguns segundos e tente novamente.'
  }
  if (/invalid format/i.test(message) || /unable to validate email/i.test(message)) {
    return 'O e-mail informado não parece válido.'
  }
  if (/auth session missing|session.*expired|refresh token/i.test(message)) {
    return 'Sua sessão expirou. Solicite um novo link e tente novamente.'
  }
  if (/otp_expired|token has expired|link is invalid/i.test(message)) {
    return 'Este link expirou ou já foi usado. Solicite um novo.'
  }
  if (/failed to fetch|network/i.test(message)) {
    return 'Falha de conexão. Verifique sua internet e tente novamente.'
  }
  return message || 'Algo deu errado. Tente novamente.'
}
