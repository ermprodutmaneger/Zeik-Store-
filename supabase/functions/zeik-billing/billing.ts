import type { SupabaseClient, User } from 'npm:@supabase/supabase-js@2.118.0'
import {
  Asaas, type AsaasInvoice, type AsaasPayment, type AsaasSubscription, type GatewayConfig,
  GatewayError, type Mode, RequestError, saoPauloToday,
} from './asaas.ts'

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export type BillingProvider = 'asaas' | 'mercadopago'
export type Status = 'pending' | 'overdue' | 'paid' | 'refund_pending' | 'refunded' | 'canceled' | 'review'

export interface Payment {
  id: string
  mode: Mode
  gateway: BillingProvider
  attempt_key: string
  order_id: string | null
  membership_id: string | null
  provider_id: string | null
  amount_cents: number
  due_on: string
  status: Status
  paid_at: string | null
  checked_at: string | null
  refund_requested_at: string | null
  fiscal_status: string
  fiscal_provider_id: string | null
  fiscal_url: string | null
  fiscal_started_at: string | null
}

interface Plan {
  id: string
  name: string
  description: string
  monthly_cents: number
  member_content: string
  is_active: boolean
}

export interface Membership {
  id: string
  user_id: string
  plan_id: string
  mode: Mode
  monthly_cents: number
  provider_id: string | null
  creation_started_at: string | null
  canceled_at: string | null
}

export interface EventRow {
  mode: Mode
  event_id: string
  resource_id: string
  gateway?: BillingProvider
  event_type: string
}

export function checked<T>(result: { data: T; error: { code?: string } | null }): T {
  if (result.error) throw new Error(`Supabase ${result.error.code ?? 'request failed'}`)
  return result.data
}

export function parseId(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw new RequestError(400, 'Identificador inválido.')
  }
  return value.toLowerCase()
}

export function parseDocument(value: unknown): string {
  const doc = typeof value === 'string' ? value.slice(0, 30).replace(/[.\/\s-]/g, '').toUpperCase() : ''
  if (!/^(\d{11}|[A-Z0-9]{12}\d{2})$/.test(doc) || /^(\d)\1+$/.test(doc)) {
    throw new RequestError(400, 'Informe um CPF ou CNPJ válido.')
  }
  return doc
}

function money(value: number): number {
  return Math.round(value * 100)
}

function paymentStatus(remote: AsaasPayment): Status {
  if (remote.deleted) return 'canceled'
  if (remote.status === 'REFUNDED') return 'refunded'
  if (remote.status === 'REFUND_IN_PROGRESS' || remote.status === 'REFUND_REQUESTED') return 'refund_pending'
  if (remote.status === 'PARTIALLY_REFUNDED' || remote.status?.startsWith('CHARGEBACK') ||
    remote.status === 'AWAITING_CHARGEBACK_REVERSAL' || remote.status === 'RECEIVED_IN_CASH' ||
    remote.refunds?.some((refund) => refund.status === 'DONE' && money(refund.value) > 0)) {
    return 'review'
  }
  if (remote.status === 'RECEIVED' || remote.status === 'CONFIRMED') return 'paid'
  if (remote.status === 'OVERDUE') return 'overdue'
  if (remote.status === 'PENDING' || remote.status === 'AWAITING_RISK_ANALYSIS') return 'pending'
  return 'review'
}

function paymentView(row: Payment) {
  return {
    id: row.id, orderId: row.order_id, membershipId: row.membership_id,
    amountCents: row.amount_cents, dueOn: row.due_on,
    status: row.status === 'paid' && row.refund_requested_at ? 'refund_pending'
      : row.status === 'pending' && row.due_on < saoPauloToday() ? 'overdue' : row.status,
    hasPix: Boolean(row.provider_id), paidAt: row.paid_at, fiscalStatus: row.fiscal_status,
    fiscalUrl: row.fiscal_url, fiscalKey: row.order_id ? row.fiscal_provider_id : null,
    canRefund: row.status === 'paid' && !row.refund_requested_at,
    mode: row.mode, provider: row.gateway,
  }
}

