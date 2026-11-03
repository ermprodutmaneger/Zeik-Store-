import { ORDER_STATUS_LABELS, type OrderStatus } from '../types/database'

const VARIANT: Record<OrderStatus, string> = {
  pendente: 'badge-warning',
  confirmado: 'badge-cyan',
  em_preparo: 'badge-violet',
  a_caminho: 'badge-cyan',
  entregue: 'badge-success',
  cancelado: 'badge-danger',
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <span className={`badge ${VARIANT[status]}`}>{ORDER_STATUS_LABELS[status]}</span>
}
