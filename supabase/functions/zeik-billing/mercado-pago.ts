import type { SupabaseClient, User } from 'npm:@supabase/supabase-js@2.118.0'
import { type Mode, RequestError, saoPauloToday } from './asaas.ts'
import {
  BillingStore, checked, type EventRow, type Payment, parseDocument, type Status, UUID,
} from './billing.ts'

interface MercadoPagoConfig {
  mode: Mode
  accessToken: string
  webhookSecret: string
  pickup: string
}

interface MpPayment {
  status: string
  status_detail?: string
  amount: string
  payment_method?: {
    id?: string
    type?: string
    ticket_url?: string
    qr_code?: string
    qr_code_base64?: string
  }
}

interface MpOrder {
  id: string
  type: string
  country_code?: string
  external_reference?: string
  total_amount: string
  status: string
  status_detail?: string
  transactions?: { payments?: MpPayment[] }
}

export class MercadoPagoError extends Error {
  constructor(readonly status: number) {
    super(`Mercado Pago HTTP ${status}`)
  }
}

export function readMercadoPagoConfig(): MercadoPagoConfig | null {
  const value = Deno.env.get('MERCADO_PAGO_MODE')
  const mode = value === 'production' ? 'production' : value === 'sandbox' ? 'sandbox' : null
  const accessToken = Deno.env.get('MERCADO_PAGO_ACCESS_TOKEN')?.trim()
  const webhookSecret = Deno.env.get('MERCADO_PAGO_WEBHOOK_SECRET')?.trim()
  const pickup = Deno.env.get('BILLING_PICKUP_DETAILS')?.trim()
    || (mode === 'sandbox' ? 'Retirada simulada para testar o checkout.' : '')
  if (!mode || !accessToken || !webhookSecret || accessToken === webhookSecret) return null
  return { mode, accessToken, webhookSecret, pickup }
}

const orderIdPattern = /^ORD[A-Z0-9]{8,70}$/

export async function authenticateMpWebhook(request: Request, secret: string): Promise<string | null> {
  const id = new URL(request.url).searchParams.get('data.id')
  const requestId = request.headers.get('x-request-id')
  if (!id || !orderIdPattern.test(id.toUpperCase()) || !requestId || !/^[a-zA-Z0-9-]{1,128}$/.test(requestId)) return null

  const parts = new Map(request.headers.get('x-signature')?.split(',').map((pair) => {
    const [name, value] = pair.trim().split('=')
    return [name, value] as const
  }))
  const ts = parts.get('ts')
  const hash = parts.get('v1')
  if (!ts || !/^\d{10,13}$/.test(ts) || !hash || !/^[0-9a-f]{64}$/i.test(hash)) return null
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
  const signature = Uint8Array.from(hash.match(/../g)!, (part) => parseInt(part, 16))
  const manifest = `id:${id.toLowerCase()};request-id:${requestId};ts:${ts};`
  return await crypto.subtle.verify('HMAC', key, signature, encoder.encode(manifest)) ? id.toUpperCase() : null
}

function getPayment(order: MpOrder) {
  const payments = order.transactions?.payments
  return payments?.length === 1 ? payments[0] : undefined
}

function toCents(value: string) {
  if (typeof value !== 'string' || !/^\d{1,13}(\.\d{1,2})?$/.test(value)) return NaN
  const [whole, fractional = ''] = value.split('.')
  const amount = Number(whole) * 100 + Number(fractional.padEnd(2, '0'))
  return Number.isSafeInteger(amount) ? amount : NaN
}

export function mpPaymentStatus(order: MpOrder): Status {
  const payment = getPayment(order)
  if (order.status === 'refunded' || (payment?.status === 'refunded' && order.status_detail !== 'partially_refunded')) return 'refunded'
  if (order.status_detail === 'partially_refunded' || payment?.status_detail === 'partially_refunded') return 'review'
  if (order.status === 'processed' && order.status_detail === 'accredited' &&
    payment?.status === 'processed' && payment.status_detail === 'accredited') return 'paid'
  if (['canceled', 'expired', 'failed'].includes(order.status)) return 'canceled'
  if (['created', 'processing', 'action_required', 'pending'].includes(order.status)) return 'pending'
  return 'review'
}

