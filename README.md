# Zeik Store

Projeto de uma loja de testes para aprender Supabase na prática: login, banco de dados, imagens e administração de produtos.

**Estado atual:** preparação do projeto. Esta versão contém o briefing para o agente, o guia de hospedagem e as variáveis de exemplo. O código da loja, o banco e o deploy ainda serão implementados.

## Começar

1. Abra este repositório em um agente de programação.
2. Copie e envie [PROMPT_AGENTE.md](PROMPT_AGENTE.md).
3. Após a implementação, siga [docs/HOSPEDAGEM.md](docs/HOSPEDAGEM.md).

## Escopo planejado

- Vitrine responsiva, busca, categorias, produto e carrinho.
- Cadastro, login, confirmação de e-mail e recuperação de senha com Supabase Auth.
- Conta do cliente e histórico de pedidos de teste.
- Painel de administrador com gestão de produtos, fotos e estoque.
- PostgreSQL com RLS e separação entre cliente e administrador.
- Supabase Storage para imagens do catálogo.
- Publicação na Vercel integrada ao GitHub.

## Configuração

O arquivo [.env.example](.env.example) declara somente a URL do projeto e sua chave publicável. Preencha os valores reais em `.env.local` e nas variáveis do ambiente de hospedagem.

Nunca publique chaves secretas, `service_role`, senhas ou dados pessoais de clientes. Os pedidos desta fase serão de teste, sem cobrança.
