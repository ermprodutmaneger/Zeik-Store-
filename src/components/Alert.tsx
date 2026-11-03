import type { ReactNode } from 'react'
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react'

type AlertVariant = 'error' | 'success' | 'info' | 'warning'

const ICONS: Record<AlertVariant, ReactNode> = {
  error: <AlertCircle size={19} aria-hidden />,
  success: <CheckCircle2 size={19} aria-hidden />,
  info: <Info size={19} aria-hidden />,
  warning: <AlertTriangle size={19} aria-hidden />,
}

export function Alert({
  variant,
  children,
}: {
  variant: AlertVariant
  children: ReactNode
}) {
  return (
    <div className={`alert alert-${variant}`} role={variant === 'error' ? 'alert' : 'status'}>
      {ICONS[variant]}
      <div>{children}</div>
    </div>
  )
}