function providerListItem<T extends { id: string; externalReference?: string | null }>(
  rows: T[], externalReference: string,
): T | undefined {
  const matches = rows.filter((row) => row.externalReference === externalReference)
  if (matches.length > 1) throw new RequestError(409, 'A cobrança precisa de revisão no painel do Asaas.')
  return matches[0]
}

export class BillingStore {
  constructor(readonly db: SupabaseClient, readonly mode: Mode, readonly pickup: string,
    readonly provider: BillingProvider) {}

  async getPlan(id: string) {
    return checked(await this.db.from('billing_plans').select('*')
      .eq('id', id).maybeSingle<Plan>())
  }

  async findMembership(id: string) {
    return checked(await this.db.from('billing_memberships').select('*')
      .eq('id', id).eq('mode', this.mode).eq('gateway', this.provider).maybeSingle<Membership>())
  }

  async findPayment(id: string) {
    return checked(await this.db.from('billing_payments').select('*')
      .eq('id', id).eq('mode', this.mode).eq('gateway', this.provider).maybeSingle<Payment>())
  }

  async listPlans() {
    const rows = checked(await this.db.from('billing_plans').select('id,name,description,monthly_cents')
      .eq('is_active', true).order('monthly_cents'))
    return rows ?? []
  }

  async createOrder(user: User, items: unknown, key: unknown) {
    if (!this.pickup) throw new RequestError(503, 'A retirada da loja está em configuração.')
    if (!Array.isArray(items) || !items.length || items.length > 50) {
      throw new RequestError(400, 'Revise os itens do seu carrinho.')
    }
    const safeItems = items.map((item) => {
      const quantity = item?.quantity
      if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
        throw new RequestError(400, 'Revise as quantidades do seu carrinho.')
      }
      return { product_id: parseId(item?.product_id), quantity }
    })
    const result = await this.db.rpc('billing_create_order', {
      p_items: safeItems, p_idempotency_key: parseId(key), p_user_id: user.id,
      p_mode: this.mode, p_gateway: this.provider, p_pickup: this.pickup.slice(0, 800),
    })
    if (result.error?.code === 'P0001') throw new RequestError(409, result.error.message)
    return { orderId: checked(result) as string }
  }

  async order(user: User, orderId: string) {
    const order = checked(await this.db.from('orders').select('id,billing_mode')
      .eq('id', orderId).eq('user_id', user.id).maybeSingle())
    if (!order?.billing_mode) throw new RequestError(404, 'Pedido Pix não encontrado.')
    const payment = checked(await this.db.from('billing_payments').select('*')
      .eq('order_id', order.id).maybeSingle<Payment>())
    if (!payment) throw new RequestError(404, 'Cobrança não encontrada.')
    return paymentView(payment)
  }

  async memberOverview(user: User) {
    const rows = checked(await this.db.from('billing_memberships').select('*')
      .eq('user_id', user.id).eq('mode', this.mode).eq('gateway', this.provider)
      .order('created_at', { ascending: false }).returns<Membership[]>()) ?? []
    return await Promise.all(rows.map(async (membership) => {
      const [plan, untilResult, chargesResult] = await Promise.all([
        this.getPlan(membership.plan_id),
        this.db.rpc('billing_membership_until', { p_id: membership.id }),
        this.db.from('billing_payments').select('*').eq('membership_id', membership.id)
          .order('due_on', { ascending: false }).limit(15).returns<Payment[]>(),
      ])
      const until = checked(untilResult) as string | null
      const active = Boolean(until && until >= saoPauloToday())
      return {
        id: membership.id, planId: membership.plan_id, name: plan?.name ?? 'Mensalidade',
        monthlyCents: membership.monthly_cents, ready: this.provider === 'mercadopago' || Boolean(membership.provider_id),
        canceledAt: membership.canceled_at, active, until,
        content: active ? plan?.member_content ?? null : null,
        payments: (checked(chargesResult) ?? []).map(paymentView),
      }
    }))
  }

  async adminPayments() {
    const rows = checked(await this.db.from('billing_payments').select('*')
      .eq('mode', this.mode).eq('gateway', this.provider).order('created_at', { ascending: false }).limit(100).returns<Payment[]>())
    return (rows ?? []).map(paymentView)
  }

  async registerNfe(id: string, value: unknown) {
    const key = typeof value === 'string' ? value.replace(/\s/g, '') : ''
    if (!/^\d{44}$/.test(key)) throw new RequestError(400, 'Informe os 44 dígitos da chave da NF-e.')
    const row = checked(await this.db.from('billing_payments')
      .update({ fiscal_provider_id: key, fiscal_status: 'authorized' })
      .eq('id', id).eq('mode', this.mode).eq('gateway', this.provider).eq('status', 'paid').not('order_id', 'is', null)
      .is('refund_requested_at', null).select('id').maybeSingle())
    if (!row) throw new RequestError(409, 'A nota deve estar vinculada a um pedido Pix pago.')
  }
}

