const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

/** Formata um valor em centavos inteiros para reais (ex.: 34990 → "R$ 349,90"). */
export function formatBRL(cents: number): string {
  return brlFormatter.format(cents / 100)
}

/** Formata uma data ISO do banco (ex.: "03/11/2026, 10:25"). */
export function formatDateTime(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : dateTimeFormatter.format(date)
}

/** Converte centavos para o texto editável do formulário (ex.: 34990 → "349,90"). */
export function centsToInput(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/**
 * Converte o texto digitado no formulário para centavos inteiros.
 * Aceita "349,90", "1.234,56", "349.90" e "349". Retorna null se inválido.
 */
export function inputToCents(value: string): number | null {
  const raw = value
    .trim()
    .replace(/^R\$\s*/, '')
    .replace(/\s/g, '')
  if (!raw || !/^[\d.,]+$/.test(raw)) return null

  let normalized: string
  if (raw.includes(',')) {
    // Formato pt-BR: ponto é milhar, vírgula é decimal.
    normalized = raw.replace(/\./g, '').replace(',', '.')
  } else if (/^\d{1,3}(\.\d{3})+$/.test(raw)) {
    // Apenas separadores de milhar, sem decimais (ex.: "1.234").
    normalized = raw.replace(/\./g, '')
  } else {
    // Ponto decimal ou número inteiro.
    normalized = raw
  }

  const num = Number(normalized)
  if (!Number.isFinite(num) || num < 0) return null
  return Math.round(num * 100)
}

/** Primeiros 8 caracteres de um UUID, para exibir o número do pedido. */
export function shortId(id: string): string {
  return id.slice(0, 8).toUpperCase()
}
