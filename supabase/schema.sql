-- =============================================================================
-- Zeik Store — schema do banco (PostgreSQL / Supabase)
-- -----------------------------------------------------------------------------
-- COMO USAR
--   1. Crie um projeto Supabase NOVO e exclusivo para estes testes.
--      Não execute em bancos de outros projetos/clientes.
--   2. Abra SQL Editor → New query, cole TODO este arquivo e execute (Run).
--   3. Depois execute supabase/seed.sql para os produtos demonstrativos.
--   4. Cadastre sua conta pelo aplicativo, confirme o e-mail e promova-a a
--      administradora com supabase/admin.sql (pelo UUID, nunca por senha padrão).
--
-- RESUMO DE SEGURANÇA
--   - RLS ativo em todas as tabelas públicas, com privilégios mínimos por papel.
--   - Visitantes (anon) leem apenas o catálogo ativo.
--   - Clientes (authenticated) leem/alteram só o próprio perfil (só o nome)
--     e consultam apenas os próprios pedidos.
--   - Administradores são definidos SOMENTE na tabela user_roles. Nenhum
--     cliente consegue escrever nela pela API (sem políticas de escrita);
--     quem decide é o banco via private.is_admin(), não o navegador.
--   - Pedidos de teste nascem na função create_test_order (SECURITY DEFINER):
--     valida usuário, produtos ativos, preços e estoque no servidor, grava
--     itens com nome/preço do momento e baixa o estoque em uma transação,
--     sem estoque negativo e sem duplicar em reenvios (idempotência).
--   - Valores monetários em centavos inteiros (bigint).
-- =============================================================================

create extension if not exists pgcrypto;

-- Funções privilegiadas ficam fora dos schemas expostos pela Data API.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
alter default privileges in schema private revoke execute on functions from public;
grant usage on schema public to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Tabelas
-- -----------------------------------------------------------------------------

-- Perfil público do usuário (1:1 com auth.users). Criado pelo trigger
-- handle_new_user no cadastro. NÃO guarda senha (isso é do Supabase Auth).
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  email text not null default '' check (char_length(email) <= 254),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Perfil de exibição do usuário (nome e e-mail espelhado do Auth).';

-- Papéis de acesso. Separada de profiles para o cliente nunca se promover:
-- não há política de INSERT/UPDATE/DELETE para usuários da API.
create table if not exists public.user_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'customer' check (role in ('customer', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.user_roles is 'Papel do usuário (customer/admin). Escrita só pelo trigger de cadastro e pelo SQL Editor.';

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 90),
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories (id) on delete set null,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 90),
  description text check (description is null or char_length(description) <= 2000),
  -- Preço em centavos (ex.: 34990 = R$ 349,90). Nunca ponto flutuante.
  price_cents bigint not null check (price_cents >= 0 and price_cents <= 100000000),
  stock integer not null default 0 check (stock >= 0 and stock <= 1000000),
  image_url text check (image_url is null or char_length(image_url) <= 1000),
  -- Caminho no bucket quando a foto veio do Storage; null para fotos do seed.
  image_path text check (image_path is null or char_length(image_path) <= 1000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_category_id_idx on public.products (category_id);
create index if not exists products_active_created_idx on public.products (is_active, created_at desc);

-- Pedidos de TESTE (sem cobrança). user_id referencia profiles para a API
-- poder embutir nome/e-mail do cliente nas consultas do administrador.
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pendente'
    check (status in ('pendente', 'confirmado', 'em_preparo', 'a_caminho', 'entregue', 'cancelado')),
  total_cents bigint not null default 0 check (total_cents >= 0),
  is_test_order boolean not null default true,
  -- Chave enviada pelo navegador para reenvios não duplicarem o pedido.
  idempotency_key uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orders_user_created_idx on public.orders (user_id, created_at desc);
create index if not exists orders_status_idx on public.orders (status);
create unique index if not exists orders_user_idempotency_idx
  on public.orders (user_id, idempotency_key)
  where idempotency_key is not null;

-- Itens guardam nome e preço PRATICADOS no pedido (histórico íntegro mesmo
-- que o produto mude depois). product_id com ON DELETE RESTRICT: produto com
-- pedidos não pode ser excluído — apenas desativado.
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  product_name text not null check (char_length(product_name) <= 120),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  quantity integer not null check (quantity >= 1 and quantity <= 999),
  subtotal_cents bigint not null check (subtotal_cents >= 0),
  check (subtotal_cents = unit_price_cents * quantity)
);

