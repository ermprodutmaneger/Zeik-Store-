import { createContext } from 'react'
import type { CartItem } from '../types/database'

export interface AddToCartInput {
  productId: string
  slug: string
  name: string
  priceCents: number
  imageUrl: string | null
}

export interface CartContextValue {
  items: CartItem[]
  totalItems: number
  subtotalCents: number
  addItem: (item: AddToCartInput, quantity?: number) => void
  removeItem: (productId: string) => void
  setQuantity: (productId: string, quantity: number) => void
  replaceItems: (items: CartItem[]) => void
  clear: () => void
}

export const CartContext = createContext<CartContextValue | null>(null)
