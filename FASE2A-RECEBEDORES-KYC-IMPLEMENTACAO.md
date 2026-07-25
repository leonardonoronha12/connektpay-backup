# FASE 2A - Recebedores e KYC Interno - Implementacao

## Escopo executado

Esta etapa implementa apenas a camada interna de Recebedores e KYC da Connekt Pay.

Respeitado nesta entrega:

- nenhuma chamada real a APIs externas;
- nenhum endpoint inventado da MyGateway;
- nenhuma alteracao na integracao atual de Payment Links;
- nenhum escopo aberto para PIX, cartao, payout, antecipacao ou Pix Automatico;
- nenhuma alteracao de RBAC fora do necessario para o fluxo interno existente;
- nenhum deploy realizado.

## Arquivos alterados

### Regras internas e feature flags

- `lib/receiver-kyc.ts`
  - centralizacao dos status internos;
  - checklist documental por PF/PJ;
  - validacoes de e-mail, data, documento e upload;
  - redaction para auditoria;
  - labels em portugues para status e documentos.

- `lib/env.ts`
  - flags internas da Fase 2A:
    - `INTERNAL_RECEIVERS_FLOW_ENABLED`
    - `INTERNAL_KYC_FLOW_ENABLED`
    - `RECEIVER_PROVIDER_SYNC_ENABLED`
    - `MYGATEWAY_KYC_ENABLED`

- `.env.example`
  - flags adicionadas com valores seguros por padrao.

### Adapter do provider

- `lib/acquirer/provider.ts`
  - reaproveitamento da abstracao existente `AcquirerProvider`;
  - contratos futuros adicionados sem criar adapter paralelo:
    - `createRecipient`
    - `getRecipient`
    - `submitKyc`
    - `getKycStatus`

- `lib/receiver-provider-sync.ts`
  - contratos internos preparados para uso futuro;
  - retorno controlado de `awaiting_integration`;
  - bloqueio por feature flag;
  - nenhuma simulacao de aprovacao externa.

- `lib/acquirer/index.ts`
  - ajuste de tipagem para manter o provider aderente ao contrato `AcquirerProvider`.

### Banco de dados

- `supabase/migrations/20260710000001_phase2a_receivers_kyc_internal.sql`
  - adicionados somente campos ausentes confirmados na auditoria:
    - `receivers.internal_status`
    - `receivers.birth_date`
    - `receivers.trade_name`
    - `receivers.legal_responsible_name`
    - `receivers.legal_responsible_document`
    - `receivers.provider_status`
    - `receivers.provider_synced_at`
    - `receivers.provider_last_error`
    - `receivers.provider_last_error_at`
    - `kyc_requests.internal_notes`
    - `kyc_requests.checklist`
    - `kyc_requests.reviewed_by_profile_id`
    - `kyc_requests.provider_status`
    - `kyc_requests.provider_last_error`
    - `kyc_requests.provider_last_error_at`
    - `kyc_documents.checksum_sha256`
    - `kyc_documents.status`
    - `kyc_documents.deleted_at`
    - `kyc_documents.deleted_by_profile_id`
  - indices de deduplicacao e consulta interna.

- `supabase/setup.sql`
  - schema consolidado atualizado para refletir a mesma evolucao da migration.

### APIs internas

- `app/api/receivers/route.ts`
  - criacao de recebedor PF/PJ com normalizacao e validacao;
  - prevencao de duplicidade por documento na organizacao;
  - definicao inicial de `internal_status`;
  - auditoria com dados mascarados.

- `app/api/receivers/[id]/route.ts`
  - suporte completo aos campos PF/PJ;
  - validacao de CPF do responsavel legal;
  - recalculo de `internal_status`;
  - auditoria before/after com redaction.

- `app/api/kyc-requests/route.ts`
  - inicio da analise interna somente com perfil completo e documentos obrigatorios;
  - reaproveitamento do KYC pendente existente;
  - vinculacao de documentos pendentes ao request;
  - sincronizacao do status do recebedor.

- `app/api/kyc-requests/[id]/route.ts`
  - aprovacao e reprovacao internas;
  - `internal_notes`;
  - `reviewed_by_profile_id`;
  - `reviewed_at`;
  - sincronizacao do `kyc_status` e `internal_status` do recebedor;
  - auditoria.

- `app/api/kyc/upload/route.ts`
  - upload privado via backend;
  - validacao de tipo, MIME e tamanho;
  - checksum SHA-256;
  - prevencao de upload duplicado;
  - auditoria;
  - recalculo de `internal_status`.

- `app/api/kyc-requests/[id]/documents/route.ts`
  - listagem por `kyc_request_id`;
  - exclusao de arquivos removidos logicamente;
  - signed URLs temporarias;
  - trilha de auditoria de leitura.

