import { Minus, Plus } from 'lucide-react'

interface QuantityStepperProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  disabled?: boolean
  label?: string
}

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 99,
  disabled = false,
  label = 'Quantidade',
}: QuantityStepperProps) {
  return (
    <div className="qty-stepper" role="group" aria-label={label}>
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={disabled || value <= min}
        aria-label="Diminuir quantidade"
      >
        <Minus size={17} />
      </button>
      <span className="qty-value" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={disabled || value >= max}
        aria-label="Aumentar quantidade"
      >
        <Plus size={17} />
      </button>
    </div>
  )
}
