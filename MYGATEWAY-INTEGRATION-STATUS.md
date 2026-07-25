# MyGateway — Status de Integração (Connekt Pay)

Data: 2026-07-18

Regra de arquitetura: nenhuma tela/rota/service chama MyGateway diretamente. Sempre: Service → AcquirerProvider → MygProvider → MyGateway.

| Funcionalidade | Endpoint usado | Status | Observação |
|---|---|---|---|
| Autenticação | `POST /authentication/v2/auth` | real | Header validado com `Authorization`, cache de token ativo e reuso ate `expires_in`. |
| Criar Payment Link | `POST /payments/v1/paymentlink` | real | Fluxo homologado e validado em producao com persistencia de `provider_reference`, `provider_url`, `provider_status` e `provider_payload` sanitizado. |
| Consultar Payment Link por ID | `GET /payments/v1/paymentlink/{id}` | real | Validado em homologacao real e producao. |
| Listar Payment Links | `GET /payments/v1/paymentlink` | real | `listPaymentLinks()` implementado, testado e homologado; nao e mais placeholder. |
| Consultar situação (Payment/Link) | `GET /payments/v1/situation/{id}` | preparado | Mantido para status/conciliação de pagamentos avulsos; nao faz parte do fluxo homologado de Payment Links. |
| Tokenizar cartão | `POST /payments/v1/creditcard/generate/token` | preparado | Implementacao existe no adapter, mas nao foi revalidada nesta etapa e nao faz parte do escopo homologado em producao. |
| Criar assinatura | `POST /subscriptions/v1/create` | preparado | Endpoint presente no adapter, mas o modulo externo de Assinaturas segue dependente de confirmacao contratual/homologacao adicional. |
| Cancelar assinatura | `POST /subscriptions/v1/cancel` | preparado | Endpoint presente no adapter, mas o cancelamento externo nao foi homologado nesta etapa. |
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

## TODO técnico (para homologação com credenciais reais)

- Confirmar endpoints oficiais de antecipação (`request/get/cancel`) e padronizar parsing de `status`/`amount`.
- Confirmar endpoints de payout (`create/get/list`) para conciliação completa (repasses internos vs provedor).
- Confirmar endpoint oficial de KYC/recipient para habilitar onboarding self-service com sync no provider.
- Confirmar endpoints/eventos oficiais de Pix Automático (autorização do pagador, cancelamento e charge events).
- Confirmar o papel exato de `GET /payments/v1/situation/{id}` para pagamentos avulsos e conciliacao, sem misturar esse contrato com Payment Links.