- `app/api/kyc-documents/[id]/route.ts`
  - remocao controlada de documentos;
  - exclusao do arquivo no storage privado;
  - soft delete com auditoria.

- `app/api/public/receivers/route.ts`
  - alinhamento de validacao e normalizacao com a API interna;
  - prevencao de divergencia futura entre fluxos.

- `app/api/kyc-requests/route.ts`
  - enriquecimento da fila com dados do analista responsavel para a operacao interna.

### UI

- `components/ui/Badge.tsx`
  - suporte aos novos status internos em portugues.

- `components/screens.tsx`
  - `RecipientsScreen`
    - suporte completo a PF e PJ;
    - progresso da configuracao;
    - proximo passo em linguagem leiga;
    - mensagem explicita de aprovacao interna;
    - upload com tipos aceitos e limite informado;
    - recarregamento de documentos e status;
    - botao de inicio da analise interna para requests pendentes;
    - visualizacao de documentos enviados quando houver signed URL;
    - correcao do trecho quebrado no `map` dos documentos.
  - `KycApprovalScreen`
    - mensagem explicita de aprovacao interna da Connekt Pay;
    - checklist resumido de cadastro e documentos;
    - exibicao de analista e motivo quando concluido;
    - recarga da fila apos acoes de analise;
    - preview seguro via signed URL.

- `types/kyc.ts`
  - alinhamento de `under_review` com o runtime real.

### Ajustes finais antes da publicacao

- `components/screens.tsx`
  - reexposto o botao de persistencia do modal principal de Recebedores/KYC usando a funcao `saveReceiver` ja existente;
  - alinhada a copy mandatória da Fase 2A para deixar explicito:
    - `Esta analise e interna da Connekt Pay.`
    - `A sincronizacao com a MyGateway sera habilitada apos a integracao com o provedor.`

- `lib/receiver-kyc.ts`
  - atualizadas as mensagens educativas compartilhadas para refletir exatamente o posicionamento interno exigido para a Fase 2A.

## Comportamentos implementados

### Recebedores internos

- cadastro e edicao com campos de PF e PJ;
- validacao de CPF/CNPJ;
- validacao de e-mail e telefone;
- endereco estruturado;
- dados bancarios com sanitizacao;
- chave PIX interna;
- deduplicacao por documento dentro da organizacao;
- isolamento por `organization_id`.

### KYC interno

- documentos obrigatorios por tipo de recebedor;
- upload seguro em bucket privado;
- signed URLs temporarias para visualizacao;
- status internos em portugues;
- inicio de analise apenas quando o cadastro estiver completo;
- aprovacao e reprovacao internas;
- rastreio de quem analisou e quando analisou;
- remocao controlada de documentos.

### Auditoria e seguranca

- logs de criacao, edicao, upload, leitura e exclusao;
- mascaramento de documentos e dados bancarios;
- sem armazenamento de segredos no frontend;
- sem aprovacao externa simulada;
- sem sincronizacao com provider enquanto as flags estiverem desabilitadas.

## Migration

- Migration criada: `SIM`
- Justificativa:
  - a auditoria inicial confirmou ausencia real de campos necessarios para a Fase 2A;
  - a migration foi mantida enxuta e limitada ao modelo interno de Recebedores/KYC;
  - nenhum campo de contrato externo da MyGateway foi inventado.

## O que NAO foi feito nesta etapa

- nenhum endpoint real da MyGateway foi implementado;
- nenhuma sincronizacao de recebedor com provider foi habilitada;
- nenhum envio de KYC para provider foi habilitado;
- nenhuma aprovacao externa foi simulada;
- nenhum contrato externo da MyGateway foi inventado.

## Rodada de producao controlada

- a migration de banco foi aplicada em producao e validada separadamente nesta rodada;
- os ajustes finais de UI/copy ficaram prontos localmente, passaram em `npm run test:kyc`, `npm run lint` e `npm run build`;
- a publicacao da versao corrigida em producao foi bloqueada por rate limit da Vercel (`api-upload-free`);
- por esse motivo, o alias de producao permaneceu apontando para o deployment anterior:
  - `dpl_BMh9vQXVRRXCqEeFM92S7zodJPwQ`
  - `https://connektpay-6nrrtr27l-leonardonoronha12-2214s-projects.vercel.app`
  - alias: `https://connektpay.vercel.app`

## Dependencias exclusivas da MyGateway

- contrato oficial para `createRecipient`;
- contrato oficial para `getRecipient`;
- contrato oficial para `submitKyc`;
- contrato oficial para `getKycStatus`;
- mapeamento homologado de status externos;
- regras oficiais de erro, retries e retorno para recebedores/KYC.
