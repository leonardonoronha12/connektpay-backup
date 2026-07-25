# FASE 2A - Preflight de Deploy

Data: 2026-07-13

## Escopo desta rodada

- sem alteracao de codigo funcional;
- sem alteracao de tabelas, colunas, dados, RLS ou constraints;
- alteracao controlada de um unico indice remoto para aderencia exata a migration local;
- sem reaplicacao de migration;
- sem deploy;
- sem qualquer comando de `db push`, rollback ou execucao manual de SQL de schema.

## 1. Conferencia do schema remoto vs migration local

Migration auditada:

- `supabase/migrations/20260710000001_phase2a_receivers_kyc_internal.sql`

### Itens confirmados no banco remoto

#### Tabela `public.kyc_documents`

Confirmado:

- tabela existente;
- colunas esperadas:
  - `id`
  - `organization_id`
  - `receiver_id`
  - `kyc_request_id`
  - `doc_type`
  - `storage_bucket` com default `kyc-documents`
  - `storage_path`
  - `original_filename`
  - `mime_type`
  - `size_bytes`
  - `created_at` com default `now()`
  - `checksum_sha256`
  - `status` com default `uploaded`
  - `deleted_at`
  - `deleted_by_profile_id`
- constraints confirmadas:
  - PK em `id`
  - FK para `organizations(id)`
  - FK para `receivers(id)`
  - FK para `kyc_requests(id)`
  - FK para `profiles(id)` em `deleted_by_profile_id`
- indices confirmados:
  - `kyc_documents_org_idx`
  - `kyc_documents_receiver_idx`
  - `kyc_documents_request_idx`
  - `kyc_documents_org_status_idx`
  - `kyc_documents_receiver_checksum_uq`
- RLS ativa: `true`
- FORCE RLS ativa: `true`
- policy confirmada:
  - `kyc_documents_all`
- bucket privado confirmado:
  - `storage.buckets.id = kyc-documents`
  - `public = false`

#### Tabela `public.receivers`

Confirmado:

- colunas esperadas:
  - `type`
  - `legal_name`
  - `email`
  - `phone`
  - `address` com default `'{}'::jsonb`
  - `internal_status` com default `'draft'::text`
  - `birth_date`
  - `trade_name`
  - `legal_responsible_name`
  - `legal_responsible_document`
  - `provider_status`
  - `provider_synced_at`
  - `provider_last_error`
  - `provider_last_error_at`
- indices confirmados:
  - `receivers_org_internal_status_idx`
  - `receivers_org_document_uq`
  - `receivers_org_provider_reference_uq`

#### Tabela `public.kyc_requests`

Confirmado:

- colunas esperadas:
  - `internal_notes`
  - `checklist` com default `'{}'::jsonb`
  - `reviewed_by_profile_id`
  - `provider_status`
  - `provider_last_error`
  - `provider_last_error_at`
- constraints confirmadas:
  - PK em `id`
  - FK para `organizations(id)`
  - FK para `receivers(id)`
  - FK para `profiles(id)` em `reviewed_by_profile_id`

### Divergencia encontrada e resolvida

#### Evidencia antes da alteracao

Pre-validacoes executadas:

- `created_at` confirmado em `public.kyc_requests`
  - tipo: `timestamp with time zone`
  - nulabilidade: `NO`
  - default: `now()`
- volume da tabela:
  - `count(*) = 14`
- definicao atual do indice antes da correcao:

```sql
CREATE INDEX kyc_requests_org_status_idx
ON public.kyc_requests USING btree (organization_id, status)
```

- dependencias schema-level do indice:
  - nenhuma dependencia encontrada em `pg_depend`
  - nenhuma constraint dependente do indice

Conclusao da pre-validacao:

- a tabela era pequena (`14` linhas);
- o bloqueio breve de `DROP/CREATE` era aceitavel;
- nenhuma alteracao de dados, colunas, constraints ou RLS era necessaria.

#### Estrategia adotada

A tentativa inicial com `CREATE INDEX CONCURRENTLY` foi descartada porque:

- `supabase db query --linked` executa em transacao;
- o PostgreSQL retornou:

```text
CREATE INDEX CONCURRENTLY cannot run inside a transaction block
```

Como a tabela tinha apenas `14` linhas, a estrategia final foi:

