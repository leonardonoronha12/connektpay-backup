# Smoke Tests — Connekt Pay

## Automatizados (Playwright)

Rodar contra produção:

```bash
set BASE_URL=https://connektpay.vercel.app
npx playwright test
```

O que valida:
- Redirect de tela protegida sem sessão
- API pública sem API key
- API pública com API key inválida
- Webhook sem assinatura / assinatura inválida
- MyGateway sem credenciais (erro controlado)

Arquivo: [smoke.spec.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/tests/smoke.spec.ts)

## Testes MyGateway (Playwright, unit/integration com mocks)

```bash
npm run test:mygateway
```

Arquivo: [mygateway.spec.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/tests/mygateway.spec.ts)

## Testes Split (Playwright, unit com cálculo em centavos)

```bash
npm run test:split
```

Arquivo: [split.spec.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/tests/split.spec.ts)

## Testes Recorrência (Playwright, unit de core)

```bash
npm run test:recurrence
```

Arquivos: [recurrence.spec.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/tests/recurrence.spec.ts), [pix-auto.spec.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/tests/pix-auto.spec.ts)

## Testes KYC (Playwright, unit de validação CPF/CNPJ)

```bash
npm run test:kyc
```

Arquivo: [kyc.spec.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/tests/kyc.spec.ts)

## Testes Payouts/Repasses (Playwright, unit de core)

```bash
npm run test:payouts
```

Arquivo: [payouts.spec.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/tests/payouts.spec.ts)

## Testes Notificações (Playwright, unit de templates)

```bash
npm run test:notifications
```

Arquivo: [notifications.spec.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/tests/notifications.spec.ts)

## Testes Dashboard (Playwright, unit de agregação)

```bash
npm run test:dashboard
```

Arquivo: [dashboard.spec.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/tests/dashboard.spec.ts)

## Testes Antecipação (Playwright, unit de core)

```bash
npm run test:anticipation
```

Arquivo: [anticipation.spec.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/tests/anticipation.spec.ts)

## Testes Conciliação (Playwright, unit de core)

```bash
npm run test:reconciliation
```

Arquivo: [reconciliation.spec.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/tests/reconciliation.spec.ts)

## Checklist Manual (produção)

- Autenticação
  - Login → dashboard → logout
  - Reset de senha (envio de e-mail + troca de senha)
- Autorização (RBAC)
  - Usuário sem perfil de admin não acessa `/admin/*`
  - Usuário sem perfil financeiro não acessa `/ledger`, `/antecipacao`, `/repasses`
- Webhooks
  - Enviar webhook real com assinatura válida (MyGateway)
  - Confirmar criação de `webhook_events` e processamento
- Pagamentos
  - Sem credenciais MyGateway: UI mostra “O provedor financeiro ainda não está configurado.”
  - Com credenciais MyGateway: criar pagamento PIX e cartão, confirmar atualização de `transactions` e `ledger_entries`
  - Com Split configurado: criar split rules, pagar e confirmar:
    - `pay_split` preenchida para a transação
    - `pay_transacao` com `connekt_fee_amount` e `provider_split_payload`
    - `ledger_entries` com `type=fee` e `type=split` após pagamento aprovado (via webhook ou retorno imediato)
- Recorrência
  - Criar plano em `/subscriptions/plans` e validar criação de `pay_plano` e `payment_links(type=recurring)`
  - Criar assinatura em `/subscriptions/new` e validar `pay_assinatura` + `pay_pagador`
  - Enviar webhook `recurring.charge.paid` e confirmar criação idempotente de `transactions` + snapshot (`pay_transacao`/`pay_split`) + `ledger_entries`
- Antecipação
  - Em `/antecipacao`, validar:
    - `POST /api/anticipation/simulate` retorna `availableCents`, `feeBpsDefault`
    - Solicitar antecipação cria `pay_antecipacao` e `pay_antecipacao_events`
  - Enviar webhook `anticipation.executed` e confirmar lançamentos no `ledger_entries` (idempotente) com `anticipation_request_id` apontando para `pay_antecipacao.id`
- Conciliação
  - Em `/admin/conciliacao`, executar conciliação e validar criação de `pay_conciliation_runs`, `pay_conciliation_items`, `pay_conciliation_events`
  - Garantir que itens não retornem `payload` sensível no frontend
  - Reprocessar item com `provider_reference` e confirmar atualização de `provider_status`/`provider_amount_centavos`
- Auditoria
  - Após cada ação crítica (criar link, criar pagamento, criar payout, KYC submit, conciliação), confirmar que existe linha correspondente em `audit_logs` com:
    - `origin` correto (`internal_api` ou `public_api`)
    - `actor_user_id` preenchido quando ação via sessão
    - `entity`, `entity_id`, `before`, `after`, `created_at`
