# MyGateway — Auth v2 + Payment Link (QA)

Data: 2026-07-14

## Escopo validado

- autenticação v2;
- cache do token com margem segura;
- bloqueio de autenticações concorrentes;
- criação de Payment Link;
- consulta de Payment Link por id;
- listagem de Payment Links;
- garantia de não chamar a MyGateway quando `MYGATEWAY_PAYMENT_LINKS_ENABLED=false` (gating no fluxo do Payment Link).

Fora de escopo (não testado aqui):

- pagamento avulso PIX;
- pagamento avulso cartão;
- split externo;
- assinaturas externas;
- recebedores/KYC/repasses/antecipações.

## Testes executados

- `npm run test:mygateway`

Cobertura de cenários (mock):

- autenticação v2 (`/authentication/v2/auth`)
- reaproveitamento de token
- autenticação concorrente não duplica chamadas
- erro 401 → `invalid_credentials`
- erro 429 → `rate_limited`
- Payment Link:
  - create (`/payments/v1/paymentlink`)
  - get por id (`/payments/v1/paymentlink/{id}`)
  - list (`/payments/v1/paymentlink`)

## Segurança verificada (no nível de implementação)

- nenhum segredo é escrito em log pelo fluxo do provider;
- `x-api-key` é enviado apenas server-side;
- `authData` e `auth_token` não são persistidos no banco.

## Pendências para homologação real

- validar em ambiente real qual header funciona:
  - `Authorization` ou `Authentication`
- validar forma real de `expires_in` (string numérica vs data ISO)
- validar o shape real do endpoint de listagem (`GET /payments/v1/paymentlink`)
