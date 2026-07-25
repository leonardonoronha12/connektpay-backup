# Debug Session: pagarme-basic-auth
- **Status**: [OPEN]
- **Issue**: Webhook real da Pagar.me chega ao Preview correto, mas a autenticação HTTP Basic retorna 401 mesmo com credenciais redefinidas nos dois lados.
- **Debug Server**: Pending startup
- **Log File**: .dbg/trae-debug-log-pagarme-basic-auth.ndjson

## Reproduction Steps
1. Publicar o Preview atual.
2. Configurar o webhook Sandbox da Pagar.me para a URL do Preview.
3. Concluir um pagamento Sandbox real via payment link.
4. Observar que o webhook chega ao endpoint e retorna 401.

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | O header `Authorization` real chega em formato diferente do parser atual. | High | Low | Pending |
| B | O runtime do Preview não está carregando os valores esperados de `PAGARME_WEBHOOK_USERNAME` e `PAGARME_WEBHOOK_PASSWORD`. | High | Low | Pending |
| C | O header `Authorization` não chega intacto ao runtime, ou chega em outro header. | Med | Med | Pending |
| D | A comparação falha por detalhes de conteúdo real, como espaços, UTF-8, vazio ou múltiplos `:`. | Med | Low | Pending |
| E | O POST manual com as credenciais efetivas do deployment também falha, indicando problema no código/runtime local. | Med | Med | Pending |

## Log Evidence
- `Preview` instrumentado publicado em `https://connektpay-q4bke2j77-connekt-8e34459c.vercel.app`.
- `vercel logs --json` no deployment `dpl_DFKZnoKYaYKLZfprbnWtqxwgaZNV` mostrou:
  - request sem header: `authorizationPresent=false`, `scheme=ausente`, `expectedUsernamePresent=true`, `expectedPasswordPresent=true`, `authFailureReason=missing_authorization`
  - request com `Bearer`: `authorizationPresent=true`, `scheme=Bearer`, `authRelatedHeaders=["authorization"]`, `authFailureReason=invalid_scheme`
  - request com `Basic not-base64`: `authorizationPresent=true`, `scheme=Basic`, `base64Decodable=false`, `authRelatedHeaders=["authorization"]`, `authFailureReason=invalid_base64`
- Hashes truncados esperados carregados no runtime do deployment:
  - `expectedUsernameHash=f8e4d7f041d4`
  - `expectedPasswordHash=439811a84447`
- Painel da Pagar.me autenticado ainda aponta o webhook Sandbox ativo para `https://connektpay-cqnwc4nrs-connekt-8e34459c.vercel.app/api/webhooks`, e não para o `Preview` instrumentado `q4bke2j77`.
- Após o disparo real no `Preview` instrumentado `q4bke2j77`, `vercel logs --json` mostrou 3 tentativas reais da Pagar.me com os mesmos campos:
  - `authorizationPresent=true`
  - `scheme=Basic`
  - `headerLength=86`
  - `base64Decodable=true`
  - `decodedLength=59`
  - `hasSeparator=true`
  - `firstSeparatorIndex=15`
  - `hasMultipleSeparators=false`
  - `receivedUsernameLength=15`
  - `receivedPasswordLength=43`
  - `receivedUsernameHash=f8e4d7f041d4`
  - `receivedPasswordHash=78a3454acc95`
  - `expectedUsernameHash=f8e4d7f041d4`
  - `expectedPasswordHash=439811a84447`
  - `usernameMatches=true`
  - `passwordMatches=false`
  - `authFailureReason=invalid_password`
- O painel autenticado depois do disparo confirmou que o webhook ativo passou a apontar para `https://connektpay-q4bke2j77-connekt-8e34459c.vercel.app/api/webhooks`.

## Verification Conclusion
- Hipótese A: rejeitada para o webhook real; a Pagar.me envia `Basic` bem-formado e decodificável.
- Hipótese B: rejeitada; o deployment instrumentado carrega `PAGARME_WEBHOOK_USERNAME` e `PAGARME_WEBHOOK_PASSWORD`.
- Hipótese C: rejeitada para testes sintéticos; a Vercel não remove o header `authorization` quando ele é enviado.
- Hipótese D: confirmada parcialmente; o problema real não é esquema, Base64 nem formato, e sim divergência apenas no conteúdo da senha.
- Hipótese E: ainda pendente até executar um POST manual com as credenciais corretas efetivas do deployment.
