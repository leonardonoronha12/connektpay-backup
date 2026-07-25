# Entrega — Connekt Pay

Data: 2026-06-23  
Produto: Connekt Pay (Next.js + Supabase + MyGateway)  
Objetivo: Plataforma de pagamentos com controle financeiro interno (ledger), split, recorrência, antecipação e conciliação.

## 1. Visão geral do projeto

A Connekt Pay é uma aplicação web (painel + APIs) para criar cobranças, acompanhar transações e operar rotinas financeiras (repasse, antecipação e conciliação) com rastreabilidade e auditoria.

Ponto central do produto:
- A Connekt mantém uma visão interna consistente dos valores e estados financeiros.
- A integração com o provedor (MyGateway) é encapsulada por um provider interno.
- O sistema foi preparado para operar com segurança (RLS no Supabase, rotas públicas com rate limit e webhooks assinados).

## 2. Arquitetura usada

### Componentes

- **Frontend (Next.js App Router)**: painel para operação (empresa/financeiro/admin).
- **Backend (Next.js API Routes)**: endpoints internos e públicos, validações, integrações e escrita no banco.
- **Banco + Auth (Supabase/Postgres + Supabase Auth)**: dados transacionais, RLS, policies, triggers, funções `security definer` quando necessário.
- **Provedor Financeiro (MyGateway)**: processa pagamentos, tokenização, assinaturas e consulta de status.

### Princípios de arquitetura

- **Fonte da verdade interna**: o ledger interno (`ledger_entries` e `pay_ledger`) é a referência para saldo e consistência financeira.
- **Encapsulamento do provedor**: nenhuma tela ou rota chama MyGateway diretamente. Sempre:
  - Service → `AcquirerProvider` → `MygProvider` → MyGateway
- **Eventos/Webhooks**: mudanças críticas podem ser refletidas via webhooks, com idempotência e reprocessamento.
- **Auditoria**: ações sensíveis geram `audit_logs` para rastreabilidade.

## 3. Stack técnica

- **Frontend**: Next.js (App Router), React, TypeScript, CSS utilitário/tema do projeto.
- **Backend**: Next.js Route Handlers (API), TypeScript.
- **Banco**: Supabase (Postgres), RLS/policies, triggers `updated_at`, funções `security definer`.
- **Testes**: Playwright (smoke e testes de core), scripts `npm run test:*`.
- **Deploy**: Vercel (app) + Supabase (DB/Auth).

## 4. Responsabilidade da Connekt

O que é “produto” e responsabilidade da Connekt (camada interna):

- **Painel e experiência do usuário**: criação/gestão de links, transações, recebedores, assinaturas, auditoria e rotinas financeiras.
- **Modelo interno e governança**:
  - Ledger e regras de saldo (centavos, sem float).
  - Split rules e cálculo determinístico.
  - Módulos de recorrência, antecipação e conciliação.
- **Segurança e compliance do app**:
  - RLS e isolamento por organização no Supabase.
  - Proteção de rotas internas com sessão e RBAC.
  - Rate limit em rotas públicas.
  - Webhook assinado e reprocessamento controlado.
- **Auditoria**: registro de ações críticas em `audit_logs`.

## 5. Responsabilidade da MyGateway

O que depende do provedor financeiro (MyGateway):

- Processar pagamentos (PIX/cartão) e fornecer status.
- Tokenização de cartão (quando aplicável).
- Operação de assinaturas (criação/cancelamento e eventos de cobrança).
- Endpoints de antecipação/payout/relatórios (conforme disponibilidade no contrato/integração).

Observação: quando algum endpoint ainda não existe/foi confirmado, o sistema mantém o método “preparado” com erro tipado e documentação.

## 6. Módulos implementados

### 6.1 Payment Links

- CRUD e listagem de links de pagamento.
- Checkout por slug e consulta do link.
- Integração com provider para criação e sincronização quando configurado.

### 6.2 MyGateway Provider (AcquirerProvider → MygProvider)

- Camada única de comunicação com o provedor.
- Tratamento de erros tipados (`MyGatewayError`) e mensagens amigáveis no produto.
- Métodos reais e “preparados” documentados no status de integração.

### 6.3 Split

- Regras de split por recebedor.
- Cálculo em centavos (sem float), com arredondamento consistente.
- Persistência/snapshot do split por transação.

### 6.4 Ledger

- Ledger interno como fonte da verdade financeira.
- Lançamentos idempotentes (evita duplicidade em eventos).
- Base para saldo, valores antecipáveis e conciliação.

### 6.5 Recorrência

- Cadastro de planos e assinaturas.
- Tokenização no backend.
- Dunning e regras de churn/MRR no core.
- Processamento de eventos de cobrança via webhooks.

### 6.6 Antecipação

