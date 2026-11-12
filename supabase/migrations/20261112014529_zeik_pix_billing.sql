-- Pix e mensalidades. Aplicar depois de supabase/schema.sql.
begin;

alter table public.orders
  add column billing_mode text check (billing_mode in ('sandbox', 'production')),
  add column pickup_instructions text;

alter table public.orders add constraint orders_billing_environment_check
  check (billing_mode is null or (is_test_order = (billing_mode = 'sandbox')));

create table public.billing_settings (
  singleton boolean primary key default true check (singleton),
  live_checkout boolean not null default false
);
insert into public.billing_settings default values;

create table public.billing_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 100),
  description text not null check (length(btrim(description)) between 1 and 1000),
  monthly_cents bigint not null check (monthly_cents between 1 and 100000000),
  member_content text not null check (length(btrim(member_content)) between 1 and 8000),
  is_active boolean not null default false
);

create table public.billing_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  plan_id uuid not null references public.billing_plans(id) on delete restrict,
  mode text not null check (mode in ('sandbox', 'production')),
  monthly_cents bigint not null check (monthly_cents > 0),
  provider_id text,
  creation_started_at timestamptz,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (mode, provider_id)
);

create unique index billing_one_membership_per_plan
  on public.billing_memberships (user_id, plan_id, mode) where canceled_at is null;
create index billing_memberships_plan_idx on public.billing_memberships (plan_id);

create table public.billing_payments (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('sandbox', 'production')),
  order_id uuid unique references public.orders(id) on delete restrict,
  membership_id uuid references public.billing_memberships(id) on delete restrict,
  provider_id text,
  amount_cents bigint not null check (amount_cents > 0),
  due_on date not null,
  status text not null default 'pending' check (status in
    ('pending', 'overdue', 'paid', 'refund_pending', 'refunded', 'canceled', 'review')),
  creation_started_at timestamptz,
  refund_requested_at timestamptz,
  paid_at timestamptz,
  checked_at timestamptz,
  fiscal_status text not null default 'waiting' check (fiscal_status in
    ('waiting', 'required', 'processing', 'authorized', 'error')),
  fiscal_provider_id text,
  fiscal_url text,
  fiscal_started_at timestamptz,
  created_at timestamptz not null default now(),
  check (num_nonnulls(order_id, membership_id) = 1),
  unique (mode, provider_id)
);

create index billing_payments_membership_due_idx on public.billing_payments (membership_id, due_on desc);
create index billing_payments_reconcile_idx
  on public.billing_payments (mode, checked_at nulls first, due_on)
  where status in ('pending', 'overdue', 'refund_pending', 'review');
create index billing_payments_fiscal_idx
  on public.billing_payments (mode, fiscal_status, paid_at)
  where fiscal_status in ('required', 'processing');

create table public.billing_webhook_events (
  mode text not null check (mode in ('sandbox', 'production')),
  event_id text not null,
  resource_id text not null,
  event_type text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  primary key (mode, event_id)
);
create index billing_webhook_events_pending_idx
  on public.billing_webhook_events (mode, next_attempt_at) where processed_at is null;

alter table public.billing_settings enable row level security;
alter table public.billing_plans enable row level security;
alter table public.billing_memberships enable row level security;
alter table public.billing_payments enable row level security;
alter table public.billing_webhook_events enable row level security;
revoke all on public.billing_settings, public.billing_plans, public.billing_memberships, public.billing_payments,
  public.billing_webhook_events from public, anon, authenticated;
grant select on public.billing_settings to service_role;
grant select, insert, update, delete on public.billing_plans, public.billing_memberships,
  public.billing_payments, public.billing_webhook_events to service_role;

grant usage on schema private to service_role;
grant select on public.profiles, public.user_roles to service_role;
grant select, update on public.products to service_role;
grant select, insert, update on public.orders to service_role;
grant select, insert on public.order_items to service_role;

