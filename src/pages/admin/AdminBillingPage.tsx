import { useEffect, useState } from 'react'
import { Alert } from '../../components/Alert'
import { useBillingConfig } from '../../contexts/billingConfigContext'
import { formatBRL, shortId } from '../../lib/format'
import { FISCAL_LABELS, formatBillingDate, getAdminCharges, PAYMENT_LABELS, refundPix, registerNfe, type Charge } from '../../services/billing'

export function AdminBillingPage() {
  const { config, error: configError } = useBillingConfig()
  const [charges, setCharges] = useState<Charge[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [noteId, setNoteId] = useState<string | null>(null)
  const [noteKey, setNoteKey] = useState('')
  const mode = config?.mode

  useEffect(() => {
    if (!mode) return
    let active = true
    getAdminCharges()
      .then((rows) => { if (active) setCharges(rows) })
      .catch((failure: Error) => { if (active) setError(failure.message) })
    return () => { active = false }
  }, [mode])

  async function load() {
    setBusy(true)
    setError(null)
    try {
      setCharges(await getAdminCharges())
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Lista indisponível.')
    } finally {
      setBusy(false)
    }
  }

  async function refund(charge: Charge) {
    if (!window.confirm(`Solicitar ao Asaas a devolução integral de ${formatBRL(charge.amountCents)}?`)) return
    setBusy(true)
    setError(null)
    setMessage('')
    try {
      await refundPix(charge.id)
      setMessage('Solicitação enviada. Confira o estado atualizado na lista.')
      setCharges(await getAdminCharges())
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Estorno indisponível.')
    } finally {
      setBusy(false)
    }
  }

  async function saveNote(charge: Charge) {
    setBusy(true)
    setError(null)
    setMessage('')
    try {
      await registerNfe(charge.id, noteKey)
      setNoteId(null)
      setNoteKey('')
      setMessage('Chave da NF-e registrada no pedido.')
      setCharges(await getAdminCharges())
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível registrar a NF-e.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <div className="billing-heading">
        <h2>Cobranças Pix</h2>
        {mode ? <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => void load()}>Atualizar lista</button> : null}
      </div>
      {configError || error ? <Alert variant="error">{configError || error}</Alert> : null}
      {message ? <Alert variant="success">{message}</Alert> : null}
      {config && !mode ? <Alert variant="info">Ative o Asaas para consultar e estornar cobranças Pix.</Alert> : null}
      {mode === 'sandbox' ? <Alert variant="info">Cobranças de teste do Asaas.</Alert> : null}
      {mode && charges?.length === 0 ? <p className="muted">Nenhuma cobrança neste ambiente.</p> : null}
      <div className="billing-stack">
        {charges?.map((charge) => (
          <article key={charge.id} className="card billing-panel">
            <div className="billing-heading">
              <h3>{charge.orderId ? `Pedido #${shortId(charge.orderId)}` : `Mensalidade #${shortId(charge.id)}`}</h3>
              <strong>{formatBRL(charge.amountCents)}</strong>
            </div>
            <p>{PAYMENT_LABELS[charge.status]} · Vence {formatBillingDate(charge.dueOn)}</p>
            <p className="muted small">{charge.orderId ? 'NF-e' : 'NFS-e'} · {FISCAL_LABELS[charge.fiscalStatus]}</p>
            {charge.fiscalUrl ? <a href={charge.fiscalUrl} target="_blank" rel="noreferrer">Abrir nota fiscal</a> : null}
            {charge.fiscalKey ? <p className="small" style={{ overflowWrap: 'anywhere' }}>{charge.fiscalKey}</p> : null}
            {charge.orderId && charge.status === 'paid' ? (
              noteId === charge.id ? (
                <form className="billing-form" onSubmit={(event) => { event.preventDefault(); void saveNote(charge) }}>
                  <label htmlFor="nfe-key">Chave da NF-e já emitida</label>
                  <input id="nfe-key" className="input" inputMode="numeric" required pattern="[0-9]{44}"
                    maxLength={44} value={noteKey} onChange={(event) => setNoteKey(event.target.value)} />
                  <button className="btn btn-primary btn-sm" disabled={busy}>Salvar chave</button>
                </form>
              ) : (
                <button type="button" className="btn btn-outline btn-sm" disabled={busy}
                  onClick={() => { setNoteId(charge.id); setNoteKey(charge.fiscalKey ?? '') }}>
                  {charge.fiscalKey ? 'Corrigir chave da NF-e' : 'Registrar NF-e'}
                </button>
              )
            ) : null}
            {charge.canRefund ? (
              <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => void refund(charge)}>
                Estornar Pix
              </button>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  )
}
