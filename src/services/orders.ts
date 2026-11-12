import { requireSupabase } from '../lib/supabase'
import type { OrderStatus, OrderWithCustomer, OrderWithItems } from '../types/database'

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message)
}

export interface CreateOrderItemInput {
  product_id: string
  quantity: number
}

/**
 * Cria um pedido de TESTE (sem cobrança) chamando a função do banco
 * `create_test_order`. O navegador envia apenas IDs e quantidades:
 * preços, disponibilidade, total e baixa de estoque são validados e
 * aplicados no servidor, em uma única transação. A chave de idempotência
 * evita pedidos duplicados em reenvios (duplo clique, retry de rede).
 *
 * Retorna o ID do pedido criado (ou do já existente para a mesma chave).
 */
export async function createTestOrder(
  items: CreateOrderItemInput[],
  idempotencyKey: string,
): Promise<string> {
  const supabase = requireSupabase()
  const { data, error } = await supabase.rpc('create_test_order', {
    p_items: items,
    p_idempotency_key: idempotencyKey,
  })
  throwIfError(error)
  return data as string
}

const ORDER_WITH_ITEMS = '*, order_items(*)'

/** Pedidos do cliente logado (RLS limita aos próprios pedidos). */
export async function listMyOrders(userId: string): Promise<OrderWithItems[]> {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_WITH_ITEMS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .returns<OrderWithItems[]>()
  throwIfError(error)
  return data ?? []
}

/** Um pedido pelo ID (cliente só lê o próprio; admin lê qualquer um). */
export async function getOrderById(id: string): Promise<OrderWithItems | null> {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_WITH_ITEMS)
    .eq('id', id)
    .maybeSingle<OrderWithItems>()
  throwIfError(error)
  return data ?? null
}

/** Todos os pedidos com nome/e-mail do cliente (somente administrador). */
export async function listAllOrders(): Promise<OrderWithCustomer[]> {
  const supabase = requireSupabase()
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*), profiles(full_name, email)')
    .order('created_at', { ascending: false })
    .returns<OrderWithCustomer[]>()
  throwIfError(error)
  return data ?? []
}

/**
 * Atualiza o andamento do pedido. O banco só permite a administradores e
 * apenas a coluna `status` (privilégio de UPDATE restrito + RLS).
 */
export async function updateOrderStatus(id: string, status: OrderStatus): Promise<void> {
  const supabase = requireSupabase()
  const { error } = await supabase.from('orders').update({ status }).eq('id', id)
  throwIfError(error)
}

export interface OrderStats {
  totalOrders: number
  pendingOrders: number
  /** Soma dos pedidos não cancelados, em centavos. */
  totalCents: number
}

/** Contadores de pedidos para o painel do administrador. */
export async function getOrderStats(): Promise<OrderStats> {
  const supabase = requireSupabase()

  const total = await supabase.from('orders').select('id', { count: 'exact', head: true })
  throwIfError(total.error)

  const pending = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pendente')
  throwIfError(pending.error)

  const sums = await supabase
    .from('orders')
    .select('total_cents')
    .neq('status', 'cancelado')
    .returns<{ total_cents: number }[]>()
  throwIfError(sums.error)

  return {
    totalOrders: total.count ?? 0,
    pendingOrders: pending.count ?? 0,
    totalCents: (sums.data ?? []).reduce((acc, row) => acc + row.total_cents, 0),
  }
}
