-- Executar somente no projeto exclusivo de TESTES da Zeik Store.
-- Todos os usuários, produtos e pedidos deste teste somem no ROLLBACK.
begin;

select set_config('qa.customer_a', gen_random_uuid()::text, true);
select set_config('qa.customer_b', gen_random_uuid()::text, true);
select set_config('qa.admin', gen_random_uuid()::text, true);
select set_config('qa.product', gen_random_uuid()::text, true);
select set_config('qa.hidden', gen_random_uuid()::text, true);
select set_config('qa.idempotency', gen_random_uuid()::text, true);

insert into auth.users (id, email, raw_user_meta_data)
values
  (current_setting('qa.customer_a')::uuid, 'qa-a@example.invalid', '{"full_name":"QA A"}'),
  (current_setting('qa.customer_b')::uuid, 'qa-b@example.invalid', '{"full_name":"QA B"}'),
  (current_setting('qa.admin')::uuid, 'qa-admin@example.invalid', '{"full_name":"QA Admin"}');

update public.user_roles set role = 'admin'
 where user_id = current_setting('qa.admin')::uuid;

insert into public.products (id, name, slug, price_cents, stock, is_active)
values
  (current_setting('qa.product')::uuid, 'QA ativo', 'qa-' || current_setting('qa.product'), 1234, 3, true),
  (current_setting('qa.hidden')::uuid, 'QA oculto', 'qa-' || current_setting('qa.hidden'), 1234, 3, false);

set local role anon;
do $$
begin
  if not exists (select 1 from public.products where id = current_setting('qa.product')::uuid) then
    raise exception 'FAIL: visitante não lê produto ativo';
  end if;
  if exists (select 1 from public.products where id = current_setting('qa.hidden')::uuid) then
    raise exception 'FAIL: visitante lê produto oculto';
  end if;
  begin
    perform 1 from public.profiles;
    raise exception 'FAIL: visitante acessou perfis';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.create_test_order('[]'::jsonb, gen_random_uuid());
    raise exception 'FAIL: visitante chamou criação de pedido';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

select set_config('request.jwt.claim.sub', current_setting('qa.customer_a'), true);
set local role authenticated;
do $$
declare
  v_order uuid;
  v_repeat uuid;
  v_count integer;
begin
  if not exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'FAIL: trigger de cadastro não criou o perfil';
  end if;
  if exists (select 1 from public.profiles where id = current_setting('qa.customer_b')::uuid) then
    raise exception 'FAIL: cliente A leu perfil de B';
  end if;
  if private.is_admin() then raise exception 'FAIL: cliente é admin'; end if;

  update public.products set stock = 99 where id = current_setting('qa.product')::uuid;
  get diagnostics v_count = row_count;
  if v_count <> 0 then raise exception 'FAIL: cliente alterou estoque'; end if;

  begin
    update public.user_roles set role = 'admin' where user_id = auth.uid();
    raise exception 'FAIL: cliente se promoveu';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.profiles set email = 'forjado@example.invalid' where id = auth.uid();
    raise exception 'FAIL: cliente alterou e-mail espelhado';
  exception when insufficient_privilege then null;
  end;

  update public.profiles set full_name = 'QA A atualizado' where id = auth.uid();
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'FAIL: cliente não alterou o próprio nome'; end if;

  v_order := public.create_test_order(
    jsonb_build_array(jsonb_build_object('product_id', current_setting('qa.product'), 'quantity', 2, 'price_cents', 1)),
    current_setting('qa.idempotency')::uuid
  );
  perform set_config('qa.order', v_order::text, true);
  if not exists (select 1 from public.orders where id = v_order and total_cents = 2468 and is_test_order) then
    raise exception 'FAIL: total não foi calculado no banco';
  end if;
  if (select stock from public.products where id = current_setting('qa.product')::uuid) <> 1 then
    raise exception 'FAIL: estoque não baixou';
  end if;

  v_repeat := public.create_test_order(
    jsonb_build_array(jsonb_build_object('product_id', current_setting('qa.product'), 'quantity', 2)),
    current_setting('qa.idempotency')::uuid
  );
  if v_repeat <> v_order then raise exception 'FAIL: pedido duplicado'; end if;
  if (select stock from public.products where id = current_setting('qa.product')::uuid) <> 1 then
    raise exception 'FAIL: reenvio baixou estoque duas vezes';
  end if;

  begin
    perform public.create_test_order(
      jsonb_build_array(jsonb_build_object('product_id', current_setting('qa.product'), 'quantity', 2)),
      gen_random_uuid()
    );
    raise exception using errcode = 'ZX001', message = 'FAIL: venda acima do estoque';
  exception when raise_exception then null;
  end;
  if (select count(*) from public.orders where user_id = auth.uid()) <> 1 then
    raise exception 'FAIL: falha de estoque deixou pedido parcial';
  end if;

  begin
    update public.orders set total_cents = 1 where id = v_order;
    raise exception 'FAIL: cliente alterou total';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into storage.objects (bucket_id, name) values ('product-images', 'qa-forbidden.jpg');
    raise exception 'FAIL: cliente enviou imagem';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

select set_config('request.jwt.claim.sub', current_setting('qa.customer_b'), true);
set local role authenticated;
do $$
declare v_count integer;
begin
  if exists (select 1 from public.orders where id = current_setting('qa.order')::uuid) then
    raise exception 'FAIL: cliente B leu pedido de A';
  end if;
  if exists (select 1 from public.order_items where order_id = current_setting('qa.order')::uuid) then
    raise exception 'FAIL: cliente B leu itens de A';
  end if;
  update public.orders set status = 'cancelado' where id = current_setting('qa.order')::uuid;
  get diagnostics v_count = row_count;
  if v_count <> 0 then raise exception 'FAIL: cliente B alterou pedido de A'; end if;
end;
$$;
reset role;

select set_config('request.jwt.claim.sub', current_setting('qa.admin'), true);
set local role authenticated;
do $$
begin
  if not private.is_admin() then raise exception 'FAIL: papel administrativo não foi reconhecido'; end if;
  if not exists (select 1 from public.products where id = current_setting('qa.hidden')::uuid) then
    raise exception 'FAIL: admin não lê produto oculto';
  end if;
  update public.orders set status = 'cancelado' where id = current_setting('qa.order')::uuid;
  if (select stock from public.products where id = current_setting('qa.product')::uuid) <> 3 then
    raise exception 'FAIL: cancelamento não devolveu estoque';
  end if;
  update public.orders set status = 'cancelado' where id = current_setting('qa.order')::uuid;
  if (select stock from public.products where id = current_setting('qa.product')::uuid) <> 3 then
    raise exception 'FAIL: cancelamento devolveu estoque duas vezes';
  end if;
  begin
    update public.orders set status = 'confirmado' where id = current_setting('qa.order')::uuid;
    raise exception using errcode = 'ZX001', message = 'FAIL: pedido cancelado reaberto';
  exception when raise_exception then null;
  end;
  insert into storage.objects (bucket_id, name) values ('product-images', 'qa-admin.jpg');
end;
$$;
reset role;

rollback;
select 'PASS: RLS, papéis, perfis, pedidos, idempotência, estoque e Storage' as verification;