export class Billing extends BillingStore {
  readonly gateway: Asaas
  constructor(db: SupabaseClient, readonly config: GatewayConfig) {
    super(db, config.mode, config.pickup, 'asaas')
    this.gateway = new Asaas(config)
  }

  async customer(user: User, document: unknown) {
    const cpfCnpj = parseDocument(document)
    const profile = checked(await this.db.from('profiles').select('full_name')
      .eq('id', user.id).maybeSingle())
    if (!profile?.full_name.trim() || !user.email) {
      throw new RequestError(409, 'Preencha seu nome completo em Minha conta.')
    }
    return await this.gateway.customer(user.id, profile.full_name.trim(), user.email, cpfCnpj)
  }

  async createOrderPix(user: User, orderId: string, document: unknown) {
    const summary = await this.order(user, orderId)
    let payment = await this.findPayment(summary.id)
    if (!payment || payment.status !== 'pending' || payment.due_on < saoPauloToday()) {
      throw new RequestError(409, 'Este Pix não está disponível.')
    }
    if (!payment.provider_id) {
      // Em caso de resposta perdida, procure pelo identificador antes de criar.
      const reference = payment.id
      const existing = providerListItem(
        await this.gateway.list<AsaasPayment>('/payments', { externalReference: reference }), reference,
      )
      if (existing) {
        await this.recordPayment(existing)
      } else {
        const customer = await this.customer(user, document)
        const claim = checked(await this.db.from('billing_payments')
          .update({ creation_started_at: new Date().toISOString() })
          .eq('id', payment.id).eq('status', 'pending').is('provider_id', null)
          .is('creation_started_at', null).select('id').maybeSingle())
        if (claim) {
          try {
            const remote = await this.gateway.request<AsaasPayment>('/payments', 'POST', {
              customer, billingType: 'PIX', value: payment.amount_cents / 100,
              dueDate: payment.due_on, description: 'Pedido Zeik Store', externalReference: reference,
            })
            await this.recordPayment(remote)
          } catch (error) {
            await this.releaseCreationOnRejection('billing_payments', payment.id, error)
            throw error
          }
        }
      }
      payment = await this.findPayment(payment.id)
    }
    if (!payment?.provider_id) {
      throw new RequestError(409, 'O Pix ainda está sendo gerado. Aguarde e tente novamente.')
    }
    return await this.paymentPix(payment)
  }

  async releaseCreationOnRejection(table: 'billing_payments' | 'billing_memberships', id: string, error: unknown) {
    // Um timeout pode ter criado o registro no Asaas. Concilie pela referência.
    if (error instanceof GatewayError && [400, 401, 403, 422].includes(error.status)) {
      checked(await this.db.from(table).update({ creation_started_at: null })
        .eq('id', id).is('provider_id', null))
    }
  }

  async paymentPix(payment: Payment) {
    if (!payment.provider_id || !['pending', 'overdue'].includes(payment.status) ||
      (payment.order_id && payment.due_on < saoPauloToday())) {
      throw new RequestError(409, 'Este Pix não está disponível.')
    }
    return await this.gateway.pix(payment.provider_id)
  }

