# Connekt Pay

Plataforma SaaS de pagamentos white-label da Connekt Pay, construída com Next.js, Supabase e integração financeira orientada a Pix, cartão, assinaturas, split, ledger e webhooks.

## Arquitetura

- Checkout público interno da Connekt Pay.
- Integração com provedor financeiro via API, sem redirecionamento para checkout hospedado.
- Supabase como base transacional, autenticação e políticas de isolamento multi-tenant.
- Fluxos internos para pagamentos, assinaturas, split, repasses, antecipação, conciliação e auditoria.

## Stack

- Next.js App Router
- React 18
- TypeScript
- Supabase
- Playwright
- Vercel

## Rodar localmente

1. Instale as dependências:

```bash
npm install
```

2. Crie o arquivo local de ambiente a partir do exemplo:

```bash
copy .env.example .env.local
```

3. Preencha as variáveis necessárias em `.env.local`.

4. Rode o servidor:

```bash
npm run dev
```

## Testes e validações

```bash
npm run lint
npm run build
npm run test:smoke
npm run test:mygateway
npm run test:split
npm run test:recurrence
npm run test:anticipation
npm run test:reconciliation
npm run test:kyc
npm run test:payouts
npm run test:notifications
npm run test:dashboard
```

## Módulos principais

- Links de pagamento e checkout interno
- Pix e cartão
- Assinaturas e recorrência
- Split e recebedores
- Ledger e conciliação
- Repasses e antecipação
- KYC, auditoria e notificações

## Documentação

- Deploy: [docs/DEPLOY.md](./docs/DEPLOY.md)
- Migrações: [docs/SUPABASE-MIGRATIONS.md](./docs/SUPABASE-MIGRATIONS.md)
- Checklist de go live: [GO-LIVE-CHECKLIST.md](./GO-LIVE-CHECKLIST.md)
- Segurança: [docs/PRODUCTION-SECURITY.md](./docs/PRODUCTION-SECURITY.md)

## Split

- Configuração de taxa da Connekt por organização em `pay_taxa_config`.
- Regras de split via `GET/POST /api/split-rules` e `PATCH/DELETE /api/split-rules/:id`.
- Persistência por transação via `pay_transacao`, `pay_split`, `pay_ledger` e `ledger_entries`.

## Design

Figma de referência:
https://www.figma.com/design/tv1kGT3ruc6a2ONpDfWCDM/Connekt-Pay-SaaS-Fintech-Design--c%C3%B3pia-.
