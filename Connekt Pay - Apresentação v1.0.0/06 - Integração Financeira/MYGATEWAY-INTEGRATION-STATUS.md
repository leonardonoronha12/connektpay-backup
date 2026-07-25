# MyGateway — Status de Integração (Connekt Pay)

Data: 2026-06-23

Regra de arquitetura: nenhuma tela/rota/service chama MyGateway diretamente. Sempre: Service → AcquirerProvider → MygProvider → MyGateway.

| Funcionalidade | Endpoint usado | Status | Observação |
|---|---|---|---|
| Autenticação | `POST /authentication/v1/auth` | real | Usa `x-api-key` + `authData` (base64). |
| Criar Payment Link (PIX) | `POST /payments/v1/create` | real | Persistimos `provider_reference` e `provider_payload` no banco (uso interno). |
| Consultar situação (Payment/Link) | `GET /payments/v1/situation/{id}` | real | Usado para status e para conciliação (`getTransaction`). |
| Tokenizar cartão | `POST /payments/v1/creditcard/generate/token` | real | Tokenização feita apenas no backend. |
| Criar assinatura | `POST /subscriptions/v1/create` | real | Integra split + metadata. |
| Cancelar assinatura | `POST /subscriptions/v1/cancel` | real | Cancelamento via provider. |
| Solicitar antecipação | `POST /anticipations/v1/request` | preparado | Implementado e testado com mock; confirmar endpoint real no contrato MyGateway. |
| Consultar antecipação | `GET /anticipations/v1/{id}` | preparado | Implementado e testado com mock; confirmar endpoint real e shape de retorno. |
| Cancelar antecipação | `POST /anticipations/v1/cancel` | preparado | Implementado e testado com mock; confirmar endpoint real. |
| Criar payout/repasse | `POST /payouts` | preparado | Endpoint ainda não confirmado no contrato MyGateway; ajustar quando definido. |
| Consultar payout | — | pendente | `getPayout()` retorna erro tipado (501) até existir endpoint real. |
| Listar payouts (conciliação) | — | pendente | `listPayouts()` retorna erro tipado (501) até existir endpoint real. |
| KYC do recebedor (submit) | — | pendente | `submitKyc()` retorna erro tipado (501) até existir endpoint real (recipient/KYC). |
| Pix Automático (autorização/cobrança) | — | pendente | Modelo preparado no banco; sem endpoints MyGateway confirmados para Pix Automático. |
| Listar transações (conciliação) | — | pendente | `listTransactions()` retorna erro tipado (501); conciliação usa `getTransaction()` por referência. |
| Listar antecipações (conciliação) | — | pendente | `listAnticipations()` retorna erro tipado (501); conciliação usa `getAnticipation()` por referência. |
| Listar Payment Links | — | pendente | `listPaymentLinks()` retorna `[]` (placeholder). |

## TODO técnico (para homologação com credenciais reais)

- Confirmar endpoints oficiais de antecipação (`request/get/cancel`) e padronizar parsing de `status`/`amount`.
- Confirmar endpoints de payout (`create/get/list`) para conciliação completa (repasses internos vs provedor).
- Confirmar endpoint oficial de KYC/recipient para habilitar onboarding self-service com sync no provider.
- Confirmar endpoints/eventos oficiais de Pix Automático (autorização do pagador, cancelamento e charge events).
- Confirmar se `GET /payments/v1/situation/{id}` atende também IDs de `provider_reference` de transações internas e qual a semântica do campo `value/amount`.
