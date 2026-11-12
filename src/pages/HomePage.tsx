import { useBillingConfig } from '../contexts/billingConfigContext'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  BadgePercent,
  ClipboardCheck,
  Search,
  SearchX,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { Alert } from '../components/Alert'
import { EmptyState } from '../components/EmptyState'
import { ProductCard } from '../components/ProductCard'
import {
  listActiveProducts,
  listCategories,
  type ProductSort,
} from '../services/catalog'
import type { Category, ProductWithCategory } from '../types/database'

const SORT_OPTIONS: { value: ProductSort; label: string }[] = [
  { value: 'destaques', label: 'Destaques' },
  { value: 'menor-preco', label: 'Menor preço' },
  { value: 'maior-preco', label: 'Maior preço' },
  { value: 'nome', label: 'Nome (A–Z)' },
]

const LOAD_ERROR_MESSAGE =
  'Não foi possível carregar os produtos do banco. Verifique a conexão e se o schema/seed já foram executados no Supabase.'

function SkeletonGrid() {
  return (
    <div className="product-grid" aria-hidden>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="product-card" style={{ animation: 'none' }}>
          <div className="skeleton" style={{ aspectRatio: '4 / 3', borderRadius: 0 }} />
          <div className="product-body">
            <div className="skeleton" style={{ height: 12, width: '45%' }} />
            <div className="skeleton" style={{ height: 16, width: '90%' }} />
            <div className="skeleton" style={{ height: 20, width: '55%' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

interface CatalogResult {
  key: string
  products: ProductWithCategory[]
  failed: boolean
}

export function HomePage() {
  const { config } = useBillingConfig()
  const live = config?.legacyCheckout === false
  const [searchParams, setSearchParams] = useSearchParams()
  const searchParam = searchParams.get('busca') ?? ''
  const categoryParam = searchParams.get('categoria') ?? ''
  const sortParam = searchParams.get('ordenar') ?? 'destaques'
  const validSort: ProductSort = SORT_OPTIONS.some((o) => o.value === sortParam)
    ? (sortParam as ProductSort)
    : 'destaques'

  const [categories, setCategories] = useState<Category[]>([])
  const [reloadKey, setReloadKey] = useState(0)
  const [searchInput, setSearchInput] = useState(searchParam)
  const debounceRef = useRef<number | undefined>(undefined)

  // Mantém o campo sincronizado quando a busca vem do cabeçalho
  // (ajuste de estado na renderização, sem efeito).
  const [lastSearchParam, setLastSearchParam] = useState(searchParam)
  if (searchParam !== lastSearchParam) {
    setLastSearchParam(searchParam)
    setSearchInput(searchParam)
  }

  const isFiltering = Boolean(searchParam || categoryParam)

  // Resultado chaveado pela consulta atual: enquanto a chave não bate,
  // a vitrine está "carregando" (sem setState síncrono dentro do efeito).
  const queryKey = `${searchParam}|${categoryParam}|${validSort}|${reloadKey}`
  const [result, setResult] = useState<CatalogResult | null>(null)

  useEffect(() => {
    let active = true
    listCategories()
      .then((data) => {
        if (active) setCategories(data)
      })
      .catch(() => {
        // Sem categorias, a vitrine segue com "Todas".
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    let active = true
    listActiveProducts({
      search: searchParam,
      categorySlug: categoryParam || undefined,
      sort: validSort,
    })
      .then((data) => {
        if (active) setResult({ key: queryKey, products: data, failed: false })
      })
      .catch(() => {
        if (active) setResult({ key: queryKey, products: [], failed: true })
      })
    return () => {
      active = false
    }
  }, [searchParam, categoryParam, validSort, queryKey])

  const currentResult = result && result.key === queryKey ? result : null
  const loading = currentResult === null
  const products = currentResult?.products ?? []
  const error = currentResult?.failed ? LOAD_ERROR_MESSAGE : null

  const updateParam = useCallback(
    (key: string, value: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (value) next.set(key, value)
          else next.delete(key)
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  function handleSearchChange(value: string) {
    setSearchInput(value)
    window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => {
      updateParam('busca', value.trim())
    }, 350)
  }

  function clearFilters() {
    setSearchParams({}, { replace: true })
  }

  return (
    <div className="container">
      {!isFiltering ? (
        <>
          <section className="hero animate-in">
            <div className="hero-copy">
              <span className="hero-badge">
                <Sparkles size={14} aria-hidden />
                {live ? 'Zeik Store' : 'Loja de testes'}
              </span>
              <h1 className="hero-title">
                Tecnologia que combina com <span className="grad-text">você</span>
              </h1>
              <p className="hero-subtitle">
                {live ? 'Fones, relógios, caixas de som e acessórios. Consulte o estoque e as condições de retirada.'
                  : 'Explore o catálogo demonstrativo e teste o carrinho sem cobrança real.'}
              </p>
              <div className="hero-ctas">
                <a href="#catalogo" className="btn btn-primary btn-lg">
                  Ver produtos
                </a>
                <Link to="/cadastro" className="btn btn-outline btn-lg">
                  Criar minha conta
                </Link>
              </div>
            </div>
            <div className="hero-media">
              <img
                src="/demo/hero-zeik.jpg"
                alt="Acessórios de tecnologia em tons de roxo e ciano sobre fundo claro"
              />
            </div>
          </section>

          <section className="benefits" aria-label="Como comprar">
            <div className="benefit">
              <div className="benefit-icon">
                <BadgePercent size={22} aria-hidden />
              </div>
              <div>
                <h3>{live ? 'Pagamento via Pix' : 'Pedidos de teste'}</h3>
                <p>{live ? 'Gere o QR Code no pedido e acompanhe a confirmação pela loja.'
                  : 'Explore o checkout sem transferir dinheiro.'}</p>
              </div>
            </div>
            <div className="benefit">
              <div className="benefit-icon">
                <ClipboardCheck size={22} aria-hidden />
              </div>
              <div>
                <h3>Acompanhe seu pedido</h3>
                <p>Veja os itens, o total e o andamento em Minha conta.</p>
              </div>
            </div>
            <div className="benefit">
              <div className="benefit-icon">
                <ShieldCheck size={22} aria-hidden />
              </div>
              <div>
                <h3>Dados protegidos</h3>
                <p>Você só acessa os seus dados — a regra vale no banco (RLS), não só na tela.</p>
              </div>
            </div>
          </section>
        </>
      ) : null}

      <section id="catalogo">
        <div className="section-head">
          <h2 className="section-title">{isFiltering ? 'Resultados' : 'Catálogo'}</h2>
        </div>

        <div className="category-row" role="navigation" aria-label="Categorias">
          <button
            type="button"
            className={`chip${!categoryParam ? ' chip-active' : ''}`}
            onClick={() => updateParam('categoria', '')}
          >
            Todas
          </button>
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              className={`chip${categoryParam === category.slug ? ' chip-active' : ''}`}
              onClick={() => updateParam('categoria', category.slug)}
            >
              {category.name}
            </button>
          ))}
        </div>

        <div className="catalog-toolbar">
          <div className="toolbar-search input-with-icon">
            <Search size={18} aria-hidden />
            <label className="sr-only" htmlFor="busca-catalogo">
              Buscar no catálogo
            </label>
            <input
              id="busca-catalogo"
              className="input"
              type="search"
              placeholder="Buscar por nome ou descrição…"
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
          </div>

          <div className="toolbar-sort">
            <label className="sr-only" htmlFor="ordenar">
              Ordenar produtos
            </label>
            <select
              id="ordenar"
              className="select"
              value={validSort}
              onChange={(e) =>
                updateParam('ordenar', e.target.value === 'destaques' ? '' : e.target.value)
              }
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {!loading && !error ? (
            <span className="catalog-count">
              {products.length}{' '}
              {products.length === 1 ? 'produto encontrado' : 'produtos encontrados'}
            </span>
          ) : null}
        </div>

        {loading ? (
          <SkeletonGrid />
        ) : error ? (
          <>
            <Alert variant="error">{error}</Alert>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setReloadKey((k) => k + 1)}
            >
              Tentar novamente
            </button>
          </>
        ) : products.length === 0 ? (
          <EmptyState
            icon={<SearchX size={30} />}
            title="Nenhum produto encontrado"
            description={
              isFiltering
                ? 'Nada combinou com a busca ou a categoria escolhida. Tente outro termo ou limpe os filtros.'
                : 'O catálogo está vazio no banco. Execute o seed (supabase/seed.sql) ou cadastre produtos no painel do administrador.'
            }
            action={
              isFiltering ? (
                <button type="button" className="btn btn-primary" onClick={clearFilters}>
                  Limpar filtros
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="product-grid">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </section>

      <div style={{ height: 30 }} />
    </div>
  )
}
