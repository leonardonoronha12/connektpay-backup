# FASE 2A - Recebedores e KYC Interno - Produção

Data: 2026-07-13

## Resumo executivo

- backup logico pre-migration: realizado;
- migration de banco: aplicada com sucesso no Supabase de producao;
- dados existentes: preservados;
- feature flags de integracao externa: mantidas desabilitadas;
- testes locais obrigatorios: aprovados;
- deploy corretivo em producao: concluido com sucesso;
- alias ativo homologado: `https://connektpay.vercel.app`;
- falhas iniciais de Recebedores PF/PJ e regressoes pontuais foram reproduzidas, diagnosticadas, corrigidas e revalidadas;
- resultado final desta rodada: Recebedores PF/PJ, KYC interno, seguranca documental e regressao da Fase 1 validados no alias de producao;
- nenhuma chamada real a MyGateway foi observada durante a re-homologacao final.

## 1. Backup e rollback

### Tabelas auditadas antes da alteracao

- `receivers`
- `kyc_requests`
- `kyc_documents`

### Artefatos de backup gerados

- `backups/phase2a-predeploy-receivers-dbquery.json`
- `backups/phase2a-predeploy-kyc_requests-dbquery.json`
- `backups/phase2a-predeploy-kyc_documents-dbquery.json`
- `backups/phase2a-predeploy-summary.json`

### Rollback

- rollback confirmado via politica de backup/PITR do Supabase;
- a migration foi endurecida para ser idempotente e preservar dados existentes;
- nenhum campo legado de `receivers.status`, `receivers.kyc_status` ou `kyc_requests.status` foi removido ou renomeado.

## 2. Migration aplicada em producao

Arquivo aplicado:

- `supabase/migrations/20260710000001_phase2a_receivers_kyc_internal.sql`

Confirmacoes objetivas registradas na rodada:

- campos novos de PF/PJ: presentes;
- `receivers.internal_status`: presente;
- campos de revisao KYC: presentes;
- metadados documentais em `kyc_documents`: presentes;
- indices e constraints da Fase 2A: presentes;
- RLS e FORCE RLS: mantidas ativas;
- bucket `kyc-documents`: privado;
- dados anteriores: preservados;
- `supabase/setup.sql`: mantido consistente com o schema consolidado esperado.

## 3. Feature flags e isolamento da MyGateway

Flags exigidas para producao:

- `RECEIVER_PROVIDER_SYNC_ENABLED=false`
- `MYGATEWAY_KYC_ENABLED=false`

Confirmacoes tecnicas desta rodada:

- nenhum endpoint novo da MyGateway foi inventado;
- nenhum contrato externo foi habilitado;
- o adapter continua retornando estado controlado de aguardando integracao;
- nenhuma evidência de chamada real a `mygateway` foi observada na homologacao automatizada da versao publicada;
- nenhum recebedor validado nesta rodada recebeu `provider_reference` ou `provider_synced`.

Referencias de codigo:

- `lib/env.ts`
- `lib/receiver-provider-sync.ts`

## 4. Testes executados

### Suite obrigatoria

```bash
npm run test:kyc
npm run lint
npm run build
```

Resultado:

- `npm run test:kyc`: `90 passed (2.1s)`
- `npm run lint`: sem erros
- `npm run build`: concluido com sucesso

## 5. Deploy da aplicacao

### Publicacao corretiva

- inspect URL: `https://vercel.com/leonardonoronha12-2214s-projects/connektpay/BGdRXQ16FM7nN4HSVYvkciqrwcbg`
- deployment URL: `https://connektpay-ca2h9pkjs-leonardonoronha12-2214s-projects.vercel.app`
- alias de producao: `https://connektpay.vercel.app`
- objetivo do redeploy: publicar somente as correcoes confirmadas apos o diagnostico forense da homologacao inicial.

## 6. Homologacao autenticada no alias atual

### Recebedor PF

Falha inicial reproduzida e corrigida:

- causa raiz confirmada: `PATCH /api/receivers/[id]` usava client de sessao enquanto `GET/POST` ja operavam com admin client quando a service role estava disponivel;
- correcao publicada: alinhamento do `PATCH` ao mesmo padrao de acesso usado nas demais rotas de Recebedores;
- arquivo corrigido: `app/api/receivers/[id]/route.ts`.

Revalidado em producao apos redeploy:

- criacao do recebedor PF: aprovada;
- edicao do cadastro PF: aprovada;
- persistencia apos fechar e reabrir o modal: aprovada;
- CPF: validado;
- data de nascimento: persistida;
- endereco: persistido;
- banco, agencia, conta e digito: persistidos;
- chave PIX: persistida;
- resposta da API de edicao: `PATCH 200`.

Conclusao PF:

- cadastro base: aprovado;
- edicao/persistencia: aprovadas;
- status final PF: **HOMOLOGADO**.

### Recebedor PJ

Falha inicial reproduzida e corrigida:

