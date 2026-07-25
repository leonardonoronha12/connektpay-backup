# Test Suite Refactor

## Objetivo

- Desmembrar `qa-e2e-audit.spec.ts` em specs menores e independentes.
- Eliminar acoplamento por variáveis globais, `storageState` mutável, slug compartilhado e dependência de ordem.
- Manter a validação por domínio sem executar a suíte completa nesta rodada.

## Quantidade De Testes Movidos

- Testes movidos do monólito original: `22`
- Teste adicional derivado para isolar o fluxo mobile de checkout: `1`
- Total da nova malha criada nesta rodada: `23`

## Arquivos Criados

- [qa-auth.spec.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/tests/qa-auth.spec.ts)
- [qa-dashboard.spec.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/tests/qa-dashboard.spec.ts)
- [qa-payment-links.spec.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/tests/qa-payment-links.spec.ts)
- [qa-checkout.spec.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/tests/qa-checkout.spec.ts)
- [qa-transactions.spec.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/tests/qa-transactions.spec.ts)
- [qa-admin.spec.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/tests/qa-admin.spec.ts)
- [qa-mobile.spec.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/tests/qa-mobile.spec.ts)
- [qa-suite.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/tests/helpers/qa-suite.ts)

## Arquivo Removido

- `tests/qa-e2e-audit.spec.ts`

## Dependências Removidas

- Variáveis globais de autenticação compartilhada entre testes.
- Reuso de `checkoutSlugFromFlow` entre `Payment Links`, `Checkout público` e `Transações`.
- Dependência implícita de `logout` de outro teste.
- Reuso de `storageState` mutável entre fluxos heterogêneos.
- Mistura de fluxos desktop e mobile no mesmo arquivo.
- Cadeia longa de testes de domínios distintos dentro de um único `describe`.

## Sessões Isoladas

- Cada teste cria sua própria credencial E2E temporária via helper.
- Cada teste faz login por conta própria sem depender de sessão anterior.
- `qa-auth.spec.ts` preserva o fluxo real de login via UI como sentinela de autenticação.
- Os demais specs de domínio usam autenticação própria via API no mesmo contexto do browser para remover acoplamento com redirecionamento visual e onboarding.
- Cada teste faz cleanup próprio chamando `session.cleanup()` ao final.
- O logout passou a ser validado pela invalidação de sessão, não por navegação herdada de outro teste.
- A cobertura mobile foi separada em arquivo próprio e roda apenas no projeto mobile.

## Dados Isolados

- Cada teste que cria link usa nome e slug efetivamente próprios.
- Cada teste que cria transação parte de link próprio e cliente próprio.
- Cada teste que cria recebedor usa nome e CNPJ únicos.
- Cada fluxo de checkout público limpa explicitamente o contexto autenticado antes de validar a rota pública.
- O cleanup principal ocorre pela remoção da organização temporária criada para a credencial E2E do teste.
- Não existe mais compartilhamento de slug, e-mail de cliente ou entidade mutável entre specs.

## Mapeamento Por Domínio

- `qa-auth.spec.ts`
  - login
  - logout

- `qa-dashboard.spec.ts`
  - dashboard

- `qa-payment-links.spec.ts`
  - listagem
  - criação
  - navegação para checkout do link próprio

- `qa-checkout.spec.ts`
  - checkout público desktop com slug próprio

- `qa-transactions.spec.ts`
  - criação de transação de apoio
  - busca
  - detalhes
  - export

- `qa-admin.spec.ts`
  - recebedores
-  - criação própria de recebedor via API autenticada
-  - abertura do detalhe de recebedor
-  - validação do modal de recebedor e KYC interno
-  - navegação para aprovação de KYC

- `qa-mobile.spec.ts`
  - navegação do drawer mobile
  - checkout mobile com sessão isolada

## Dependências Estruturais Removidas Nesta Rodada

- O helper `loginWithQaSession()` deixou de depender do fluxo visual completo de login/dashboard para os specs de domínio.
- A criação de Payment Link por API deixou de depender de `fetch('/api/payment-links')` dentro de `page.evaluate()`.
- O preenchimento do formulário de Payment Link passou a respeitar inputs controlados por React com setter nativo e eventos `input/change`.
- O spec de transações deixou de depender de clique por ponteiro em elemento suscetível a overlay e passou a abrir o menu por teclado.
- O spec administrativo deixou de concentrar múltiplos domínios não correlatos e ficou restrito ao núcleo `Recebedores + KYC`.

## Redução Observada De Flakiness

- Menor impacto de efeitos colaterais porque cada teste passa a provisionar a própria sessão.
- Menor dependência de ordem porque nenhum fluxo depende de dados criados em outro arquivo.
- Menor contaminação entre desktop e mobile porque os projetos agora têm cobertura separada por arquivo.
- Menor risco de vazamento de cookies e `localStorage` porque o teste responsável pelo checkout limpa explicitamente o contexto antes de validar a rota pública.
- Menor custo de diagnóstico porque cada falha agora aponta para um domínio funcional menor.

## Estratégia De Validação Desta Rodada

- Executar cada novo arquivo com:
  - `--workers=1`
  - `--repeat-each=5`
  - `--retries=0`
- Não executar a suíte completa até todos os arquivos novos estabilizarem individualmente.

## Resultado Final Da Validação Isolada

- `qa-auth.spec.ts`: `10 passed`
- `qa-dashboard.spec.ts`: `5 passed`
- `qa-payment-links.spec.ts`: `5 passed`
- `qa-checkout.spec.ts`: `5 passed`
- `qa-transactions.spec.ts`: `5 passed`
- `qa-admin.spec.ts`: `5 passed`
- `qa-mobile.spec.ts`: `10 passed`
- Total da validação isolada desta rodada: `45 passed`, `0 failed`, `0 interrupted`
- A suíte completa permaneceu intencionalmente sem execução nesta etapa, conforme a estratégia de estabilização por domínio.