  async subscribe(user: User, planId: string, document: unknown) {
    const plan = await this.getPlan(planId)
    if (!plan?.is_active) throw new RequestError(404, 'Plano indisponível.')
    const lookup = async () => checked(await this.db.from('billing_memberships').select('*')
      .eq('user_id', user.id).eq('plan_id', plan.id).eq('mode', this.mode).eq('gateway', this.provider)
      .is('canceled_at', null).maybeSingle<Membership>())
    let membership = await lookup()
    if (!membership) {
      const insert = await this.db.from('billing_memberships').insert({
        user_id: user.id, plan_id: plan.id, monthly_cents: plan.monthly_cents, mode: this.mode, gateway: this.provider,
      }).select('*').single<Membership>()
      membership = insert.error?.code === '23505' ? await lookup() : checked(insert)
    }
    if (!membership) throw new RequestError(409, 'Atualize a página e tente novamente.')

    let providerId = membership.provider_id
    if (!providerId) {
      const reference = membership.id
      const existing = providerListItem(
        await this.gateway.list<AsaasSubscription>('/subscriptions', { externalReference: reference }), reference,
      )
      if (existing) {
        providerId = (await this.linkSubscription(existing))?.provider_id ?? null
      } else {
        const customer = await this.customer(user, document)
        const claim = checked(await this.db.from('billing_memberships')
          .update({ creation_started_at: new Date().toISOString() })
          .eq('id', membership.id).is('provider_id', null).is('creation_started_at', null)
          .is('canceled_at', null).select('id').maybeSingle())
        if (claim) {
          try {
            const remote = await this.gateway.request<AsaasSubscription>('/subscriptions', 'POST', {
              customer, billingType: 'PIX', cycle: 'MONTHLY', value: membership.monthly_cents / 100,
              nextDueDate: saoPauloToday(), description: `Zeik Store — ${plan.name}`,
              externalReference: reference,
            })
            providerId = (await this.linkSubscription(remote))?.provider_id ?? null
          } catch (error) {
            await this.releaseCreationOnRejection('billing_memberships', membership.id, error)
            throw error
          }
        }
      }
    }
    if (providerId) await this.refreshSubscriptionPayments(providerId)
    return { membershipId: membership.id }
  }

  async linkSubscription(remote: AsaasSubscription) {
    if (!remote.externalReference || !UUID.test(remote.externalReference)) return null
    const membership = await this.findMembership(remote.externalReference)
    if (!membership) return null
    if (remote.billingType !== 'PIX' || money(remote.value) !== membership.monthly_cents ||
      remote.cycle !== 'MONTHLY' || (membership.provider_id && membership.provider_id !== remote.id)) {
      throw new RequestError(409, 'A assinatura no Asaas diverge do plano contratado.')
    }
    const changes = {
      provider_id: remote.id,
      ...(remote.deleted || ['INACTIVE', 'EXPIRED'].includes(remote.status)
        ? { canceled_at: membership.canceled_at ?? new Date().toISOString() } : {}),
    }
    const update = this.db.from('billing_memberships').update(changes).eq('id', membership.id)
    return checked(await (membership.provider_id ? update.eq('provider_id', remote.id) : update.is('provider_id', null))
      .select('*').maybeSingle<Membership>()) ?? await this.findMembership(membership.id)
  }

  async refreshSubscriptionPayments(providerId: string) {
    const rows = await this.gateway.list<AsaasPayment>(
      `/subscriptions/${encodeURIComponent(providerId)}/payments`, {},
    )
    for (const row of rows) await this.recordPayment({ ...row, subscription: providerId })
  }

