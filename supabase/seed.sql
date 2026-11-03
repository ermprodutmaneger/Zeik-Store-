-- =============================================================================
-- Zeik Store — dados demonstrativos (seed)
-- -----------------------------------------------------------------------------
-- Execute DEPOIS de supabase/schema.sql, no mesmo projeto de testes.
-- Pode ser reexecutado: usa o slug como chave e atualiza os campos.
--
-- As fotos dos produtos de demonstração ficam em public/demo/ do site
-- (image_path nulo = não estão no Storage). Fotos enviadas pelo painel do
-- administrador vão para o bucket product-images e preenchem image_path.
-- Preços em centavos (ex.: 34990 = R$ 349,90). Tudo fictício, sem cobrança.
-- =============================================================================

insert into public.categories (name, slug) values
  ('Áudio', 'audio'),
  ('Wearables', 'wearables'),
  ('Acessórios', 'acessorios'),
  ('Casa e Escritório', 'casa-e-escritorio')
on conflict (slug) do update set name = excluded.name;

insert into public.products
  (name, slug, description, category_id, price_cents, stock, image_url, image_path, is_active)
values
  (
    'Fone Bluetooth Zeik Pulse Pro',
    'fone-bluetooth-pulse-pro',
    'Cancelamento de ruído ativo, até 40 horas de bateria e almofadas macias para usar o dia todo. Produto fictício para testes da loja.',
    (select id from public.categories where slug = 'audio'),
    34990, 24, '/demo/fone-bluetooth-pulse-pro.jpg', null, true
  ),
  (
    'Fones Sem Fio Zeik Buds Air',
    'buds-air',
    'Leves, com estojo de recarga rápida USB-C e resistência a respingos para treinos e dia a dia. Produto fictício para testes da loja.',
    (select id from public.categories where slug = 'audio'),
    17990, 3, '/demo/buds-air.jpg', null, true
  ),
  (
    'Caixa de Som Zeik Boom 360',
    'caixa-de-som-boom-360',
    'Som em 360 graus, graves encorpados e anel de luz ambiente. Acompanha cabo USB-C. Produto fictício para testes da loja.',
    (select id from public.categories where slug = 'audio'),
    42990, 12, '/demo/caixa-de-som-boom-360.jpg', null, true
  ),
  (
    'Relógio Inteligente Zeik Fit Watch S2',
    'relogio-fit-watch-s2',
    'Monitoramento de sono, batimentos e treinos, notificações do celular e bateria de até 10 dias. Produto fictício para testes da loja.',
    (select id from public.categories where slug = 'wearables'),
    59990, 8, '/demo/relogio-fit-watch-s2.jpg', null, true
  ),
  (
    'Carregador 3 em 1 Zeik PowerDock',
    'carregador-powerdock-3em1',
    'Base única para celular, fones e relógio, com carregamento sem fio rápido e acabamento minimalista. Produto fictício para testes da loja.',
    (select id from public.categories where slug = 'acessorios'),
    22990, 30, '/demo/carregador-powerdock-3em1.jpg', null, true
  ),
  (
    'Mochila Tech Zeik Urban Pack',
    'mochila-urban-pack',
    'Compartimento acolchoado para notebook de 15,6", tecido resistente à água e bolso antifurto. Produto fictício para testes da loja.',
    (select id from public.categories where slug = 'acessorios'),
    38990, 15, '/demo/mochila-urban-pack.jpg', null, true
  ),
  (
    'Teclado Mecânico Zeik Keys K87',
    'teclado-mecanico-k87',
    'Switches silenciosos, iluminação suave e conexão sem fio ou USB-C para o seu escritório. Produto fictício para testes da loja.',
    (select id from public.categories where slug = 'casa-e-escritorio'),
    45990, 10, '/demo/teclado-mecanico-k87.jpg', null, true
  ),
  (
    'Luminária Inteligente Zeik Glow',
    'luminaria-glow',
    'Luz ajustável do quente ao frio, controle por toque e temporizador para leitura. Produto fictício para testes da loja. (Estoque zero de propósito, para testar o estado "esgotado".)',
    (select id from public.categories where slug = 'casa-e-escritorio'),
    19990, 0, '/demo/luminaria-glow.jpg', null, true
  )
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  category_id = excluded.category_id,
  price_cents = excluded.price_cents,
  stock = excluded.stock,
  image_url = excluded.image_url,
  image_path = excluded.image_path,
  is_active = excluded.is_active;

-- Conferência rápida:
-- select name, slug, price_cents, stock, is_active from public.products order by name;
