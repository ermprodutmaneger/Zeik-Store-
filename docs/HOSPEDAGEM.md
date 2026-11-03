# Hospedagem da Zeik Store

Guia para conectar o Supabase e publicar a loja. O código já está implementado neste repositório (React + TypeScript + Vite), com `supabase/schema.sql`, `supabase/seed.sql`, `supabase/admin.sql`, scripts de validação e o rewrite de SPA em `vercel.json`.

**Ambiente preparado:** o projeto Supabase exclusivo `zeik-store` já recebeu o schema e os oito produtos de exemplo; as variáveis públicas estão configuradas no projeto Vercel `zeik-store`, vinculado a este repositório. As seções abaixo também permitem reproduzir a configuração em outro ambiente de testes. O endereço de produção e os dois retornos de autenticação já estão configurados para `https://zeik-store.vercel.app`. A conta administrativa deve ser identificada explicitamente e promovida pelo UUID.

## 1. Pré-requisitos e instalação local

1. Node.js **24.x** (mesma versão configurada na Vercel; confira com `node -v`).
2. Na raiz do repositório (onde está o `package.json`), instale as versões exatas do lockfile:

   ```bash
   npm ci
   ```

3. Sem as variáveis do Supabase (próxima seção), `npm run dev` abre a loja mostrando apenas a **tela de configuração pendente** — é o comportamento esperado: nada é simulado.

## 2. Conectar um projeto exclusivo no Supabase

