import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { LoadingScreen } from './LoadingScreen'

/**
 * Exige login. É apenas uma conveniência de navegação: quem protege os
 * dados de verdade é o banco (RLS), mesmo em chamadas diretas à API.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <LoadingScreen message="Verificando sua sessão…" />

  if (!user) {
    return (
      <Navigate
        to="/entrar"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    )
  }

  return <>{children}</>
}
