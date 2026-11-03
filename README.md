# Zeik Store

Loja de testes completa para aprender **Supabase na prática**: autenticação real, banco PostgreSQL com Row Level Security (RLS), upload de fotos no Storage e painel de administrador — com pedidos de teste **sem cobrança**.

**Estado atual:** código implementado, verificado (tipos, lint e build) e pronto para conectar a um projeto Supabase de testes e publicar na Vercel. A conexão com o banco e o deploy são os próximos passos: siga [docs/HOSPEDAGEM.md](docs/HOSPEDAGEM.md).

## O que funciona

- **Vitrine** responsiva (celular, iPad e desktop): banner, categorias, busca, ordenação, página do produto e produtos relacionados, sempre lendo do banco.
- **Carrinho** persistido no navegador, com revalidação de preço/estoque contra o banco ao abrir e ao finalizar.
- **Contas reais** com Supabase Auth: cadastro (nome, e-mail, senha), confirmação de e-mail, login/logout, recuperação e redefinição de senha, tratamento de links expirados.
- **Minha conta**: editar o próprio nome e acompanhar os pedidos.
- **Painel do administrador** (`/admin`): contadores, estoque baixo, CRUD de produtos com foto (upload para o Storage), ativar/desativar, exclusão segura e andamento dos pedidos.
- **Pedidos de teste** criados por função no banco (`create_test_order`): valida usuário, produtos ativos, preços e estoque no servidor, grava nome/preço do momento, baixa o estoque em uma transação e não duplica em reenvios (idempotência).
- **Permissões no banco (RLS)**: visitante vê só o catálogo ativo; cliente acessa só os próprios dados (e só edita o próprio nome); administrador vem da tabela `user_roles` — ninguém se promove pela API. A interface apenas reflete o que o banco já garante.
- **Sem Supabase configurado**, a loja mostra uma tela clara de “configuração pendente” — nada de login ou pedido simulados.

## Tecnologias

React 19, TypeScript, Vite, React Router e `@supabase/supabase-js`, com versões exatas no `package.json` e `package-lock.json`.

## Início rápido

```bash
npm ci          # instala as versões exatas do lockfile
cp .env.example .env.local   # preencha as variáveis abaixo
npm run dev     # http://localhost:5173
```

Variáveis públicas (somente estas duas, em `.env.local` ou na Vercel):

| Variável | Onde encontrar |
|---|---|
| `VITE_SUPABASE_URL` | Supabase → painel **Connect** do projeto |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Idem (`sb_publishable_…`) |

Nunca use `service_role`, `sb_secret` ou senha do banco no frontend: a proteção é feita por RLS.

## Banco de dados (na ordem)

Em um projeto Supabase **novo e exclusivo para testes**, no SQL Editor:

1. [`supabase/schema.sql`](supabase/schema.sql) — tabelas, índices, constraints, RLS, funções (`is_admin`, `create_test_order`), triggers e o bucket `product-images` (público, JPEG/PNG/WebP até 5 MB, escrita só de administradores).
2. [`supabase/seed.sql`](supabase/seed.sql) — 4 categorias e 8 produtos fictícios (fotos em `public/demo/`).
3. Cadastre-se pelo app, confirme o e-mail e promova sua conta com [`supabase/admin.sql`](supabase/admin.sql) (pelo UUID, sem senha padrão).

URLs de retorno de autenticação e o roteiro de deploy estão em [docs/HOSPEDAGEM.md](docs/HOSPEDAGEM.md).

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento (Vite) |
| `npm run build` | Verificação de tipos + build de produção em `dist/` |
| `npm run preview` | Pré-visualiza o build |
| `npm run lint` | ESLint (React Hooks/Compiler, TypeScript) |
| `npm run typecheck` | `tsc -b` (tipos, sem emitir arquivos) |

## Estrutura

```
public/demo/          Fotos dos produtos demonstrativos e do banner
src/
  lib/                Cliente Supabase, formatação (R$/datas), slugs, erros de auth
  types/              Tipos do domínio (centavos inteiros, status, papéis)
  services/           Catálogo, pedidos, perfil e Storage (chamadas ao Supabase)
  contexts/ hooks/    Sessão/papel do usuário e carrinho
  components/         Cabeçalho, rodapé, cartões, rotas protegidas etc.
  pages/              Vitrine, produto, carrinho, conta, autenticação
  pages/admin/        Visão geral, produtos, formulário e pedidos
  styles/             CSS (tokens, layout, loja e admin) — claro, roxo e ciano
supabase/             schema.sql, seed.sql e admin.sql
vercel.json           Rewrite de SPA para rotas diretas funcionarem
```

Rotas principais: `/` (vitrine), `/produto/:slug`, `/carrinho`, `/entrar`, `/cadastro`, `/recuperar-senha`, `/redefinir-senha`, `/auth/callback`, `/conta`, `/pedido-concluido/:id`, `/admin`, `/admin/produtos`, `/admin/produtos/novo`, `/admin/produtos/:id/editar`, `/admin/pedidos`.

## Modelo de segurança (resumo)

- Valores monetários em **centavos inteiros**; itens do pedido guardam o nome e o preço praticados.
- RLS em todas as tabelas + privilégios mínimos por coluna (`profiles.full_name` é o único campo editável pelo cliente; `orders.status` é a única coluna atualizável, e só por administradores via RLS).
- `user_roles` sem nenhuma política de escrita: promoção a admin só via SQL Editor ([`supabase/admin.sql`](supabase/admin.sql)).
- O navegador envia apenas IDs e quantidades ao finalizar; total, preço e estoque são decididos no banco.
- Bucket público apenas com fotos do catálogo; upload/substituição/exclusão restritos a administradores por políticas do Storage.

## Pendências (próxima etapa)

- Criar o projeto Supabase de testes, executar os SQLs e ligar as variáveis (ainda não há banco conectado — por isso os fluxos com e-mail, pedidos e upload ainda não foram testados de ponta a ponta).
- Publicar na Vercel e cadastrar as URLs de produção no Supabase Auth.
- Pagamento real está fora desta fase: nenhum pedido é cobrado ou marcado como pago.
