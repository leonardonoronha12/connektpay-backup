# MYGATEWAY — Mapa de Conexão Final (Connekt Pay)

Data: 2026-07-14

Objetivo:

- consolidar o que está pronto internamente;
- separar o que está confirmado pela documentação oficial recebida do que existe apenas no código atual;
- eliminar suposições antes da integração real.

Regras:

- Não altera código.
- Não cria migrations.
- Não faz deploy.
- Não chama a MyGateway.
- Não habilita feature flags externas.
- Não trata adapter atual como documentação oficial.

## Legenda

- **Pronto internamente**: domínio, banco, API, auditoria e UX existem sem provider.
- **Pronto para conectar**: contrato externo confirmado e base interna pronta; ainda depende de credencial e homologação.
- **Bloqueado por documentação**: endpoint, payload, status ou headers ainda não foram confirmados pela MyGateway.
- **Bloqueado por credencial**: depende de segredo/token/ambiente habilitado.
- **Bloqueado por homologação**: contrato já conhecido, mas falta validar comportamento real.

## Fontes de evidência

- **Confirmada pela documentação oficial recebida**: usar como base primária para implementação.
- **Encontrada no painel**: usar como evidência operacional, mas não como contrato técnico completo.
- **Presente somente no código atual**: tratar como implementação existente, não como verdade oficial do provider.
- **Pendente de confirmação da MyGateway**: não assumir, não automatizar e não promover para “pronto para conectar”.

## Autenticação

Classificação: **Pronto para conectar** + **Bloqueado por credencial** + **Bloqueado por homologação**.

| módulo interno | status interno atual | tabelas usadas | APIs internas | serviço interno | método esperado no ProviderAdapter | endpoint externo confirmado | endpoint externo pendente | payload interno | payload externo esperado | status internos | status externos pendentes | webhook relacionado | feature flag | riscos | critério de aceite da integração |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Autenticação MyGateway | Não existe fluxo de negócio próprio; depende de credenciais válidas | — | indireto, consumido pelos módulos que chamam provider | `authenticate()` em [provider.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/lib/acquirer/provider.ts) | `authenticate()` | `POST /authentication/v2/auth` | Divergência do header de autorização definitivo: `Authorization` vs `Authentication` | Interno usa envs `MYGATEWAY_API_URL`, `MYGATEWAY_X_API_KEY`, `MYGATEWAY_AUTH_DATA` | Headers confirmados: `x-api-key`, `Content-Type: application/json`; body: `{ "authData": "base64(clientId:clientSecret)" }`; resposta: `{ "auth_token": "...", "expires_in": "..." }` | — | Política final de renovação/expiração do token no ambiente real | — | — | Reutilizar `auth_token` até `expires_in`; não gerar token a cada requisição; evitar excesso de autenticações para não bloquear a API Key; falhas mapeadas sem expor segredo |

**Base de evidência**

- **Confirmada pela documentação oficial recebida**:
  - `POST /authentication/v2/auth`
  - headers `x-api-key` e `Content-Type: application/json`
  - body `{ "authData": "base64(clientId:clientSecret)" }`
  - resposta com `auth_token` e `expires_in`
  - regra operacional: reutilizar o token até `expires_in`
- **Presente somente no código atual**:
  - `POST /authentication/v1/auth` em [myg-provider.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/lib/acquirer/myg-provider.ts)
- **Pendente de confirmação da MyGateway**:
  - se `v1` continua aceito como fallback
  - se o header final do token é `Authorization` ou `Authentication`

---

## Recebedores

Classificação: **Pronto internamente** + **Bloqueado por documentação** + **Bloqueado por credencial**.

