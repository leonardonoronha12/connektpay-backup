# MYGATEWAY-DIAGNOSTICO-INICIAL

Data: 2026-07-10
Projeto: Connekt Pay
Escopo: diagnóstico técnico inicial da Fase 2, sem alteração de código funcional

## Objetivo

Preparar a integração oficial com a MyGateway sem alterar UX, RBAC, produção ou contratos não confirmados. Este documento consolida o que já está documentado, o que já está preparado no código e o que ainda depende de confirmação do provider.

## Arquitetura atual

Arquitetura confirmada no projeto:

- Frontend: Next.js App Router
- Backend: Route Handlers do Next.js
- Banco/Auth: Supabase
- Provider financeiro: MyGateway
- Regra de acoplamento: nenhuma tela ou rota chama a MyGateway diretamente
- Cadeia obrigatória:
  - Service -> `AcquirerProvider` -> `MygProvider` -> MyGateway

Arquivos centrais:

- `lib/acquirer/provider.ts`
- `lib/acquirer/index.ts`
- `lib/acquirer/myg-provider.ts`
- `lib/env.ts`
- `app/api/webhooks/route.ts`

## Fontes revisadas

Documentação localizada no projeto:

- `docs/MYGATEWAY-INTEGRATION-STATUS.md`
- `docs/ENTREGA-CONNEKT-PAY.md`
- `docs/PRODUCTION-SECURITY.md`
- `docs/PRODUCTION-AUDIT.md`
- `INVENTARIO-DE-ENDPOINTS.md`
- `CHECKLIST-HOMOLOGACAO.md`
- `ROADMAP-V1.1-MYGATEWAY.md`

Código auditado:

- `lib/acquirer/*`
- `lib/*service.ts`
- `app/api/payment-links/route.ts`
- `app/api/payments/route.ts`
- `app/api/subscriptions/route.ts`
- `app/api/anticipations/route.ts`
- `app/api/provider-settings/route.ts`
- `app/api/webhooks/route.ts`
- `lib/webhook-processor.ts`
- `tests/mygateway.spec.ts`

## Endpoints confirmados

Endpoints já confirmados pela documentação local e/ou já usados no adapter:

| Módulo | Endpoint | Status |
|---|---|---|
| Autenticação | `POST /authentication/v1/auth` | Confirmado |
| Criar payment/link PIX | `POST /payments/v1/create` | Confirmado |
| Consultar situação de payment/link | `GET /payments/v1/situation/{id}` | Confirmado |
| Tokenizar cartão | `POST /payments/v1/creditcard/generate/token` | Confirmado |
| Criar assinatura | `POST /subscriptions/v1/create` | Confirmado |
| Cancelar assinatura | `POST /subscriptions/v1/cancel` | Confirmado |

## Endpoints preparados, mas ainda não homologados com a MyGateway

| Módulo | Endpoint assumido hoje | Situação |
|---|---|---|
| Antecipação | `POST /anticipations/v1/request` | Preparado, precisa confirmar contrato |
| Antecipação | `GET /anticipations/v1/{id}` | Preparado, precisa confirmar contrato |
| Antecipação | `POST /anticipations/v1/cancel` | Preparado, precisa confirmar contrato |
| Repasses / payout | `POST /payouts` | Preparado, endpoint ainda não confirmado |

## Endpoints desconhecidos ou pendentes de informação da MyGateway

| Módulo | Endpoint | Situação |
|---|---|---|
| Consultar payout | Desconhecido | Pendente |
| Listar payouts | Desconhecido | Pendente |
| Submit KYC / recipient | Desconhecido | Pendente |
| Pix Automático | Desconhecido | Pendente |
| Listar transações no provider | Desconhecido | Pendente |
| Listar antecipações no provider | Desconhecido | Pendente |
| Listar payment links no provider | Desconhecido | Pendente |

## Autenticação

Já confirmado:

- A autenticação usa `x-api-key`
- O body usa `authData`
- O adapter já suporta:
  - `MYGATEWAY_AUTH_DATA`
  - ou `MYGATEWAY_CLIENT_ID` + `MYGATEWAY_CLIENT_SECRET`
- O token obtido é reaproveitado nas chamadas seguintes

Atenções:

- Precisamos confirmar oficialmente:
  - TTL do token
  - política de refresh
  - escopo por ambiente
  - limite de sessões/token por conta

## Credenciais necessárias

Variáveis já identificadas no projeto:

- `MYGATEWAY_BASE_URL`
- `MYGATEWAY_X_API_KEY`
- `MYGATEWAY_API_KEY`
- `MYGATEWAY_AUTH_DATA`
- `MYGATEWAY_CLIENT_ID`
- `MYGATEWAY_CLIENT_SECRET`
- `MYGATEWAY_WEBHOOK_SECRET`

Variáveis da Connekt relacionadas ao rollout seguro:

