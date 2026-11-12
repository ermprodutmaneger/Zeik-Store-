begin;

alter table public.billing_payments
  add column gateway text not null default 'asaas' check (gateway in ('asaas', 'mercadopago')),
  add column attempt_key uuid not null default gen_random_uuid();
create unique index billing_mp_attempt_key
  on public.billing_payments (attempt_key) where gateway = 'mercadopago';
create unique index billing_mp_monthly_charge
  on public.billing_payments (membership_id, due_on) where gateway = 'mercadopago' and membership_id is not null;

alter table public.billing_memberships
  add column gateway text not null default 'asaas' check (gateway in ('asaas', 'mercadopago')),
  add column renews_on date,
  add column billing_day integer check (billing_day between 1 and 31);
create index billing_mp_memberships_renew_idx on public.billing_memberships (mode, renews_on)
  where gateway = 'mercadopago' and canceled_at is null;

alter table public.billing_webhook_events
  add column gateway text not null default 'asaas' check (gateway in ('asaas', 'mercadopago'));

create function public.billing_create_order(
  p_items jsonb, p_idempotency_key uuid, p_user_id uuid, p_mode text, p_pickup text, p_gateway text
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
  if p_mode is null or p_mode not in ('sandbox', 'production')
    or p_gateway is null or p_gateway not in ('asaas', 'mercadopago')
    or coalesce(btrim(p_pickup), '') = '' then
    raise exception 'Checkout indisponível.';
  end if;
  v_id := private.reserve_checkout(p_items, p_idempotency_key, p_user_id, p_mode, p_pickup);
  select total_cents into strict v_amount from public.orders where id = v_id;
  if v_amount <= 0 then
    raise exception 'O total do pedido precisa ser maior que zero para gerar Pix.';
  end if;
  insert into public.billing_payments (mode, gateway, order_id, amount_cents, due_on)
    values (p_mode, p_gateway, v_id, v_amount, (now() at time zone 'America/Sao_Paulo')::date + 1)
    on conflict (order_id) do nothing;
  if (select gateway from public.billing_payments where order_id = v_id) <> p_gateway then
    raise exception 'Atualize o carrinho para gerar a cobrança com o provedor atual.';
  end if;
  return v_id;
end;
$$;

create or replace function public.billing_create_order(
  p_items jsonb, p_idempotency_key uuid, p_user_id uuid, p_mode text, p_pickup text
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select public.billing_create_order(p_items, p_idempotency_key, p_user_id, p_mode, p_pickup, 'asaas');
$$;

create function private.billing_next_month(p_date date, p_day integer)
returns date
language sql
immutable
security invoker
set search_path = ''
as $$
  select (date_trunc('month', p_date::timestamp) + interval '1 month')::date
    + least(p_day - 1, (date_trunc('month', p_date::timestamp) + interval '2 months')::date
      - (date_trunc('month', p_date::timestamp) + interval '1 month')::date - 1);
$$;

create function public.billing_create_mp_membership(p_user uuid, p_plan uuid, p_mode text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_plan public.billing_plans;
  v_member public.billing_memberships;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_day integer := extract(day from v_today)::integer;
begin
  select * into v_plan from public.billing_plans where id = p_plan and is_active;
  if v_plan.id is null then raise exception 'Plano indisponível.'; end if;

  insert into public.billing_memberships
    (user_id, plan_id, mode, gateway, monthly_cents, renews_on, billing_day)
  values (p_user, p_plan, p_mode, 'mercadopago', v_plan.monthly_cents,
          private.billing_next_month(v_today, v_day), v_day)
  on conflict (user_id, plan_id, mode) where canceled_at is null do nothing
  returning * into v_member;

  if v_member.id is null then
    select * into v_member from public.billing_memberships
      where user_id = p_user and plan_id = p_plan and mode = p_mode and canceled_at is null;
    if v_member.gateway <> 'mercadopago' or v_member.id is null then
      raise exception 'Já existe uma mensalidade ativa neste plano.';
    end if;
    return v_member.id;
  end if;

  insert into public.billing_payments (mode, gateway, membership_id, amount_cents, due_on)
    values (p_mode, 'mercadopago', v_member.id, v_member.monthly_cents, v_today);
  return v_member.id;
end;
$$;

create function public.billing_mp_renewals(p_mode text, p_user uuid default null)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_member public.billing_memberships;
  v_count integer := 0;
begin
  for v_member in
    select * from public.billing_memberships
     where gateway = 'mercadopago' and mode = p_mode and canceled_at is null
       and renews_on <= v_today + 5 and (p_user is null or user_id = p_user)
     order by renews_on, id limit 100 for update skip locked
  loop
    insert into public.billing_payments (mode, gateway, membership_id, amount_cents, due_on, status)
      values (p_mode, 'mercadopago', v_member.id, v_member.monthly_cents, v_member.renews_on,
        case when v_member.renews_on < v_today then 'overdue' else 'pending' end)
      on conflict do nothing;
    update public.billing_memberships
      set renews_on = private.billing_next_month(v_member.renews_on, v_member.billing_day)
      where id = v_member.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.billing_record_payment(
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
  if p_membership_id is not null and p_payment_id is null then
    insert into public.billing_payments (mode, membership_id, provider_id, amount_cents, due_on)
      select mode, id, p_provider_id, monthly_cents, p_due from public.billing_memberships
      where id = p_membership_id and mode = p_mode and monthly_cents = p_amount
      on conflict (mode, provider_id) do nothing;
    select * into v_payment from public.billing_payments
      where mode = p_mode and provider_id = p_provider_id and membership_id = p_membership_id for update;
  else
    select * into v_payment from public.billing_payments
      where mode = p_mode and id = p_payment_id
        and ((p_membership_id is null and order_id is not null) or membership_id = p_membership_id)
      for update;
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


create function public.billing_mp_record(
  p_mode text, p_attempt uuid, p_provider_id text, p_amount bigint, p_status text
)
returns public.billing_payments
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_payment public.billing_payments;
begin
  select * into v_payment from public.billing_payments
    where gateway = 'mercadopago' and mode = p_mode and attempt_key = p_attempt for update;
  if v_payment.id is null then return null; end if;
  if v_payment.amount_cents <> p_amount
    or (v_payment.provider_id is not null and v_payment.provider_id <> p_provider_id) then
    raise exception 'A order do Mercado Pago diverge da cobrança registrada.';
  end if;

  -- A tentativa anterior só é substituída após expiração/cancelamento confirmados pela API.
  if v_payment.membership_id is not null and p_status = 'canceled'
    and v_payment.status in ('pending', 'overdue') then
    update public.billing_payments
       set attempt_key = gen_random_uuid(), provider_id = null, creation_started_at = null,
           status = case when due_on < (now() at time zone 'America/Sao_Paulo')::date
             then 'overdue' else 'pending' end, checked_at = now()
     where id = v_payment.id returning * into v_payment;
    return v_payment;
  end if;

  return public.billing_record_payment(
    p_mode, v_payment.id, v_payment.membership_id, p_provider_id, p_amount, v_payment.due_on, p_status
  );
end;
$$;

-- O agendamento existente passa o segredo do Vault. Só o servidor pode validá-lo.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'zeik_billing_cron_token') then
    perform vault.create_secret(
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      'zeik_billing_cron_token',
      'Autenticação do Cron de pagamentos da Zeik Store'
    );
  end if;
end;
$$;

create function private.billing_verify_cron(p_token text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select length(p_token) between 32 and 255 and exists (
    select 1 from vault.decrypted_secrets
    where name = 'zeik_billing_cron_token'
      and sha256(convert_to(decrypted_secret, 'UTF8')) = sha256(convert_to(p_token, 'UTF8'))
  );
$$;

create function public.billing_verify_cron(p_token text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.billing_verify_cron(p_token);
$$;

revoke all on function
  public.billing_create_order(jsonb, uuid, uuid, text, text, text),
  private.billing_next_month(date, integer),
  public.billing_create_mp_membership(uuid, uuid, text),
  public.billing_mp_renewals(text, uuid),
  public.billing_mp_record(text, uuid, text, bigint, text),
  private.billing_verify_cron(text), public.billing_verify_cron(text)
  from public, anon, authenticated;

grant execute on function
  public.billing_create_order(jsonb, uuid, uuid, text, text, text),
  private.billing_next_month(date, integer),
  public.billing_create_mp_membership(uuid, uuid, text),
  public.billing_mp_renewals(text, uuid),
  public.billing_mp_record(text, uuid, text, bigint, text),
  private.billing_verify_cron(text), public.billing_verify_cron(text)
  to service_role;

commit;
