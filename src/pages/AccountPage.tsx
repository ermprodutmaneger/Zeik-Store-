import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  ClipboardList,
  FlaskConical,
  LayoutDashboard,
  LogOut,
  Save,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import { Alert } from '../components/Alert'
import { EmptyState } from '../components/EmptyState'
import { LoadingScreen } from '../components/LoadingScreen'
import { OrderStatusBadge } from '../components/OrderStatusBadge'
import { useAuth } from '../hooks/useAuth'
import { formatBRL, formatDateTime, shortId } from '../lib/format'
import { listMyOrders } from '../services/orders'
import { updateMyName } from '../services/profile'
import type { OrderWithItems } from '../types/database'

export function AccountPage() {
  const { user, profile, isAdmin, signOut, refreshProfile } = useAuth()
  const userId = user?.id
  const location = useLocation()
  const navigate = useNavigate()

  const [notice] = useState<string | null>(() => {
    const state = location.state as { notice?: string } | null
    return state?.notice ?? null
  })
  const [name, setName] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const [nameSaved, setNameSaved] = useState(false)

  const [orders, setOrders] = useState<OrderWithItems[]>([])
  const [ordersLoading, setOrdersLoading] = useState(true)
  const [ordersError, setOrdersError] = useState<string | null>(null)

  // Limpa o aviso vindo de outra página para não repetir em recarregamentos.
  useEffect(() => {
    if (notice) {
      navigate(location.pathname, { replace: true, state: {} })
    }
    // Só na montagem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Preenche o campo quando o perfil carrega (ajuste de estado na renderização,
  // padrão recomendado em vez de sincronizar via efeito).
  const [syncedProfileId, setSyncedProfileId] = useState<string | null>(null)
  if (profile && syncedProfileId !== profile.id) {
    setSyncedProfileId(profile.id)
    setName(profile.full_name)
  }

  useEffect(() => {
    if (!userId) return
    let active = true
    listMyOrders(userId)
      .then((data) => {
        if (active) setOrders(data)
      })
      .catch(() => {
        if (active) setOrdersError('Não foi possível carregar seus pedidos agora.')
      })
      .finally(() => {
        if (active) setOrdersLoading(false)
      })
    return () => {
      active = false
    }
  }, [userId])

  async function handleSaveName(event: FormEvent) {
    event.preventDefault()
    if (!user) return
    if (name.trim().length < 2) {
      setNameError('O nome deve ter pelo menos 2 caracteres.')
      return
    }
    setSavingName(true)
    setNameError(null)
    setNameSaved(false)
    try {
      await updateMyName(user.id, name)
      await refreshProfile()
      setNameSaved(true)
    } catch {
      setNameError('Não foi possível salvar o nome. Tente novamente.')
    } finally {
      setSavingName(false)
    }
  }

  async function handleSignOut() {
    await signOut()
    navigate('/')
  }

  const displayName = profile?.full_name?.trim() || 'Cliente Zeik'

  return (
    <div className="container page">
      <h1 className="page-title">Olá, {displayName.split(' ')[0]}!</h1>
      <p className="page-subtitle" style={{ marginBottom: 22 }}>
        Gerencie seus dados e acompanhe seus pedidos.
      </p>

      {notice ? <Alert variant="success">{notice}</Alert> : null}

      <div className="account-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <section className="card animate-in" aria-labelledby="perfil-titulo">
            <h2
              id="perfil-titulo"
              style={{ fontSize: '1.1rem', display: 'flex', gap: 8, alignItems: 'center' }}
            >
              <UserRound size={19} aria-hidden />
              Meu perfil
            </h2>

            <div style={{ margin: '14px 0', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {isAdmin ? (
                <span className="badge badge-violet">
                  <ShieldCheck size={13} aria-hidden />
                  Administrador da loja
                </span>
              ) : (
                <span className="badge badge-cyan">Cliente</span>
              )}
              {profile ? (
                <span className="badge badge-neutral">
                  Desde {formatDateTime(profile.created_at)}
                </span>
              ) : null}
            </div>

            <form onSubmit={handleSaveName}>
              <div className="field">
                <label htmlFor="nome">Nome de exibição</label>
                <input
                  id="nome"
                  className="input"
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Seu nome"
                  aria-invalid={Boolean(nameError)}
                />
                {nameError ? <span className="field-error">{nameError}</span> : null}
              </div>
              <div className="field">
                <label htmlFor="email">E-mail</label>
                <input
                  id="email"
                  className="input"
                  type="email"
                  value={user?.email ?? profile?.email ?? ''}
                  readOnly
                  aria-readonly="true"
                />
                <span className="field-hint">
                  O e-mail é o seu login e não pode ser alterado nesta versão de testes.
                </span>
              </div>
              {nameSaved ? <Alert variant="success">Nome atualizado!</Alert> : null}
              <button type="submit" className="btn btn-primary btn-block" disabled={savingName}>
                {savingName ? (
                  <>
                    <span className="spinner" aria-hidden />
                    Salvando…
                  </>
                ) : (
                  <>
                    <Save size={17} aria-hidden />
                    Salvar nome
                  </>
                )}
              </button>
            </form>
          </section>

          {isAdmin ? (
            <section className="card animate-in">
              <h2 style={{ fontSize: '1.1rem', marginBottom: 8 }}>Área do administrador</h2>
              <p className="muted small" style={{ marginBottom: 14 }}>
                Sua conta pode cadastrar produtos, enviar fotos, controlar o
                estoque e acompanhar os pedidos da loja.
              </p>
              <Link to="/admin" className="btn btn-primary btn-block">
                <LayoutDashboard size={18} aria-hidden />
                Abrir o painel
              </Link>
            </section>
          ) : null}

          <Link className="btn btn-outline" to="/mensalidades">Minhas mensalidades</Link>
          <button type="button" className="btn btn-outline" onClick={handleSignOut}>
            <LogOut size={17} aria-hidden />
            Sair da conta
          </button>
        </div>

        <section aria-labelledby="pedidos-titulo">
          <h2
            id="pedidos-titulo"
            style={{
              fontSize: '1.25rem',
              marginBottom: 14,
              display: 'flex',
              gap: 8,
              alignItems: 'center',
            }}
          >
            <ClipboardList size={21} aria-hidden />
            Meus pedidos
          </h2>

          {ordersLoading ? (
            <LoadingScreen message="Carregando seus pedidos…" />
          ) : ordersError ? (
            <Alert variant="error">{ordersError}</Alert>
          ) : orders.length === 0 ? (
            <EmptyState
              icon={<ClipboardList size={30} />}
              title="Nenhum pedido ainda"
              description="Seus pedidos aparecem aqui depois de finalizar o carrinho."
              action={
                <Link to="/" className="btn btn-primary">
                  Ver produtos
                </Link>
              }
            />
          ) : (
            orders.map((order) => (
              <article key={order.id} className="order-card animate-in">
                <div className="order-head">
                  <strong>Pedido #{shortId(order.id)}</strong>
                  <OrderStatusBadge status={order.status} />
                </div>
                <div className="order-meta">
                  <span>{formatDateTime(order.created_at)}</span>
                  {order.is_test_order ? <span className="badge badge-warning">
                    <FlaskConical size={12} aria-hidden /> Teste
                  </span> : null}
                  <span>
                    Total: <strong>{formatBRL(order.total_cents)}</strong>
                  </span>
                </div>
                <div className="order-items-list">
                  {order.order_items.map((item) => (
                    <div key={item.id} className="order-line">
                      <span className="qty-name">
                        {item.quantity} × {item.product_name} ({formatBRL(item.unit_price_cents)}{' '}
                        cada)
                      </span>
                      <span>{formatBRL(item.subtotal_cents)}</span>
                    </div>
                  ))}
                </div>
                <Link className="btn btn-outline btn-sm" style={{ marginTop: 12 }} to={`/pedido-concluido/${order.id}`}>
                  {order.billing_mode ? 'Ver pedido e Pix' : 'Ver pedido'}
                </Link>
              </article>
            ))
          )}
        </section>
      </div>
    </div>
  )
}
