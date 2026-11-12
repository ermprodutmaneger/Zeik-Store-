/**
 * Tipos do domínio espelhando o schema em supabase/schema.sql.
 * Valores monetários são sempre centavos inteiros (ex.: 34990 = R$ 349,90).
 */

export type UserRole = 'customer' | 'admin'

export type OrderStatus =
  | 'pendente'
  | 'confirmado'
  | 'em_preparo'
  | 'a_caminho'
  | 'entregue'
  | 'cancelado'

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pendente: 'Pendente',
  confirmado: 'Confirmado',
  em_preparo: 'Em preparo',
  a_caminho: 'Saiu para entrega',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
}

export const ORDER_STATUSES = Object.keys(ORDER_STATUS_LABELS) as OrderStatus[]

export interface Category {
  id: string
  name: string
  slug: string
  created_at: string
}

export interface Product {
  id: string
  category_id: string | null
  name: string
  slug: string
  description: string | null
  price_cents: number
  stock: number
  /** URL pública da foto (Storage ou imagem demonstrativa do seed). */
  image_url: string | null
  /** Caminho no bucket do Storage quando a foto foi enviada pelo painel; null para fotos externas/seed. */
  image_path: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface ProductWithCategory extends Product {
  categories: Pick<Category, 'name' | 'slug'> | null
}

export interface Profile {
  id: string
  full_name: string
  email: string
  created_at: string
  updated_at: string
}

export interface OrderItem {
  id: string
  order_id: string
  product_id: string
  /** Nome gravado no momento do pedido (histórico preservado). */
  product_name: string
  /** Preço unitário em centavos praticado no pedido. */
  unit_price_cents: number
  quantity: number
  subtotal_cents: number
}

export interface Order {
  id: string
  user_id: string
  status: OrderStatus
  total_cents: number
  is_test_order: boolean
  billing_mode: 'sandbox' | 'production' | null
  pickup_instructions: string | null
  idempotency_key: string | null
  created_at: string
  updated_at: string
}

export interface OrderWithItems extends Order {
  order_items: OrderItem[]
}

export interface OrderWithCustomer extends OrderWithItems {
  profiles: Pick<Profile, 'full_name' | 'email'> | null
}

/** Item do carrinho persistido no navegador (snapshot; o banco valida na finalização). */
export interface CartItem {
  productId: string
  slug: string
  name: string
  priceCents: number
  imageUrl: string | null
  quantity: number
}