| módulo interno | status interno atual | tabelas usadas | APIs internas | serviço interno | método esperado no ProviderAdapter | endpoint externo confirmado | endpoint externo pendente | payload interno | payload externo esperado | status internos | status externos pendentes | webhook relacionado | feature flag | riscos | critério de aceite da integração |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Recebedores (cadastro PF/PJ) | Fluxo interno ativo; sync provider desabilitado | `receivers`, `audit_logs` | `GET/POST /api/receivers`, `PATCH /api/receivers/[id]`, `GET/POST /api/public/receivers` | [receiver-kyc.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/lib/receiver-kyc.ts) e [receiver-provider-sync.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/lib/receiver-provider-sync.ts) | `createRecipient()` e `getRecipient()` | — | Endpoint oficial de recipient (create/get) | `{ id, organization_id, type, document, name, legal_name, address, bank_account, status, kyc_status, internal_status }` | Interface atual prevê `{ receiverId, personType, document, name, address, bankAccount, metadata }` | `draft`, `documents_pending`, `under_review`, `internally_approved`, `active`, `blocked` | `recipient.status` e mapa oficial de status do provider | — | `INTERNAL_RECEIVERS_FLOW_ENABLED=true`, `RECEIVER_PROVIDER_SYNC_ENABLED=false` | Divergência de modelo PF/PJ e dados bancários; risco de tornar o provider fonte de verdade | Recebedor interno continua soberano; ao integrar, persistir `provider_reference/status/payload` sem sobrescrever o domínio interno |

**Base de evidência**

- **Presente somente no código atual**:
  - interface opcional para `createRecipient/getRecipient`
  - stub de sync aguardando contrato oficial
- **Pendente de confirmação da MyGateway**:
  - endpoint oficial de recebedor
  - payload aceito
  - status externos

---

## KYC

Classificação: **Pronto internamente** + **Bloqueado por documentação** + **Bloqueado por credencial**.

| módulo interno | status interno atual | tabelas usadas | APIs internas | serviço interno | método esperado no ProviderAdapter | endpoint externo confirmado | endpoint externo pendente | payload interno | payload externo esperado | status internos | status externos pendentes | webhook relacionado | feature flag | riscos | critério de aceite da integração |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| KYC interno (workflow + documentos) | Fluxo interno ativo; provider KYC desabilitado | `kyc_requests`, `kyc_documents`, `receivers`, `audit_logs`, bucket `kyc-documents` | `GET/POST /api/kyc-requests`, `PATCH /api/kyc-requests/[id]`, `POST /api/kyc/upload`, `GET /api/kyc-requests/[id]/documents`, `DELETE /api/kyc-documents/[id]` | [kyc-core.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/lib/kyc-core.ts), [receiver-kyc.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/lib/receiver-kyc.ts), [receiver-provider-sync.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/lib/receiver-provider-sync.ts) | `submitKyc()` e `getKycStatus()` | — | Endpoint oficial de KYC submit/status | `{ receiver_id, status, internal_notes, checklist }` + documentos privados em storage | Interface atual prevê `{ receiverId, personType, document, name, documents[], metadata }` | `pending`, `under_review`, `approved`, `rejected` | `kyc.status` oficial do provider | — | `INTERNAL_KYC_FLOW_ENABLED=true`, `MYGATEWAY_KYC_ENABLED=false` | Privacidade de documentos; divergência entre decisão interna e provider | Envio de documentos sem URL pública permanente; telemetria externa não substitui a decisão interna |

**Base de evidência**

- **Presente somente no código atual**:
  - método opcional `submitKyc()` na interface
  - stub que retorna 501 no adapter atual
- **Pendente de confirmação da MyGateway**:
  - endpoint de KYC
  - docTypes aceitos
  - status e webhook/eventos relacionados

---

## Split

Classificação: **Pronto internamente** + **Bloqueado por documentação**.

