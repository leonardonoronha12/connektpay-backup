# CHECKLIST ENTREGA

## Base

- [x] `npm run lint` verde
- [x] `npm run build` verde
- [x] Specs direcionados dos módulos internos ajustados
  - `186 passed` na rodada de fechamento administrativo/interno
- [x] `npm run test:critical` executado nesta rodada
  - bloqueado exclusivamente por ambiente local do runner Playwright apontando para `http://localhost:3001`
  - evidência registrada: `POST /api/auth/login` retornando `404`, apesar de o build expor a rota e a porta `3001` estar ocupada (`EADDRINUSE`)
- [ ] `npm run test:critical` verde em ambiente local/configurado corretamente
- [x] Artefatos locais do Playwright fora do repositório por padrão em ambiente local
- [x] `test:changed`, `test:critical`, `test:full`, `test:homologation` e `test:production-smoke` disponíveis
- [ ] `test:full` executado na janela final de release

## Segurança

- [x] Matriz de segurança das APIs documentada em `API-SECURITY-MATRIX.md`
- [x] Risco cross-tenant conhecido fechado
- [x] Worker de eventos protegido por `CRON_SECRET`
- [x] Módulos dependentes da Pagar.me não configurada respondem com `503` e comunicação operacional clara
- [x] Módulos externos não homologados seguem bloqueados por feature flag, contrato ou habilitação de conta

## Produto

- [x] Login e logout operacionais
- [x] Dashboard operacional
- [x] Payment Links e checkout público preservados sem reabertura indevida nesta rodada
- [x] Recebedores internos operacionais
- [x] KYC administrativo interno operacional
- [x] Split interno operacional
- [x] Assinaturas internas operacionais
- [x] Repasses internos operacionais
- [x] Antecipação administrativa interna operacional
- [x] Conciliação interna operacional
- [x] Ledger interno operacional
- [x] Auditoria operacional
- [x] Configurações operacionais
- [x] Exportações CSV previstas nas telas administrativas/internas concluídas
- [x] Backoffice administrativo sem `501` conhecido na UI ou APIs internas
- [x] Backoffice administrativo sem botão morto conhecido nesta rodada

## Pendências exclusivas de ambiente/provider

- [ ] Credenciais reais da Pagar.me recebidas
- [ ] Habilitações da conta Pagar.me concluídas para recipients, KYC, split, subscriptions, payouts, anticipation, webhooks e reconciliation
- [ ] Runner local do QA crítico apontando para a instância correta da aplicação
- [ ] Smoke/homologação final executados com ambiente de release válido

## Pendências antes da liberação final

- [ ] Executar `test:full`
- [ ] Executar a checagem final de smoke/homologação conforme o ambiente de release
- [ ] Confirmar versão/commit candidata e artefatos finais de release
