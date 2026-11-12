import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CheckCircle2, PackageSearch } from 'lucide-react'
import { Alert } from '../components/Alert'
import { EmptyState } from '../components/EmptyState'
import { LoadingScreen } from '../components/LoadingScreen'
import { OrderPixPanel } from '../components/OrderPixPanel'
import { OrderStatusBadge } from '../components/OrderStatusBadge'
import { formatBRL, formatDateTime, shortId } from '../lib/format'
import { getOrderById } from '../services/orders'
import type { OrderWithItems } from '../types/database'

export function OrderSuccessPage() {
  const { id } = useParams<{ id: string }>()
  const [order, setOrder] = useState<OrderWithItems | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    if (!id) return
    getOrderById(id)
      .then((data) => {
        if (active) setOrder(data)
      })
      .catch(() => {
        if (active) setError('Não foi possível carregar os detalhes do pedido.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [id])

  if (loading) return <LoadingScreen message="Carregando seu pedido…" />

  if (error || !order) {
    return (
      <div className="container page">
        {error ? <Alert variant="error">{error}</Alert> : null}
        <EmptyState
          icon={<PackageSearch size={30} />}
          title="Pedido não encontrado"
          description="Ele pode não existir ou pertencer a outra conta. Confira seus pedidos em Minha conta."
          action={
            <Link to="/conta" className="btn btn-primary">
              Ir para Minha conta
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div className="container page">
      <div className="success-wrap animate-in">
        {!order.billing_mode ? <div className="success-icon"><CheckCircle2 size={44} aria-hidden /></div> : null}
        <h1 className="page-title">{order.billing_mode ? 'Pedido Pix' : 'Pedido de teste registrado!'}</h1>
        <p className="page-subtitle">
          Pedido <strong>#{shortId(order.id)}</strong> · {formatDateTime(order.created_at)}{' '}
          {order.billing_mode ? null : <>· <OrderStatusBadge status={order.status} /></>}
        </p>

        <div className="card" style={{ marginTop: 26, textAlign: 'left' }}>
          <h2 style={{ fontSize: '1.05rem', marginBottom: 8 }}>Itens do pedido</h2>
          <div className="order-items-list" style={{ borderTop: 'none', paddingTop: 4 }}>
            {order.order_items.map((item) => (
              <div key={item.id} className="order-line">
                <span className="qty-name">
                  {item.quantity} × {item.product_name}
                </span>
                <strong>{formatBRL(item.subtotal_cents)}</strong>
              </div>
            ))}
          </div>
          <div className="summary-row total">
            <span>{order.billing_mode ? 'Total do pedido' : 'Total (sem cobrança)'}</span>
            <span>{formatBRL(order.total_cents)}</span>
          </div>
        </div>

        {order.billing_mode ? (
          <div style={{ marginTop: 16 }}>
            <OrderPixPanel key={order.id} orderId={order.id} pickup={order.pickup_instructions} />
          </div>
        ) : (
          <div className="test-order-note" style={{ textAlign: 'left' }}>
            <CheckCircle2 size={18} aria-hidden />
            <p>O estoque foi atualizado e o pedido ficou salvo em Minha conta.</p>
          </div>
        )}

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            justifyContent: 'center',
            marginTop: 24,
          }}
        >
          <Link to="/conta" className="btn btn-primary">
            Ver meus pedidos
          </Link>
          <Link to="/" className="btn btn-outline">
            Continuar comprando
          </Link>
        </div>
      </div>
    </div>
  )
}
