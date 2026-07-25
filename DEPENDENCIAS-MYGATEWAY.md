# DEPENDENCIAS MYGATEWAY

## Integrações homologadas

| Domínio | Endpoint / contrato | Status |
|---|---|---|
| Autenticação | `POST /authentication/v2/auth` | Homologado |
| Payment Link create | `POST /payments/v1/paymentlink` | Homologado |
| Payment Link get | `GET /payments/v1/paymentlink/{id}` | Homologado |
| Payment Link list | `GET /payments/v1/paymentlink` | Homologado |

## Dependências ainda abertas

| Módulo | Falta externa | Status interno | Bloqueio atual |
|---|---|---|---|
| KYC provider | Endpoint oficial de submit/status, payload e status | Pronto internamente | Contrato não confirmado |
| Split externo | Payload oficial de split em cobrança/assinatura | Pronto internamente | Contrato não confirmado |
| Assinaturas externas | Create/cancel, eventos e status oficiais | Pronto internamente | Contrato/homologação |
| Repasses externos | Endpoints `create/get/list` oficiais | Pronto internamente | Contrato/homologação |
| Antecipação externa | Endpoints `request/get/cancel/list` oficiais | Pronto internamente | Contrato/homologação |
| Webhooks oficiais | Catálogo de eventos, assinatura, retry e idempotência oficiais | Infra interna pronta | Contrato/homologação |
| Pagamento avulso PIX | Confirmação do uso de `/payments/v1/create` e `/payments/v1/situation/{id}` | Fluxo interno existe | Contrato não confirmado |
| Pagamento avulso cartão | Tokenização e cobrança oficiais | Fluxo interno existe | Contrato não confirmado |
| Pix Automático | Endpoints e eventos oficiais | Não iniciado | Contrato inexistente no projeto |

## Regras atuais

- Feature flags externas permanecem desligadas quando o contrato não está homologado.
- Não existe fallback silencioso que transforme erro real do provider em sucesso simulado.
- Quando a integração externa está indisponível, a plataforma mantém o fluxo interno ou retorna indisponibilidade controlada.

## Próxima ação por módulo

- KYC provider: confirmar contrato oficial e status
- Split externo: confirmar shape final do payload
- Assinaturas externas: homologar create/cancel e webhooks
- Repasses externos: confirmar `create/get/list`
- Antecipação externa: confirmar `request/get/cancel/list`
- Webhooks: confirmar assinatura e catálogo de eventos
