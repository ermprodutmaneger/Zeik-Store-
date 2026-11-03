import type { ReactNode } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { EmptyState } from './EmptyState'
import { LoadingScreen } from './LoadingScreen'

/**
 * Exige papel 'admin' vindo da tabela user_roles do banco. A interface só
 * esconde o painel; o RLS é quem impede clientes de ler/gravar dados de gestão.
 */
export function AdminRoute({ children }: { children: ReactNode }) {
  const { user, isAdmin, loading } = useAuth()
  const location = useLocation()

  if (loading) return <LoadingScreen message="Verificando permissões…" />

  if (!user) {
    return (
      <Navigate
        to="/entrar"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    )
  }

  if (!isAdmin) {
    return (
      <div className="container page">
        <EmptyState
          icon={<ShieldAlert size={30} />}
          title="Área do administrador"
          description="Sua conta não tem permissão para gerenciar a loja. Se você é o administrador, promova sua conta pelo procedimento em supabase/admin.sql e entre novamente."
          action={
            <Link to="/" className="btn btn-primary">
              Voltar para a loja
            </Link>
          }
        />
      </div>
    )
  }

  return <>{children}</>
}
