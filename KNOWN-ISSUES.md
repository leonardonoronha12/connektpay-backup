# Known Issues — Connekt Pay v1.0.0

Data: 2026-06-25

Este documento lista limitações e pendências conhecidas da v1.0.0 durante a fase de homologação. Não é backlog completo — apenas itens relevantes para apresentação/homologação e para planejar v1.1.

## 1) Limitações atuais (produto)

- Cobertura “real” (end-to-end) de todos os módulos financeiros depende do catálogo final de endpoints/eventos da MyGateway (ver seção 3).
- Alguns fluxos avançados podem operar em modo “preparado”/“mock” até existirem endpoints oficiais (ex.: antecipação/payouts/KYC submit).

## 2) Funcionalidades em modo demonstração

- Módulos que dependem de endpoints ainda não confirmados no contrato MyGateway podem retornar erros tipados (ex.: 501 “not configured / not implemented”) para sinalizar pendência de integração definitiva, sem derrubar o frontend.
- A conciliação pode operar com consulta de “situação” por referência quando listagens do provedor ainda não estiverem disponíveis.

## 3) Integrações dependentes da MyGateway (pendências)

Fonte oficial: [MYGATEWAY-INTEGRATION-STATUS.md](file:///c:/Users/Leonardo/Desktop/ConnektPay/MYGATEWAY-INTEGRATION-STATUS.md)

Pendente/depende de endpoints oficiais:

- Webhooks reais (catálogo final + validação de eventos + assinatura + idempotência)
- PIX real end-to-end (homologação)
- Cartão real end-to-end (autorização/captura)
- Split real (validação de cálculo + repasse + ledger)
- Repasses/payouts reais (create/get/list)
- Antecipação real (request/get/cancel)
- KYC submit real (recipient/KYC)
- Pix Automático (autorização do pagador + cobrança + eventos)

## 4) Bugs conhecidos (qualidade)

- Auditoria Playwright: fluxo “Configurações · Provedor” falha por expectativa de heading no teste (não indica crash do produto).
  - Evidência: [AUDITORIA-FINAL-V1.0.0.md](file:///c:/Users/Leonardo/Desktop/ConnektPay/AUDITORIA-FINAL-V1.0.0.md#L334-L352)
  - Impacto: afeta o status do módulo “Configurações” na auditoria automática; não bloqueia uso do sistema em homologação.

## 5) Melhorias previstas para v1.1 (sem escopo fechado)

- Concluir integração MyGateway (endpoints/eventos oficiais) para fechar ciclo real de:
  - payouts/repasses,
  - antecipação,
  - KYC submit,
  - pix automático,
  - listagens completas para conciliação.
- Expandir suíte de QA automatizada com smoke tests focados em:
  - rotas públicas com API key + rate limit,
  - webhook com assinatura inválida e retries,
  - fluxos MyGateway reais em homologação.

