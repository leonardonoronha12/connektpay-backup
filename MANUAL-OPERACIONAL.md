# MANUAL OPERACIONAL

## Ambiente local

- Subir a aplicação:

```bash
npm run dev -- --hostname localhost --port 3001
```

- Base local esperada para testes:

```bash
BASE_URL=http://localhost:3001
```

## Comandos de teste

- Alterações correntes:

```bash
npm run test:changed -- caminho/do/arquivo.ts
```

- Cluster crítico:

```bash
npm run test:critical
```

- Suíte determinística completa:

```bash
npm run test:full
```

- Homologação externa:

```bash
npm run test:homologation
```

- Smoke de produção:

```bash
npm run test:production-smoke
```

## Quando usar cada camada

- `test:changed`: durante correções pontuais e trabalho diário
- `test:critical`: antes de consolidar bloco funcional
- `test:full`: somente na janela final de release
- `test:homologation`: somente com credenciais e ambiente próprios
- `test:production-smoke`: somente após deploy controlado

## Build e qualidade

```bash
npm run lint
npm run build
```

## Operação de eventos

- Worker automático:
  - rota: `/api/events/process-pending`
  - proteção: `Authorization: Bearer <CRON_SECRET>`
  - agendamento: `vercel.json`
- Reprocessamento manual:
  - painel de eventos
  - endpoint por evento em `/api/events/[id]/reprocess`

## Regras operacionais

- Não rodar a suíte completa após cada correção.
- Em ambiente local, os artefatos do Playwright devem permanecer fora do repositório.
- Não habilitar integrações externas não homologadas.
- Não tratar adapter como documentação oficial do provider.