| módulo interno | status interno atual | tabelas usadas | APIs internas | serviço interno | método esperado no ProviderAdapter | endpoint externo confirmado | endpoint externo pendente | payload interno | payload externo esperado | status internos | status externos pendentes | webhook relacionado | feature flag | riscos | critério de aceite da integração |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Split interno (configs + simulação) | Ativo e isolado; sem execução financeira real | `split_configs`, `split_rules`, `pay_split`, `pay_transacao`, `pay_ledger`, `audit_logs` | `/api/split-configs`, `/api/split-configs/validate` e rotas filhas | [split-core.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/lib/split-core.ts), [split-service.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/lib/split-service.ts) | Não há método isolado; split seria acoplado aos métodos de cobrança/assinatura | — | Confirmação do payload oficial de split para Payment Link, pagamento avulso e assinatura | `providerSplit.receivers[{ receiverId, amount }]` + `connektFeeAmount` | Pendente de confirmação oficial | Cálculo interno, sem status externo próprio | `split.status` e semântica externa do split | Deriva de `payment.*` e `recurring.charge.*` apenas no código atual | `SPLIT_PROVIDER_ENABLED=false` | Hoje o adapter envia split, mas isso não foi confirmado oficialmente; risco de homologar payload inválido | Só reclassificar para “pronto para conectar” quando a MyGateway confirmar payload, semântica e efeito financeiro do split |

**Base de evidência**

- **Presente somente no código atual**:
  - adapter envia `split` em `/payments/v1/create` e `/subscriptions/v1/create`
- **Pendente de confirmação da MyGateway**:
  - se split é aceito nesses endpoints
  - shape final do payload
  - comportamento financeiro e conciliação do split

---

## Assinaturas

Classificação: **Pronto internamente** + **Bloqueado por credencial** + **Bloqueado por homologação** + **Bloqueado por confirmação documental**.

| módulo interno | status interno atual | tabelas usadas | APIs internas | serviço interno | método esperado no ProviderAdapter | endpoint externo confirmado | endpoint externo pendente | payload interno | payload externo esperado | status internos | status externos pendentes | webhook relacionado | feature flag | riscos | critério de aceite da integração |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Assinaturas internas (planos/pagadores/assinaturas + simulador) | Fluxo interno pronto; provider desabilitado | `pay_plano`, `pay_pagador`, `pay_assinatura`, `pay_subscription_events`, `audit_logs` | Módulo interno em `app/api/subscriptions-internal/...`; operacional legado em `/api/subscriptions` | [subscription-core.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/lib/subscription-core.ts), [subscription-service.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/lib/subscription-service.ts), [subscriptions-internal-service.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/lib/subscriptions-internal-service.ts) | `createSubscription()` e `cancelSubscription()` | — | Confirmação oficial de create/cancel, payload e eventos de recorrência | `{ plano_id, pagador_id, recebedor_id, amount_centavos, cycle, trial_days, status, next_billing_at }` | Código atual envia `{ externalId, amountCents, cycle, trialDays, receiverId, payer, card, split, metadata }` | `pending`, `active`, `past_due`, `canceled`, `failed` | Mapa oficial de eventos/status de recorrência | `subscription.*`, `recurring.charge.*`, `pix_auto.*` apenas no código atual | `SUBSCRIPTIONS_PROVIDER_ENABLED=false` | Endpoints existem no adapter, mas isso não basta como prova documental; dependência total de webhooks homologados | Só promover para integração real com documentação oficial ou confirmação formal da MyGateway sobre create/cancel, status e eventos |

**Base de evidência**

- **Presente somente no código atual**:
  - `POST /subscriptions/v1/create`
  - `POST /subscriptions/v1/cancel`
  - payload com `split`
  - eventos `subscription.*` e `recurring.charge.*` processados no webhook
- **Pendente de confirmação da MyGateway**:
  - contrato oficial de assinaturas
  - payload aceito
  - catálogo oficial de eventos

---

## Repasses

Classificação: **Pronto internamente** + **Bloqueado por documentação** + **Bloqueado por homologação**.