-- O checkout de teste e o Pix compartilham a mesma reserva transacional.
create function private.reserve_checkout(
  p_items jsonb, p_idempotency_key uuid, p_user_id uuid, p_mode text, p_pickup text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_previous_mode text;
  v_order_id uuid;
  v_total_cents bigint := 0;
  v_item record;
  v_product record;
begin
  if p_user_id is null then
    raise exception 'Você precisa entrar na sua conta para finalizar o pedido.';
  end if;

  if p_idempotency_key is null then
    raise exception 'Chave de idempotência ausente. Recarregue a página e tente novamente.';
  end if;

  -- Reenvio (duplo clique/retry): devolve o pedido já criado, sem duplicar.
  select id, billing_mode into v_order_id, v_previous_mode
    from public.orders
   where user_id = p_user_id
     and idempotency_key = p_idempotency_key;
  if found then
    if v_previous_mode is distinct from p_mode then
      raise exception 'Atualize o carrinho e tente de novo.';
    end if;
    return v_order_id;
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id) then
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
        or (elem ->> 'quantity') !~ '^[0-9]{1,3}$'
  ) then
    raise exception 'Há um item inválido no pedido. Atualize o carrinho e tente novamente.';
  end if;

  -- Cria o pedido (a unicidade da chave também protege contra corrida).
  begin
    insert into public.orders
      (user_id, status, total_cents, is_test_order, idempotency_key, billing_mode, pickup_instructions)
    values
      (p_user_id, 'pendente', 0, p_mode is distinct from 'production', p_idempotency_key, p_mode, p_pickup)
    returning id into v_order_id;
  exception
    when unique_violation then
      select id, billing_mode into v_order_id, v_previous_mode
        from public.orders
       where user_id = p_user_id
         and idempotency_key = p_idempotency_key;
      if v_previous_mode is distinct from p_mode or v_order_id is null then
        raise;
      end if;
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

