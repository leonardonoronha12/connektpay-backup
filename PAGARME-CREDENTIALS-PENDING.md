# Pagar.me Credentials Pending

## Objetivo

- Registrar o que ainda depende exclusivamente de credenciais, habilitações e ambiente válido para concluir a homologação real da Pagar.me.
- Separar claramente o que já está pronto internamente do que continua indisponível por dependência externa legítima.

## Base interna já concluída

- Backoffice administrativo interno fechado para:
  - recebedores
  - KYC administrativo
  - split interno
  - assinaturas internas
  - repasses internos
  - antecipação administrativa interna
  - conciliação interna
- Exportações CSV previstas nas telas administrativas/internas já conectadas ao utilitário central
- Tratamento de indisponibilidade externa com `503`, sem `501` residual conhecido nas APIs internas
- RBAC, proteção cross-tenant e auditoria mantidos nos fluxos administrativos internos ajustados

## Credenciais e configurações pendentes

- `FINANCIAL_PROVIDER=pagarme`
- `PAGARME_BASE_URL`
- `PAGARME_SECRET_KEY`
- `PAGARME_PAYMENT_LINKS_ENABLED=true` quando a conta estiver apta para a etapa correspondente
- `PAGARME_HOSTED_CHECKOUT_HOSTS` se a homologação exigir ajuste adicional de allowlist

## Habilitações de conta pendentes

- Recipients
- KYC
- Split / marketplace
- Subscriptions
- Payouts / repasses
- Anticipation
- Webhooks
- Reconciliation

## Comportamento esperado enquanto faltar configuração

- Capacidades não habilitadas devem continuar indisponíveis com mensagem clara para o operador
- A indisponibilidade deve seguir retornando `503` como condição operacional legítima
- Nenhum fluxo deve simular sucesso financeiro externo

## Evidência de bloqueio local de QA

- Nesta rodada, `npm run test:critical` não demonstrou regressão funcional interna.
- O bloqueio observado foi de ambiente local do runner:
  - `POST /api/auth/login` retornou `404` em `http://localhost:3001`
  - o build da aplicação confirmou a existência da rota
  - a porta `3001` estava ocupada por outro processo (`EADDRINUSE`)

## Passos exatos para retomar a Pagar.me

- Configurar as variáveis da Pagar.me no ambiente correto
- Confirmar as habilitações da conta Sandbox/tenant para os módulos necessários
- Subir a aplicação na porta/base URL usada pelo runner crítico ou ajustar `BASE_URL`
- Reexecutar `npm run test:critical`
- Validar os fluxos da Pagar.me por ordem:
  - autenticação/configuração
  - Payment Links / checkout
  - webhooks
  - recipients
  - KYC
  - split
  - subscriptions
  - payouts
  - anticipation
  - reconciliation
- Executar `npm run test:full` apenas na janela final de release