- variáveis Vercel do app
- variáveis Supabase já existentes
- segredos de webhook
- segredos operacionais de observabilidade/log

## Sandbox e produção

Já confirmado:

- O projeto foi preparado para ambientes separados
- Existe orientação de homologar primeiro em ambiente seguro
- O código depende de `MYGATEWAY_BASE_URL`

Pendente:

- URL oficial de sandbox
- URL oficial de produção
- diferença de headers, auth e payload entre sandbox e produção
- comportamento de webhooks em sandbox

## Webhooks

Já confirmado:

- Endpoint interno: `POST /api/webhooks`
- Assinatura HMAC-SHA256
- Secret esperado: `MYGATEWAY_WEBHOOK_SECRET`
- Headers aceitos hoje:
  - `x-mygateway-signature`
  - `x-signature`
- Persistência do evento
- Idempotência por `provider_event_id`
- Reprocessamento com retry e backoff

Pendente:

- Catálogo oficial de eventos MyGateway
- Payload real de cada evento
- Ordem de entrega
- política de retry do provider
- garantia de unicidade do `provider_event_id`

## Idempotência

Já confirmado:

- Webhooks possuem deduplicação por `provider_event_id`
- Ledger evita duplicidade em lançamentos críticos
- O sistema já está preparado para reprocessamento controlado

Pendente:

- Confirmar se a MyGateway oferece chave formal de idempotência para criação de pagamentos, assinaturas, payouts e antecipações
- Confirmar header/campo oficial de idempotência

## Rate limits

Já confirmado:

- O projeto possui rate limit nas APIs públicas da Connekt

Pendente de informação da MyGateway:

- rate limit por endpoint
- limite por minuto
- limite por credencial
- headers de limite/uso
- comportamento em `429`

## Retries

Já confirmado:

- Webhooks internos reprocessam com backoff exponencial

Pendente:

- política oficial de retry da MyGateway para webhooks
- recomendação oficial da MyGateway para retries outbound da Connekt
- timeout oficial recomendado por endpoint

## Erros

Já confirmado no código:

- O adapter já tipa erros como:
  - `invalid_credentials`
  - `timeout`
  - `rate_limited`
  - `unavailable`
  - `unexpected_response`
  - `network_error`
  - `bad_request`

Pendente:

- tabela oficial de erros MyGateway
- payload padronizado de erro
- diferenças por ambiente
- mensagens e códigos de negócio para KYC, payout, antecipação e assinatura

## Mapeamento por módulo

### Recebedores

- Já preparado no código:
  - CRUD interno de recebedores
  - uso de `provider_reference`
- Parcialmente implementado:
  - existe estrutura interna para vincular recebedor ao provider
- Pendente de informação da MyGateway:
  - endpoint oficial de criação/consulta de recipient
- Ainda não iniciado ponta a ponta:
  - provisionamento automático de recebedor na MyGateway

### KYC

- Já preparado no código:
  - fluxo interno e upload documental
- Parcialmente implementado:
  - modelo interno existe
- Pendente de informação da MyGateway:
  - endpoint de submit KYC
  - retorno/status/regras documentais
- Ainda não iniciado ponta a ponta:
  - sincronização real com o provider

### Links de pagamento

- Já confirmado pela documentação:
  - criação via `POST /payments/v1/create`
- Já preparado no código:
  - rotas, persistência, provider reference, provider payload
- Parcialmente implementado:
  - listagem reversa no provider ainda não existe
- Primeiro módulo realmente mais maduro para homologação

### Checkout

- Já preparado no código:
  - tela pública e rotas de efetivação
- Já confirmado:
  - checkout depende dos módulos de pagamento existentes
- Parcialmente implementado:
  - precisa validação com credenciais reais por método

### PIX

- Já confirmado:
  - fluxo via `POST /payments/v1/create`
  - consulta via `GET /payments/v1/situation/{id}`
- Já preparado no código:
  - pagamentos e links com PIX
- Parcialmente implementado:
  - homologação real ainda pendente

### Cartão

- Já confirmado:
  - tokenização no backend
  - pagamento com cartão
- Já preparado no código:
  - tokenização e cobrança
- Parcialmente implementado:
  - validação com credenciais reais e regras antifraude/3DS ainda não documentadas

### Split

- Já preparado no código:
  - cálculo determinístico em centavos
  - snapshot por transação
- Parcialmente implementado:
  - depende de recebedor/provider reference confiável
- Pendente:
  - confirmar suporte real do provider à semântica exata de split usada

### Assinaturas

- Já confirmado:
  - create/cancel subscription
- Já preparado no código:
  - assinatura, tokenização e eventos
- Parcialmente implementado:
  - falta validar payloads reais de renovação/falha/cancelamento

### Repasses

- Já preparado no código:
  - create payout internamente
- Parcialmente implementado:
  - create payout existe preparado
- Pendente de informação da MyGateway:
  - endpoint final de create/get/list
- Ainda não iniciado ponta a ponta:
  - conciliação completa de repasses com dados do provider

