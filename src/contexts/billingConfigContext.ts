import { createContext, useContext } from 'react'
import type { BillingConfig } from '../services/billing'

export const BillingConfigContext = createContext<{
  config: BillingConfig | null
  error: string | null
}>({ config: null, error: null })

export function useBillingConfig() {
  return useContext(BillingConfigContext)
}
