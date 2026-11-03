import { useContext } from 'react'
import { CartContext, type CartContextValue } from '../contexts/cartContext'

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext)
  if (!ctx) throw new Error('useCart deve ser usado dentro de <CartProvider>.')
  return ctx
}