### Antecipação

- Já preparado no código:
  - request/get/cancel
  - simulação
  - ledger
- Parcialmente implementado:
  - adapter já tem métodos preparados
- Pendente de informação da MyGateway:
  - endpoints finais, shape e semântica de status

### Conciliação

- Já preparado no código:
  - execução, divergência, resolução e reprocessamento
- Parcialmente implementado:
  - conciliação por transação usa `getTransaction()`
- Pendente de informação da MyGateway:
  - listagens reais de transações, payouts e antecipações

### Ledger

- Já confirmado:
  - ledger interno é a fonte da verdade da Connekt
- Já preparado no código:
  - lançamentos idempotentes e rastreáveis
- Dependência:
  - qualidade dos eventos/status reais da MyGateway

## O que já está confirmado pela documentação

- Arquitetura de integração
- Endpoints reais de auth, payment create, payment situation, card tokenization, subscription create/cancel
- Estratégia de webhook assinado
- Idempotência em eventos
- Uso de ledger interno como fonte de verdade

## O que já está preparado no código

- Adapter único do provider
- Provider settings
- Payment links
- Pagamentos PIX/cartão
- Tokenização de cartão
- Assinaturas
- Antecipação preparada
- Payout create preparado
- Webhooks com retry
- Auditoria
- Sanitização de payloads

## O que está parcialmente implementado

- Recebedores com vínculo de provider
- KYC interno sem submit real no provider
- Antecipação dependente de contrato final
- Payout dependente de endpoint real
- Conciliação sem listagens reais do provider
- Assinaturas dependentes de homologação de eventos reais

## O que está pendente de informação da MyGateway

- URLs oficiais de sandbox e produção
- contratos finais de antecipação
- contratos finais de payout
- endpoint e fluxo oficial de recipient/KYC
- catálogo de webhooks
- assinatura oficial e headers definitivos
- política de idempotência
- rate limits
- retries e timeouts recomendados
- tabela oficial de erros
- suporte e contrato de Pix Automático
- política de split/recebedor no provider

## O que ainda não foi iniciado

- Provisionamento ponta a ponta de recebedor no provider
- Submit KYC real na MyGateway
- Conciliação completa de payout com listagem oficial do provider
- Conciliação completa de antecipação por listagem oficial do provider
- Pix Automático real

## Módulos preparados

- Provider base
- Provider settings
- Payment Links
- Pagamentos
- Split
- Assinaturas
- Webhooks
- Ledger
- Auditoria
- Antecipação
- Conciliação

## Módulos faltantes ou incompletos

- Recebedores no provider
- KYC no provider
- Payout get/list
- ListTransactions no provider
- ListAnticipations no provider
- ListPaymentLinks no provider
- Pix Automático

## Riscos

- Iniciar payout sem contrato confirmado pode quebrar conciliação
- Iniciar KYC sem endpoint oficial pode gerar retrabalho de modelo e UX
- Sem catálogo oficial de eventos, webhooks podem ficar inconsistentes
- Sem política de idempotência oficial, operações críticas podem duplicar
- Sem documentação de rate limit, retries agressivos podem gerar bloqueio
- Recebedor sem sincronização real no provider compromete split, payout e KYC

## Dependências

- Credenciais sandbox válidas
- URL sandbox
- URL produção
- chave de assinatura de webhook
- payloads de exemplo reais
- catálogo de eventos oficiais
- contrato de erros
- definição dos endpoints pendentes
- janela de homologação com o provider

## Dúvidas que precisam ser respondidas pela MyGateway

- Endpoints oficiais e payloads de antecipação
- Endpoints oficiais e payloads de payout
- Endpoint oficial de recipient/KYC
- Catálogo oficial de webhooks
- Header/campo oficial de assinatura
- Header/campo oficial de idempotência
- Rate limits e timeouts por endpoint
- Semântica de `GET /payments/v1/situation/{id}`
- Fluxo oficial de Pix Automático
- Regras de split e recebedor

## Ordem recomendada de implementação

Ordem segura para iniciar a Fase 2 sem quebrar a Fase 1:

1. Homologação técnica do que já está confirmado
   - autenticação
   - payment link PIX
   - consulta de status
   - tokenização de cartão
   - assinatura create/cancel
2. Validação de webhooks reais em sandbox
3. Fechamento dos contratos de antecipação
4. Fechamento dos contratos de payout
5. Fechamento do fluxo de recebedor + KYC
6. Conciliação completa com listagens reais do provider
7. Pix Automático, somente após contrato oficial

## Primeiro módulo recomendado

Primeiro módulo recomendado para iniciar a Fase 2:

- Homologação de autenticação + Payment Link PIX em sandbox

Motivo:

- já possui endpoints confirmados
- já está preparado no código
- tem menor dependência de contratos desconhecidos
- permite validar credenciais, ambiente, assinatura, status e webhook com o menor risco