| módulo interno | status interno atual | tabelas usadas | APIs internas | serviço interno | método esperado no ProviderAdapter | endpoint externo confirmado | endpoint externo pendente | payload interno | payload externo esperado | status internos | status externos pendentes | webhook relacionado | feature flag | riscos | critério de aceite da integração |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Repasses internos (workflow) | Fluxo interno completo; provider desligado | `payouts`, `payout_events`, `ledger_entries`, `audit_logs` | `/api/payouts-internal`, `/api/payouts-internal/[id]`, `/api/payouts-internal/simulate` | [payouts-internal-core.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/lib/payouts-internal-core.ts), [payouts-internal-service.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/lib/payouts-internal-service.ts) | `createPayout()`, `getPayout()`, `listPayouts()` | — | Endpoint oficial de payout create/get/list | `{ receiver_id, amount_centavos, status, bank_account_snapshot, expected_settlement_at, internal_notes }` | Interface atual prevê `{ receiverId, amount:{amount,currency}, metadata }` | `draft`, `requested`, `under_review`, `approved`, `rejected`, `scheduled`, `provider_pending`, `provider_processing`, `paid`, `failed`, `cancelled` | Status e razões oficiais do provider | `payout.*` apenas no código atual | `PAYOUT_PROVIDER_ENABLED=false` | Não existe contrato oficial confirmado; risco crítico de marcar liquidação sem confirmação real | Só permitir `provider_*` e `paid` quando contrato e homologação existirem; conciliação depende de `get/list` oficiais |

**Base de evidência**

- **Presente somente no código atual**:
  - `POST /payouts` no adapter
  - processamento de `payout.*` no webhook
- **Pendente de confirmação da MyGateway**:
  - endpoint oficial de repasse
  - payload aceito
  - status e eventos

---

## Antecipações

Classificação: **Pronto internamente** + **Bloqueado por documentação** + **Bloqueado por homologação**.

| módulo interno | status interno atual | tabelas usadas | APIs internas | serviço interno | método esperado no ProviderAdapter | endpoint externo confirmado | endpoint externo pendente | payload interno | payload externo esperado | status internos | status externos pendentes | webhook relacionado | feature flag | riscos | critério de aceite da integração |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Antecipação interna (workflow + simulador) | Fluxo interno completo; provider desligado | `pay_antecipacao`, `pay_antecipacao_events`, `ledger_entries`, `audit_logs` | `/api/anticipation`, `/api/anticipation/simulate`, `/api/anticipation/[id]`, `/api/anticipation/[id]/cancel`, `/api/admin/anticipation`, `/api/anticipations` | [anticipation-core.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/lib/anticipation-core.ts), [anticipation-service.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/lib/anticipation-service.ts) | `anticipate()`, `getAnticipation()`, `cancelAnticipation()`, `listAnticipations()` | — | Confirmação oficial de request/get/cancel/list | `{ recebedor_id, eligible_amount_centavos, requested_amount_centavos, estimated_fee_bps, net_amount_centavos, expected_settlement_*, status, internal_notes }` | Código atual envia `{ externalId, amountCents, feeBps, receiverId, metadata }` | `draft`, `eligible`, `requested`, `under_review`, `approved`, `rejected`, `scheduled`, `provider_pending`, `provider_processing`, `paid`, `failed`, `cancelled` | Status financeiros oficiais do provider | `anticipation.*` apenas no código atual | `ANTICIPATION_PROVIDER_ENABLED=false` | Adapter tem endpoints “preparados”, mas sem contrato oficial confirmado; risco de status/amount divergentes | Somente conectar quando request/get/cancel/list estiverem confirmados; nunca marcar `paid` sem confirmação real do provider |

**Base de evidência**

- **Presente somente no código atual**:
  - `POST /anticipations/v1/request`
  - `GET /anticipations/v1/{id}`
  - `POST /anticipations/v1/cancel`
  - `anticipation.*` no webhook
- **Pendente de confirmação da MyGateway**:
  - validade oficial desses endpoints
  - payload/shape de retorno
  - listagem para conciliação

---

## Payment Links

Classificação: **Pronto internamente** + **Pronto para conectar** + **Bloqueado por credencial** + **Bloqueado por homologação**.