  async cancelMembership(user: User, id: string) {
    const membership = await this.findMembership(id)
    if (!membership || membership.user_id !== user.id) throw new RequestError(404, 'Mensalidade não encontrada.')
    if (membership.canceled_at) return
    if (membership.provider_id) {
      try {
        await this.gateway.request(`/subscriptions/${encodeURIComponent(membership.provider_id)}`, 'DELETE')
      } catch (error) {
        if (!(error instanceof GatewayError && error.status === 404)) throw error
      }
      checked(await this.db.from('billing_memberships').update({ canceled_at: new Date().toISOString() })
        .eq('id', membership.id).is('canceled_at', null))
      return
    }
    const canceled = checked(await this.db.from('billing_memberships')
      .update({ canceled_at: new Date().toISOString() }).eq('id', membership.id)
      .is('creation_started_at', null).is('provider_id', null).is('canceled_at', null)
      .select('id').maybeSingle())
    if (!canceled) throw new RequestError(409, 'Aguarde a criação da mensalidade para cancelar.')
  }

  async recordPayment(remote: AsaasPayment, override?: Status): Promise<Payment | null> {
    const known = checked(await this.db.from('billing_payments').select('*')
      .eq('mode', this.mode).eq('gateway', this.provider).eq('provider_id', remote.id).maybeSingle<Payment>())
    let membershipId = known?.membership_id ?? null
    let paymentId = known?.order_id ? known.id : null
    if (!known && remote.subscription) {
      const linked = checked(await this.db.from('billing_memberships').select('id')
        .eq('mode', this.mode).eq('gateway', this.provider).eq('provider_id', remote.subscription).maybeSingle())
      membershipId = linked?.id ??
        (await this.linkSubscription(await this.gateway.subscription(remote.subscription)))?.id ?? null
    }
    if (!known && !remote.subscription && remote.externalReference && UUID.test(remote.externalReference)) {
      const candidate = await this.findPayment(remote.externalReference)
      paymentId = candidate?.order_id ? candidate.id : null
    }
    if (!membershipId && !paymentId) return null
    if (remote.billingType !== 'PIX' || !/^\d{4}-\d{2}-\d{2}$/.test(remote.dueDate) ||
      !Number.isFinite(remote.value) || remote.value <= 0) {
      throw new RequestError(409, 'Dados de cobrança inválidos no Asaas.')
    }
    const result = await this.db.rpc('billing_record_payment', {
      p_mode: this.mode, p_payment_id: paymentId, p_membership_id: membershipId,
      p_provider_id: remote.id, p_amount: money(remote.value), p_due: remote.dueDate,
      p_status: override ?? paymentStatus(remote),
    }).single<Payment>()
    return checked(result)
  }

  async refund(id: string) {
    const payment = await this.findPayment(id)
    if (!payment?.provider_id || payment.status !== 'paid') {
      throw new RequestError(409, 'A cobrança precisa estar paga para solicitar estorno.')
    }
    const providerId = payment.provider_id
    const live = await this.gateway.payment(providerId)
    if (paymentStatus(live) !== 'paid') {
      await this.recordPayment(live)
      throw new RequestError(409, 'O estado da cobrança mudou. Atualize a lista.')
    }
    const claim = checked(await this.db.from('billing_payments')
      .update({ refund_requested_at: new Date().toISOString() })
      .eq('id', id).eq('status', 'paid').is('refund_requested_at', null).select('id').maybeSingle())
    if (!claim) throw new RequestError(409, 'Já existe uma solicitação de estorno para este Pix.')

    try {
      const result = await this.gateway.request<AsaasPayment>(
        `/payments/${encodeURIComponent(providerId)}/refund`, 'POST',
        { value: payment.amount_cents / 100 },
      )
      const status = paymentStatus(result) === 'refunded' ? 'refunded' : 'refund_pending'
      await this.recordPayment({ ...live, ...result }, status)
    } catch (error) {
      if (error instanceof GatewayError && [400, 401, 403, 422].includes(error.status)) {
        checked(await this.db.from('billing_payments').update({ refund_requested_at: null })
          .eq('id', id).eq('status', 'paid'))
      }
      throw error
    }
  }

  async syncPayment(providerId: string) {
    const remote = await this.gateway.payment(providerId)
    return await this.recordPayment(remote)
  }

