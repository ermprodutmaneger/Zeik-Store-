import { requireSupabase } from '../lib/supabase'

export type BillingProvider = 'asaas' | 'mercadopago'
export type BillingMode = 'sandbox' | 'production'
export type PaymentStatus = 'pending' | 'overdue' | 'paid' | 'refund_pending' | 'refunded' | 'canceled' | 'review'
export type FiscalStatus = 'waiting' | 'required' | 'processing' | 'authorized' | 'error'

export interface BillingPlan {
  id: string
  name: string
  description: string
  monthly_cents: number
}

export interface BillingConfig {
  mode: BillingMode | null
  provider: BillingProvider | null
  pickup: string | null
  plans: BillingPlan[]
  legacyCheckout: boolean
}

export interface Charge {
  id: string
  orderId: string | null
  membershipId: string | null
  amountCents: number
  dueOn: string
  status: PaymentStatus
  hasPix: boolean
  paidAt: string | null
  fiscalStatus: FiscalStatus
  fiscalUrl: string | null
  fiscalKey: string | null
  canRefund: boolean
  mode: BillingMode
  provider: BillingProvider
}

export interface Pix {
  encodedImage: string
  payload: string
  expirationDate: string
  ticketUrl?: string | null
}

export interface Membership {
  id: string
  planId: string
  name: string
  monthlyCents: number
  ready: boolean
  canceledAt: string | null
  active: boolean
  until: string | null
  content: string | null
  payments: Charge[]
}

export const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  pending: 'Aguardando Pix',
  overdue: 'Em atraso',
  paid: 'Pix confirmado',
  refund_pending: 'Estorno solicitado',
  refunded: 'Estornado',
  canceled: 'Cancelado',
  review: 'Em análise',
}

export const FISCAL_LABELS: Record<FiscalStatus, string> = {
  waiting: 'Aguardando pagamento',
  required: 'Aguardando emissão',
  processing: 'Em processamento',
  authorized: 'Emitida',
  error: 'Requer revisão',
}

async function request<T>(body?: Record<string, unknown>): Promise<T> {
  const { data, error } = await requireSupabase().functions.invoke<T>('zeik-billing',
    body ? { body } : { method: 'GET' })
  if (error) {
    const response = 'context' in error ? error.context : null
    if (response instanceof Response) {
      const payload = await response.json().catch(() => null)
      if (typeof payload?.message === 'string') throw new Error(payload.message)
    }
    throw new Error('Não foi possível consultar a cobrança. Tente novamente.')
  }
  return data as T
}

export const getBillingConfig = () => request<BillingConfig>()
export const startPixOrder = (items: Array<{ product_id: string; quantity: number }>, key: string) =>
  request<{ orderId: string }>({ action: 'start-order', items, key })
export const getOrderCharge = (orderId: string) =>
  request<Charge>({ action: 'order', orderId })
export const createOrderPix = (orderId: string, document: string) =>
  request<Pix>({ action: 'order-pix', orderId, document })
export const getPix = (paymentId: string, document?: string) =>
  request<Pix>({ action: 'pix', paymentId, document })
export const getMemberships = () => request<Membership[]>({ action: 'overview' })
export const subscribeToPlan = (planId: string, document: string) =>
  request<{ membershipId: string }>({ action: 'subscribe', planId, document })
export const cancelMembership = (membershipId: string) =>
  request({ action: 'cancel-membership', membershipId })
export const getAdminCharges = () => request<Charge[]>({ action: 'admin-list' })
export const registerNfe = (paymentId: string, key: string) =>
  request({ action: 'register-nfe', paymentId, key })
export const refundPix = (paymentId: string) => request({ action: 'refund', paymentId })

export function formatBillingDate(date: string): string {
  return date.slice(0, 10).split('-').reverse().join('/')
}
