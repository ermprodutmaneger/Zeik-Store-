import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FlaskConical, Info, ShoppingCart, Trash2 } from 'lucide-react'
import { Alert } from '../components/Alert'
import { EmptyState } from '../components/EmptyState'
import { ProductImage } from '../components/ProductImage'
import { QuantityStepper } from '../components/QuantityStepper'
import { useAuth } from '../hooks/useAuth'
import { useCart } from '../hooks/useCart'
import { formatBRL } from '../lib/format'
import { revalidateCartItems } from '../services/catalog'
import { createTestOrder } from '../services/orders'
import type { CartItem } from '../types/database'

export function CartPage() {
  const { items, setQuantity, removeItem, replaceItems, clear, subtotalCents, totalItems } =
    useCart()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [notices, setNotices] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)

  // A mesma chave é reusada nas tentativas: se a resposta se perder,
  // o banco devolve o MESMO pedido em vez de duplicar. Só muda quando
  // o conteúdo do carrinho muda.
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID())
  const signature = items.map((i) => `${i.productId}:${i.quantity}`).join('|')
  const signatureRef = useRef(signature)
  useEffect(() => {
    if (signatureRef.current !== signature) {
      signatureRef.current = signature
      idempotencyKeyRef.current = crypto.randomUUID()
    }
  }, [signature])

  const itemsRef = useRef(items)
  useEffect(() => {
    itemsRef.current = items
  }, [items])

  // Ao abrir o carrinho, confere preço/estoque atuais no banco.
  const idsKey = items
    .map((i) => i.productId)
    .slice()
    .sort()
    .join(',')
  useEffect(() => {
    if (!idsKey) return
    let active = true
    revalidateCartItems(idsKey.split(','))
      .then((rows) => {
        if (!active) return
        const current = itemsRef.current
        const next: CartItem[] = []
        const notes: string[] = []

        for (const item of current) {
          const row = rows.find((r) => r.productId === item.productId)
          if (!row || !row.available) {
            notes.push(`“${item.name}” ficou indisponível e foi removido do carrinho.`)
            continue
          }
          if (row.stock <= 0) {
            notes.push(`“${item.name}” esgotou e foi removido do carrinho.`)
            continue
          }
          const updated: CartItem = { ...item, name: row.name || item.name, imageUrl: row.imageUrl }
          if (row.priceCents !== item.priceCents) {
            notes.push(
              `O preço de “${item.name}” mudou para ${formatBRL(row.priceCents)} e foi atualizado.`,
            )
            updated.priceCents = row.priceCents
          }
          if (row.stock < item.quantity) {
            notes.push(
              `A quantidade de “${item.name}” foi ajustada para ${row.stock} (estoque disponível).`,
            )
            updated.quantity = row.stock
          }
          next.push(updated)
        }

        if (JSON.stringify(next) !== JSON.stringify(current)) {
          replaceItems(next)
        }
        if (notes.length > 0) setNotices(notes)
      })
      .catch(() => {
        // Sem revalidação agora, o banco valida tudo de novo ao finalizar.
      })
    return () => {
      active = false
    }
  }, [idsKey, replaceItems])

  async function handleCheckout() {
    if (!user) {
      navigate('/entrar', { state: { from: '/carrinho' } })
      return
    }
    setSubmitting(true)
    setCheckoutError(null)
    try {
      const orderId = await createTestOrder(
        items.map((i) => ({ product_id: i.productId, quantity: i.quantity })),
        idempotencyKeyRef.current,
      )
      clear()
      navigate(`/pedido-concluido/${orderId}`)
    } catch (err) {
      setCheckoutError(
        err instanceof Error
          ? err.message
          : 'Não foi possível finalizar o pedido de teste. Tente novamente.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (items.length === 0) {
    return (
      <div className="container page">
        <h1 className="page-title" style={{ marginBottom: 20 }}>
          Seu carrinho
        </h1>
        <EmptyState
          icon={<ShoppingCart size={30} />}
          title="Carrinho vazio"
          description="Adicione produtos da vitrine para montar um pedido de teste."
          action={
            <Link to="/" className="btn btn-primary">
              Ver produtos
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div className="container page">
      <h1 className="page-title">Seu carrinho</h1>
      <p className="page-subtitle" style={{ marginBottom: 22 }}>
        {totalItems} {totalItems === 1 ? 'item' : 'itens'} — preços e estoque são
        confirmados no banco ao abrir o carrinho e ao finalizar.
      </p>

      {notices.length > 0 ? (
        <Alert variant="info">
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {notices.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {checkoutError ? <Alert variant="error">{checkoutError}</Alert> : null}

      <div className="cart-layout">
        <div className="cart-items">
          {items.map((item) => (
            <article key={item.productId} className="cart-item animate-in">
              <Link to={`/produto/${item.slug}`} className="cart-thumb" aria-label={item.name}>
                <ProductImage src={item.imageUrl} alt={item.name} />
              </Link>
              <div className="cart-item-main">
                <Link to={`/produto/${item.slug}`} className="cart-item-name">
                  {item.name}
                </Link>
                <span className="small muted">{formatBRL(item.priceCents)} cada</span>
                <div className="cart-item-actions">
                  <QuantityStepper
                    value={item.quantity}
                    onChange={(qty) => setQuantity(item.productId, qty)}
                    label={`Quantidade de ${item.name}`}
                  />
                  <strong>{formatBRL(item.priceCents * item.quantity)}</strong>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => removeItem(item.productId)}
                    aria-label={`Remover ${item.name} do carrinho`}
                  >
                    <Trash2 size={16} aria-hidden />
                    Remover
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>

        <aside className="card cart-summary">
          <h2 style={{ fontSize: '1.15rem', marginBottom: 10 }}>Resumo do pedido</h2>
          <div className="summary-row">
            <span>Subtotal ({totalItems} {totalItems === 1 ? 'item' : 'itens'})</span>
            <span>{formatBRL(subtotalCents)}</span>
          </div>
          <div className="summary-row">
            <span>Entrega</span>
            <span>Simulada — grátis</span>
          </div>
          <div className="summary-row total">
            <span>Total do pedido de teste</span>
            <span>{formatBRL(subtotalCents)}</span>
          </div>

          <button
            type="button"
            className="btn btn-primary btn-lg btn-block"
            onClick={handleCheckout}
            disabled={submitting}
            style={{ marginTop: 16 }}
          >
            {submitting ? (
              <>
                <span className="spinner" aria-hidden />
                Registrando pedido…
              </>
            ) : user ? (
              'Finalizar pedido de teste'
            ) : (
              'Entrar para finalizar'
            )}
          </button>

          {!user ? (
            <p className="small muted" style={{ marginTop: 10, display: 'flex', gap: 6 }}>
              <Info size={15} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden />
              É preciso ter uma conta para registrar o pedido no seu histórico.
            </p>
          ) : null}

          <div className="test-order-note">
            <FlaskConical size={18} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden />
            <p>
              <strong>Pedido de teste, sem cobrança.</strong> Nenhum pagamento é
              feito: o pedido é salvo no banco, o estoque baixa e você acompanha
              tudo em “Minha conta”.
            </p>
          </div>

          <Link
            to="/"
            className="btn btn-ghost btn-block"
            style={{ marginTop: 10 }}
          >
            Continuar comprando
          </Link>
        </aside>
      </div>
    </div>
  )
}
