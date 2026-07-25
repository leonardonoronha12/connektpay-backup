# Pagar.me Migration

## Arquitetura

- A camada de adquirência passa a suportar seleção neutra por `FINANCIAL_PROVIDER`.
- Providers suportados nesta fase:
  - `pagarme`
  - `mygateway` (legado)
- O registry usa `getAcquirerProvider(providerId?)` e não faz fallback silencioso entre PSPs.
- Provider desconhecido gera `ProviderError` com `code=invalid_config`.
- Tudo que depende de PSP externo deve continuar passando pela interface `AcquirerProvider`.

## Variáveis

- `FINANCIAL_PROVIDER=pagarme|mygateway`
- `PAGARME_BASE_URL`
  - sandbox padrão: `https://sdx-api.pagar.me/core/v5`
  - produção: `https://api.pagar.me/core/v5`
- `PAGARME_SECRET_KEY`
- `PAGARME_PAYMENT_LINKS_ENABLED`
- `PAGARME_WEBHOOK_USERNAME`
  - usuário exclusivo configurado no webhook da Pagar.me
- `PAGARME_WEBHOOK_PASSWORD`
  - senha exclusiva configurada no webhook da Pagar.me
- `PAGARME_HOSTED_CHECKOUT_HOSTS` opcional para allowlist adicional de checkout hospedado

## Autenticação

- O `PagarMeProvider` encapsula Basic Auth com `PAGARME_SECRET_KEY`.
- Não existe fluxo de token temporário nesta fase.
- O header `Authorization` não é persistido em banco, logs, payloads sanitizados ou documentação.

## Base concluída antes da homologação real

- Provider registry multi-PSP
- `ProviderError` neutro com sanitização
- Capabilities por provider em `env.ts`
- `PagarMeProvider`
- Recebedores internos
- KYC administrativo interno
- Split interno
- Assinaturas internas
- Repasses internos
- Antecipação administrativa interna
- Conciliação interna
- Exportações CSV administrativas/internas previstas em produto
- Backoffice administrativo endurecido contra erro silencioso, loading preso e feedback ausente
- Indisponibilidade operacional legítima tratada com `503` quando a dependência externa ainda não está configurada
- Payment Links:
  - `createPaymentLink()`
  - `getPaymentLink()`
  - `listPaymentLinks()`
- Checkout público neutro com allowlist por provider
- `provider-settings` neutro para provider ativo

## Módulos ainda dependentes da Pagar.me

- customers
- recipients
- standalone payments
- subscriptions
- split
- webhooks
- refunds
- reconciliation

## Endpoints usados

- `POST /paymentlinks`
- `GET /paymentlinks/{payment_link_id}`
- `GET /paymentlinks`
- `POST /api/webhooks` recebe eventos da Pagar.me
- `GET /hooks/{hook_id}` pode ser usado para consultar o webhook configurado

## Webhooks

- Recurso oficial da API V5: `hooks`.
- O painel homologado expõe autenticação HTTP Basic no endpoint, sem `Webhook Secret`, `Signing Secret`, `HMAC` ou `X-Hub-Signature-256`.
- Header esperado no endpoint interno: `Authorization`.
- Formato esperado: `Basic <base64(username:password)>`.
- O endpoint decodifica o header, separa `username:password` no primeiro `:`, compara com `PAGARME_WEBHOOK_USERNAME` e `PAGARME_WEBHOOK_PASSWORD` e retorna `401` quando a autenticação falha.
- A comparação de usuário e senha usa `crypto.timingSafeEqual` sobre buffers normalizados, sem fallback inseguro.
- Respostas `401` incluem `WWW-Authenticate: Basic realm="Pagar.me Webhook"`.
- Em produção, ausência de `PAGARME_WEBHOOK_USERNAME` ou `PAGARME_WEBHOOK_PASSWORD` mantém o endpoint em fail-closed com `503`.
- O body cru continua sendo lido antes do `JSON.parse` para preservar o contrato do parser e a geração de `provider_event_id`.
- Eventos duplicados continuam deduplicados por `provider_event_id`, priorizando o `id` top-level do webhook quando presente.

## Payment Link

- Payload enviado:
  - `type: "order"`
  - `name`
  - `payment_settings.accepted_payment_methods`
  - `cart_settings.items`
  - `expires_at` quando aplicável
  - `max_paid_sessions` quando aplicável
- Resposta normalizada para o contrato interno:
  - `provider_reference`
  - `provider_url`
  - `provider_status`
  - `provider_payload` sanitizado
  - `created_at`
  - `updated_at`

## Segurança

- URLs hospedadas são validadas por allowlist do provider antes de uso no checkout.
- Links antigos da MyGateway continuam compatíveis.
- Novos links gravam `metadata.provider_id` para identificar claramente o PSP de origem.
- Métodos não implementados retornam `ProviderError` com `NOT_IMPLEMENTED`.
- Fluxos ainda não habilitados externamente não devem simular sucesso financeiro nem mascarar indisponibilidade de conta/provider.

## Riscos

- Os demais módulos continuam bloqueados até implementação e homologação específicas.
- O host padrão de checkout hospedado da Pagar.me pode exigir ajuste fino via `PAGARME_HOSTED_CHECKOUT_HOSTS` durante homologação real.
- Sem credenciais válidas, `PAGARME_PAYMENT_LINKS_ENABLED=true` não basta para ativar sincronização.
- Habilitações de conta Sandbox podem ser necessárias por produto, como recipients, split, KYC e marketplace.
- A validação crítica de UI local desta rodada ficou bloqueada por configuração do runner Playwright e deve ser repetida em ambiente correto.

## Passos exatos para retomar a homologação

- Configurar `FINANCIAL_PROVIDER=pagarme`
- Configurar `PAGARME_BASE_URL`
- Configurar `PAGARME_SECRET_KEY`
- Configurar `PAGARME_WEBHOOK_USERNAME`
- Configurar `PAGARME_WEBHOOK_PASSWORD`
- Habilitar `PAGARME_PAYMENT_LINKS_ENABLED=true`
- Confirmar habilitações da conta para os módulos exigidos
- Reexecutar `npm run test:critical` com `BASE_URL` apontando para a instância correta da aplicação
- Validar:
  - autenticação/configuração via `authenticate()`
  - create/get/list de Payment Links
  - redirecionamento do checkout público para URL hospedada permitida
  - indisponibilidades restantes respondendo com `503` quando a conta/provider ainda não estiverem configurados