- Simulação por bps (centavos).
- Solicitação, aprovação e cancelamento.
- Execução via webhook com lançamentos de ledger idempotentes.
- UI com validação de “antecipável” e recebedor com KYC aprovado.

### 6.7 Conciliação

- Execuções registradas (`pay_conciliation_runs`).
- Itens por execução (`pay_conciliation_items`) com:
  - comparação de valores (centavos) e status (normalização)
  - classificação: `matched` / `divergent` / `pending` / `resolved`
  - resolução e reprocessamento
- Payload do provider armazenado de forma sanitizada (sem dados sensíveis).
- UI administrativa para rodar, analisar e tratar divergências.

### 6.8 Webhooks

- Endpoint com assinatura (fail-closed em produção quando configurado).
- Persistência do evento e reprocessamento com backoff.
- Processador de eventos com idempotência.

### 6.9 Auditoria

- `audit_logs` para ações críticas (internas e via API pública quando aplicável).
- Logs imutáveis (sem update/delete para `authenticated`).
- Tela admin para consulta/pesquisa.

### 6.10 Segurança

- RLS + FORCE RLS em tabelas sensíveis.
- Rotas internas com sessão e RBAC.
- Rotas públicas com API key + rate limit.
- Sanitização de payloads do provider antes de retornar ao frontend.

Documento de referência: [PRODUCTION-SECURITY.md](file:///c:/Users/Leonardo/Desktop/ConnektPay/docs/PRODUCTION-SECURITY.md)

## 7. O que está real vs preparado/pendente (MyGateway)

Fonte: [MYGATEWAY-INTEGRATION-STATUS.md](file:///c:/Users/Leonardo/Desktop/ConnektPay/docs/MYGATEWAY-INTEGRATION-STATUS.md)

### Real (usado hoje com endpoint conhecido)

- Autenticação: `POST /authentication/v1/auth`
- Criar Payment Link/PIX: `POST /payments/v1/create`
- Consultar situação: `GET /payments/v1/situation/{id}`
- Tokenizar cartão: `POST /payments/v1/creditcard/generate/token`
- Criar/cancelar assinatura: `POST /subscriptions/v1/create`, `POST /subscriptions/v1/cancel`
- Conciliação (transação): usa `getTransaction()` via `GET /payments/v1/situation/{id}`

### Preparado / Pendente (depende de endpoint final da MyGateway)

- Antecipação: request/get/cancel (implementado com mock, depende de confirmação do contrato)
- Payouts (create/get/list): parte está preparada e parte ainda pendente para conciliação completa de repasses
- Listagens específicas do provider para conciliação (listTransactions/listPayouts/listAnticipations)
- listPaymentLinks (placeholder)

## 8. Testes executados e status

Executados (passing):

- `npm run lint`
- `npm run build`
- `npm run test:smoke`
- `npm run test:mygateway`
- `npm run test:split`
- `npm run test:recurrence`
- `npm run test:anticipation`
- `npm run test:reconciliation`

Os testes cobrem:
- cálculo em centavos (split/antecipação)
- normalização/classificação (conciliação)
- rotas públicas básicas, webhook sem assinatura e MyGateway sem credenciais (smoke)
- chamadas de endpoints MyGateway (mockadas) e erros tipados (mygateway)

## 9. Pendências técnicas (para homologação real)

Prioridade alta (para operar com credenciais reais):

- Confirmar endpoints oficiais de antecipação (request/get/cancel) e padronizar parsing de status/amount.
- Confirmar endpoints oficiais de payout (create/get/list) para completar conciliação de repasses internos vs provedor.
- Validar em sandbox/produção MyGateway a semântica de `GET /payments/v1/situation/{id}` (IDs aceitos e campos de valor/status).
- Ajustar/fechar lista de erros e mensagens amigáveis do provider conforme respostas reais.

Hardening/operacional:

- Validar webhooks reais (assinatura + payload + idempotência).
- Monitorar logs (Vercel/Supabase) após primeira operação real.
- Revisar limites de rate limit conforme tráfego esperado.

## 10. Próximos passos recomendados

1. Homologação com credenciais reais da MyGateway (sandbox):
   - criar link, pagar (PIX/cartão), validar status e ledger
   - executar conciliação e revisar divergências
2. Confirmar endpoints pendentes (antecipação e payout) e finalizar métodos no `MygProvider`.
3. Rodar “teste manual” de ponta a ponta em produção (checklist em [PRODUCTION-AUDIT.md](file:///c:/Users/Leonardo/Desktop/ConnektPay/docs/PRODUCTION-AUDIT.md)).
4. Preparar rollout:
   - configurar envs na Vercel
   - configurar webhook secret e cron secret (se aplicável)
5. Iniciar piloto com 1–2 clientes para validação de fluxo e estabilidade.

