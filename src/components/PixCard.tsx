import { useId, useState } from 'react'
import { Copy } from 'lucide-react'
import { Alert } from './Alert'
import { type Pix } from '../services/billing'

export function PixCard({ pix, sandbox }: { pix: Pix; sandbox: boolean }) {
  const field = useId()
  const [message, setMessage] = useState('')

  async function copy() {
    try {
      await navigator.clipboard.writeText(pix.payload)
      setMessage('Código Pix copiado.')
    } catch {
      setMessage('Selecione o código e copie pelo seu aparelho.')
    }
  }

  return (
    <div className="pix-card">
      {sandbox ? <Alert variant="info">Pix de teste do Asaas. Use o simulador do Asaas para confirmar.</Alert> : null}
      <img width="192" height="192" src={`data:image/png;base64,${pix.encodedImage}`} alt="QR Code Pix da cobrança" />
      <div className="field">
        <label htmlFor={field}>Pix Copia e Cola</label>
        <div className="pix-copy">
          <input id={field} className="input" value={pix.payload} readOnly onFocus={(e) => e.target.select()} />
          <button type="button" className="btn btn-primary" onClick={() => void copy()}>
            <Copy size={16} aria-hidden /> Copiar
          </button>
        </div>
      </div>
      <span className="small" role="status">{message}</span>
    </div>
  )
}

export function BillingDocument({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const field = useId()
  return (
    <div className="field">
      <label htmlFor={field}>CPF ou CNPJ do pagador</label>
      <input id={field} className="input" value={value} onChange={(e) => onChange(e.target.value)}
        autoComplete="off" maxLength={22} required />
      <p className="muted small">Enviado ao Asaas para identificar o pagador.</p>
    </div>
  )
}
