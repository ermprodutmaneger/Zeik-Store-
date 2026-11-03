import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Package, Pencil, Plus, Search, SearchX, Trash2 } from 'lucide-react'
import { Alert } from '../../components/Alert'
import { EmptyState } from '../../components/EmptyState'
import { LoadingScreen } from '../../components/LoadingScreen'
import { ProductImage } from '../../components/ProductImage'
import { formatBRL } from '../../lib/format'
import { deleteProduct, listAllProducts, setProductActive } from '../../services/catalog'
import { deleteProductImage } from '../../services/storage'
import type { ProductWithCategory } from '../../types/database'

export function AdminProductsPage() {
  const location = useLocation()
  const navigate = useNavigate()

  const [notice, setNotice] = useState<string | null>(() => {
    const state = location.state as { notice?: string } | null
    return state?.notice ?? null
  })
  const [products, setProducts] = useState<ProductWithCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  useEffect(() => {
    if (notice) navigate(location.pathname, { replace: true, state: {} })
    // Só na montagem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let active = true
    listAllProducts()
      .then((data) => {
        if (active) setProducts(data)
      })
      .catch(() => {
        if (active) setError('Não foi possível carregar os produtos.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return products
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        p.slug.toLowerCase().includes(term) ||
        (p.categories?.name.toLowerCase().includes(term) ?? false),
    )
  }, [products, search])

  async function handleToggleActive(product: ProductWithCategory) {
    const next = !product.is_active
    setTogglingId(product.id)
    setError(null)
    setProducts((current) =>
      current.map((p) => (p.id === product.id ? { ...p, is_active: next } : p)),
    )
    try {
      await setProductActive(product.id, next)
    } catch {
      setProducts((current) =>
        current.map((p) => (p.id === product.id ? { ...p, is_active: !next } : p)),
      )
      setError(`Não foi possível ${next ? 'ativar' : 'desativar'} “${product.name}”.`)
    } finally {
      setTogglingId(null)
    }
  }

  async function handleDelete(product: ProductWithCategory) {
    setDeletingId(product.id)
    setError(null)
    try {
      await deleteProduct(product.id)
      if (product.image_path) {
        // Foto estava no Storage: limpa o arquivo (sem bloquear a exclusão).
        await deleteProductImage(product.image_path).catch(() => {})
      }
      setProducts((current) => current.filter((p) => p.id !== product.id))
      setConfirmDeleteId(null)
      setNotice(`Produto “${product.name}” excluído.`)
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      if (/foreign key/i.test(message)) {
        setError(
          `“${product.name}” já aparece em pedidos e não pode ser excluído, para preservar o histórico. Desative o produto em vez disso.`,
        )
      } else {
        setError(`Não foi possível excluir “${product.name}”. ${message}`.trim())
      }
      setConfirmDeleteId(null)
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) return <LoadingScreen message="Carregando produtos…" />

  return (
    <div>
      {notice ? <Alert variant="success">{notice}</Alert> : null}
      {error ? <Alert variant="error">{error}</Alert> : null}

      <div className="catalog-toolbar">
        <div className="toolbar-search input-with-icon">
          <Search size={18} aria-hidden />
          <label className="sr-only" htmlFor="busca-produtos-admin">
            Buscar produto
          </label>
          <input
            id="busca-produtos-admin"
            className="input"
            type="search"
            placeholder="Buscar por nome, slug ou categoria…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Link to="/admin/produtos/novo" className="btn btn-primary">
          <Plus size={18} aria-hidden />
          Novo produto
        </Link>
      </div>

      {products.length === 0 ? (
        <EmptyState
          icon={<Package size={30} />}
          title="Nenhum produto cadastrado"
          description="Cadastre o primeiro produto ou execute o seed (supabase/seed.sql) para ver a vitrine funcionando."
          action={
            <Link to="/admin/produtos/novo" className="btn btn-primary">
              Cadastrar produto
            </Link>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<SearchX size={30} />}
          title="Nada encontrado"
          description={`Nenhum produto combina com “${search}”.`}
          action={
            <button type="button" className="btn btn-outline" onClick={() => setSearch('')}>
              Limpar busca
            </button>
          }
        />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Produto</th>
                <th scope="col">Categoria</th>
                <th scope="col">Preço</th>
                <th scope="col">Estoque</th>
                <th scope="col">Ativo</th>
                <th scope="col" style={{ textAlign: 'right' }}>
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((product) => (
                <tr key={product.id}>
                  <td>
                    <div className="table-product">
                      <span className="table-thumb">
                        <ProductImage src={product.image_url} alt={product.name} />
                      </span>
                      <span>
                        <strong>{product.name}</strong>
                        <br />
                        <span className="muted small">/produto/{product.slug}</span>
                      </span>
                    </div>
                  </td>
                  <td>{product.categories?.name ?? 'Sem categoria'}</td>
                  <td>{formatBRL(product.price_cents)}</td>
                  <td>
                    {product.stock === 0 ? (
                      <span className="badge badge-danger">Esgotado</span>
                    ) : product.stock <= 5 ? (
                      <span className="badge badge-warning">{product.stock} un.</span>
                    ) : (
                      <>{product.stock} un.</>
                    )}
                  </td>
                  <td>
                    <label className="switch">
                      <input
                        type="checkbox"
                        checked={product.is_active}
                        disabled={togglingId === product.id}
                        onChange={() => void handleToggleActive(product)}
                        aria-label={`${product.is_active ? 'Desativar' : 'Ativar'} ${product.name}`}
                      />
                      <span className="switch-track" />
                    </label>
                  </td>
                  <td>
                    {confirmDeleteId === product.id ? (
                      <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => void handleDelete(product)}
                          disabled={deletingId === product.id}
                        >
                          {deletingId === product.id ? 'Excluindo…' : 'Confirmar exclusão'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          Cancelar
                        </button>
                      </span>
                    ) : (
                      <span className="row-actions">
                        <Link
                          to={`/admin/produtos/${product.id}/editar`}
                          className="btn btn-outline btn-sm"
                        >
                          <Pencil size={15} aria-hidden />
                          Editar
                        </Link>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setConfirmDeleteId(product.id)}
                          aria-label={`Excluir ${product.name}`}
                        >
                          <Trash2 size={15} aria-hidden />
                          Excluir
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="small muted" style={{ marginTop: 14 }}>
        Produtos que já estão em pedidos não podem ser excluídos (o histórico é
        preservado): use o interruptor “Ativo” para tirá-los da vitrine.
      </p>
    </div>
  )
}
