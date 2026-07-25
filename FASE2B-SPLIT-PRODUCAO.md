# FASE 2B - Split Interno - Produção

Data: 2026-07-13

## Resumo executivo

A Fase 2B de Split Interno foi publicada em produção sem integração com a MyGateway, com migration aplicada no Supabase remoto, deploy na Vercel e homologação da rota `/split`.

## Banco de dados

### Migration aplicada

- arquivo:
  - `supabase/migrations/20260713000002_phase2b_split_internal.sql`

### Estratégia usada

- aplicação isolada do SQL remoto via:

```bash
npx supabase db query --linked --file "c:\Users\Leonardo\Desktop\ConnektPay\supabase\migrations\20260713000002_phase2b_split_internal.sql"
```

- registro no histórico via:

```bash
npx supabase migration repair --linked --status applied 20260713000002
```

### Verificações pós-migration

- `public.split_configs` existe no remoto;
- `public.split_rules.split_config_id` existe no remoto;
- a versão `20260713000002` consta em `supabase_migrations.schema_migrations`.

### Observação operacional

- a integração MCP do Supabase retornou `Invalid project ref: ConnektPay`;
- por segurança, a aplicação da migration foi concluída via Supabase CLI já vinculado ao projeto real de produção.

## Aplicação

### Pré-vôo

- `.vercelignore` revisado e compatível com o limite da Vercel Free:
  - `.next`
  - `test-results`
  - `playwright-report`
  - `coverage`
  - evidências e artefatos temporários

### Deploy

- deploy remoto concluído com sucesso para:
  - `https://connektpay.vercel.app`

## Homologação em produção

### Rota validada

- `https://connektpay.vercel.app/split`

### Resultado

- página abriu com o título `Split Interno`;
- módulo carregou sem redirecionamento indevido;
- sessão autenticada de QA estava ativa;
- interface exibiu:
  - configurações ativas;
  - recebedores elegíveis;
  - regras cadastradas;
  - simulador de distribuição.

### Rede observada

- chamadas internas observadas:
  - `/api/me`
  - `/api/split-configs`
  - assets `/_next/*`
- chamadas externas observadas:
  - Google Fonts
- chamadas à MyGateway:
  - nenhuma

## Resultado final de produção

- camada interna de Split publicada;
- simulador publicado;
- feature flag de provider mantida desabilitada;
- nenhuma execução financeira real;
- nenhuma chamada à MyGateway observada;
- sem regressões confirmadas nesta rodada.
