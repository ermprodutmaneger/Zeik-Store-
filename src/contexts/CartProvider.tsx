import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { CartItem } from '../types/database'
import { CartContext, type AddToCartInput, type CartContextValue } from './cartContext'

/**
 * O carrinho persiste apenas no navegador (localStorage), como permitido
 * pela especificação. Catálogo, perfis e pedidos vivem no Supabase, e a
 * finalização revalida preço e estoque no banco.
 */
const STORAGE_KEY = 'zeik-store-cart-v1'
const MAX_QUANTITY = 99

function isValidCartItem(value: unknown): value is CartItem {
  if (typeof value !== 'object' || value === null) return false
  const item = value as Record<string, unknown>
  return (
    typeof item.productId === 'string' &&
    typeof item.slug === 'string' &&
    typeof item.name === 'string' &&
    typeof item.priceCents === 'number' &&
    typeof item.quantity === 'number' &&
    (item.imageUrl === null || typeof item.imageUrl === 'string')
  )
}

function loadInitialCart(): CartItem[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isValidCartItem).map((item) => ({
      ...item,
      quantity: Math.min(Math.max(1, Math.floor(item.quantity)), MAX_QUANTITY),
    }))
  } catch {
    return []
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(loadInitialCart)

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
    } catch {
      // Armazenamento indisponível (modo privado etc.): o carrinho segue em memória.
    }
  }, [items])

  const addItem = useCallback((input: AddToCartInput, quantity = 1) => {
    const safeQty = Math.min(Math.max(1, Math.floor(quantity)), MAX_QUANTITY)
    setItems((current) => {
      const existing = current.find((item) => item.productId === input.productId)
      if (existing) {
        return current.map((item) =>
          item.productId === input.productId
            ? {
                ...item,
                // Atualiza o snapshot com os dados mais recentes exibidos.
                name: input.name,
                priceCents: input.priceCents,
                imageUrl: input.imageUrl,
                slug: input.slug,
                quantity: Math.min(item.quantity + safeQty, MAX_QUANTITY),
              }
            : item,
        )
      }
      return [...current, { ...input, quantity: safeQty }]
    })
  }, [])

  const removeItem = useCallback((productId: string) => {
    setItems((current) => current.filter((item) => item.productId !== productId))
  }, [])

  const setQuantity = useCallback((productId: string, quantity: number) => {
    setItems((current) => {
      if (quantity <= 0) return current.filter((item) => item.productId !== productId)
      return current.map((item) =>
        item.productId === productId
          ? { ...item, quantity: Math.min(Math.floor(quantity), MAX_QUANTITY) }
          : item,
      )
    })
  }, [])

  const replaceItems = useCallback((next: CartItem[]) => {
    setItems(next)
  }, [])

  const clear = useCallback(() => setItems([]), [])

  const value = useMemo<CartContextValue>(() => {
    const totalItems = items.reduce((acc, item) => acc + item.quantity, 0)
    const subtotalCents = items.reduce(
      (acc, item) => acc + item.priceCents * item.quantity,
      0,
    )
    return {
      items,
      totalItems,
      subtotalCents,
      addItem,
      removeItem,
      setQuantity,
      replaceItems,
      clear,
    }
  }, [items, addItem, removeItem, setQuantity, replaceItems, clear])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}
