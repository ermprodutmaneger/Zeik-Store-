import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Alert } from '../components/Alert'
import { BillingDocument, PixCard } from '../components/PixCard'
import { useBillingConfig } from '../contexts/billingConfigContext'
import { formatBRL } from '../lib/format'
import {
  cancelMembership, FISCAL_LABELS, formatBillingDate, getMemberships, getPix, PAYMENT_LABELS,
  subscribeToPlan, type Charge, type Membership, type Pix,
} from '../services/billing'

export function MembershipPage() {
  const { config, error: configError } = useBillingConfig()
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [document, setDocument] = useState('')
  const [paymentForm, setPaymentForm] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [pix, setPix] = useState<{ chargeId: string; code: Pix } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mode = config?.mode

  const refresh = useCallback(async () => setMemberships(await getMemberships()), [])
  useEffect(() => {
    if (!mode) return
    function check() {
      void refresh().catch((failure: Error) => setError(failure.message))
    }
    check()
    const timer = window.setInterval(() => { if (!window.document.hidden) check() }, 12_000)
    return () => window.clearInterval(timer)
  }, [mode, refresh])

  async function run(action: () => Promise<unknown>) {
    setBusy(true)
    setError(null)
    try {
      await action()
      await refresh()
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Operação indisponível.')
    } finally {
      setBusy(false)
    }
  }

  function subscribe(event: FormEvent, planId: string) {
    event.preventDefault()
    void run(async () => {
      await subscribeToPlan(planId, document)
      setSelected(null)
      setDocument('')
    })
  }

  function showPix(charge: Charge) {
    void run(async () => {
      const code = await getPix(charge.id, document)
      setPix(code.payload ? { chargeId: charge.id, code } : null)
      setPaymentForm(null)
      setDocument('')
    })
  }

  return (
    <div className="container page">
      <h1 className="page-title">Minhas mensalidades</h1>
      <p className="page-subtitle">Acompanhe o vencimento, pague por Pix e acesse os benefícios do seu plano.</p>
      {configError || error ? <Alert variant="error">{configError || error}</Alert> : null}
      {mode === 'sandbox' ? <Alert variant="info">Ambiente de testes de pagamento.</Alert> : null}

      <div className="billing-stack">
        {memberships.map((membership) => {
          const payable = (charge: Charge) =>
            !membership.canceledAt && ['pending', 'overdue'].includes(charge.status)
          const needsDocument = (charge: Charge) =>
            charge.provider === 'mercadopago' && charge.mode === 'production' && !charge.hasPix
          return (
            <article className="card billing-panel" key={membership.id}>
              <div className="billing-heading">
                <h2>{membership.name}</h2>
                <strong>{formatBRL(membership.monthlyCents)}/mês</strong>
              </div>
              <p className="muted">
                {membership.active && membership.until ? `Acesso liberado até ${formatBillingDate(membership.until)}.`
                  : 'Acesso liberado após a confirmação da mensalidade.'}
                {membership.canceledAt ? ' Renovação cancelada.' : null}
              </p>
              {membership.content ? <p className="member-content">{membership.content}</p> : null}
              {membership.ready && !membership.canceledAt && membership.payments.length === 0
                ? <p role="status">A primeira mensalidade está sendo gerada.</p> : null}
              {membership.payments.map((charge) => (
                <div className="billing-charge" key={charge.id}>
                  <div className="billing-heading">
                    <p>
                      <strong>{PAYMENT_LABELS[charge.status]}</strong><br />
                      <span className="small muted">Vencimento {formatBillingDate(charge.dueOn)}</span>
                    </p>
                    {payable(charge) && paymentForm !== charge.id ? (
                      <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => {
                        if (needsDocument(charge)) {
                          setPaymentForm(charge.id)
                          setSelected(null)
                          setDocument('')
                        } else showPix(charge)
                      }}>
                        {charge.hasPix ? 'Ver Pix' : 'Gerar Pix'}
                      </button>
                    ) : null}
                  </div>
                  {payable(charge) && paymentForm === charge.id ? (
                    <form className="billing-form" onSubmit={(event) => { event.preventDefault(); showPix(charge) }}>
                      <BillingDocument value={document} onChange={setDocument} provider={charge.provider} />
                      <button className="btn btn-primary btn-sm" disabled={busy}>Gerar Pix</button>
                    </form>
                  ) : null}
                  {payable(charge) && pix?.chargeId === charge.id
                    ? <PixCard pix={pix.code} sandbox={charge.mode === 'sandbox'} provider={charge.provider} /> : null}
                  {charge.fiscalUrl ? <a href={charge.fiscalUrl} target="_blank" rel="noreferrer">Abrir NFS-e</a>
                    : charge.status === 'paid' ? <p className="small muted">NFS-e · {FISCAL_LABELS[charge.fiscalStatus]}</p> : null}
                </div>
              ))}
              {!membership.canceledAt ? (
                <button type="button" className="btn btn-outline btn-sm" disabled={busy}
                  onClick={() => {
                    if (window.confirm('Cancelar as próximas mensalidades deste plano?')) {
                      void run(() => cancelMembership(membership.id))
                    }
                  }}>
                  Cancelar renovação
                </button>
              ) : null}
            </article>
          )
        })}

        {config?.plans.map((plan) => {
          const existing = memberships.find((item) => item.planId === plan.id && !item.canceledAt)
          if (existing?.ready) return null
          return (
            <article className="card billing-panel" key={plan.id}>
              <div className="billing-heading">
                <h2>{plan.name}</h2>
                <strong>{formatBRL(plan.monthly_cents)}/mês</strong>
              </div>
              <p>{plan.description}</p>
              <p className="muted small">Um Pix por mês. Você paga cada cobrança no banco e pode cancelar a renovação aqui.</p>
              {selected === plan.id ? (
                <form className="billing-form" onSubmit={(event) => subscribe(event, plan.id)}>
                  {config.provider === 'mercadopago' ? null : <BillingDocument value={document} onChange={setDocument} />}
                  <button type="submit" className="btn btn-primary" disabled={busy}>
                    {busy ? 'Registrando…' : 'Confirmar assinatura mensal'}
                  </button>
                </form>
              ) : (
                <button type="button" className="btn btn-primary" disabled={busy}
                  onClick={() => { setSelected(plan.id); setPaymentForm(null); setDocument('') }}>
                  {existing ? 'Concluir assinatura' : 'Assinar com Pix'}
                </button>
              )}
            </article>
          )
        })}
        {config && !config.plans.length && !memberships.length
          ? <p className="muted">A loja ainda não oferece planos para assinatura.</p> : null}
      </div>
      <Link to="/conta" className="btn btn-outline" style={{ marginTop: 20 }}>Minha conta</Link>
    </div>
  )
}
