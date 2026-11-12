import { useEffect, useState, type FormEvent } from 'react'
import { Alert } from './Alert'
import { BillingDocument, PixCard } from './PixCard'
import { formatBRL } from '../lib/format'
import {
  createOrderPix, FISCAL_LABELS, formatBillingDate, getOrderCharge, getPix,
  PAYMENT_LABELS, type Charge, type Pix,
} from '../services/billing'

export function OrderPixPanel({ orderId, pickup }: { orderId: string; pickup: string | null }) {
  const [charge, setCharge] = useState<Charge | null>(null)
  const [document, setDocument] = useState('')
  const [pix, setPix] = useState<Pix | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    async function refresh() {
      try {
        const latest = await getOrderCharge(orderId)
        if (active) setCharge(latest)
      } catch (failure) {
        if (active) setError(failure instanceof Error ? failure.message : 'Cobrança indisponível.')
      }
    }
    void refresh()
    const timer = window.setInterval(() => { if (!window.document.hidden) void refresh() }, 8_000)
    return () => { active = false; window.clearInterval(timer) }
  }, [orderId])

  async function showPix(event: FormEvent) {
    event.preventDefault()
    if (!charge) return
    setBusy(true)
    setError(null)
    try {
      const code = charge.hasPix ? await getPix(charge.id) : await createOrderPix(orderId, document)
      setPix(code.payload ? code : null)
      setDocument('')
      setCharge(await getOrderCharge(orderId))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Pix indisponível.')
    } finally {
      setBusy(false)
    }
  }

  const waiting = charge?.status === 'pending'
  const needsDocument = charge && !charge.hasPix &&
    (charge.provider !== 'mercadopago' || charge.mode !== 'sandbox')
  return (
    <section className="card billing-panel" aria-label="Pagamento do pedido">
      {charge ? (
        <>
          <div className="billing-heading">
            <h2>{PAYMENT_LABELS[charge.status]}</h2>
            <strong>{formatBRL(charge.amountCents)}</strong>
          </div>
          {charge.mode === 'sandbox' ? <span className="badge badge-warning">Ambiente de testes</span> : null}
          {waiting ? <p className="muted small">Pague até {formatBillingDate(charge.dueOn)}. A confirmação aparece aqui automaticamente.</p> : null}
          {charge.status === 'paid' && pickup ? <p><strong>Retirada</strong><br />{pickup}</p> : null}
          {charge.fiscalKey ? (
            <p className="small" style={{ overflowWrap: 'anywhere' }}><strong>Chave da NF-e</strong><br />{charge.fiscalKey}</p>
          ) : charge.status === 'paid' ? <p className="small muted">NF-e · {FISCAL_LABELS[charge.fiscalStatus]}</p> : null}
          {charge.fiscalUrl ? <a href={charge.fiscalUrl} target="_blank" rel="noreferrer">Abrir nota fiscal</a> : null}
          {waiting && pix ? <PixCard pix={pix} sandbox={charge.mode === 'sandbox'} provider={charge.provider} /> : null}
          {waiting && !pix ? (
            <form onSubmit={showPix} className="billing-form">
              {needsDocument ? <BillingDocument value={document} onChange={setDocument} provider={charge.provider} /> : null}
              <button className="btn btn-primary" disabled={busy}>
                {busy ? 'Carregando…' : charge.hasPix ? 'Ver QR Code' : 'Gerar Pix'}
              </button>
            </form>
          ) : null}
        </>
      ) : error ? null : <p role="status">Consultando pagamento…</p>}
      {error ? <Alert variant="error">{error}</Alert> : null}
    </section>
  )
}
