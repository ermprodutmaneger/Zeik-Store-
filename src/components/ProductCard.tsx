import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ShoppingCart } from 'lucide-react'
import { useCart } from '../hooks/useCart'
import { formatBRL } from '../lib/format'
import type { ProductWithCategory } from '../types/database'
import { ProductImage } from './ProductImage'

export function ProductCard({ product }: { product: ProductWithCategory }) {
  const { addItem } = useCart()
  const [added, setAdded] = useState(false)
  const timerRef = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timerRef.current), [])

  const outOfStock = product.stock <= 0
  const lowStock = !outOfStock && product.stock <= 5

  function handleAdd() {
    addItem(
      {
        productId: product.id,
        slug: product.slug,
        name: product.name,
        priceCents: product.price_cents,
        imageUrl: product.image_url,
      },
      1,
    )
    setAdded(true)
    window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setAdded(false), 1400)
  }

  return (
    <article className="product-card">
      <Link
        to={`/produto/${product.slug}`}
        className="product-media"
        aria-label={`Ver ${product.name}`}
      >
        <ProductImage src={product.image_url} alt={product.name} />
        {outOfStock ? (
          <span className="badge badge-danger stock-flag">Esgotado</span>
        ) : lowStock ? (
          <span className="badge badge-warning stock-flag">Últimas unidades</span>
        ) : null}
      </Link>

      <div className="product-body">
        {product.categories ? (
          <span className="product-cat">{product.categories.name}</span>
        ) : (
          <span className="product-cat">Zeik Store</span>
        )}
        <Link to={`/produto/${product.slug}`} className="product-name">
          {product.name}
        </Link>
        <div className="product-foot">
          <span className="product-price">{formatBRL(product.price_cents)}</span>
          <button
            type="button"
            className={`add-btn${added ? ' added' : ''}`}
            onClick={handleAdd}
            disabled={outOfStock}
            aria-label={
              outOfStock
                ? `${product.name} esgotado`
                : `Adicionar ${product.name} ao carrinho`
            }
          >
            {added ? <Check size={19} /> : <ShoppingCart size={19} />}
          </button>
        </div>
      </div>
    </article>
  )
}
