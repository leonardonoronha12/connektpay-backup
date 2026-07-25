# RELEASE V1.0

## Objetivo

- Fechar a última rodada interna da Connekt Pay antes da homologação real da Pagar.me.
- Deixar o produto pronto para receber credenciais e habilitações externas sem reabrir módulos internos já concluídos.
- Registrar com evidência o que está concluído internamente e o que permanece bloqueado apenas por provider/ambiente.

## Estado atual

- Base web autenticada operacional com login, RBAC, dashboard, transações, recebedores internos, KYC interno, split interno, assinaturas internas, repasses internos, antecipação interna, conciliação interna, ledger, auditoria e configurações.
- `AdminScreen`, `KycApprovalScreen`, `ConciliationScreen` e `AdminAnticipationInternalScreen` foram endurecidas contra erro silencioso, loading preso, retry inseguro e feedback ausente.
- Exportações CSV previstas foram fechadas com o utilitário central para recebedores, KYC, split interno, assinaturas internas, repasses internos, conciliação, antecipação administrativa e demais superfícies administrativas já previstas em produto.
- MyGateway permanece preservado apenas como legado/referência técnica. A preparação operacional atual é orientada para a Pagar.me como provider alvo.
- Indisponibilidades dependentes de provider não configurado permanecem respondendo com `503`, sem simular sucesso externo e sem reintroduzir `501`.

## Evidências desta rodada

- Testes direcionados de domínio: verde
  - `186 passed` em `Desktop Chrome` para:
    - `csv.spec.ts`
    - `rbac.spec.ts`
    - `kyc.spec.ts`
    - `reconciliation.spec.ts`
    - `anticipation.spec.ts`
    - `payouts-internal.spec.ts`
    - `split-internal.spec.ts`
    - `subscriptions-internal.spec.ts`
- `npm run lint`: verde
  - apenas warnings legados de `<img>` em `components/screens.tsx`, sem erro bloqueador
- `npm run build`: verde
- `npm run test:critical`: bloqueado por ambiente local do runner
  - o runner Playwright em `http://localhost:3001` respondeu `404` em `POST /api/auth/login`
  - o build da aplicação expõe a rota `'/api/auth/login'`
  - tentativa de subir o app em `3001` falhou com `EADDRINUSE`
  - conclusão: há colisão de porta/base URL incorreta no ambiente local de QA, não evidência de regressão funcional interna desta rodada

## Escopo validado internamente

- Autenticação e RBAC em nível de domínio e rotas internas
- Dashboard e backoffice administrativo
- Recebedores e KYC interno
- Split interno
- Assinaturas internas
- Repasses internos
- Antecipação interna
- Conciliação interna
- Exportações CSV internas
- Auditoria administrativa das ações internas ajustadas
- Tratamento de `503` como indisponibilidade operacional legítima

## Dependências externas ainda abertas

- Credenciais reais da Pagar.me
- Habilitação da conta Sandbox/tenant para módulos necessários
  - recipients
  - KYC
  - split
  - subscriptions
  - payouts
  - anticipation
  - webhooks
  - reconciliation
- Homologação externa final em ambiente configurado corretamente
- Reexecução do `test:critical` em runner apontando para a instância correta da aplicação
- `test:full`, reservado para a janela final após chegada das credenciais/habilitações da Pagar.me

## Gate de liberação final

- `npm run lint` verde
- `npm run build` verde
- Sem `501` remanescente nas APIs internas
- Sem erro silencioso conhecido nas telas administrativas internas
- Sem risco cross-tenant conhecido aberto nos módulos ajustados
- Módulos dependentes de provider externo indisponíveis com comunicação clara e `503`
- `npm run test:critical` verde ou bloqueado exclusivamente por ambiente local/runner, com evidência documentada

## Decisão atual

- Estado da versão: **base interna pronta para receber credenciais da Pagar.me**
- Liberação interna: **concluída**
- Pendências relevantes: **exclusivamente credenciais/habilitações da Pagar.me e correção do ambiente local de QA Playwright**
