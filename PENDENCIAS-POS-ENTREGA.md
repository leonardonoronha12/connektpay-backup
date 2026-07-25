# PENDENCIAS POS ENTREGA

## Pendências técnicas imediatas

- Executar `test:full` na janela final de release
- Executar smoke/homologação final no ambiente alvo
- Reexecutar `npm run test:critical` com o runner apontando para a instância correta da aplicação
  - nesta rodada o Playwright local recebeu `404` em `POST /api/auth/login` em `http://localhost:3001`
  - o build confirmou a rota existente e a porta `3001` estava ocupada por outro processo
- Consolidar `TEST-MATURITY.md` após a rodada completa de fechamento

## Pendências dependentes da Pagar.me

- Recebedores no provider
- KYC provider
- Split externo
- Assinaturas externas
- Repasses externos
- Antecipação externa
- Webhooks oficiais
- Reconciliação externa
- Pagamento avulso PIX/cartão com conta, contrato e habilitação confirmados
- Pix Automático

## Melhorias de engenharia pós-fechamento

- Migrar `next lint` para ESLint CLI, já que o comando está deprecado no Next 16
- Criar spec dedicada de ledger/financeiro se quisermos separar esse domínio do bloco de repasses/antecipação
- Consolidar o relatório final de maturidade da suíte determinística

## Itens deliberadamente não entregues nesta V1

- Novos PSPs
- Operações reais em módulos externos sem homologação
- Qualquer fallback que simule sucesso financeiro externo
