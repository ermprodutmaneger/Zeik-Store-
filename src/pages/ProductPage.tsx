import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  Check,
  ChevronRight,
  FlaskConical,
  PackageSearch,
  ShoppingCart,
  Zap,
} from 'lucide-react'
import { Alert } from '../components/Alert'
import { EmptyState } from '../components/EmptyState'
import { LoadingScreen } from '../components/LoadingScreen'
import { ProductCard } from '../components/ProductCard'
import { ProductImage } from '../components/ProductImage'
import { QuantityStepper } from '../components/QuantityStepper'
import { useCart } from '../hooks/useCart'
import { formatBRL } from '../lib/format'
import { getProductBySlug, listRelatedProducts } from '../services/catalog'
import type { ProductWithCategory } from '../types/database'

interface ProductResult {
  slug: string
  product: ProductWithCategory | null
  related: ProductWithCategory[]
  failed: boolean
}

export function ProductPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { addItem } = useCart()

  const [result, setResult] = useState<ProductResult | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [added, setAdded] = useState(false)

  // Ao trocar de produto, reinicia quantidade e feedback (sem efeito).
  const [lastSlug, setLastSlug] = useState(slug)
  if (slug !== lastSlug) {
    setLastSlug(slug)
    setQuantity(1)
    setAdded(false)
  }

  useEffect(() => {
    let active = true
    async function load() {
      if (!slug) return
      try {
        const found = await getProductBySlug(slug)
        const related = found ? await listRelatedProducts(found) : []
        if (active) setResult({ slug, product: found, related, failed: false })
      } catch {
        if (active) setResult({ slug, product: null, related: [], failed: true })
      }
    }
    void load()
    return () => {
      active = false
    }
  }, [slug])

  const currentResult = result && result.slug === slug ? result : null
  const product = currentResult?.product ?? null
  const related = currentResult?.related ?? []
  const loading = currentResult === null
  const error = currentResult?.failed
    ? 'Não foi possível carregar este produto. Tente novamente.'
    : null

  useEffect(() => {
    document.title = product ? `${product.name} · Zeik Store` : 'Zeik Store — Loja de testes'
    return () => {
      document.title = 'Zeik Store — Loja de testes'
    }
  }, [product])

  if (loading) return <LoadingScreen message="Carregando produto…" />

  if (error) {
    return (
      <div className="container page">
        <Alert variant="error">{error}</Alert>
        <Link to="/" className="btn btn-outline">
          Voltar para a loja
        </Link>
      </div>
    )
  }

  if (!product) {
    return (
      <div className="container page">
        <EmptyState
          icon={<PackageSearch size={30} />}
          title="Produto não encontrado"
          description="Este produto não existe ou foi desativado pelo administrador."
          action={
            <Link to="/" className="btn btn-primary">
              Ver o catálogo
            </Link>
          }
        />
      </div>
    )
  }

  const outOfStock = product.stock <= 0
  const lowStock = !outOfStock && product.stock <= 5
  const maxQty = Math.min(99, Math.max(1, product.stock))

  function addToCart(goToCart: boolean) {
    if (!product) return
    addItem(
      {
        productId: product.id,
        slug: product.slug,
        name: product.name,
        priceCents: product.price_cents,
        imageUrl: product.image_url,
      },
      quantity,
    )
    if (goToCart) {
      navigate('/carrinho')
    } else {
      setAdded(true)
    }
  }

  return (
    <div className="container page">
      <nav className="breadcrumb" aria-label="Você está em">
        <Link to="/">Início</Link>
        <ChevronRight size={15} aria-hidden />
        {product.categories ? (
          <>
            <Link to={`/?categoria=${product.categories.slug}`}>
              {product.categories.name}
            </Link>
            <ChevronRight size={15} aria-hidden />
          </>
        ) : null}
        <span aria-current="page">{product.name}</span>
      </nav>

      <div className="product-layout">
        <div className="product-gallery animate-in">
          <ProductImage src={product.image_url} alt={product.name} />
        </div>

        <div className="product-info animate-in">
          {product.categories ? (
            <span className="badge badge-cyan">{product.categories.name}</span>
          ) : (
            <span className="badge badge-violet">Zeik Store</span>
          )}
          <h1>{product.name}</h1>

          {outOfStock ? (
            <span className="badge badge-danger">Esgotado no momento</span>
          ) : lowStock ? (
            <span className="badge badge-warning">
              Últimas {product.stock} unidades em estoque
            </span>
          ) : (
            <span className="badge badge-success">Em estoque ({product.stock} unidades)</span>
          )}

          <p className="big-price">{formatBRL(product.price_cents)}</p>
          <p className="small muted">Preço de demonstração — os pedidos são de teste.</p>

          {product.description ? <p className="product-desc">{product.description}</p> : null}

          <div className="buy-box">
            <QuantityStepper
              value={quantity}
              onChange={setQuantity}
              max={maxQty}
              disabled={outOfStock}
            />
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => addToCart(false)}
              disabled={outOfStock}
            >
              {added ? <Check size={18} aria-hidden /> : <ShoppingCart size={18} aria-hidden />}
              {added ? 'Adicionado!' : 'Adicionar ao carrinho'}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => addToCart(true)}
              disabled={outOfStock}
            >
              <Zap size={18} aria-hidden />
              Comprar agora
            </button>
          </div>

          {added ? (
            <p className="buy-note">
              <Check size={16} aria-hidden />
              Produto no carrinho.
              <Link to="/carrinho">Ver carrinho</Link>
            </p>
          ) : (
            <p className="buy-note">
              <FlaskConical size={16} aria-hidden />
              Ao finalizar, o pedido de teste é salvo no banco e baixa o estoque —
              sem nenhuma cobrança.
            </p>
          )}
        </div>
      </div>

      {related.length > 0 ? (
        <section>
          <div className="section-head">
            <h2 className="section-title">Você também pode gostar</h2>
          </div>
          <div className="product-grid">
            {related.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
