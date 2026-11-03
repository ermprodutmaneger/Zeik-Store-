-- =============================================================================
-- Zeik Store — tornar a SUA conta administradora
-- -----------------------------------------------------------------------------
-- Não existe senha administrativa padrão nem "primeiro usuário vira admin".
-- A promoção é manual, pelo UUID da conta, executada por quem tem acesso ao
-- painel do Supabase (SQL Editor). Guarde esse acesso com o mesmo cuidado
-- de uma senha-mestra: quem roda SQL aqui tem poder total sobre o projeto.
--
-- PASSO A PASSO
--   1. No aplicativo, cadastre-se em /cadastro e confirme o e-mail.
--   2. No painel do Supabase: Authentication → Users → clique na sua conta
--      e copie o campo "User UID" (um UUID como 3f9c1d2e-...-....).
--   3. Em SQL Editor, substitua o UUID de exemplo abaixo pelo seu e execute.
--   4. Saia e entre de novo no aplicativo: o menu "Painel" aparece e /admin
--      libera. (O papel é lido da tabela user_roles a cada login.)
--
-- Executar sem trocar o UUID não altera nada (zero linhas afetadas).
-- =============================================================================

-- 1) Promover a administrador (troque pelo seu UUID):
update public.user_roles
   set role = 'admin'
 where user_id = '00000000-0000-0000-0000-000000000000'; -- ← COLE SEU UUID AQUI

-- 2) Conferir o resultado (deve listar sua conta com role = admin):
select p.full_name, p.email, r.role, r.user_id
  from public.user_roles r
  join public.profiles p on p.id = r.user_id
 order by r.role desc, p.email;

-- -----------------------------------------------------------------------------
-- Situações especiais (descomente apenas se precisar)
-- -----------------------------------------------------------------------------

-- A) A conta foi criada ANTES de executar o schema.sql (sem linha em
--    user_roles)? Crie a linha já como admin, trocando o UUID:
-- insert into public.user_roles (user_id, role)
-- values ('00000000-0000-0000-0000-000000000000', 'admin')
-- on conflict (user_id) do update set role = 'admin';

-- B) Rebaixar de volta para cliente comum, trocando o UUID:
-- update public.user_roles
--    set role = 'customer'
--  where user_id = '00000000-0000-0000-0000-000000000000';