create index if not exists order_items_order_id_idx on public.order_items (order_id);
create index if not exists order_items_product_id_idx on public.order_items (product_id);

-- -----------------------------------------------------------------------------
-- Funções auxiliares e triggers
-- -----------------------------------------------------------------------------

-- Mantém updated_at sincronizado em qualquer UPDATE.
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

drop trigger if exists user_roles_set_updated_at on public.user_roles;
create trigger user_roles_set_updated_at
  before update on public.user_roles
  for each row execute function private.set_updated_at();

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
  before update on public.products
  for each row execute function private.set_updated_at();

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function private.set_updated_at();

-- Verdadeiro se o usuário da sessão é administrador.
-- SECURITY DEFINER: lê user_roles sem recursão de RLS e sem expor a tabela.
create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.user_roles
     where user_id = auth.uid()
       and role = 'admin'
  );
$$;

-- Ao cadastrar: cria perfil e papel 'customer'.
-- O nome inicial pode vir de raw_user_meta_data (apenas exibição); o papel é
-- SEMPRE 'customer' aqui — metadata nunca concede administração.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    left(coalesce(btrim(new.raw_user_meta_data ->> 'full_name'), ''), 120),
    coalesce(new.email, '')
  )
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'customer')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- -----------------------------------------------------------------------------
-- Criação de pedido de teste (transação única, validada no banco)
-- -----------------------------------------------------------------------------
-- O navegador envia apenas [{product_id, quantity}] e uma chave de
-- idempotência. Preços e total são calculados AQUI, com trava de linha nos
-- produtos (FOR UPDATE) para pedidos concorrentes não furarem o estoque.
create or replace function private.create_test_order(
  p_items jsonb,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_order_id uuid;
  v_total_cents bigint := 0;
  v_item record;
  v_product record;
begin
  if v_user_id is null then
    raise exception 'Você precisa entrar na sua conta para finalizar o pedido.';
  end if;

  if p_idempotency_key is null then
    raise exception 'Chave de idempotência ausente. Recarregue a página e tente novamente.';
  end if;

  -- Reenvio (duplo clique/retry): devolve o pedido já criado, sem duplicar.
  select id into v_order_id
    from public.orders
   where user_id = v_user_id
     and idempotency_key = p_idempotency_key;
  if found then
    return v_order_id;
  end if;

  if not exists (select 1 from public.profiles where id = v_user_id) then
    raise exception 'Perfil não encontrado. Saia e entre novamente na sua conta.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Seu carrinho está vazio.';
  end if;

  if jsonb_array_length(p_items) > 50 then
    raise exception 'O pedido tem itens demais. Divida a compra em pedidos menores.';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_items) as elem
     where elem ->> 'product_id' is null
        or (elem ->> 'product_id') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        or elem ->> 'quantity' is null
        or (elem ->> 'quantity') !~ '^[0-9]+$'
  ) then
    raise exception 'Há um item inválido no pedido. Atualize o carrinho e tente novamente.';
  end if;

  -- Cria o pedido (a unicidade da chave também protege contra corrida).
  begin
    insert into public.orders (user_id, status, total_cents, is_test_order, idempotency_key)
    values (v_user_id, 'pendente', 0, true, p_idempotency_key)
    returning id into v_order_id;
  exception
    when unique_violation then
      select id into v_order_id
        from public.orders
       where user_id = v_user_id
         and idempotency_key = p_idempotency_key;
      return v_order_id;
  end;

  -- Itens agregados por produto e em ordem estável (evita deadlock).
  for v_item in
    select (elem ->> 'product_id')::uuid as product_id,
           sum((elem ->> 'quantity')::integer) as quantity
      from jsonb_array_elements(p_items) as elem
     group by (elem ->> 'product_id')::uuid
     order by (elem ->> 'product_id')::uuid
  loop
    select id, name, price_cents, stock, is_active
      into v_product
      from public.products
     where id = v_item.product_id
     for update;

    if not found then
      raise exception 'Um dos produtos não foi encontrado. Atualize o carrinho.';
    end if;

    if v_item.quantity < 1 or v_item.quantity > 99 then
      raise exception 'Quantidade inválida para "%" (permitido de 1 a 99).', v_product.name;
    end if;

    if not v_product.is_active then
      raise exception 'O produto "%" não está mais disponível.', v_product.name;
    end if;

    if v_product.stock < v_item.quantity then
      raise exception 'Estoque insuficiente para "%": restam % unidade(s).',
        v_product.name, v_product.stock;
    end if;

    update public.products
       set stock = stock - v_item.quantity
     where id = v_product.id;

    insert into public.order_items
      (order_id, product_id, product_name, unit_price_cents, quantity, subtotal_cents)
    values
      (v_order_id, v_product.id, v_product.name, v_product.price_cents,
       v_item.quantity, v_product.price_cents * v_item.quantity);

    v_total_cents := v_total_cents + (v_product.price_cents * v_item.quantity);
  end loop;

  update public.orders
     set total_cents = v_total_cents
   where id = v_order_id;

  return v_order_id;
