import { requireSupabase } from '../lib/supabase'
import { slugify } from '../lib/slug'
import type { Category, Product, ProductWithCategory } from '../types/database'

export type ProductSort = 'destaques' | 'menor-preco' | 'maior-preco' | 'nome'

export interface CatalogFilters {
  search?: string
  categorySlug?: string
  sort?: ProductSort
}

const PRODUCT_WITH_CATEGORY = '*, categories(name, slug)'

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message)
}

/** Remove caracteres que quebrariam o filtro `or(...)` do PostgREST. */
function sanitizeSearch(term: string): string {
  return term.replace(/[%_(),\\]/g, ' ').trim()
}

/** Lista as categorias do catálogo (leitura pública). */
export async function listCategories(): Promise<Category[]> {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('name', { ascending: true })
    .returns<Category[]>()
  throwIfError(error)
  return data ?? []
}

/** Vitrine: apenas produtos ativos, com busca, categoria e ordenação no banco. */
export async function listActiveProducts(
  filters: CatalogFilters = {},
): Promise<ProductWithCategory[]> {
  const supabase = requireSupabase()
  const { search, categorySlug, sort = 'destaques' } = filters

  let query = supabase
    .from('products')
    .select(PRODUCT_WITH_CATEGORY)
    .eq('is_active', true)

  if (categorySlug) {
    const { data: category, error } = await supabase
      .from('categories')
      .select('id')
      .eq('slug', categorySlug)
      .maybeSingle<{ id: string }>()
    throwIfError(error)
    if (!category) return []
    query = query.eq('category_id', category.id)
  }

  const term = sanitizeSearch(search ?? '')
  if (term) {
    query = query.or(`name.ilike.%${term}%,description.ilike.%${term}%`)
  }

  if (sort === 'menor-preco') query = query.order('price_cents', { ascending: true })
  else if (sort === 'maior-preco') query = query.order('price_cents', { ascending: false })
  else if (sort === 'nome') query = query.order('name', { ascending: true })
  else query = query.order('created_at', { ascending: false })

  const { data, error } = await query.returns<ProductWithCategory[]>()
  throwIfError(error)
  return data ?? []
}

/** Produto ativo pelo slug (página do produto). */
export async function getProductBySlug(slug: string): Promise<ProductWithCategory | null> {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_WITH_CATEGORY)
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle<ProductWithCategory>()
  throwIfError(error)
  return data ?? null
}

/** Outros produtos ativos da mesma categoria. */
export async function listRelatedProducts(
  product: Product,
  limit = 4,
): Promise<ProductWithCategory[]> {
  if (!product.category_id) return []
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_WITH_CATEGORY)
    .eq('is_active', true)
    .eq('category_id', product.category_id)
    .neq('id', product.id)
    .order('created_at', { ascending: false })
    .limit(limit)
    .returns<ProductWithCategory[]>()
  throwIfError(error)
  return data ?? []
}

export interface CartRevalidation {
  productId: string
  name: string
  priceCents: number
  stock: number
  imageUrl: string | null
  available: boolean
}

/**
 * Revalida preço/estoque/disponibilidade dos itens do carrinho contra o banco.
 * Produtos desativados não voltam na consulta (RLS) e são marcados indisponíveis.
 */
export async function revalidateCartItems(
  productIds: string[],
): Promise<CartRevalidation[]> {
  if (productIds.length === 0) return []
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from('products')
    .select('id, name, price_cents, stock, image_url, is_active')
    .in('id', productIds)
    .returns<
      {
        id: string
        name: string
        price_cents: number
        stock: number
        image_url: string | null
        is_active: boolean
      }[]
    >()
  throwIfError(error)
  const byId = new Map((data ?? []).map((row) => [row.id, row]))
  return productIds.map((productId) => {
    const row = byId.get(productId)
    if (!row) {
      return { productId, name: '', priceCents: 0, stock: 0, imageUrl: null, available: false }
    }
    return {
      productId,
      name: row.name,
      priceCents: row.price_cents,
      stock: row.stock,
      imageUrl: row.image_url,
      available: row.is_active,
    }
  })
}

/* ------------------------------------------------------------------ */
/* Administração (RLS garante que só administradores leem/escrevem)    */
/* ------------------------------------------------------------------ */

/** Todos os produtos (ativos e inativos) para o painel do administrador. */
export async function listAllProducts(): Promise<ProductWithCategory[]> {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from('products')
    .select(PRODUCT_WITH_CATEGORY)
    .order('created_at', { ascending: false })
    .returns<ProductWithCategory[]>()
  throwIfError(error)
  return data ?? []
}

export async function getProductById(id: string): Promise<Product | null> {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('id', id)
    .maybeSingle<Product>()
  throwIfError(error)
  return data ?? null
}

export interface ProductInput {
  name: string
  slug: string
  description: string | null
  category_id: string | null
  price_cents: number
  stock: number
  image_url: string | null
  image_path: string | null
  is_active: boolean
}

export async function createProduct(input: ProductInput): Promise<Product> {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from('products')
    .insert(input)
    .select('*')
    .single<Product>()
  throwIfError(error)
  return data as Product
}

export async function updateProduct(id: string, input: ProductInput): Promise<Product> {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from('products')
    .update(input)
    .eq('id', id)
    .select('*')
    .single<Product>()
  throwIfError(error)
  return data as Product
}

/** Ativa/desativa um produto sem reescrever os demais campos. */
export async function setProductActive(id: string, isActive: boolean): Promise<void> {
  const supabase = requireSupabase()
  const { error } = await supabase.from('products').update({ is_active: isActive }).eq('id', id)
  throwIfError(error)
}

/**
 * Exclui o produto. Falha com violação de chave estrangeira se houver itens
 * de pedidos referenciando-o — nesse caso, desative para preservar histórico.
 */
export async function deleteProduct(id: string): Promise<void> {
  const supabase = requireSupabase()
  const { error } = await supabase.from('products').delete().eq('id', id)
  throwIfError(error)
}

/** Cria uma categoria (slug gerado a partir do nome). */
export async function createCategory(name: string): Promise<Category> {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from('categories')
    .insert({ name: name.trim(), slug: slugify(name) })
    .select('*')
    .single<Category>()
  throwIfError(error)
  return data as Category
}

/** Limiar de estoque baixo exibido no painel. */
export const LOW_STOCK_THRESHOLD = 5

export interface CatalogStats {
  totalProducts: number
  activeProducts: number
  lowStockProducts: Product[]
}

/** Contadores do painel: produtos, ativos e lista de estoque baixo. */
export async function getCatalogStats(): Promise<CatalogStats> {
  const supabase = requireSupabase()

  const total = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
  throwIfError(total.error)

  const active = await supabase
    .from('products')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true)
  throwIfError(active.error)

  const lowStock = await supabase
    .from('products')
    .select('*')
    .eq('is_active', true)
    .lte('stock', LOW_STOCK_THRESHOLD)
    .order('stock', { ascending: true })
    .returns<Product[]>()
  throwIfError(lowStock.error)

  return {
    totalProducts: total.count ?? 0,
    activeProducts: active.count ?? 0,
    lowStockProducts: lowStock.data ?? [],
  }
}
