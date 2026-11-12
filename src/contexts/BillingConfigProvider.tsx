import { useEffect, useState, type ReactNode } from 'react'
import { getBillingConfig, type BillingConfig } from '../services/billing'
import { BillingConfigContext } from './billingConfigContext'

export function BillingConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<BillingConfig | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    getBillingConfig()
      .then((value) => { if (active) setConfig(value) })
      .catch(() => { if (active) setError('Não foi possível verificar as opções de pagamento. Recarregue a página.') })
    return () => { active = false }
  }, [])
  return <BillingConfigContext.Provider value={{ config, error }}>{children}</BillingConfigContext.Provider>
}