end;
$$;

-- A API expõe somente o wrapper invoker; o código privilegiado é privado.
create or replace function public.create_test_order(p_items jsonb, p_idempotency_key uuid)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_test_order(p_items, p_idempotency_key);
$$;

comment on function public.create_test_order(jsonb, uuid) is
  'Cria pedido de teste validando preço/estoque no banco, com baixa de estoque e idempotência. Retorna o ID do pedido.';

-- Cancelamento é terminal e devolve o estoque uma única vez na transação.
create or replace function private.handle_order_cancellation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
begin
  if old.status = new.status then
    return new;
  end if;
  if old.status in ('cancelado', 'entregue') then
    raise exception 'Este pedido já foi encerrado e não pode mudar de andamento.';
  end if;
  if new.status = 'cancelado' then
    for v_item in
      select product_id, sum(quantity)::integer as quantity
        from public.order_items
       where order_id = old.id
       group by product_id
       order by product_id
    loop
      update public.products
         set stock = stock + v_item.quantity
       where id = v_item.product_id;
    end loop;
  end if;
  return new;
end;
$$;

revoke all on function private.handle_order_cancellation() from public, anon, authenticated;
drop trigger if exists orders_restore_stock_on_cancel on public.orders;
create trigger orders_restore_stock_on_cancel
  before update of status on public.orders
  for each row execute function private.handle_order_cancellation();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- categories: leitura pública; escrita só de administradores.
drop policy if exists "Categorias: leitura pública" on public.categories;
create policy "Categorias: leitura pública"
  on public.categories for select
  to anon, authenticated
  using (true);

drop policy if exists "Categorias: admin cria" on public.categories;
create policy "Categorias: admin cria"
  on public.categories for insert
  to authenticated
  with check ((select private.is_admin()));

drop policy if exists "Categorias: admin atualiza" on public.categories;
create policy "Categorias: admin atualiza"
  on public.categories for update
  to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

drop policy if exists "Categorias: admin exclui" on public.categories;
create policy "Categorias: admin exclui"
  on public.categories for delete
  to authenticated
  using ((select private.is_admin()));

-- products: visitantes veem apenas ativos; administradores veem e gerenciam tudo.
drop policy if exists "Produtos: vitrine lê ativos" on public.products;
drop policy if exists "Produtos: admin lê todos" on public.products;
drop policy if exists "Produtos: leitura autorizada" on public.products;
drop policy if exists "Produtos: visitante lê ativos" on public.products;
create policy "Produtos: visitante lê ativos" on public.products for select to anon using (is_active = true);
create policy "Produtos: leitura autorizada" on public.products for select
  to authenticated
  using (is_active = true or (select private.is_admin()));

drop policy if exists "Produtos: admin cria" on public.products;
create policy "Produtos: admin cria"
  on public.products for insert
  to authenticated
  with check ((select private.is_admin()));

drop policy if exists "Produtos: admin atualiza" on public.products;
create policy "Produtos: admin atualiza"
  on public.products for update
  to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

drop policy if exists "Produtos: admin exclui" on public.products;
create policy "Produtos: admin exclui"
  on public.products for delete
  to authenticated
  using ((select private.is_admin()));

-- profiles: cada cliente lê/edita o próprio; admin lê todos (lista de pedidos).
drop policy if exists "Perfis: cliente lê o próprio" on public.profiles;
drop policy if exists "Perfis: admin lê todos" on public.profiles;
drop policy if exists "Perfis: leitura autorizada" on public.profiles;
create policy "Perfis: leitura autorizada" on public.profiles for select
  to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()));

