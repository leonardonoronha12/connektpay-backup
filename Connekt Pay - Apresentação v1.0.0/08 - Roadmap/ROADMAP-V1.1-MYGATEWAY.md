# ROADMAP v1.1 — MyGateway (Connekt Pay)

Este documento define a próxima fase (v1.1), focada em completar a integração real com a MyGateway para homologação e produção.

Escopo: somente itens relacionados à MyGateway e à operacionalização (webhooks, homologação e produção).  
Não é um plano de refatoração de arquitetura; assume o padrão atual Service → Provider.

## PIX real

- Confirmar contratos e campos obrigatórios para criação de cobrança PIX.
- Garantir ciclo de vida completo: created → pending → paid → failed/canceled (sem polling excessivo).
- Padronizar idempotência (chaves por `payment_link_id`/`transaction_id`) e recuperação após falha.
- Validar reconciliação do status pelo provider em cenários de atraso/duplicidade.

## Cartão real

- Confirmar tokenização e autorização/captura conforme contrato MyGateway.
- Mapear e padronizar erros (declined/invalid/timeout) para mensagens consistentes na UI.
- Garantir antifraude/3DS (se aplicável) e trilha de auditoria interna.
- Validar estornos/reembolsos (se suportado no contrato).

## Webhooks reais

- Confirmar catálogo oficial de eventos (payments/subscriptions/payouts/anticipations).
- Implementar verificação de assinatura (secret) e replay protection.
- Garantir idempotência de processamento por `event_id` e tolerância a reentregas.
- Definir estratégia de retries, DLQ interna (tabela/estado) e reprocessamento.

## Split real

- Confirmar semântica do split no provider (fixo/percentual, arredondamento, taxas).
- Garantir persistência e rastreabilidade: “antes/depois” do split no ledger interno.
- Validar split em:
  - pagamento avulso (payment link/checkout)
  - assinaturas (cobranças recorrentes)

## Assinaturas reais

- Confirmar endpoints oficiais (create/cancel/situation) e campos necessários.
- Garantir conciliação entre status interno e status do provider.
- Implementar eventos reais via webhook para:
  - charge succeeded/failed
  - subscription canceled/expired
  - invoices/charges geradas

## Repasses reais (payouts)

- Confirmar endpoints oficiais (create/get/list) e modelo de status do provider.
- Garantir fluxo fim-a-fim:
  - solicitação → processamento → pago/falhou
- Conciliação completa:
  - valores, taxas, divergências e evidências (payloads redigidos)

## Antecipação real

- Confirmar endpoints oficiais (request/get/cancel) e campos de retorno.
- Padronizar cálculo de taxas e estado interno vs provider.
- Validar cenários de:
  - aprovação/rejeição
  - cancelamento
  - liquidação parcial (se existir no contrato)

## KYC real

- Confirmar endpoint oficial de onboarding/recipient/KYC submit.
- Definir “fonte da verdade” (provider vs banco interno) e sincronização.
- Garantir trilha de auditoria e governança de dados sensíveis.
- Validar jornada completa:
  - criação de recebedor → envio de KYC → análise → aprovação/reprovação

## Pix Automático

- Confirmar endpoints e eventos oficiais para autorização do pagador e cobranças recorrentes via PIX.
- Modelar estados (autorização ativa/suspensa/cancelada; cobranças; falhas).
- Definir requisitos legais/consentimento e telas necessárias para demo/homologação.

## Homologação

- Checklist de homologação com MyGateway:
  - credenciais, URLs, secrets e ambientes
  - cenários mínimos (PIX/cartão/assinatura/repasses/antecipação)
  - validação de webhooks (assinatura + idempotência + retries)
- Definir dataset e scripts de preparação para homologação (sem dados reais).
- Relatórios de evidência (Playwright + logs + payloads redigidos).

## Produção

- Checklist de produção:
  - rotação de secrets e chaves
  - observabilidade (logs, métricas, alertas)
  - limites/rate limiting e proteção de endpoints
  - política de retries e tratamento de falhas do provider
- Plano de rollout:
  - feature flags/controle por organização (se necessário)
  - monitoramento pós-go-live e playbook de incidentes

Connekt Pay v1.0.0 congelada e pronta para homologação.

