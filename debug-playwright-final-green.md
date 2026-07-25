# Debug Session: playwright-final-green

- Status: OPEN
- Objetivo: levar a suíte Playwright a `0 failed` e `0 interrupted` sem mascarar erros e corrigindo apenas o necessário.

## Escopo atual

- `tests/homologacao-rodada2.spec.ts`
- `tests/qa-e2e-audit.spec.ts`
- `tests/signup-onboarding.spec.ts`
- `app/api/dashboard/route.ts`
- `lib/anticipation-service.ts`

## Hipóteses falsificáveis

1. O `500` em `/api/dashboard` ocorre por dependência opcional de dados/tabelas não resiliente no ambiente E2E.
2. O fluxo de `Payment Links` falha por interceptação real de clique pelo checklist/assistant, e não por lentidão arbitrária.
3. O cenário `Checkout público` já aceita um erro controlado do provider, mas o harness ainda contabiliza esse ruído como falha global.
4. Há pelo menos uma expectativa desatualizada restante em `qa-e2e-audit` ou `homologacao-rodada2`.
5. Parte da instabilidade residual depende de configuração de ambiente (`BASE_URL`/projeto) e não de regressão funcional.

## Evidências conhecidas

- `http://127.0.0.1:3001/login` responde `200`
- `http://localhost:3000/login` não está disponível
- `tests/signup-onboarding.spec.ts` passou isolado
- `qa-e2e-audit` ainda falha em `Dashboard`, `Payment Links` e consolidação do `Checkout público`
- `homologacao-rodada2` recebeu correção de seletor ambíguo com `.first()`, pendente de revalidação consolidada

## Próximos passos

1. Revalidar `Checkout público` após o filtro específico de ruído esperado.
2. Reproduzir `Payment Links` com foco na interceptação do overlay.
3. Isolar a causa raiz do `500` em `/api/dashboard`.
4. Reexecutar `qa-e2e-audit` completo.
5. Reexecutar a suíte completa e gerar `TEST-MATURITY.md` somente após verde real.