- mesma causa raiz do fluxo PF: assimetria entre o client usado em `PATCH /api/receivers/[id]` e os clients usados em listagem/criacao;
- correcao publicada no mesmo arquivo: `app/api/receivers/[id]/route.ts`.

Revalidado em producao apos redeploy:

- criacao do recebedor PJ: aprovada;
- edicao do cadastro PJ: aprovada;
- persistencia apos fechar e reabrir o modal: aprovada;
- CNPJ: validado;
- razao social: persistida;
- nome fantasia: persistido;
- responsavel legal: persistido;
- CPF do responsavel: persistido;
- endereco: persistido;
- dados bancarios: persistidos;
- resposta da API de edicao: `PATCH 200`.

Conclusao PJ:

- cadastro base: aprovado;
- edicao/persistencia: aprovadas;
- status final PJ: **HOMOLOGADO**.

### Fluxo de KYC interno

Validado em producao:

- upload real de documentos PF por `POST /api/kyc/upload`;
- listagem de documentos com `signed_url` temporaria;
- preview validado por `GET` da signed URL com resposta `200` e `content-type: image/png`;
- remocao real por `DELETE /api/kyc-documents/411e4dbf-e653-47de-88e0-85b292ddfbf9` com resposta `200`;
- queda da listagem de documentos de `4` para `3` apos remocao;
- aprovacao interna do KYC PF com fila mostrando `Aprovado / Aprovado internamente / Analista: Admin Demo`;
- reprovacao interna do KYC PJ com motivo `Documento de teste rejeitado na homologação E2E.`;
- auditoria visual de analista e status na fila administrativa.

Conclusao KYC:

- fluxo interno: **homologado**;
- upload, preview, remocao, aprovacao e reprovacao continuaram funcionando apos o redeploy corretivo.

### Evidencias

- `test-results/phase2a-prod-2026-07-13T17-59-32-254Z/phase2a-production-report.json`
- `test-results/phase2a-prod-2026-07-13T18-01-46-572Z/phase2a-production-report.json`
- revalidacao manual no alias `https://connektpay.vercel.app` apos o deployment corretivo publicado nesta rodada.

## 7. Segurança documental

Estado confirmado na base, no backend e no alias publicado:

- bucket de documentos privado;
- acesso via signed URL temporaria no backend;
- preview da signed URL validado com resposta `200`;
- remocao controlada por endpoint dedicado;
- redaction de dados bancarios e `storage_path` na auditoria;
- RLS ativa nas tabelas da Fase 2A;
- sem evidencia de exposicao publica permanente de documentos.

Seguranca adicional validada:

- `401` sem sessao em rotas protegidas;
- `401` em API publica sem API key e com API key invalida;
- ausencia de chamadas reais a MyGateway no frontend e nas APIs observadas durante a homologacao;
- filtros por `organization_id` mantidos nas APIs testadas.

Limites desta rodada:

- a prova negativa completa cross-tenant continuou limitada pela disponibilidade de um segundo tenant operacional, mas os filtros por `organization_id` e o comportamento observado permaneceram consistentes;
- o smoke RBAC no alias publicado nao mostrou regressao visivel para os perfis verificados nesta rodada.

## 8. Regressões e compatibilidade

### Falhas iniciais corrigidas

- `Assinaturas > Planos`: regressao corrigida com degradacao controlada quando o objeto de banco nao existe no ambiente remoto;
- `Split`: cancelamento revalidado sem navegacao indevida apos o ajuste de camada do modal;
- `Recebedores`: edicao/persistencia revalidadas com `PATCH 200`.

### Validado apos redeploy

- Dashboard: carregou com sucesso e `/api/dashboard` respondeu `200`;
- Links de Pagamento: tela e `/api/payment-links` responderam `200`;
- Split: `/api/split-rules` respondeu `200` e o modal se comportou corretamente;
- Assinaturas > Planos: `/api/plans` deixou de retornar `500` e passou a responder `200`;
- Recebedores: listagem e edicao responderam `200`;
- menu do usuario: comportamento OK;
- login: comportamento OK;
- RBAC smoke: comportamento OK nos fluxos revalidados;
- nenhuma chamada real a MyGateway foi observada nas rotas e recursos testados.

## 9. Pendencias exclusivas da MyGateway

- contrato oficial para `createRecipient`
- contrato oficial para `getRecipient`
- contrato oficial para `submitKyc`
- contrato oficial para `getKycStatus`
- homologacao de mapeamento de status externos
- regras oficiais de erro/retry/retorno dos modulos de recebedores e KYC

## 10. Conclusao desta rodada

- banco de producao: atualizado com sucesso;
- alias de producao: homologado apos deploy corretivo bem-sucedido;
- Recebedor PF: homologado;
- Recebedor PJ: homologado;
- KYC interno: homologado;
- documentos privados e signed URLs: homologados;
- chamadas reais a MyGateway: nao observadas;
- regressoes confirmadas na homologacao inicial: corrigidas e revalidadas;
- Fase 2A em producao: **pronta para continuidade controlada**, mantendo MyGateway desabilitado nesta etapa.