-- Perfis são criados exclusivamente pelo trigger de cadastro do Auth.
drop policy if exists "Perfis: cliente atualiza o próprio" on public.profiles;
create policy "Perfis: cliente atualiza o próprio"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- user_roles: somente leitura do próprio papel (ou todos, para admin).
-- SEM políticas de escrita = ninguém se promove pela API.
drop policy if exists "Papéis: usuário lê o próprio" on public.user_roles;
drop policy if exists "Papéis: admin lê todos" on public.user_roles;
drop policy if exists "Papéis: leitura autorizada" on public.user_roles;
create policy "Papéis: leitura autorizada" on public.user_roles for select
  to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

-- orders: cliente lê só os próprios; admin lê todos e atualiza o andamento.
-- Criação apenas pela função create_test_order (sem política de INSERT).
drop policy if exists "Pedidos: cliente lê os próprios" on public.orders;
drop policy if exists "Pedidos: admin lê todos" on public.orders;
drop policy if exists "Pedidos: leitura autorizada" on public.orders;
create policy "Pedidos: leitura autorizada" on public.orders for select
  to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

drop policy if exists "Pedidos: admin atualiza andamento" on public.orders;
create policy "Pedidos: admin atualiza andamento"
  on public.orders for update
  to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- order_items: leitura vinculada ao dono do pedido (ou admin). Sem escrita direta.
drop policy if exists "Itens: cliente lê os dos próprios pedidos" on public.order_items;
drop policy if exists "Itens: admin lê todos" on public.order_items;
drop policy if exists "Itens: leitura autorizada" on public.order_items;
create policy "Itens: leitura autorizada" on public.order_items for select
  to authenticated
  using ((select private.is_admin()) or exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid())));

-- -----------------------------------------------------------------------------
-- Privilégios mínimos (além do RLS, limitamos até as COLUNAS editáveis)
-- -----------------------------------------------------------------------------
revoke all on table public.profiles, public.user_roles, public.categories,
  public.products, public.orders, public.order_items
  from public, anon, authenticated;

grant select on table public.categories to anon, authenticated;
grant insert, update, delete on table public.categories to authenticated;

grant select on table public.products to anon, authenticated;
grant insert, update, delete on table public.products to authenticated;

-- Cliente lê o próprio perfil e atualiza SOMENTE o nome.
grant select on table public.profiles to authenticated;
grant update (full_name) on table public.profiles to authenticated;

-- Papéis: só leitura. Nada de escrita pela API.
grant select on table public.user_roles to authenticated;

-- Pedidos: leitura; UPDATE apenas da coluna status (e o RLS exige admin).
-- Sem INSERT/DELETE: a criação passa pela função validada.
grant select on table public.orders to authenticated;
grant update (status) on table public.orders to authenticated;

grant select on table public.order_items to authenticated;

-- Funções: execução restrita ao necessário.
revoke all on function private.is_admin() from public, anon, authenticated;
grant execute on function private.is_admin() to authenticated;

revoke all on function private.create_test_order(jsonb, uuid) from public, anon, authenticated;
grant execute on function private.create_test_order(jsonb, uuid) to authenticated;

revoke all on function public.create_test_order(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.create_test_order(jsonb, uuid) to authenticated;

-- Funções de trigger não devem ser chamáveis pela API.
revoke all on function private.handle_new_user() from public, anon, authenticated;
revoke all on function private.set_updated_at() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Storage: bucket público SOMENTE com fotos do catálogo
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  5242880, -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Fotos: leitura pública" on storage.objects;
create policy "Fotos: leitura pública"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'product-images');

drop policy if exists "Fotos: admin envia" on storage.objects;
create policy "Fotos: admin envia"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'product-images' and (select private.is_admin()));

drop policy if exists "Fotos: admin atualiza" on storage.objects;
create policy "Fotos: admin atualiza"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'product-images' and (select private.is_admin()))
  with check (bucket_id = 'product-images' and (select private.is_admin()));

drop policy if exists "Fotos: admin exclui" on storage.objects;
create policy "Fotos: admin exclui"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'product-images' and (select private.is_admin()));

-- Fim. Próximo passo: execute supabase/seed.sql.
