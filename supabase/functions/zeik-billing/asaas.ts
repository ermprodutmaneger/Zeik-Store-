export type Mode = 'sandbox' | 'production'

export interface GatewayConfig {
  mode: Mode
  apiKey: string
  webhookToken: string
  cronToken: string
  pickup: string
}

export interface AsaasPayment {
  id: string
  billingType: string
  value: number
  dueDate: string
  status: string
  deleted?: boolean
  externalReference?: string | null
  subscription?: string | null
  customer?: string
  refunds?: Array<{ value: number; status: string }>
}

export interface AsaasSubscription {
  id: string
  billingType: string
  cycle: string
  value: number
  externalReference?: string | null
  status: string
  deleted?: boolean
}

export interface AsaasInvoice {
  id: string
  status: string
  pdfUrl?: string | null
  payment?: string | null
  externalReference?: string | null
}

export interface PixCode {
  encodedImage: string
  payload: string
  expirationDate: string
}

export class RequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

export class GatewayError extends Error {
  constructor(readonly status: number) {
    super(`Asaas HTTP ${status}`)
  }
}

export function readConfig(): GatewayConfig | null {
  const mode = Deno.env.get('ASAAS_BILLING_MODE')
  const apiKey = Deno.env.get('ASAAS_API_KEY')?.trim()
  const webhookToken = Deno.env.get('ASAAS_WEBHOOK_TOKEN')?.trim()
  const cronToken = Deno.env.get('BILLING_CRON_TOKEN')?.trim()
  const pickup = Deno.env.get('BILLING_PICKUP_DETAILS')?.trim()
    || (mode === 'sandbox' ? 'Retirada simulada para testar o checkout.' : '')

  if ((mode !== 'sandbox' && mode !== 'production') || !apiKey ||
    !webhookToken || !/^[^\s]{32,255}$/.test(webhookToken) ||
    !cronToken || !/^[^\s]{32,255}$/.test(cronToken) ||
    new Set([apiKey, webhookToken, cronToken]).size !== 3) return null

  return { mode, apiKey, webhookToken, cronToken, pickup }
}

export function sameSecret(actual: string | null, expected: string): boolean {
  if (!actual || actual.length !== expected.length) return false
  let difference = 0
  for (let index = 0; index < expected.length; index += 1) {
    difference |= actual.charCodeAt(index) ^ expected.charCodeAt(index)
  }
  return difference === 0
}

export class Asaas {
  private readonly base: string
  constructor(private readonly config: GatewayConfig) {
    this.base = config.mode === 'production'
      ? 'https://api.asaas.com/v3'
      : 'https://api-sandbox.asaas.com/v3'
  }

  async request<T>(path: string, method = 'GET', body?: object): Promise<T> {
    let response: Response
    try {
      response = await fetch(this.base + path, {
        method,
        headers: {
          'access_token': this.config.apiKey,
          'Content-Type': 'application/json',
          'User-Agent': 'Zeik-Store-Billing/1.0',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(8_000),
        redirect: 'error',
      })
    } catch {
      throw new GatewayError(503)
    }
    if (!response.ok) {
      await response.body?.cancel()
      throw new GatewayError(response.status)
    }
    return await response.json() as T
  }

  async list<T>(path: string, query: Record<string, string>): Promise<T[]> {
    const result = await this.request<{ data: T[] }>(
      `${path}?${new URLSearchParams({ limit: '20', ...query })}`,
    )
    return result.data
  }

  async customer(userId: string, name: string, email: string, cpfCnpj: string): Promise<string> {
    const externalReference = `zeik-user-${userId}`
    const existing = await this.list<{ id: string }>('/customers', { externalReference, cpfCnpj })
    const customer = existing[0] ?? await this.request<{ id: string }>('/customers', 'POST', {
      name, email, cpfCnpj, externalReference, notificationDisabled: false,
    })
    try {
      await this.configureReminders(customer.id)
    } catch (error) {
      console.error('Revise as notificações no Asaas', error instanceof GatewayError ? error.status : '')
    }
    return customer.id
  }

  private async configureReminders(customer: string) {
    const { data } = await this.request<{ data: Array<{
      id: string; event: string; scheduleOffset?: number; emailEnabledForCustomer: boolean
      smsEnabledForCustomer: boolean; phoneCallEnabledForCustomer: boolean
      whatsappEnabledForCustomer: boolean; enabled: boolean
    }> }>(`/customers/${encodeURIComponent(customer)}/notifications`)

    const notifications = data.flatMap((rule) => {
      const email = rule.event === 'PAYMENT_CREATED' || rule.event === 'PAYMENT_RECEIVED' ||
        (rule.event === 'PAYMENT_DUEDATE_WARNING' && [0, 5].includes(rule.scheduleOffset ?? -1)) ||
        (rule.event === 'PAYMENT_OVERDUE' && rule.scheduleOffset === 1)
      if (email === (rule.emailEnabledForCustomer && rule.enabled) &&
        !rule.smsEnabledForCustomer && !rule.phoneCallEnabledForCustomer && !rule.whatsappEnabledForCustomer) return []
      return [{
        id: rule.id, ...(email ? { enabled: true } : {}), emailEnabledForCustomer: email,
        smsEnabledForCustomer: false, phoneCallEnabledForCustomer: false, whatsappEnabledForCustomer: false,
      }]
    })
    if (notifications.length) await this.request('/notifications/batch', 'PUT', { customer, notifications })
  }

  payment(id: string) {
    return this.request<AsaasPayment>(`/payments/${encodeURIComponent(id)}`)
  }

  subscription(id: string) {
    return this.request<AsaasSubscription>(`/subscriptions/${encodeURIComponent(id)}`)
  }

  pix(id: string) {
    return this.request<PixCode>(`/payments/${encodeURIComponent(id)}/pixQrCode`)
  }
}

export function saoPauloToday(): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts()
  const get = (type: string) => parts.find((part) => part.type === type)?.value
  return `${get('year')}-${get('month')}-${get('day')}`
}
