import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { GatewayError, readConfig, RequestError, sameSecret } from './asaas.ts'
import { Billing, checked, type EventRow, parseId } from './billing.ts'

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Cache-Control': 'no-store',
}

function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers })
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text()
  if (text.length > 64_000) throw new RequestError(413, 'Requisição muito grande.')
  try {
    const data = JSON.parse(text)
    if (data && typeof data === 'object' && !Array.isArray(data)) return data
  } catch {
    // O mesmo erro cobre sintaxe inválida e valores que não são objetos.
  }
  throw new RequestError(400, 'Dados inválidos.')
}

function client() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })
}

async function receiveAsaas(request: Request, billing: Billing) {
  if (!sameSecret(request.headers.get('asaas-access-token'), billing.config.webhookToken)) {
    return json({ message: 'Token inválido.' }, 401)
  }
  const body = await readBody(request)
  const eventType = body.event
  if (typeof eventType !== 'string' || typeof body.id !== 'string' ||
    !/^[A-Za-z0-9_&-]{1,255}$/.test(body.id)) {
    throw new RequestError(400, 'Evento inválido.')
  }
  const resourceType = eventType.startsWith('PAYMENT_') ? 'payment'
    : eventType.startsWith('SUBSCRIPTION_') ? 'subscription'
    : eventType.startsWith('INVOICE_') ? 'invoice' : null
  if (!resourceType) return json({ received: true })
  const resource = body[resourceType] as { id?: unknown } | undefined
  if (typeof resource?.id !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(resource.id)) {
    throw new RequestError(400, 'Recurso inválido.')
  }
  const event: EventRow = {
    mode: billing.mode, event_id: body.id, resource_id: resource.id, event_type: eventType.slice(0, 100),
  }
  const inserted = checked(await billing.db.from('billing_webhook_events').upsert(event, {
    onConflict: 'mode,event_id', ignoreDuplicates: true,
  }).select('event_id').maybeSingle())
  if (inserted) {
    const edge = (globalThis as typeof globalThis & {
      EdgeRuntime?: { waitUntil: (promise: Promise<unknown>) => void }
    }).EdgeRuntime
    const work = billing.retryEvent(event).catch(() => console.error('Evento aguardando nova tentativa.'))
    if (edge) edge.waitUntil(work)
    else await work
  }
  return json({ received: true })
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  const route = new URL(request.url).pathname.replace(/\/$/, '').split('/').at(-1)
  try {
    const config = readConfig()
    const db = client()
    if (route === 'zeik-billing' && request.method === 'GET') {
      const live = checked(await db.from('billing_settings').select('live_checkout').single())?.live_checkout
      const enabled = config && (config.mode === 'production' ? live : !live)
      const billing = enabled ? new Billing(db, config) : null
      return json({
        mode: billing?.mode ?? null,
        pickup: billing?.config.pickup || null,
        plans: billing ? await billing.listPlans() : [],
        legacyCheckout: !live,
      })
    }
    if (request.method !== 'POST') return json({ message: 'Método não permitido.' }, 405)
    if (!config) return json({ message: 'O Pix da Zeik Store está em configuração.' }, 503)
    const billing = new Billing(db, config)
    if (route === 'webhook') return await receiveAsaas(request, billing)
    if (route === 'maintenance') {
      if (!sameSecret(request.headers.get('x-zeik-cron-token'), config.cronToken)) {
        return json({ message: 'Token inválido.' }, 401)
      }
      await billing.maintenance()
      return json({ ok: true })
    }
    if (route !== 'zeik-billing') return json({ message: 'Endereço não encontrado.' }, 404)

    const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1]
    if (!token) return json({ message: 'Entre na sua conta.' }, 401)
    const { data: { user }, error: authError } = await db.auth.getUser(token)
    if (authError || !user) return json({ message: 'Sua sessão expirou. Entre novamente.' }, 401)

    const body = await readBody(request)
    if (body.action === 'admin-list' || body.action === 'refund' || body.action === 'register-nfe') {
      const role = checked(await db.from('user_roles').select('role').eq('user_id', user.id).maybeSingle())
      if (role?.role !== 'admin') return json({ message: 'Acesso restrito ao administrador.' }, 403)
      if (body.action === 'admin-list') return json(await billing.adminPayments())
      if (body.action === 'register-nfe') await billing.registerNfe(parseId(body.paymentId), body.key)
      else await billing.refund(parseId(body.paymentId))
      return json({ ok: true })
    }

    if (body.action === 'start-order' || body.action === 'subscribe') {
      const live = checked(await db.from('billing_settings').select('live_checkout').single())?.live_checkout
      if (Boolean(live) !== (config.mode === 'production')) {
        return json({ message: 'Novas cobranças estão pausadas.' }, 503)
      }
    }

    switch (body.action) {
      case 'start-order':
        return json(await billing.createOrder(user, body.items, body.key))
      case 'order':
        return json(await billing.order(user, parseId(body.orderId)))
      case 'order-pix':
        return json(await billing.createOrderPix(user, parseId(body.orderId), body.document))
      case 'overview':
        return json(await billing.memberOverview(user))
      case 'subscribe':
        return json(await billing.subscribe(user, parseId(body.planId), body.document))
      case 'cancel-membership':
        await billing.cancelMembership(user, parseId(body.membershipId))
        return json({ ok: true })
      case 'pix':
        return json(await billing.customerPix(user, parseId(body.paymentId)))
      default:
        return json({ message: 'Ação desconhecida.' }, 400)
    }
  } catch (error) {
    if (error instanceof RequestError) return json({ message: error.message }, error.status)
    if (error instanceof GatewayError) {
      console.error('Asaas retornou HTTP', error.status)
      return error.status === 400 || error.status === 422
        ? json({ message: 'O Asaas recusou os dados da cobrança. Revise o cadastro ou fale com a loja.' }, 422)
        : json({ message: 'O Asaas está indisponível para esta operação. Tente novamente em instantes.' }, 503)
    }
    console.error('Falha de cobrança', error instanceof Error ? error.message : '')
    return json({ message: 'Não foi possível atualizar a cobrança. Tente novamente.' }, 500)
  }
})
