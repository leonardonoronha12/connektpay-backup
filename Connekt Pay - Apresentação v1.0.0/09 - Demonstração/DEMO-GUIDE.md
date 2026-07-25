# DEMO GUIDE — Connekt Pay v1.0.0

Objetivo: roteiro para reunião com Cezar e Matheus, com narrativa de produto, ordem de telas e respostas sugeridas.

## 1) Roteiro (ordem sugerida)

1. Abertura (2–3 min)
   - Problema que resolvemos: operação de pagamentos com governança e visão financeira
   - O que é a v1.0.0: demo/homologação pronta, integração MyGateway em estágio avançado

2. Visão executiva (5 min)
   - Mostrar o resumo executivo e status da versão
   - Destacar: 18 módulos, 29 rotas, 54 APIs, 83 métodos HTTP, 17 fluxos E2E aprovados

3. Jornada do painel (10–15 min)
   - Login → Dashboard (KPIs)
   - Transações (filtros, busca, detalhes, export)
   - Ledger (extrato e export)

4. Venda por link (8–10 min)
   - Links de Pagamento (criar e listar)
   - Checkout Público (abrir por slug; validar métodos PIX/cartão; finalizar)
   - Sucesso/estado de confirmação

5. Recorrência (5–8 min)
   - Planos (gestão)
   - Assinaturas (criar/acompanhar/cancelar)

6. Recebedores e KYC (6–8 min)
   - Recebedores (cadastro/status)
   - KYC (upload) e aprovação via admin

7. Governança e operação (5–8 min)
   - Auditoria (audit logs + export)
   - Eventos/Webhooks (persistência + reprocessamento)

8. Segurança e prontidão (5 min)
   - RLS por organização
   - API pública com API key + rate limit
   - Webhook com assinatura

9. Integração MyGateway e próximos passos (5 min)
   - O que está integrado vs o que depende de endpoints/contrato
   - Checklist de homologação e roadmap v1.1

## 2) Telas que devem ser mostradas

- `/login`
- `/dashboard`
- `/transacoes`
- `/links-pagamento` e `/links-pagamento/novo`
- `/checkout?slug=...` e `/checkout/success`
- `/subscriptions/plans`
- `/assinaturas` e/ou `/subscriptions`
- `/recebedores`
- `/admin/aprovacao-kyc`
- `/ledger`
- `/admin/auditoria`
- `/admin/eventos`
- `/admin/provedor-financeiro`

## 3) Funcionalidades principais para enfatizar

- Venda por link + checkout público
- Governança: audit logs + eventos/reprocessamento
- Segurança: RLS, segregação de segredos, assinatura de webhook, rate limiting
- Visão financeira: ledger e trilha de lançamentos

## 4) Perguntas prováveis do Cezar (e respostas sugeridas)

1) “O que já está pronto de verdade vs o que é demo?”
- v1.0.0 entrega painel, checkout e governança com qualidade (E2E 17/17).
- Integração MyGateway está real nas rotas-base (auth, criar link, situação, tokenização, assinatura).
- Itens “real completo” restantes viram foco da v1.1 (webhooks, payout, antecipação, KYC submit, Pix Automático).

2) “Como garantimos que uma organização não vê dados de outra?”
- RLS por `organization_id` no Supabase + contexto de sessão; reforçado com FORCE RLS em tabelas sensíveis.

3) “Quais riscos de produção?”
- Dependências do contrato MyGateway para fechar ciclo real (webhooks/payout/antecipação/KYC).
- Observabilidade: monitorar erros e webhooks no go-live; checklist pronto.

## 5) Perguntas prováveis do Matheus (e respostas sugeridas)

1) “Quantas rotas e APIs tem hoje?”
- 29 rotas UI; 54 route handlers; 83 métodos HTTP.

2) “Como é a proteção das APIs públicas?”
- API key por organização + rate limit; payloads sensíveis não são expostos.

3) “Como reprocessa falha de webhook?”
- Eventos são persistidos e há reprocessamento manual/automático (admin/cron), com idempotência.

## 6) Evidências e credibilidade (mostrar rapidamente)

- E2E final: [QA-E2E-FINAL.md](file:///c:/Users/Leonardo/Desktop/ConnektPay/QA-E2E-FINAL.md)
- Evidências organizadas: pasta “04 - Evidências” desta apresentação
- Segurança/produção: [PRODUCTION-SECURITY.md](file:///c:/Users/Leonardo/Desktop/ConnektPay/docs/PRODUCTION-SECURITY.md) e [PRODUCTION-AUDIT.md](file:///c:/Users/Leonardo/Desktop/ConnektPay/docs/PRODUCTION-AUDIT.md)