  async cancelOrder(payment: Payment) {
    if (!payment.order_id || !['pending', 'overdue'].includes(payment.status)) return
    if (payment.provider_id) {
      const live = await this.gateway.payment(payment.provider_id)
      const status = paymentStatus(live)
      if (status !== 'pending' && status !== 'overdue') {
        await this.recordPayment(live)
        return
      }
      await this.gateway.request(`/payments/${encodeURIComponent(payment.provider_id)}`, 'DELETE')
      await this.recordPayment(live, 'canceled')
      return
    }
    const found = providerListItem(
      await this.gateway.list<AsaasPayment>('/payments', { externalReference: payment.id }), payment.id,
    )
    if (found) {
      const reconciled = await this.recordPayment(found)
      if (reconciled) await this.cancelOrder(reconciled)
      return
    }
    checked(await this.db.rpc('billing_expire_unissued_order', { p_id: payment.id, p_mode: this.mode }))
  }

  async processEvent(event: EventRow) {
    if (event.event_type.startsWith('PAYMENT_')) {
      try {
        await this.syncPayment(event.resource_id)
      } catch (error) {
        if (!(error instanceof GatewayError && error.status === 404 && event.event_type === 'PAYMENT_DELETED')) {
          throw error
        }
        // Em exclusões, use só o ID que já foi vinculado à loja.
        const row = checked(await this.db.from('billing_payments').select('*')
          .eq('mode', this.mode).eq('gateway', this.provider).eq('provider_id', event.resource_id).maybeSingle<Payment>())
        if (row) {
          await this.recordPayment({
            id: event.resource_id, status: 'PENDING', billingType: 'PIX',
            dueDate: row.due_on, value: row.amount_cents / 100,
          }, 'canceled')
        }
      }
    } else if (event.event_type.startsWith('SUBSCRIPTION_')) {
      try {
        const linked = await this.linkSubscription(await this.gateway.subscription(event.resource_id))
        if (linked && !linked.canceled_at) await this.refreshSubscriptionPayments(event.resource_id)
      } catch (error) {
        if (!(error instanceof GatewayError && error.status === 404 &&
          ['SUBSCRIPTION_DELETED', 'SUBSCRIPTION_INACTIVATED'].includes(event.event_type))) throw error
        checked(await this.db.from('billing_memberships').update({ canceled_at: new Date().toISOString() })
          .eq('mode', this.mode).eq('gateway', this.provider).eq('provider_id', event.resource_id).is('canceled_at', null))
      }
    } else if (event.event_type.startsWith('INVOICE_')) {
      await this.syncInvoice(event.resource_id)
    }
    checked(await this.db.from('billing_webhook_events').update({ processed_at: new Date().toISOString() })
      .eq('mode', this.mode).eq('gateway', this.provider).eq('event_id', event.event_id))
  }

  async retryEvent(event: EventRow) {
    try {
      await this.processEvent(event)
    } catch (error) {
      console.error('Falha ao conciliar evento', event.event_id, error instanceof Error ? error.message : '')
      checked(await this.db.from('billing_webhook_events')
        .update({ next_attempt_at: new Date(Date.now() + 5 * 60_000).toISOString() })
        .eq('mode', this.mode).eq('gateway', this.provider).eq('event_id', event.event_id).is('processed_at', null))
    }
  }

  async syncInvoice(invoiceId: string) {
    const invoice = await this.gateway.request<AsaasInvoice>(`/invoices/${encodeURIComponent(invoiceId)}`)
    if (!invoice.payment) return
    const status = invoice.status === 'AUTHORIZED' ? 'authorized'
      : ['ERROR', 'CANCELED', 'CANCELLATION_DENIED'].includes(invoice.status) ? 'error' : 'processing'
    const url = status === 'authorized' && invoice.pdfUrl?.startsWith('https://') ? invoice.pdfUrl : null
    checked(await this.db.from('billing_payments').update({
      fiscal_status: status, fiscal_url: url, fiscal_provider_id: invoice.id,
    }).eq('mode', this.mode).eq('gateway', this.provider).eq('provider_id', invoice.payment).not('membership_id', 'is', null))
  }

