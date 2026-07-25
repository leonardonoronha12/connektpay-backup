# MYGATEWAY — Ordem Final Recomendada de Implementação

Data: 2026-07-14

Objetivo: orientar a conexão final com a MyGateway usando a base interna já pronta (Fases 2A–2E), reduzindo risco operacional e evitando regressões.

Regras:

- Não altera código neste passo (este arquivo é apenas o plano final).
- Não cria migration.
- Não faz deploy.
- Não habilita feature flags externas.
- Não chama a MyGateway.

## Regra de evidência

Cada passo abaixo separa:

- **Confirmada pela documentação oficial recebida**
- **Encontrada no painel**
- **Presente somente no código atual**
- **Pendente de confirmação da MyGateway**

---

## Pré-requisitos gerais (antes do passo 1)

- Credenciais e segredos:
  - `MYGATEWAY_API_URL`
  - `MYGATEWAY_X_API_KEY`
  - `MYGATEWAY_AUTH_DATA` (base64)
  - `MYGATEWAY_WEBHOOK_SECRET`
- Ambiente de homologação disponível (sandbox/produção) e evento de teste com `provider_event_id`.
- Política de segurança:
  - confirmar que nenhum payload sensível (PAN/CVV/docs KYC) será logado;
  - validar mascaramento e sanitização onde aplicável.
- Estratégia de “fonte de verdade”:
  - **domínios internos permanecem fonte primária**;
  - provider vira apenas executor e emissor de eventos, sem “ressuscitar” legado.

---

## 1) Autenticação

Objetivo:

- Validar credenciais e token de acesso do provider.

Componentes:

- ProviderAdapter: `authenticate()` em [provider.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/lib/acquirer/provider.ts)
- Endpoint a usar na implementação real: `POST /authentication/v2/auth`

Base de evidência:

- **Confirmada pela documentação oficial recebida**:
  - `POST /authentication/v2/auth`
  - headers `x-api-key` e `Content-Type: application/json`
  - body `{ "authData": "base64(clientId:clientSecret)" }`
  - resposta com `auth_token` e `expires_in`
  - o `auth_token` deve ser reutilizado até `expires_in`
- **Presente somente no código atual**:
  - `POST /authentication/v1/auth`
- **Pendente de confirmação da MyGateway**:
  - header final do token: `Authorization` ou `Authentication`

Critério de aceite:

- `authenticate()` retorna `ok: true` de forma consistente;
- o token é cacheado e reutilizado até `expires_in`;
- a aplicação não gera novo token a cada requisição;
- o volume de autenticações não provoca bloqueio da API Key;
- falhas mapeiam para mensagens claras (credencial inválida, timeout, indisponível);
- nenhum segredo é logado.

---

## 2) Payment Link / PIX

Objetivo:

- implementar primeiro o contrato confirmado de Payment Link;
- manter pagamento avulso PIX/cartão separado e pendente até confirmação oficial do contrato.

Componentes internos:

- `POST /api/payment-links` (gera e sincroniza quando configurado) em [payment-links/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/payment-links/route.ts)
- `POST /api/payments` (PIX/card) em [payments/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/payments/route.ts)
- Split embutido via `calculateSplitForProvider()` e snapshot em `pay_split/pay_transacao`.

Base de evidência:

- **Confirmada pela documentação oficial recebida**:
  - Payment Link:
    - `POST /payments/v1/paymentlink`
    - `GET /payments/v1/paymentlink/{id}`
    - `GET /payments/v1/paymentlink`
  - payload de criação:
    - `value`
    - `title`
    - `description`
    - `validity`
    - `minimumNumberOfInstallments`
    - `maximumQuantityOfInstallments`
    - `numberOfAllowedSales`
    - `showFormAddress`
    - `customerInterest`
    - `acceptedPaymentsType`
  - resposta com `id` e `link`
- **Presente somente no código atual**:
  - Payment Link tratado como `POST /payments/v1/create`
  - consulta tratada como `GET /payments/v1/situation/{id}`
  - pagamentos avulsos PIX/cartão também usam `/payments/v1/create`
- **Pendente de confirmação da MyGateway**:
  - contrato oficial de pagamento avulso PIX
  - contrato oficial de pagamento avulso cartão
  - header final de autenticação nesses endpoints

Critério de aceite:

- Payment Link usa exclusivamente `/payments/v1/paymentlink`;
- pagamento avulso permanece separado de Payment Link no desenho e na implementação;
- nenhum endpoint de pagamento avulso é assumido como oficial sem confirmação;
- `provider_reference` e `provider_url` do link são persistidos corretamente;
- nenhum fallback “demo” permanece ativo quando o contrato externo estiver confirmado e as credenciais forem habilitadas.

---

## 3) Webhooks

Objetivo:

- validar primeiro o contrato oficial de webhooks;
- só depois conectar a infraestrutura interna já pronta.

Componentes internos:

- `POST /api/webhooks` em [webhooks/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/webhooks/route.ts)
- Processamento e efeitos: [webhook-processor.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/lib/webhook-processor.ts)

Base de evidência:

- **Encontrada no painel**:
  - cadastro com `nome`
  - `URL`
  - `API Key`
- **Presente somente no código atual**:
  - header `x-mygateway-signature`
  - validação HMAC
  - retry e dedupe por `provider_event_id`
  - catálogo interno assumido de eventos
- **Pendente de confirmação da MyGateway**:
  - catálogo oficial de eventos
  - formato do payload
  - header de assinatura
  - formato oficial de assinatura/HMAC
  - retry oficial
  - idempotência oficial do evento

Critério de aceite:

