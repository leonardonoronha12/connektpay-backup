# Debug Session: playwright-stabilization

- Status: OPEN
- Objetivo: identificar a causa raiz compartilhada das falhas residuais da suíte Playwright e estabilizar a execução sem mascarar erros.

## Escopo atual

- `tests/menu-usuario-regression.spec.ts`
- `tests/ui-modal-stay-open.spec.ts`
- `tests/homologacao-rodada2.spec.ts`
- `tests/qa-e2e-audit.spec.ts`
- `tests/signup-onboarding.spec.ts`

## Hipóteses falsificáveis

1. O login UI não submete de fato em alguns fluxos porque o botão/handler muda de estado antes da captura de `POST /api/auth/login`.
2. O usuário E2E temporário é criado, mas o estado de autenticação não fica disponível ao navegador no tempo esperado por causa de sincronização entre Supabase/Auth e App Router.
3. Parte das falhas de menu por perfil vem de inconsistência na aplicação do cookie `cp_dev_role`/`cp_role` entre navegação inicial e hidratação do header.
4. As falhas de recebedores não são do backend; o teste está interagindo com o componente errado porque a UI usa prompt/dialog customizado e não um modal simples.
5. O `qa-e2e-audit` ainda carrega pressupostos antigos de storage state/login e por isso falha mesmo quando o backend responde `200`.

## Evidências já conhecidas

- Há logs locais com `POST /api/auth/login 200`, `POST /api/onboarding/ensure 200` e `GET /dashboard 200`.
- Há artefatos de falha onde o navegador permanece em `/login` sem cookies `sb-*` visíveis.
- A suíte já teve melhorias prévias em `tests/helpers/e2e-auth.ts`, mas permanece um bloco residual de falhas sistêmicas.
- Reexecução isolada de `qa-e2e-audit` mostrou ausência total de `POST /api/auth/login`; o navegador executou apenas `GET /login` e `GET /login?`, indicando submit nativo antes de o handler React ser observado nesse spec.
- Reexecuções isoladas de `menu-usuario-regression`, `ui-modal-stay-open` e `homologacao-rodada2` não falharam no fluxo validado; quebraram no `finally` por `TypeError` no helper `tests/helpers/e2e-auth.ts` ao chamar `.catch()` em query builders do Supabase.

## Próximos passos

1. Corrigir o helper de limpeza de credenciais temporárias.
2. Migrar `qa-e2e-audit` para o helper compartilhado `loginViaUi` e remover o fluxo legado inconsistente.
3. Revalidar subset mínimo.
4. Executar a suíte completa e classificar eventuais remanescentes.