| módulo interno | status interno atual | tabelas usadas | APIs internas | serviço interno | método esperado no ProviderAdapter | endpoint externo confirmado | endpoint externo pendente | payload interno | payload externo esperado | status internos | status externos pendentes | webhook relacionado | feature flag | riscos | critério de aceite da integração |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Payment Links | CRUD interno pronto; sync provider ainda não homologado | `payment_links`, `audit_logs` | `GET/POST /api/payment-links`, `GET/POST /api/public/payment-links` | Orquestração atual em [payment-links/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/payment-links/route.ts) | `createPaymentLink()`, `getPaymentLink()`, `listPaymentLinks()` | `POST /payments/v1/paymentlink`, `GET /payments/v1/paymentlink/{id}`, `GET /payments/v1/paymentlink` | Header de autenticação final (`Authorization` vs `Authentication`) | `{ name, description, amount, methods, max_installments, slug, status }` | Criação confirmada: `{ "value":"50025", "title":"Venda de Produto X", "description":"Descrição detalhada do produto", "validity":"2026-01-06 15:30", "minimumNumberOfInstallments":1, "maximumQuantityOfInstallments":18, "numberOfAllowedSales":1, "showFormAddress":1, "customerInterest":0, "acceptedPaymentsType":["PIX","Credit","Billet"] }`; resposta confirmada: `{ "id":"...", "link":"..." }` | `active`/`inactive` (interno) + telemetria externa quando houver sync | Status/listagem finais do provider | Não há webhook oficial confirmado específico do link | Credenciais via `isMyGatewayConfigured()` | O código atual ainda trata Payment Link como `/payments/v1/create`; isso precisa ser considerado divergência, não verdade oficial | Implementação real deve usar `/paymentlink`; gravar `provider_reference/link`; não confundir com pagamento avulso |

**Base de evidência**

- **Confirmada pela documentação oficial recebida**:
  - `POST /payments/v1/paymentlink`
  - `GET /payments/v1/paymentlink/{id}`
  - `GET /payments/v1/paymentlink`
  - payload de criação e resposta com `id` e `link`
- **Presente somente no código atual**:
  - `createPaymentLink()` usa `POST /payments/v1/create`
  - `getPaymentLink()` usa `GET /payments/v1/situation/{id}`
- **Pendente de confirmação da MyGateway**:
  - header final de autenticação para esses endpoints
  - semântica oficial de status do link

---

## PIX

Classificação: **Pronto internamente** + **Bloqueado por documentação** + **Bloqueado por credencial** + **Bloqueado por homologação**.

| módulo interno | status interno atual | tabelas usadas | APIs internas | serviço interno | método esperado no ProviderAdapter | endpoint externo confirmado | endpoint externo pendente | payload interno | payload externo esperado | status internos | status externos pendentes | webhook relacionado | feature flag | riscos | critério de aceite da integração |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Pagamento avulso PIX | Fluxo interno existe; sem contrato oficial confirmado para endpoint externo | `transactions`, `customers`, `pay_transacao`, `pay_split`, `ledger_entries`, `pay_ledger`, `audit_logs` | `POST /api/payments`, `POST /api/public/payments` | [payments/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/payments/route.ts) | `createPayment()`, `getTransaction()` | — | Manter `POST /payments/v1/create` e `GET /payments/v1/situation/{id}` como pendentes de confirmação oficial para pagamento avulso | `{ method:'pix', amount, customer, metadata, description }` | Pendente de confirmação oficial | `created`, `pending`, `paid`, `failed`, `refunded` | Catálogo oficial de `situation/status` do pagamento avulso | `payment.*` apenas no código atual | Credenciais via `isMyGatewayConfigured()` | O código atual usa `/payments/v1/create`, mas isso não pode ser tratado como contrato oficial; também não deve ser confundido com Payment Link | Só promover para integração real quando a MyGateway confirmar endpoint, payload, headers e estados do pagamento avulso PIX |

**Base de evidência**

- **Presente somente no código atual**:
  - `POST /payments/v1/create`
  - `GET /payments/v1/situation/{id}`
  - `payment.*` no processamento interno
- **Pendente de confirmação da MyGateway**:
  - se esses endpoints atendem pagamento avulso PIX
  - payload oficial
  - status e webhooks oficiais

---

## Cartão

Classificação: **Pronto internamente** + **Bloqueado por documentação** + **Bloqueado por credencial** + **Bloqueado por homologação**.

