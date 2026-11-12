import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FlaskConical, Search, ShoppingBag } from 'lucide-react'
import { Alert } from '../../components/Alert'
import { EmptyState } from '../../components/EmptyState'
import { LoadingScreen } from '../../components/LoadingScreen'
import { OrderStatusBadge } from '../../components/OrderStatusBadge'
import { formatBRL, formatDateTime, shortId } from '../../lib/format'
import { listAllOrders, updateOrderStatus } from '../../services/orders'
import {
  ORDER_STATUS_LABELS,
  ORDER_STATUSES,
  type OrderStatus,
  type OrderWithCustomer,
} from '../../types/database'

type StatusFilter = 'todos' | OrderStatus

export function AdminOrdersPage() {
  const [orders, setOrders] = useState<OrderWithCustomer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos')
  const [search, setSearch] = useState('')
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    listAllOrders()
      .then((data) => {
        if (active) setOrders(data)
      })
      .catch(() => {
        if (active) setError('Não foi possível carregar os pedidos.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return orders.filter((order) => {
      if (statusFilter !== 'todos' && order.status !== statusFilter) return false
      if (!term) return true
      return (
        order.id.toLowerCase().includes(term) ||
        shortId(order.id).includes(term.toUpperCase()) ||
        (order.profiles?.full_name.toLowerCase().includes(term) ?? false) ||
        (order.profiles?.email.toLowerCase().includes(term) ?? false)
      )
    })
  }, [orders, statusFilter, search])

  async function handleStatusChange(order: OrderWithCustomer, next: OrderStatus) {
    const previous = order.status
    setUpdatingId(order.id)
    setError(null)
    setSavedMessage(null)
    setOrders((current) =>
      current.map((o) => (o.id === order.id ? { ...o, status: next } : o)),
    )
    try {
      await updateOrderStatus(order.id, next)
      setSavedMessage(
        `Pedido #${shortId(order.id)} atualizado para “${ORDER_STATUS_LABELS[next]}”.`,
      )
    } catch (err) {
      setOrders((current) =>
        current.map((o) => (o.id === order.id ? { ...o, status: previous } : o)),
      )
      setError(err instanceof Error ? err.message : `Não foi possível atualizar o pedido #${shortId(order.id)}.`)
    } finally {
      setUpdatingId(null)
    }
  }

  if (loading) return <LoadingScreen message="Carregando pedidos…" />

  return (
    <div>
      {error ? <Alert variant="error">{error}</Alert> : null}
      {savedMessage ? <Alert variant="success">{savedMessage}</Alert> : null}

      <div className="catalog-toolbar">
        <div className="toolbar-search input-with-icon">
          <Search size={18} aria-hidden />
          <label className="sr-only" htmlFor="busca-pedidos">
            Buscar pedido
          </label>
          <input
            id="busca-pedidos"
            className="input"
            type="search"
            placeholder="Buscar por cliente, e-mail ou número…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="toolbar-sort">
          <label className="sr-only" htmlFor="filtro-status">
            Filtrar por andamento
          </label>
          <select
            id="filtro-status"
            className="select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          >
            <option value="todos">Todos os andamentos</option>
            {ORDER_STATUSES.map((status) => (
              <option key={status} value={status}>
                {ORDER_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<ShoppingBag size={30} />}
          title={orders.length === 0 ? 'Nenhum pedido ainda' : 'Nenhum pedido encontrado'}
          description={
            orders.length === 0
              ? 'Quando um cliente finalizar o carrinho, o pedido aparece aqui com os itens e o total calculados pelo banco.'
              : 'Nenhum pedido combina com a busca ou o andamento escolhido.'
          }
        />
      ) : (
        filtered.map((order) => (
          <article key={order.id} className="order-card animate-in">
            <div className="order-head">
              <strong>Pedido #{shortId(order.id)}</strong>
              <OrderStatusBadge status={order.status} />
            </div>
            <div className="order-meta">
              <span>
                {order.profiles?.full_name || 'Cliente'}
                {order.profiles?.email ? ` · ${order.profiles.email}` : ''}
              </span>
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

            <div
              style={{
                marginTop: 16,
                display: 'flex',
                gap: 10,
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <label
                htmlFor={`status-${order.id}`}
                style={{ fontWeight: 600, fontSize: '0.9rem' }}
              >
                Andamento:
              </label>
              <select
                id={`status-${order.id}`}
                className="select"
                style={{ width: 'auto', minWidth: 200 }}
                value={order.status}
                disabled={updatingId === order.id || order.status === 'cancelado' || order.status === 'entregue' ||
                  (Boolean(order.billing_mode) && order.status === 'pendente')}
                onChange={(e) =>
                  void handleStatusChange(order, e.target.value as OrderStatus)
                }
              >
                {ORDER_STATUSES.filter((status) => !order.billing_mode ||
                  status === order.status || ['em_preparo', 'entregue'].includes(status)).map((status) => (
                  <option key={status} value={status}>
                    {ORDER_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
              {order.billing_mode ? <Link to="/admin/cobrancas" className="btn btn-outline btn-sm">Ver cobranças</Link> : null}
              {updatingId === order.id ? (
                <span className="small muted">Salvando…</span>
              ) : null}
            </div>
          </article>
        ))
      )}
    </div>
  )
}