1. Abra [Supabase](https://supabase.com/dashboard) e crie (ou selecione) um projeto dedicado a este teste, conforme o plano disponível. Não reutilize banco de clientes.
2. No painel **Connect**, obtenha a URL do projeto e a chave publicável (`sb_publishable_…`).
3. Copie `.env.example` para `.env.local` e preencha:
   - `VITE_SUPABASE_URL`: URL do projeto.
   - `VITE_SUPABASE_PUBLISHABLE_KEY`: chave publicável.
4. Nunca use `service_role`, `sb_secret` ou senha do banco no frontend. O `.env.local` já está fora do Git (`.gitignore`).
5. Reinicie o servidor após mudar variáveis: `npm run dev`. A loja deve passar da tela de configuração para a vitrine.

## 3. Preparar banco, imagens e administrador

No **SQL Editor** do projeto de teste correto, execute nesta ordem:

1. [`supabase/schema.sql`](../supabase/schema.sql) — cria tabelas (`profiles`, `user_roles`, `categories`, `products`, `orders`, `order_items`), índices, constraints, funções (`is_admin`, `create_test_order`), triggers, RLS com privilégios mínimos e o bucket público **`product-images`** (JPEG/PNG/WebP, até 5 MB; leitura pública, escrita/exclusão só de administradores).
2. [`supabase/seed.sql`](../supabase/seed.sql) — 4 categorias e 8 produtos fictícios de demonstração (um deles com estoque zero e outro com estoque baixo, de propósito). As fotos do seed ficam em `public/demo/` no site; fotos enviadas depois pelo painel vão para o Storage.
3. Cadastre a sua conta pelo aplicativo (`/cadastro`) e confirme o e-mail.
4. Em **Authentication → Users**, copie o UUID da sua conta e promova-a executando [`supabase/admin.sql`](../supabase/admin.sql) com o seu UUID. Não existe senha administrativa padrão, e ninguém consegue se promover pela API.
5. Saia e entre de novo no app: o menu **Painel** aparece e `/admin` libera.

> Dica: em **Table Editor**, confira o ícone de RLS ativo nas seis tabelas; em **Storage**, o bucket `product-images` deve estar público e conter apenas fotos do catálogo.

## 4. Configurar autenticação (URLs de retorno)

1. Em **Authentication → Providers**, confirme o provedor **Email** ativo e a confirmação de e-mail ligada.
2. Em **Authentication → URL Configuration**, cadastre os endereços que o app usa:
   - A página `/auth/callback` recebe o link de confirmação de cadastro.
   - A página `/redefinir-senha` recebe o link de recuperação de senha.
3. **Desenvolvimento opcional** (endereço mostrado pelo Vite, em geral `http://localhost:5173`): mantenha a Site URL de produção e adicione estes retornos somente quando for testar localmente:
   - Redirect URLs:
     - `http://localhost:5173/auth/callback`
     - `http://localhost:5173/redefinir-senha`
4. **Produção (já configurada neste projeto)**:
   - Site URL: `https://zeik-store.vercel.app`
   - Redirect URLs (adicione sem apagar as de desenvolvimento, se ainda testar local):
     - `https://zeik-store.vercel.app/auth/callback`
     - `https://zeik-store.vercel.app/redefinir-senha`
5. O projeto usa o serviço SMTP padrão do Supabase, destinado a testes com os e-mails dos membros da equipe. Para cadastro e recuperação por endereços externos, configure um SMTP próprio em **Authentication → Emails → SMTP Settings**. Confirmação e recuperação só devem ser consideradas validadas após receber e abrir os e-mails reais.

## 5. Publicar na Vercel pelo GitHub

1. Verifique localmente: `npm run typecheck`, `npm run lint` e `npm run build` devem passar.
2. Na [Vercel](https://vercel.com/new), importe o repositório `ermprodutmaneger/Zeik-Store-`.
3. A Vercel detecta Vite automaticamente. Confira: raiz = pasta do `package.json` (a raiz do repo), build `npm run build`, saída `dist`.
4. Em **Environment Variables**, adicione `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` ao ambiente de produção. O Vite embute essas variáveis no build: qualquer alteração pede um novo deploy.
5. Publique e copie a URL final. Volte à seção 4 e cadastre essa URL no Supabase (Site URL + as duas Redirect URLs).
6. Teste abrir diretamente uma rota interna (ex.: `/carrinho`, `/admin`) e recarregar: o rewrite de SPA em `vercel.json` evita o 404.
7. Com a integração Git ativa, novos pushes na branch de produção geram novos deploys automaticamente.

> Previews de Pull Request: cada preview ganha uma URL própria. Para testar login/confirmação nelas, adicione temporariamente `https://URL-DO-PREVIEW/auth/callback` e `.../redefinir-senha` às Redirect URLs, ou teste a autenticação apenas em produção/localhost.

## 6. Conferir o teste completo

- **Configuração pendente:** sem as variáveis (ex.: apague-as de um preview), aparece a tela de configuração — sem login ou pedidos simulados.
- **Visitante:** vê apenas produtos ativos; `/conta` e `/admin` pedem login.
- **Cliente A:** cadastra, confirma o e-mail, entra, edita o próprio nome e finaliza um pedido de teste.
- **Cliente B:** não vê nem altera nada do Cliente A — inclusive chamando a API direto (RLS). Tentar gravar em `user_roles`, mudar preço/estoque ou ler pedidos alheios deve falhar.
- **Administrador:** cadastra produto com foto (Storage), muda preço/estoque, desativa produto que já tem pedidos (excluir é bloqueado para preservar o histórico) e atualiza o andamento dos pedidos.
- **Estoque:** o pedido baixa as unidades; dois envios com a mesma finalização (duplo clique/retry) não duplicam o pedido; quantidade maior que o estoque é recusada com mensagem clara.
- **Persistência:** recarregar a página mantém produtos, fotos e pedidos vindos do banco.
- **E-mails:** confirmação cai em `/auth/callback`; recuperação, em `/redefinir-senha` — no domínio certo (localhost ou produção).
- **Pagamento:** nenhum valor é cobrado nesta fase; pedidos nascem como “de teste”.

## Referências oficiais

- [Supabase com React](https://supabase.com/docs/guides/getting-started/quickstarts/reactjs)
- [Autenticação por senha](https://supabase.com/docs/guides/auth/passwords)
- [SMTP e restrições do envio padrão](https://supabase.com/docs/guides/auth/auth-smtp)
- [URLs de retorno](https://supabase.com/docs/guides/auth/redirect-urls)
- [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Chaves de API](https://supabase.com/docs/guides/getting-started/api-keys)
- [Vite na Vercel](https://vercel.com/docs/frameworks/frontend/vite)