create or replace function private.create_test_order(p_items jsonb, p_idempotency_key uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Você precisa entrar na sua conta para finalizar o pedido.';
  end if;
  if (select live_checkout from public.billing_settings) then
    raise exception 'A loja está aceitando pedidos por Pix.';
  end if;
  return private.reserve_checkout(p_items, p_idempotency_key, auth.uid(), null, null);
end;
$$;

create function public.billing_create_order(
  p_items jsonb, p_idempotency_key uuid, p_user_id uuid, p_mode text, p_pickup text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_amount bigint;
begin
  if p_mode is null or p_mode not in ('sandbox', 'production') or coalesce(btrim(p_pickup), '') = '' then
    raise exception 'Checkout indisponível.';
  end if;
  v_id := private.reserve_checkout(p_items, p_idempotency_key, p_user_id, p_mode, p_pickup);
  select total_cents into strict v_amount from public.orders where id = v_id;
  if v_amount <= 0 then
    raise exception 'O total do pedido precisa ser maior que zero para gerar Pix.';
  end if;
  insert into public.billing_payments (mode, order_id, amount_cents, due_on)
    values (p_mode, v_id, v_amount, (now() at time zone 'America/Sao_Paulo')::date + 1)
    on conflict (order_id) do nothing;
  return v_id;
end;
$$;

create function public.billing_record_payment(
  p_mode text, p_payment_id uuid, p_membership_id uuid, p_provider_id text,
  p_amount bigint, p_due date, p_status text
)
returns public.billing_payments
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_payment public.billing_payments;
  v_status text;
  v_order_status text;
begin
  if p_membership_id is not null then
    insert into public.billing_payments (mode, membership_id, provider_id, amount_cents, due_on)
      select mode, id, p_provider_id, monthly_cents, p_due from public.billing_memberships
      where id = p_membership_id and mode = p_mode and monthly_cents = p_amount
      on conflict (mode, provider_id) do nothing;
    select * into v_payment from public.billing_payments
      where mode = p_mode and provider_id = p_provider_id and membership_id = p_membership_id for update;
  else
    select * into v_payment from public.billing_payments
      where mode = p_mode and id = p_payment_id and order_id is not null for update;
  end if;

  if v_payment.id is null or v_payment.amount_cents <> p_amount or v_payment.due_on <> p_due
    or (v_payment.provider_id is not null and v_payment.provider_id <> p_provider_id) then
    raise exception 'A cobrança do provedor não corresponde ao registro da loja.';
  end if;

  -- Uma leitura antiga do gateway não reabre um pedido nem desfaz um estorno.
  v_status := case
    when v_payment.status = 'refunded' then 'refunded'
    when v_payment.status = 'canceled' and p_status in ('paid', 'refund_pending', 'review') then 'review'
    when v_payment.status = 'canceled' and p_status <> 'refunded' then 'canceled'
    when v_payment.status = 'review' and p_status <> 'refunded' then 'review'
    when v_payment.status = 'refund_pending' and p_status not in ('refunded', 'review') then 'refund_pending'
    when v_payment.status = 'paid' and p_status in ('pending', 'overdue', 'canceled') then 'paid'
    when v_payment.status = 'overdue' and p_status = 'pending' then 'overdue'
    else p_status
  end;

  update public.billing_payments
     set provider_id = p_provider_id, status = v_status, checked_at = now(),
         paid_at = case when v_status = 'paid' then coalesce(paid_at, now()) else paid_at end,
         fiscal_status = case when v_status = 'paid' and fiscal_status = 'waiting'
           then 'required' else fiscal_status end
   where id = v_payment.id returning * into v_payment;

  if v_payment.order_id is not null then
    select status into v_order_status from public.orders where id = v_payment.order_id for update;
    if v_status = 'paid' and v_order_status = 'pendente' then
      update public.orders set status = 'confirmado' where id = v_payment.order_id;
    elsif v_status in ('refunded', 'canceled') and v_order_status in ('pendente', 'confirmado', 'em_preparo') then
      update public.orders set status = 'cancelado' where id = v_payment.order_id;
    end if;
  end if;
  return v_payment;
end;
$$;

create function public.billing_expire_unissued_order(p_id uuid, p_mode text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_order_id uuid;
begin
  update public.billing_payments set status = 'canceled', checked_at = now()
    where id = p_id and mode = p_mode and provider_id is null and order_id is not null
      and status in ('pending', 'overdue') and due_on < (now() at time zone 'America/Sao_Paulo')::date
    returning order_id into v_order_id;
  if v_order_id is not null then
    update public.orders set status = 'cancelado' where id = v_order_id and status = 'pendente';
  end if;
end;
$$;

create function public.billing_membership_until(p_id uuid)
returns date
language sql
stable
security invoker
set search_path = ''
as $$
  select max(coalesce((
    select min(next_payment.due_on)
    from public.billing_payments next_payment
    where next_payment.membership_id = member.id and next_payment.due_on > payment.due_on
      and next_payment.status <> 'canceled'
  ), (payment.due_on + interval '1 month')::date) + case when member.canceled_at is null then 3 else 0 end)
  from public.billing_memberships member
  join public.billing_payments payment on payment.membership_id = member.id
  where member.id = p_id and payment.status = 'paid' and payment.refund_requested_at is null
    and not exists (
      select 1 from public.billing_payments later
      where later.membership_id = member.id and later.due_on >= payment.due_on
        and later.due_on <= (now() at time zone 'America/Sao_Paulo')::date
        and (later.status in ('refund_pending', 'refunded', 'review') or later.refund_requested_at is not null)
    )
$$;

create function private.guard_pix_order_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment_status text;
begin
  if old.billing_mode is null or old.status = new.status then
    return new;
  end if;
  select case when status = 'paid' and refund_requested_at is not null then 'refund_pending' else status end
    into v_payment_status from public.billing_payments where order_id = old.id;
  if new.status = 'cancelado' then
    if v_payment_status is null or v_payment_status not in ('canceled', 'refunded') then
      raise exception 'Cancele ou estorne o Pix antes de cancelar o pedido.';
    end if;
  elsif new.status = 'pendente' or v_payment_status is distinct from 'paid' then
    raise exception 'Só é possível avançar o pedido após a confirmação do Pix.';
  end if;
  return new;
end;
$$;

create trigger orders_guard_pix_status before update of status on public.orders
  for each row execute function private.guard_pix_order_status();

revoke all on function private.reserve_checkout(jsonb, uuid, uuid, text, text),
  private.guard_pix_order_status(),
  public.billing_create_order(jsonb, uuid, uuid, text, text),
  public.billing_record_payment(text, uuid, uuid, text, bigint, date, text),
  public.billing_expire_unissued_order(uuid, text),
  public.billing_membership_until(uuid)
  from public, anon, authenticated;

grant execute on function private.reserve_checkout(jsonb, uuid, uuid, text, text),
  public.billing_create_order(jsonb, uuid, uuid, text, text),
  public.billing_record_payment(text, uuid, uuid, text, bigint, date, text),
  public.billing_expire_unissued_order(uuid, text),
  public.billing_membership_until(uuid)
  to service_role;

commit;
