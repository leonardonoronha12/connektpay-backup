# MyGateway — Auth v2 + Payment Link (Implementação)

Data: 2026-07-14

Escopo desta etapa:

- autenticação v2;
- Payment Link:
  - create
  - get por id
  - list

Fora de escopo:

- pagamento avulso PIX;
- pagamento avulso cartão;
- split externo;
- assinaturas externas;
- recebedores/KYC/repasses/antecipações.

## Alterações realizadas

### 1) Autenticação v2

- Endpoint atualizado para `POST /authentication/v2/auth` (substitui `v1`).
- Headers enviados:
  - `x-api-key`
  - `Content-Type: application/json`
- Body enviado:
  - `{ "authData": "base64(clientId:clientSecret)" }`
- Resposta esperada:
  - `{ "auth_token": "...", "expires_in": "..." }`

### 2) Cache de token e controle de concorrência

- O `auth_token` é cacheado em memória e reutilizado até o `expires_in`.
- Margem segura aplicada:
  - o token é considerado inválido quando faltam <= 60s para expirar.
- Lock concorrente:
  - múltiplas chamadas simultâneas não disparam múltiplas autenticações; aguardam a mesma promise.

### 3) Header do token configurável

- Por padrão, as chamadas autenticadas usam:
  - `Authorization: <auth_token>`
- Pode ser configurado via variável de ambiente:
  - `MYGATEWAY_AUTH_HEADER=Authorization` ou `MYGATEWAY_AUTH_HEADER=Authentication`
- Não existe fallback automático silencioso em produção:
  - o header usado depende explicitamente de `MYGATEWAY_AUTH_HEADER`.

### 4) Payment Link (contrato confirmado)

Implementado exclusivamente:

- `POST /payments/v1/paymentlink`
- `GET /payments/v1/paymentlink/{id}`
- `GET /payments/v1/paymentlink`

Mapeamento interno → payload externo:

- `value`: centavos como string numérica
- `title`: nome do link
- `description`: descrição sanitizada
- `validity`: `YYYY-MM-DD HH:mm`
- `minimumNumberOfInstallments`: 1
- `maximumQuantityOfInstallments`: 1..18
- `numberOfAllowedSales`: > 0
- `showFormAddress`: 0/1
- `customerInterest`: 0/1
- `acceptedPaymentsType`: somente `PIX`, `Credit`, `Billet`

Persistência no banco (já existente no fluxo atual do módulo):

- `provider_reference`
- `provider_url`
- `provider_status`
- `provider_payload` (payload do provider)
- `provider_last_error`
- `provider_synced_at`

### 5) Feature flag (gating)

- `MYGATEWAY_PAYMENT_LINKS_ENABLED=false` por padrão.
- Quando `false`:
  - o sistema mantém o fluxo interno atual;
  - não chama a MyGateway;
  - retorna mensagem explícita informando que a sincronização externa está desabilitada.

## Arquivos principais alterados

- Provider:
  - [myg-provider.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/lib/acquirer/myg-provider.ts)
  - [types.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/lib/acquirer/types.ts)
- Feature flags:
  - [env.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/lib/env.ts)
- Módulo Payment Links (gating + persistência):
  - [payment-links/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/payment-links/route.ts)