  async issueServiceInvoice(payment: Payment, invoiceSettings: Record<string, unknown>) {
    if (!payment.provider_id || !payment.membership_id) return
    if (payment.fiscal_provider_id) {
      await this.syncInvoice(payment.fiscal_provider_id)
      return
    }
    const existing = await this.gateway.list<AsaasInvoice>('/invoices', { payment: payment.provider_id })
    const match = existing.find((invoice) => invoice.payment === payment.provider_id)
    if (match) {
      await this.syncInvoice(match.id)
      return
    }
    const claim = checked(await this.db.from('billing_payments')
      .update({ fiscal_status: 'processing', fiscal_started_at: new Date().toISOString() })
      .eq('id', payment.id).eq('status', 'paid').eq('fiscal_status', 'required')
      .is('fiscal_started_at', null).select('id').maybeSingle())
    if (!claim) return
    try {
      const invoice = await this.gateway.request<AsaasInvoice>('/invoices', 'POST', {
        ...invoiceSettings, payment: payment.provider_id, value: payment.amount_cents / 100,
        effectiveDate: saoPauloToday(), externalReference: payment.id,
      })
      await this.syncInvoice(invoice.id)
    } catch (error) {
      if (error instanceof GatewayError && [400, 401, 403, 422].includes(error.status)) {
        checked(await this.db.from('billing_payments').update({ fiscal_status: 'error' }).eq('id', payment.id))
      }
      throw error
    }
  }

  async maintenance() {
    const events = checked(await this.db.from('billing_webhook_events').select('*')
      .eq('mode', this.mode).eq('gateway', this.provider).is('processed_at', null).lte('next_attempt_at', new Date().toISOString())
      .order('received_at').limit(12).returns<EventRow[]>()) ?? []
    await Promise.all(events.map((event) => this.retryEvent(event)))

    const payments = checked(await this.db.from('billing_payments').select('*').eq('mode', this.mode).eq('gateway', this.provider)
      .or('status.in.(pending,overdue,refund_pending,review),and(status.eq.paid,refund_requested_at.not.is.null)')
      .order('checked_at', { nullsFirst: true }).limit(12).returns<Payment[]>()) ?? []
    await Promise.allSettled(payments.map(async (payment) => {
      checked(await this.db.from('billing_payments')
        .update({ checked_at: new Date().toISOString() }).eq('id', payment.id))
      if (payment.order_id && payment.due_on < saoPauloToday() && ['pending', 'overdue'].includes(payment.status)) {
        await this.cancelOrder(payment)
      } else if (payment.provider_id) {
        await this.syncPayment(payment.provider_id)
      }
    })).then(logJobErrors)

    const settings = Deno.env.get('ASAAS_NFSE_SETTINGS')
    if (settings) {
      const invoiceSettings = JSON.parse(settings) as Record<string, unknown>
      const invoices = checked(await this.db.from('billing_payments').select('*')
        .eq('mode', this.mode).eq('gateway', this.provider).eq('status', 'paid').not('membership_id', 'is', null)
        .in('fiscal_status', ['required', 'processing']).order('checked_at', { nullsFirst: true })
        .limit(8).returns<Payment[]>()) ?? []
      await Promise.allSettled(invoices.map(async (payment) => {
        checked(await this.db.from('billing_payments')
          .update({ checked_at: new Date().toISOString() }).eq('id', payment.id))
        await this.issueServiceInvoice(payment, invoiceSettings)
      })).then(logJobErrors)
    }
  }

  async customerPix(user: User, id: string, _document?: unknown) {
    const payment = await this.findPayment(id)
    if (!payment) throw new RequestError(404, 'Cobrança não encontrada.')
    if (payment.membership_id) {
      const membership = await this.findMembership(payment.membership_id)
      if (membership?.user_id !== user.id || membership.canceled_at) {
        throw new RequestError(404, 'Cobrança não encontrada.')
      }
    } else if (payment.order_id) {
      await this.order(user, payment.order_id)
    }
    return await this.paymentPix(payment)
  }
}

function logJobErrors(results: PromiseSettledResult<unknown>[]) {
  for (const item of results) {
    if (item.status === 'rejected') {
      console.error('Falha em tarefa de cobrança', item.reason instanceof Error ? item.reason.message : '')
    }
  }
}
