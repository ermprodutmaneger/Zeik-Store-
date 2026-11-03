# Hospedagem da Zeik Store

Este guia descreve a configuração a fazer **depois que o agente implementar a loja** seguindo [PROMPT_AGENTE.md](../PROMPT_AGENTE.md).

## Estado inicial

O repositório começa com documentação e variáveis de exemplo. Ainda não contém uma aplicação executável, banco provisionado, usuário administrador ou deploy. Os arquivos SQL e os scripts npm abaixo devem ser gerados pelo agente.

## 1. Gerar o projeto pelo agente

1. Abra o repositório `ermprodutmaneger/Zeik-Store-` no agente de programação.
2. Envie o conteúdo de `PROMPT_AGENTE.md`.
3. Confira se o resultado inclui o aplicativo, `package.json`, lockfile, scripts de validação, SQL do banco e configuração de rotas para a Vercel.
4. Salve o código neste mesmo repositório.

## 2. Conectar um projeto exclusivo no Supabase

1. Abra [Supabase](https://supabase.com/dashboard) e selecione ou crie um projeto dedicado a este teste, conforme o plano disponível. Não reutilize o banco de clientes.
2. No painel Connect, obtenha a URL do projeto e sua chave publicável.
3. Copie `.env.example` para `.env.local` no ambiente de desenvolvimento e preencha:
   - `VITE_SUPABASE_URL`: URL do projeto.
   - `VITE_SUPABASE_PUBLISHABLE_KEY`: chave publicável.
4. Não use chaves secretas ou `service_role` no frontend. Arquivos `.env.local` não devem ser enviados ao GitHub.
5. Após o agente criar o `package.json` e o lockfile, execute `npm ci` e `npm run dev`. Ao alterar variáveis locais, reinicie o servidor.

## 3. Preparar banco, imagens e administrador

1. Revise o SQL gerado. No projeto de teste correto, execute `supabase/schema.sql` e depois `supabase/seed.sql`, conforme o README atualizado.
2. Confirme que as tabelas expostas têm RLS e que os privilégios de `anon` e `authenticated` são os mínimos necessários.
3. Crie o bucket do catálogo e as políticas de upload, leitura e exclusão descritas pelo agente. Um bucket público deve conter somente fotos públicas de produtos.
4. Cadastre a sua conta pelo aplicativo e confirme o e-mail.
5. Localize o UUID dessa conta em Authentication e execute somente para esse UUID o procedimento de atribuição de administrador. Não existe senha administrativa padrão.

## 4. Configurar autenticação

1. Habilite o provedor de e-mail e senha e confira as regras de confirmação.
2. Em Authentication → URL Configuration, configure a Site URL e as URLs permitidas de retorno.
3. Durante o desenvolvimento, use o endereço local realmente mostrado pelo Vite. Se for `http://localhost:5173`, autorize os caminhos de callback e recuperação implementados pelo agente nesse endereço.
4. Após a publicação, use a URL real de produção na Site URL e autorize os caminhos exatos de callback e recuperação desse domínio. Não invente uma URL antes do deploy.
5. Verifique a configuração de envio de e-mails do projeto. Se o envio padrão não atender aos destinatários do teste, configure um SMTP apropriado antes de testar confirmação e recuperação; não considere o fluxo validado sem receber os e-mails.

## 5. Publicar na Vercel pelo GitHub

1. Verifique os resultados de tipos, lint e `npm run build`.
2. Na [Vercel](https://vercel.com/new), importe o repositório `ermprodutmaneger/Zeik-Store-`.
3. Selecione o projeto React/Vite gerado. Use como raiz a pasta que contém o `package.json`.
4. Confira o comando de build `npm run build` e a saída `dist`, salvo configuração diferente documentada pelo agente.
5. Adicione `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` ao ambiente pretendido. Como Vite incorpora essas variáveis no build, alterações exigem um novo deploy.
6. Publique e copie a URL que a Vercel retornar.
7. Atualize a configuração de autenticação do Supabase com essa URL, como descrito acima.
8. Abra diretamente uma rota interna e recarregue. O aplicativo deve ter o rewrite de SPA configurado para evitar erros 404.
9. Os próximos pushes na branch de produção devem gerar novos deploys quando a integração Git estiver ativa.

## 6. Conferir o teste completo

- Visitante: vê produtos ativos, mas não entra em páginas privadas.
- Cliente A: entra, edita o próprio nome e cria pedido de teste.
- Cliente B: não consulta nem altera dados do Cliente A, inclusive por chamadas diretas à API.
- Administrador: cadastra produto com foto, altera preço e estoque e acompanha pedidos.
- Recarregamento: produtos e pedidos continuam no banco.
- Estoque: pedido concorrente ou repetido não causa estoque negativo ou pedido duplicado.
- E-mail: confirmação e recuperação abrem as rotas corretas do site publicado.
- Pagamento: nenhum valor é cobrado nesta fase.

## Referências oficiais

- [Supabase com React](https://supabase.com/docs/guides/getting-started/quickstarts/reactjs)
- [Autenticação por senha](https://supabase.com/docs/guides/auth/passwords)
- [URLs de retorno](https://supabase.com/docs/guides/auth/redirect-urls)
- [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Chaves de API](https://supabase.com/docs/guides/getting-started/api-keys)
- [Vite na Vercel](https://vercel.com/docs/frameworks/frontend/vite)