- contrato oficial de webhook recebido e versionado;
- infraestrutura interna é ajustada ao contrato oficial, e não o contrário;
- eventos são deduplicados sem duplicar ledger;
- `payment.paid` e `payment.refunded` funcionam de forma idempotente quando esses eventos forem confirmados oficialmente;
- eventos sem metadata continuam rastreáveis.

---

## 4) Recebedores

Objetivo:

- Sincronizar recebedores com o provider (quando o contrato existir).

Status atual:

- Bloqueado por documentação (sem endpoint oficial confirmado).

Base de evidência:

- **Presente somente no código atual**:
  - interface `createRecipient/getRecipient`
  - stub de sync
- **Pendente de confirmação da MyGateway**:
  - endpoint oficial de recebedores
  - payload oficial
  - status oficiais

Critério de aceite:

- criar/atualizar recebedor interno não depende do provider;
- ao habilitar `RECEIVER_PROVIDER_SYNC_ENABLED`, gravar `provider_reference/status/payload` sem sobrescrever campos internos;
- mapear PF/PJ e dados bancários com mascaramento e auditoria.

---

## 5) KYC

Objetivo:

- Submeter KYC/documentos ao provider e acompanhar status.

Status atual:

- Bloqueado por documentação (sem endpoint oficial confirmado; `submitKyc` retorna 501 no adapter).

Base de evidência:

- **Presente somente no código atual**:
  - `submitKyc()` na interface/adapter
- **Pendente de confirmação da MyGateway**:
  - endpoint oficial de KYC
  - status oficiais
  - tipagem de documentos

Critério de aceite:

- envio de documentos não expõe URL pública permanente;
- status do provider é persistido como “telemetria”, sem sobrescrever decisão interna;
- auditoria completa para REQUEST/APPROVE/REJECT/SYNC_FAILED.

---

## 6) Split

Objetivo:

- Homologar semântica de split no provider nos fluxos já existentes (payment link, payments, subscriptions).

Status atual:

- Pronto internamente; bloqueado por confirmação do contrato externo.

Base de evidência:

- **Presente somente no código atual**:
  - envio de `split` em payloads do adapter
- **Pendente de confirmação da MyGateway**:
  - payload oficial de split
  - semântica financeira do split
  - compatibilidade com Payment Link, pagamento avulso e assinatura

Critério de aceite:

- a MyGateway confirma payload e semântica do split;
- a liquidação bate com o snapshot interno (`pay_split`);
- arredondamentos ficam previsíveis e auditáveis.

---

## 7) Assinaturas

Objetivo:

- Ligar a execução real de recorrência no provider e consumir eventos de cobranças.

Status atual:

- Endpoints create/cancel existem no adapter, mas ainda dependem de confirmação documental e homologação oficial.

Base de evidência:

- **Presente somente no código atual**:
  - `POST /subscriptions/v1/create`
  - `POST /subscriptions/v1/cancel`
  - consumo interno de `subscription.*` e `recurring.charge.*`
- **Pendente de confirmação da MyGateway**:
  - contrato oficial de create/cancel
  - payload oficial
  - catálogo oficial de eventos

Critério de aceite:

- `createSubscription` cria e grava referência do provider;
- `recurring.charge.paid` cria snapshot/transação e ledger idempotente;
- dunning em falha funciona e não altera módulos proibidos;
- Pix Automático continua isolado (não habilitar sem contrato).

---

## 8) Repasses

Objetivo:

- Conectar workflow interno de repasses ao provider (criação + monitoramento + conciliação).

Status atual:

- Bloqueado por documentação (endpoints de payout ainda não confirmados no contrato).

Critério de aceite:

- com `PAYOUT_PROVIDER_ENABLED=true`, permitir transições para `provider_*` e nunca marcar `paid` sem confirmação;
- `payout.*` webhook atualiza somente registros externos (ou espelho externo definido);
- conciliação consegue consultar payout (get/list).

---

## 9) Antecipações

Objetivo:

- Conectar o fluxo de antecipação interna ao provider quando endpoints forem confirmados.

Status atual:

- Endpoints estão “preparados” no adapter; bloqueado por documentação/homologação.

Critério de aceite:

- com `ANTICIPATION_PROVIDER_ENABLED=true`, criar antecipação externa com `externalId` e metadata;
- webhook `anticipation.*` atualiza registro externo e conciliação valida status/amount;
- regra: jamais `paid` sem integração real.

---

## 10) Ledger / Conciliação

Objetivo:

- Consolidar reconciliação ponta-a-ponta para transações, repasses e antecipações.

Status atual:

- Ledger pronto; conciliação pronta parcialmente (transações ok, payouts/antecipações dependem de endpoints).

Critério de aceite:

- conciliação cria runs e itens com classificação consistente;
- divergências são rastreáveis e resolvíveis sem sobrescrever itens `resolved`;
- payload do provider é sanitizado no armazenamento;
- email de divergência ao owner dispara quando aplicável.

---

## 11) Pix Automático

Objetivo:

- Habilitar autorização e cobrança recorrente via Pix Automático.

Status atual:

- Bloqueado por documentação (nenhum endpoint oficial confirmado).

Critério de aceite:

- contrato oficial definido (endpoints + eventos);
- consentimento do pagador e estados mapeados;
- eventos `pix_auto.*` atualizam `pay_assinatura` com rastreabilidade;
- sem regressões nas assinaturas já existentes.

## Conclusão operacional

- O primeiro contrato realmente confirmado para iniciar implementação é a autenticação `v2`.
- O segundo contrato confirmado é o de Payment Link em `/payments/v1/paymentlink`.
- Pagamento avulso PIX/cartão permanece separado e pendente de confirmação.
- Split não deve ser tratado como pronto para conectar.
- Webhooks têm infraestrutura interna pronta, mas contrato externo ainda pendente.