```sql
set lock_timeout = '5s';
set statement_timeout = '30s';
drop index public.kyc_requests_org_status_idx;
create index kyc_requests_org_status_idx
on public.kyc_requests (organization_id, status, created_at desc);
```

#### Evidencia depois da alteracao

Definicao remota confirmada apos a correcao:

```sql
CREATE INDEX kyc_requests_org_status_idx
ON public.kyc_requests USING btree (organization_id, status, created_at DESC)
```

Conclusao:

- o indice remoto agora corresponde exatamente ao SQL local da migration;
- nenhuma outra estrutura da Fase 2A foi alterada.

## 2. Historico remoto de migrations

Comando executado:

```bash
npx supabase migration list --linked
```

Estado atual:

- `20260710000001` foi reparada no historico remoto com status `applied`;
- `npx supabase migration list --linked` agora mostra:
  - `20260710000001 | 20260710000001`

Comandos deliberadamente **nao** executados:

- `supabase db push`
- reaplicacao da migration completa
- rollback
- qualquer alteracao adicional fora do indice divergente

## 3. Atualizacao do `.vercelignore`

Arquivo atualizado:

- `.vercelignore`

Entradas adicionadas:

```text
.next
test-results
screenshots
videos
traces
backups
playwright-report
coverage
*.webm
*.zip
*.har
*.trace
*.log
temp
tmp
test-results-*
Connekt Pay - Apresentação v1.0.0/04 - Evidências
```

Mantido fora do ignore por ser necessario ao build/runtime:

- `app`
- `components`
- `lib`
- `public`
- `supabase/migrations`
- configuracoes de Next/Vercel
- `package.json`
- `package-lock.json`

## 4. Medicao do pacote potencial de deploy

Comando executado:

```bash
powershell -ExecutionPolicy Bypass -File temp\measure_deploy_footprint.ps1
```

### Caminhos descartaveis confirmados como ignorados

- `.next` -> `780.11 MB`
- `node_modules` -> `531.00 MB`
- `backups` -> `0.04 MB`
- `test-results` -> `0.25 MB`
- `screenshots` -> `0.00 MB`
- `videos` -> `0.00 MB`
- `traces` -> `0.00 MB`
- `playwright-report` -> `0.51 MB`
- `coverage` -> `0.00 MB`
- `temp` -> `0.01 MB`
- `tmp` -> `0.00 MB`

Reducao estimada so com esses descartes:

- `1311.92 MB`

### Artefatos adicionais de evidencia revisados

- `Connekt Pay - Apresentação v1.0.0/04 - Evidências` -> `15.61 MB`
- `test-results-checkout-failed-20260624-173253` -> `0.05 MB`

Reducao incremental adicional estimada com esses dois descartes:

- `15.66 MB`

### Reducao total estimada apos a limpeza de upload

- `1327.58 MB`

### Maiores caminhos restantes no workspace

Mesmo apos ignorar o grosso do upload, os maiores caminhos locais revisados foram:

- `Connekt Pay - Apresentação v1.0.0` -> `15.79 MB`
- `docs` -> `5.29 MB`
- `components` -> `0.48 MB`
- `app` -> `0.28 MB`
- `lib` -> `0.23 MB`
- `supabase` -> `0.18 MB`

Observacao:

- `Connekt Pay - Apresentação v1.0.0` permaneceu no workspace, mas a subarvore de evidencias foi excluida do upload;
- `docs` nao foi ignorado integralmente para evitar remover documentacao que possa ser relevante ao projeto fora do escopo deste preflight.

## 5. Decisao desta rodada

- deploy: **nao executado**
- migration: **nao reaplicada**
- repair do historico: **executado com sucesso**

Resultado:

- o unico objeto divergente era `kyc_requests_org_status_idx`;
- o indice foi corrigido para aderencia exata ao SQL local;
- os dados da tabela permaneceram intactos (`14` linhas antes e depois);
- RLS/Force RLS permaneceram ativas em `kyc_documents`;
- o bucket `kyc-documents` permaneceu privado;
- com o schema aderente, o historico da migration foi reparado com seguranca.

## 6. Proximo passo recomendado

Antes da unica tentativa de deploy apos a liberacao da Vercel:

1. aguardar a liberacao do limite da Vercel;
2. manter a sequencia unica ja combinada:
   - `npm run test:kyc`
   - `npm run lint`
   - `npm run build`
   - `npx vercel deploy --prod --yes`
3. executar a validacao obrigatoria em producao apos o deploy.
