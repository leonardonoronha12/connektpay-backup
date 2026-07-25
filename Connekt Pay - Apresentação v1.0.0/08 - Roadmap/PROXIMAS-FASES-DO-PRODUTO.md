# Próximas Fases do Produto — Connekt Pay

Este documento resume a evolução do produto após o congelamento da v1.0.0, com foco na operacionalização “real” da integração financeira.

## v1.1 — MyGateway (prioridade)

Referência detalhada: [ROADMAP-V1.1-MYGATEWAY.md](file:///c:/Users/Leonardo/Desktop/ConnektPay/ROADMAP-V1.1-MYGATEWAY.md)

Entregas principais:
- PIX real (ciclo completo + webhooks)
- Cartão real (tokenização/autorizar/capturar, erros e reembolsos se aplicável)
- Webhooks reais (assinatura, idempotência, retries, replay protection)
- Split real (semântica, taxas e ledger)
- Assinaturas reais (ciclo de cobranças e eventos)
- Repasses reais (payouts)
- Antecipação real
- KYC real (submit no provider + sincronização)
- Pix Automático

## Pós v1.1 — Evoluções do produto

- Observabilidade e operação:
  - métricas/alertas para webhooks e falhas do provider
  - playbooks de incidentes e rotinas de reprocessamento
- Qualidade:
  - ampliar suites E2E por domínio (split/recorrência/repasses/antecipação)
- UX:
  - microcopy e consistência de mensagens
  - melhorias de formulários e validações

