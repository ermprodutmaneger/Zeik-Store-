import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CircleDollarSign,
  Package,
  PackageCheck,
  PackageMinus,
  Pencil,
  ShoppingBag,
  Timer,
} from 'lucide-react'
import { Alert } from '../../components/Alert'
import { LoadingScreen } from '../../components/LoadingScreen'
import { OrderStatusBadge } from '../../components/OrderStatusBadge'
import { formatBRL, formatDateTime, shortId } from '../../lib/format'
import { getCatalogStats, type CatalogStats } from '../../services/catalog'
import { getOrderStats, listAllOrders, type OrderStats } from '../../services/orders'
import type { OrderWithCustomer } from '../../types/database'

export function AdminDashboardPage() {
  const [catalogStats, setCatalogStats] = useState<CatalogStats | null>(null)
  const [orderStats, setOrderStats] = useState<OrderStats | null>(null)
  const [recentOrders, setRecentOrders] = useState<OrderWithCustomer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    Promise.all([getCatalogStats(), getOrderStats(), listAllOrders()])
      .then(([catalog, orders, allOrders]) => {
        if (!active) return
        setCatalogStats(catalog)
        setOrderStats(orders)
        setRecentOrders(allOrders.slice(0, 5))
      })
      .catch(() => {
        if (active) {
          setError(
            'Não foi possível carregar os dados do painel. Confirme que o schema foi executado e que sua conta é administradora.',
          )
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  if (loading) return <LoadingScreen message="Carregando o painel…" />
  if (error) return <Alert variant="error">{error}</Alert>
  if (!catalogStats || !orderStats) return null

  const stats = [
    {
      icon: <Package size={20} aria-hidden />,
      value: String(catalogStats.totalProducts),
      label: 'Produtos cadastrados',
    },
    {
      icon: <PackageCheck size={20} aria-hidden />,
      value: String(catalogStats.activeProducts),
      label: 'Produtos ativos na vitrine',
    },
    {
      icon: <PackageMinus size={20} aria-hidden />,
      value: String(catalogStats.lowStockProducts.length),
      label: 'Com estoque baixo (até 5)',
    },
    {
      icon: <ShoppingBag size={20} aria-hidden />,
      value: String(orderStats.totalOrders),
      label: 'Pedidos de teste recebidos',
    },
    {
      icon: <Timer size={20} aria-hidden />,
      value: String(orderStats.pendingOrders),
      label: 'Pedidos pendentes',
    },
    {
      icon: <CircleDollarSign size={20} aria-hidden />,
      value: formatBRL(orderStats.totalCents),
      label: 'Total em pedidos de teste (sem cobrança)',
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <section className="stat-grid" aria-label="Resumo da loja">
        {stats.map((stat) => (
          <div key={stat.label} className="stat-card animate-in">
            <div className="stat-icon">{stat.icon}</div>
            <p className="stat-value">{stat.value}</p>
            <p className="stat-label">{stat.label}</p>
          </div>
        ))}
      </section>

      {catalogStats.lowStockProducts.length > 0 ? (
        <section className="card">
          <h2 style={{ fontSize: '1.1rem', marginBottom: 12 }}>Estoque baixo</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {catalogStats.lowStockProducts.map((product) => (
              <div
                key={product.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  justifyContent: 'space-between',
                }}
              >
                <span>
                  {product.name}{' '}
                  <span className={`badge ${product.stock === 0 ? 'badge-danger' : 'badge-warning'}`}>
                    {product.stock === 0 ? 'Esgotado' : `${product.stock} un.`}
                  </span>
                </span>
                <Link
                  to={`/admin/produtos/${product.id}/editar`}
                  className="btn btn-ghost btn-sm"
                >
                  <Pencil size={15} aria-hidden />
                  Ajustar
                </Link>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="card">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            marginBottom: 12,
          }}
        >
          <h2 style={{ fontSize: '1.1rem' }}>Pedidos recentes</h2>
          <Link to="/admin/pedidos" className="btn btn-ghost btn-sm">
            Ver todos
          </Link>
        </div>
        {recentOrders.length === 0 ? (
          <p className="muted small">
            Nenhum pedido de teste ainda. Finalize um carrinho como cliente para ver
            o fluxo completo.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {recentOrders.map((order) => (
              <div
                key={order.id}
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '6px 14px',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span>
                  <strong>#{shortId(order.id)}</strong>{' '}
                  <span className="muted small">
                    {order.profiles?.full_name || order.profiles?.email || 'Cliente'} ·{' '}
                    {formatDateTime(order.created_at)}
                  </span>
                </span>
                <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <strong>{formatBRL(order.total_cents)}</strong>
                  <OrderStatusBadge status={order.status} />
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