| módulo interno | status interno atual | tabelas usadas | APIs internas | serviço interno | método esperado no ProviderAdapter | endpoint externo confirmado | endpoint externo pendente | payload interno | payload externo esperado | status internos | status externos pendentes | webhook relacionado | feature flag | riscos | critério de aceite da integração |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Pagamento avulso Cartão | Fluxo interno existe; tokenização no backend já implementada no código | `transactions`, `customers`, `pay_transacao`, `pay_split`, `ledger_entries`, `pay_ledger`, `audit_logs` | `POST /api/payments`, `POST /api/public/payments` | [payments/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/payments/route.ts), [myg-provider.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/lib/acquirer/myg-provider.ts) | `tokenizeCard()`, `createPayment()` | — | Confirmação oficial de tokenização e create para cartão | `{ method:'card', amount, customer, installments, card{...} }` | Pendente de confirmação oficial | `created`, `pending`, `paid`, `failed`, `refunded` | Catálogo oficial de status e eventos de chargeback | `payment.*` apenas no código atual | Credenciais via `isMyGatewayConfigured()` | Existe risco PCI se a integração real for feita com base apenas no código atual; falta confirmação de contrato | Só conectar quando tokenização e cobrança com cartão tiverem contrato/documentação oficial confirmados |

**Base de evidência**

- **Presente somente no código atual**:
  - `POST /payments/v1/creditcard/generate/token`
  - `POST /payments/v1/create`
- **Pendente de confirmação da MyGateway**:
  - validade oficial desses endpoints para cartão
  - formato final do header de autenticação
  - eventos de chargeback/disputa

---

## Webhooks

Classificação: **Infraestrutura interna pronta** + **Bloqueado por contrato externo** + **Bloqueado por homologação**.

| módulo interno | status interno atual | tabelas usadas | APIs internas | serviço interno | método esperado no ProviderAdapter | endpoint externo confirmado | endpoint externo pendente | payload interno | payload externo esperado | status internos | status externos pendentes | webhook relacionado | feature flag | riscos | critério de aceite da integração |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Pipeline de webhooks | Infra interna pronta com fila, retry e processamento | `webhook_events`, `webhook_attempts` e tabelas-alvo dos módulos financeiros | `POST /api/webhooks` | [webhook-processor.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/lib/webhook-processor.ts) | N/A | — | Catálogo oficial de eventos, formato do payload, header de assinatura, HMAC, retry e idempotência | Interno persiste payload bruto + `provider_event_id` + status de processamento | Pendente de confirmação oficial | `pending`, `processing`, `processed`, `failed` | Catálogo oficial de eventos do provider | No código atual: `payment.*`, `subscription.*`, `recurring.charge.*`, `payout.*`, `anticipation.*`, `pix_auto.*` | `MYGATEWAY_WEBHOOK_SECRET` no código atual | Hoje o código assume assinatura e formato próprios; isso não pode ser tratado como contrato oficial da MyGateway | Antes da implementação real, confirmar catálogo, payload, header e regra de retry/idempotência; só então alinhar o processador interno |

**Base de evidência**

- **Encontrada no painel**:
  - cadastro com `nome`
  - `URL`
  - `API Key`
- **Presente somente no código atual**:
  - uso de `x-mygateway-signature`
  - validação HMAC
  - retry interno, dedupe por `provider_event_id`
  - catálogo de eventos assumido pelo processador
- **Pendente de confirmação da MyGateway**:
  - formato oficial de assinatura
  - header oficial
  - payload oficial
  - política de retry
  - política de idempotência

---

## Ledger

Classificação: **Pronto internamente**.

