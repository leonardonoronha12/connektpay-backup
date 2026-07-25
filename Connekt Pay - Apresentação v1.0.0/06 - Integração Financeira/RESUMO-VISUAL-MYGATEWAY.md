# Resumo Visual — Integração MyGateway (v1.0.0)

Objetivo: apresentar, de forma clara, o status da integração financeira na v1.0.0.

Referências:
- [MYGATEWAY-INTEGRATION-STATUS.md](file:///c:/Users/Leonardo/Desktop/ConnektPay/docs/MYGATEWAY-INTEGRATION-STATUS.md)
- [CHECKLIST-HOMOLOGACAO.md](file:///c:/Users/Leonardo/Desktop/ConnektPay/CHECKLIST-HOMOLOGACAO.md)
- Roadmap: [ROADMAP-V1.1-MYGATEWAY.md](file:///c:/Users/Leonardo/Desktop/ConnektPay/ROADMAP-V1.1-MYGATEWAY.md)

## O que já está integrado (real)

- Autenticação no provider
- Criar payment link (PIX)
- Consultar situação (payment/link)
- Tokenização de cartão (backend)
- Criar assinatura
- Cancelar assinatura

## O que está preparado (estrutura pronta, depende de contrato/endpoints)

- Processamento de eventos e reprocessamento (infra interna pronta)
- Conciliação (base pronta; evolui conforme listagens oficiais do provider)
- Modelos/tabelas e estados internos para:
  - antecipação
  - repasses
  - KYC

## O que depende da MyGateway (pendente para “real”)

- PIX real end-to-end com webhooks reais em ambiente de homologação
- Cartão real end-to-end (autorização/captura e respostas finais)
- Webhooks reais (catálogo final de eventos + assinatura + idempotência)
- Split real (semântica e taxas)
- Repasses/payouts (endpoints create/get/list)
- Antecipação (endpoints request/get/cancel)
- KYC submit no provider (endpoint oficial)
- Pix Automático (endpoints + eventos + consentimento)

