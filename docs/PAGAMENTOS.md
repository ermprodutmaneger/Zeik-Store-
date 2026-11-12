# Pix e mensalidades da Zeik Store

O Asaas cria e recebe os Pix. O Supabase guarda pedidos, cobranças e acesso aos planos e roda a Edge Function. A loja na Vercel usa a mesma conta e o mesmo carrinho.

## Começar no Sandbox

1. Crie ou entre na [conta Sandbox do Asaas](https://sandbox.asaas.com/). Em **Integrações → Chaves de API**, gere uma chave de teste. Use um cadastro e dados fictícios na homologação.
2. No projeto Supabase da Zeik Store, abra **Edge Functions → Secrets**. Adicione os valores abaixo. Guarde as chaves no painel. Em um projeto comercial ativo, use um projeto Supabase separado para homologação.
3. No Asaas Sandbox, abra **Integrações → Webhooks** e crie um webhook para `https://apkawxehkaqaescpeqkb.supabase.co/functions/v1/zeik-billing/webhook`. Copie no campo de autenticação o mesmo valor de `ASAAS_WEBHOOK_TOKEN`. Use entrega sequencial e selecione os eventos das cobranças Pix e assinaturas. Se usar NFS-e, selecione também os eventos de notas fiscais. O Asaas inclui o token no cabeçalho `asaas-access-token`.
4. Configure a tarefa de manutenção abaixo. No checkout, adicione um produto, entre na sua conta e selecione **Continuar para o Pix → Gerar Pix**. Confirme a cobrança pelo painel do Sandbox ou pelo [simulador da API](https://docs.asaas.com/reference/confirmar-pagamento). A tela deve mudar para **Pix confirmado**, e o pedido deve ficar confirmado no painel. Teste também o estorno, a expiração e o acesso do assinante.
5. No painel da loja, abra **Cobranças Pix** para consultar pagamentos, estornar e registrar a chave da NF-e de um pedido físico. Em **Minha conta → Minhas mensalidades**, o assinante consulta o próximo Pix e seu acesso.

| Secret | Valor no Sandbox |
| --- | --- |
| `ASAAS_BILLING_MODE` | `sandbox` |
| `ASAAS_API_KEY` | Chave da conta Sandbox |
| `ASAAS_WEBHOOK_TOKEN` | Segredo aleatório com 32 a 255 caracteres, igual no Asaas e no Supabase |
| `BILLING_CRON_TOKEN` | Outro segredo aleatório com 32 a 255 caracteres, usado pelo Supabase Cron |
| `BILLING_PICKUP_DETAILS` | Opcional. Instruções públicas de retirada. O Sandbox usa retirada simulada quando vazio. |
| `ASAAS_NFSE_SETTINGS` | Opcional. JSON fiscal do serviço com os campos do cadastro e da [API de NFS-e](https://docs.asaas.com/reference/agendar-nota-fiscal), validados com a contabilidade. |

## Manutenção a cada cinco minutos

1. Em **Integrations → Cron**, habilite Cron. Habilite `pg_net` em **Database → Extensions**.
2. Abra **Vault** e cadastre um segredo chamado `zeik_billing_cron_token`, com o mesmo valor de `BILLING_CRON_TOKEN`.
3. Crie um job do tipo SQL, com frequência `*/5 * * * *`, usando:

```sql
select net.http_post(
  url := 'https://apkawxehkaqaescpeqkb.supabase.co/functions/v1/zeik-billing/maintenance',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-zeik-cron-token', (
      select decrypted_secret from vault.decrypted_secrets
      where name = 'zeik_billing_cron_token'
    )
  ),
  body := '{}'::jsonb,
  timeout_milliseconds := 45000
);
```

O webhook registra o evento antes de responder ao Asaas. O job retoma eventos pendentes, atualiza pagamentos, cancela Pix avulso vencido e processa notas de serviço quando configuradas. Acompanhe o histórico no Cron, os logs da Edge Function e os logs de entrega no Asaas. Se houver dúvida após timeout de criação ou estorno, confira a referência da cobrança no Asaas antes de repetir a operação.

## Planos mensais e produção

- Cadastre cada plano em `billing_plans` com nome, descrição, preço em centavos e conteúdo do assinante. O preço é guardado na contratação. Crie planos de homologação com conteúdo fictício. A assinatura do Asaas gera um Pix mensal. O cliente paga cada cobrança manualmente. A loja protege o conteúdo no servidor e dá três dias de carência após o vencimento da renovação.
- A régua usa as notificações por e-mail do Asaas disponíveis no cadastro do pagador. Confirme as regras de criação, vencimento e atraso no painel da conta durante a homologação. Os avisos de WhatsApp, SMS e voz ficam desativados para o pagador criado pela loja.
- Para produção, use a chave Pix e uma conta Asaas apta para receber. Crie novas credenciais e um webhook de produção. Revise catálogo, estoque, preço, regras de retirada e cadastro fiscal antes de ativar. Combine a modalidade fiscal com sua contabilidade. A NFS-e automática deste código atende planos de serviço com cadastro compatível. Para mercadoria, a loja permite registrar a chave da NF-e emitida pelo seu emissor. Para emissão automática de mercadoria, integre esse emissor com a loja.
- Encerre reservas de teste e retire planos fictícios antes da transição. A loja abre cobranças de produção quando `ASAAS_BILLING_MODE=production` e a configuração `billing_settings.live_checkout` está ativa. Com a operação real ativa, o caminho antigo de pedidos de teste é desabilitado no banco.
- O checkout físico atual é para retirada. Para oferecer entrega, configure a modalidade e o cálculo de frete antes de anunciar envio.
- Em caso de estorno antes da retirada, o cancelamento devolve a reserva ao estoque. Após entregar, confirme a devolução física antes de repor o estoque. Verifique no emissor se há ação fiscal pendente após um estorno.

## Implantação e verificação

Em um banco vazio, aplique primeiro `supabase/schema.sql` e depois a migração em `supabase/migrations`. Em um banco que já usa o schema da Zeik Store, aplique somente a migração. Publique a Edge Function `zeik-billing` conforme `supabase/config.toml`.

A função usa a sessão validada pelo Supabase Auth para ações da loja, o token do Asaas para webhook e o token de manutenção para Cron. O preço sai do banco e cada pedido é vinculado a uma cobrança. O Supabase controla o acesso aos pedidos e a função confirma ID, referência, valor e estado pela API do Asaas.

- [Webhook do Asaas](https://docs.asaas.com/docs/receba-eventos-do-asaas-no-seu-endpoint-de-webhook)
- [Agendar Edge Functions pelo Supabase Cron](https://supabase.com/docs/guides/functions/schedule-functions)
