# Checklist de Homologação — Connekt Pay (pós v1.0.0)

Data: 2026-06-24  
Objetivo: preparar o início da homologação com foco em MyGateway, webhooks, segurança e operação.

## 1) Credenciais MyGateway

- [ ] Confirmar ambiente (homologação vs produção) e URLs oficiais
- [ ] Configurar no backend (Vercel/ambiente):
  - [ ] `MYGATEWAY_BASE_URL`
  - [ ] `MYGATEWAY_X_API_KEY` (ou `MYGATEWAY_API_KEY`)
  - [ ] `MYGATEWAY_AUTH_DATA` (ou `MYGATEWAY_CLIENT_ID` + `MYGATEWAY_CLIENT_SECRET`)
- [ ] Validar autenticação e rotas básicas com “smoke” manual (sem dados sensíveis em log)

## 2) Webhooks

- [ ] Configurar `MYGATEWAY_WEBHOOK_SECRET` (fail-closed em produção)
- [ ] Confirmar lista oficial de eventos do provider (payments/subscriptions/payouts/anticipations)
- [ ] Validar:
  - [ ] assinatura correta
  - [ ] idempotência por `event_id`
  - [ ] reentregas (retries) e replay protection
- [ ] Verificar persistência e reprocessamento:
  - [ ] fluxo de pendentes
  - [ ] reprocessamento manual (admin)

## 3) PIX real

- [ ] Confirmar criação de cobrança PIX via MyGateway
- [ ] Confirmar QR/BRCode e expiração
- [ ] Confirmar transição para “pago” via webhook
- [ ] Conferir lançamento no ledger após pagamento confirmado

## 4) Cartão real

- [ ] Confirmar tokenização (backend)
- [ ] Confirmar autorização/captura (contrato MyGateway)
- [ ] Validar recusas e mensagens amigáveis no checkout
- [ ] Validar conciliação/ledger após confirmação

## 5) Split real

- [ ] Confirmar semântica do split no provider (fixo/percentual, arredondamento)
- [ ] Validar split em:
  - [ ] payment links/checkout (pagamento avulso)
  - [ ] assinaturas (cobrança recorrente)
- [ ] Conferir ledger: lançamentos consistentes e rastreáveis

## 6) KYC real

- [ ] Confirmar endpoint oficial de KYC submit no provider
- [ ] Mapear estados e SLA (pending/approved/rejected)
- [ ] Validar jornada:
  - [ ] criar recebedor
  - [ ] enviar documentos
  - [ ] aprovar/rejeitar
  - [ ] sincronizar status com provider (quando existir)

## 7) Repasses reais (payouts)

- [ ] Confirmar endpoints oficiais (create/get/list)
- [ ] Validar fluxo completo:
  - [ ] request → processing → paid/failed
  - [ ] webhooks e idempotência
- [ ] Conferir ledger após paid

## 8) Antecipação real

- [ ] Confirmar endpoints oficiais (request/get/cancel)
- [ ] Validar simulação e taxas (bps) vs contrato
- [ ] Validar cancelamento e lançamento no ledger (se aplicável)

## 9) Pix Automático

- [ ] Confirmar endpoints/eventos oficiais
- [ ] Modelar consentimento/autorizações
- [ ] Validar cobranças recorrentes via eventos

## 10) Logs, auditoria e observabilidade

Referências:
- [PRODUCTION-AUDIT.md](file:///c:/Users/Leonardo/Desktop/ConnektPay/docs/PRODUCTION-AUDIT.md)
- [PRODUCTION-SECURITY.md](file:///c:/Users/Leonardo/Desktop/ConnektPay/docs/PRODUCTION-SECURITY.md)

- [ ] Verificar cobertura de `audit_logs` para operações críticas (internal/public)
- [ ] Verificar que não há segredos em logs e respostas
- [ ] Monitorar logs de runtime (Vercel) e erros 5xx (Supabase/Functions)

## 11) Produção (pré go-live)

- [ ] Validar headers de segurança e HTTPS/HSTS
- [ ] Revisar variáveis de ambiente (segredos apenas no backend)
- [ ] Validar rate limit em APIs públicas
- [ ] Validar reprocessamento de eventos pendentes (cron/segredo)
- [ ] Revisar checklist de go-live do projeto

## 12) Encerramento da homologação

- [ ] Executar checklist de ponta a ponta:
  - [ ] link → checkout → pagamento PIX
  - [ ] link → checkout → pagamento cartão
  - [ ] assinatura → cobrança → cancelamento
  - [ ] split → pagamento → ledger
  - [ ] payout → paid → ledger
  - [ ] conciliação → divergências → resolução
- [ ] Consolidar evidências (screenshots/logs/traces) e assinar aceite interno