| módulo interno | status interno atual | tabelas usadas | APIs internas | serviço interno | método esperado no ProviderAdapter | endpoint externo confirmado | endpoint externo pendente | payload interno | payload externo esperado | status internos | status externos pendentes | webhook relacionado | feature flag | riscos | critério de aceite da integração |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Ledger (saldo e lançamentos) | Completo e idempotente; não chama provider diretamente | `ledger_entries`, `pay_ledger` | `GET /api/ledger`, `GET /api/public/ledger` | [ledger-admin.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/lib/ledger-admin.ts) e efeitos em [webhook-processor.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/lib/webhook-processor.ts) | N/A | — | — | `{ type, direction, amount, balance_after, origin, entity refs }` | — | `sale`, `refund` e demais tipos internos | — | Deriva de eventos financeiros reais quando homologados | — | Concorrência e ordenação de eventos; mitigado internamente | Base contábil interna permanece soberana; só reage a eventos/execuções já confirmados |

**Base de evidência**

- **Presente somente no código atual**:
  - geração de ledger via webhooks e serviços internos
- **Pendente de confirmação da MyGateway**:
  - não se aplica como contrato direto; depende dos módulos externos homologados

---

## Conciliação

Classificação: **Pronto internamente (parcial)** + **Bloqueado por documentação** + **Bloqueado por homologação**.

| módulo interno | status interno atual | tabelas usadas | APIs internas | serviço interno | método esperado no ProviderAdapter | endpoint externo confirmado | endpoint externo pendente | payload interno | payload externo esperado | status internos | status externos pendentes | webhook relacionado | feature flag | riscos | critério de aceite da integração |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Conciliação (runs + itens + divergência) | Funciona internamente; depende de contratos externos para ficar completa | `pay_conciliation_runs`, `pay_conciliation_items`, `pay_conciliation_events` | `GET/POST /api/reconciliation`, compat `/api/conciliation` | [reconciliation-service.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/lib/reconciliation-service.ts), [reconciliation-core.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/lib/reconciliation-core.ts) | `getTransaction()`, `getPayout()`, `listPayouts()`, `getAnticipation()`, `listAnticipations()` | — | Contratos oficiais de consulta para transações, payouts e antecipações | `{ entity_type, entity_id/provider_reference, internal_status, internal_amount }` | Pendente de confirmação oficial para cada entidade | `matched`, `divergent`, `pending`, `resolved` | Status oficiais por entidade no provider | N/A | Depende do contrato real de consulta; hoje há risco de falso divergente por usar adapter como fonte documental | Só considerar conciliação externa pronta quando consultas oficiais do provider estiverem confirmadas e homologadas |

**Base de evidência**

- **Presente somente no código atual**:
  - `getTransaction()` em `/payments/v1/situation/{id}`
  - `getPayout/listPayouts` pendentes no adapter
  - `getAnticipation/listAnticipations` preparados/pendentes no adapter
- **Pendente de confirmação da MyGateway**:
  - endpoints oficiais de consulta por entidade
  - mapeamento oficial de status e amounts

---

## Pix Automático

Classificação: **Pronto internamente (estrutura)** + **Bloqueado por documentação** + **Bloqueado por homologação**.

| módulo interno | status interno atual | tabelas usadas | APIs internas | serviço interno | método esperado no ProviderAdapter | endpoint externo confirmado | endpoint externo pendente | payload interno | payload externo esperado | status internos | status externos pendentes | webhook relacionado | feature flag | riscos | critério de aceite da integração |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Pix Automático (autorização e cobranças) | Banco/modelo preparado; sem contrato externo validado | `pay_assinatura`, `pay_subscription_events` | Não há API dedicada consolidada | Atualizações internas em [webhook-processor.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/lib/webhook-processor.ts) | Pendente | — | Endpoints oficiais de autorização, cancelamento e cobrança | Campos internos `pix_auto_*` na assinatura | Pendente de confirmação oficial | A definir | A definir | `pix_auto.*` apenas no código atual | — | Alto risco de suposição contratual; depende de consentimento do pagador e estados específicos | Só iniciar após contrato oficial completo da MyGateway |

**Base de evidência**

- **Presente somente no código atual**:
  - suporte estrutural em `pay_assinatura`
  - consumo de eventos `pix_auto.*` no processador
- **Pendente de confirmação da MyGateway**:
  - endpoints
  - payloads
  - estados
  - eventos