function ticketFor(order: MpOrder): URL | null {
  try {
    const url = new URL(getPayment(order)?.payment_method?.ticket_url ?? '')
    return url.protocol === 'https:' &&
      ['mercadopago.com.br', 'www.mercadopago.com.br', 'mercadopago.com', 'www.mercadopago.com'].includes(url.hostname)
      ? url : null
  } catch {
    return null
  }
}

export class MercadoPagoBilling extends BillingStore {
  constructor(db: SupabaseClient, readonly config: MercadoPagoConfig) {
    super(db, config.mode, config.pickup, 'mercadopago')
  }

  private async api<T>(path: string, method = 'GET', key?: string, body?: object): Promise<T> {
    let response: Response
    try {
      response = await fetch(`https://api.mercadopago.com/v1/orders${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
          'Content-Type': 'application/json',
          ...(key ? { 'X-Idempotency-Key': key } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(8000),
        redirect: 'error',
      })
    } catch {
      throw new MercadoPagoError(503)
    }
    if (!response.ok) {
      await response.body?.cancel()
      throw new MercadoPagoError(response.status)
    }
    return await response.json() as T
  }

  private async loadOrder(id: string) {
    if (!orderIdPattern.test(id)) throw new RequestError(400, 'Order do Mercado Pago inválida.')
    return await this.api<MpOrder>(`/${id}`)
  }

  private async saveOrder(order: MpOrder, known?: Payment, override?: Status) {
    const attempt = order.external_reference
    if (!attempt || !UUID.test(attempt) || !orderIdPattern.test(order.id)) return null
    const charge = known ?? checked(await this.db.from('billing_payments').select('*')
      .eq('gateway', this.provider).eq('mode', this.mode).eq('attempt_key', attempt)
      .maybeSingle<Payment>())
    if (!charge || charge.attempt_key !== attempt) return null

    const payment = getPayment(order)
    const amount = toCents(order.total_amount)
    if (order.type !== 'online' || (order.country_code && order.country_code !== 'BRA') ||
      amount !== charge.amount_cents || (charge.provider_id && charge.provider_id !== order.id) ||
      (payment && (payment.payment_method?.id !== 'pix' ||
        payment.payment_method.type !== 'bank_transfer' || toCents(payment.amount) !== amount))) {
      throw new RequestError(409, 'Os dados da order divergem da cobrança da loja.')
    }

    const ticket = ticketFor(order)
    if (ticket && ticket.pathname.startsWith('/sandbox/') !== (this.mode === 'sandbox')) {
      throw new RequestError(409, 'O ambiente da order não corresponde à configuração do Mercado Pago.')
    }
    if (this.mode === 'sandbox' && !ticket && !charge.provider_id) {
      // Antes de vincular uma cobrança de teste, confirme a URL do ambiente Sandbox.
      throw new RequestError(409, 'A order de teste ainda não disponibilizou a confirmação do Sandbox.')
    }

    return checked(await this.db.rpc('billing_mp_record', {
      p_mode: this.mode, p_attempt: attempt, p_provider_id: order.id, p_amount: amount,
      p_status: override ?? mpPaymentStatus(order),
    }).single<Payment>())
  }

  private async pix(charge: Payment, user: User, document: unknown) {
    if (!['pending', 'overdue'].includes(charge.status) ||
      (charge.order_id && charge.due_on < saoPauloToday())) {
      throw new RequestError(409, 'Este Pix não está disponível.')
    }

    let order: MpOrder
    if (charge.provider_id) {
      order = await this.loadOrder(charge.provider_id)
    } else {
      const amount = (charge.amount_cents / 100).toFixed(2)
      const payer = this.mode === 'sandbox'
        ? { email: 'test_payer@example.com', first_name: 'APRO' }
        : this.payer(user, document)
      checked(await this.db.from('billing_payments').update({ creation_started_at: new Date().toISOString() })
        .eq('id', charge.id).eq('attempt_key', charge.attempt_key).is('creation_started_at', null))
      order = await this.api<MpOrder>('', 'POST', charge.attempt_key, {
        type: 'online', processing_mode: 'automatic', external_reference: charge.attempt_key,
        total_amount: amount, payer, transactions: {
          payments: [{ amount, payment_method: { id: 'pix', type: 'bank_transfer' } }],
        },
      })
    }

    const updated = await this.saveOrder(order, charge)
    const method = getPayment(order)?.payment_method
    if (!updated || !['pending', 'overdue'].includes(updated.status) ||
      updated.attempt_key !== charge.attempt_key || !method?.qr_code) {
      return { encodedImage: '', payload: '', expirationDate: '', ticketUrl: null }
    }
    return {
      encodedImage: method.qr_code_base64 ?? '', payload: method.qr_code,
      expirationDate: '', ticketUrl: ticketFor(order)?.href ?? null,
    }
  }

  private payer(user: User, document: unknown) {
    if (!user.email) throw new RequestError(409, 'Confirme seu e-mail para gerar o Pix.')
    const number = parseDocument(document)
    return { email: user.email, identification: { type: number.length === 11 ? 'CPF' : 'CNPJ', number } }
  }

  override async order(user: User, orderId: string) {
    const summary = await super.order(user, orderId)
    if (this.mode !== 'sandbox' || summary.provider !== this.provider || summary.status !== 'pending' ||
      !summary.hasPix) return summary
    const charge = await this.findPayment(summary.id)
    const before = new Date(Date.now() - 10_000).toISOString()
    if (!charge?.provider_id || (charge.checked_at && charge.checked_at >= before)) return summary
    const refreshed = checked(await this.db.from('billing_payments')
      .update({ checked_at: new Date().toISOString() }).eq('id', charge.id)
      .or(`checked_at.is.null,checked_at.lt.${before}`).select('id').maybeSingle())
    if (!refreshed) return summary
    await this.syncPayment(charge)
    return await super.order(user, orderId)
  }

  async createOrderPix(user: User, orderId: string, document: unknown) {
    const summary = await super.order(user, orderId)
    const payment = await this.findPayment(summary.id)
    if (!payment) throw new RequestError(404, 'Cobrança não encontrada.')
    return await this.pix(payment, user, document)
  }

  async customerPix(user: User, id: string, document?: unknown) {
    const payment = await this.findPayment(id)
    if (!payment) throw new RequestError(404, 'Cobrança não encontrada.')
    if (payment.membership_id) {
      const membership = await this.findMembership(payment.membership_id)
      if (membership?.user_id !== user.id || membership.canceled_at) {
        throw new RequestError(404, 'Mensalidade não encontrada.')
      }
    } else if (payment.order_id) {
      await this.order(user, payment.order_id)
    }
    return await this.pix(payment, user, document)
  }

  override async memberOverview(user: User) {
    checked(await this.db.rpc('billing_mp_renewals', { p_mode: this.mode, p_user: user.id }))
    return await super.memberOverview(user)
  }

  async subscribe(user: User, planId: string, _document?: unknown) {
    const result = await this.db.rpc('billing_create_mp_membership', { p_user: user.id, p_plan: planId, p_mode: this.mode })
    if (result.error?.code === 'P0001') throw new RequestError(409, result.error.message)
    return { membershipId: checked(result) as string }
  }

  async cancelMembership(user: User, id: string) {
    const membership = await this.findMembership(id)
    if (!membership || membership.user_id !== user.id) throw new RequestError(404, 'Mensalidade não encontrada.')
    checked(await this.db.from('billing_memberships').update({ canceled_at: new Date().toISOString() })
      .eq('id', id).eq('user_id', user.id).is('canceled_at', null))
  }

  async refund(id: string) {
    const payment = await this.findPayment(id)
    if (!payment?.provider_id || payment.status !== 'paid') {
      throw new RequestError(409, 'A cobrança precisa estar paga para solicitar estorno.')
    }
    const order = await this.loadOrder(payment.provider_id)
    const current = await this.saveOrder(order, payment)
    if (current?.status !== 'paid') throw new RequestError(409, 'A cobrança mudou de estado.')
    const started = checked(await this.db.from('billing_payments')
      .update({ refund_requested_at: new Date().toISOString() }).eq('id', id)
      .eq('status', 'paid').is('refund_requested_at', null).select('id').maybeSingle())
    if (!started) throw new RequestError(409, 'Já existe uma solicitação de estorno para esta cobrança.')
    try {
      await this.api(`/${order.id}/refund`, 'POST', `${payment.attempt_key}-refund`, {})
    } catch (error) {
      if (error instanceof MercadoPagoError && [400, 401, 403, 422].includes(error.status)) {
        checked(await this.db.from('billing_payments').update({ refund_requested_at: null }).eq('id', id).eq('status', 'paid'))
      }
      throw error
    }
    await this.saveOrder(await this.loadOrder(order.id), payment)
  }

  private async syncPayment(charge: Payment) {
    if (!charge.provider_id) {
      if (charge.order_id && charge.due_on < saoPauloToday()) {
        checked(await this.db.rpc('billing_expire_unissued_order', { p_id: charge.id, p_mode: this.mode }))
      }
      return
    }
    const remote = await this.loadOrder(charge.provider_id)
    const expired = charge.order_id && charge.due_on < saoPauloToday()
    if (expired && mpPaymentStatus(remote) === 'pending' && ['created', 'action_required'].includes(remote.status)) {
      await this.api(`/${remote.id}/cancel`, 'POST', `${charge.attempt_key}-cancel`, {})
      await this.saveOrder(await this.loadOrder(remote.id), charge)
    } else {
      await this.saveOrder(remote, charge)
    }
  }

  async retryEvent(event: EventRow) {
    try {
      await this.saveOrder(await this.loadOrder(event.resource_id))
      checked(await this.db.from('billing_webhook_events').update({ processed_at: new Date().toISOString() })
        .eq('mode', this.mode).eq('gateway', this.provider).eq('event_id', event.event_id))
    } catch (error) {
      console.error('Falha ao conciliar order do Mercado Pago', event.resource_id, error instanceof Error ? error.message : '')
      checked(await this.db.from('billing_webhook_events')
        .update({ next_attempt_at: new Date(Date.now() + 5 * 60_000).toISOString() })
        .eq('mode', this.mode).eq('gateway', this.provider).eq('event_id', event.event_id).is('processed_at', null))
    }
  }

  async maintenance() {
    checked(await this.db.rpc('billing_mp_renewals', { p_mode: this.mode }))
    const events = checked(await this.db.from('billing_webhook_events').select('*')
      .eq('mode', this.mode).eq('gateway', this.provider).is('processed_at', null)
      .lte('next_attempt_at', new Date().toISOString()).order('received_at').limit(12).returns<EventRow[]>()) ?? []
    await Promise.all(events.map((event) => this.retryEvent(event)))

    const today = saoPauloToday()
    const rows = checked(await this.db.from('billing_payments').select('*')
      .eq('mode', this.mode).eq('gateway', this.provider)
      .or(`and(provider_id.not.is.null,status.in.(pending,overdue,refund_pending,review)),and(status.eq.paid,refund_requested_at.not.is.null),and(provider_id.is.null,order_id.not.is.null,due_on.lt.${today},status.in.(pending,overdue))`)
      .order('checked_at', { nullsFirst: true }).limit(20).returns<Payment[]>()) ?? []
    const results = await Promise.allSettled(rows.map(async (charge) => {
      checked(await this.db.from('billing_payments').update({ checked_at: new Date().toISOString() }).eq('id', charge.id))
      await this.syncPayment(charge)
    }))
    for (const result of results) {
      if (result.status === 'rejected') console.error('Conciliação de Pix pendente', result.reason instanceof Error ? result.reason.message : '')
    }
  }
}
