
# Connekt Pay

Aplicação Next.js (App Router) com banco e backend no Supabase.

## Rodar localmente

1. Instale dependências:

```bash
npm i
```

2. Configure as variáveis de ambiente:

Crie `.env.local` baseado em `.env.example`.

3. Rode o servidor:

```bash
npm run dev
```

## Deploy (produção)

Guia completo: [docs/DEPLOY.md](./docs/DEPLOY.md)

## Split

- Configuração de taxa da Connekt (por organização): tabela `pay_taxa_config` (valores em centavos e bps).
- Regras de split: endpoints internos `GET/POST /api/split-rules` e `PATCH/DELETE /api/split-rules/:id`.
- Persistência por transação: `pay_transacao` + `pay_split` (snapshot do cálculo) e `pay_ledger`/`ledger_entries` após pagamento aprovado.

## Testes

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

## Go-live

Checklist: [GO-LIVE-CHECKLIST.md](./GO-LIVE-CHECKLIST.md)

## Design

Figma (referência): https://www.figma.com/design/tv1kGT3ruc6a2ONpDfWCDM/Connekt-Pay-SaaS-Fintech-Design--c%C3%B3pia-.
