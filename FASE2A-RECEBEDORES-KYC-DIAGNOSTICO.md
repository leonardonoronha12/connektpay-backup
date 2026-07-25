# FASE2A-RECEBEDORES-KYC-DIAGNOSTICO

Data: 2026-07-10
Escopo: auditoria inicial obrigatória da Fase 2A

## Objetivo

Implementar somente a camada interna de Recebedores e KYC, sem inventar endpoints da MyGateway, sem chamadas externas reais e sem quebrar a Fase 1.

## Resumo executivo

O projeto **já possui** uma base funcional de Recebedores e KYC:

- tabelas `receivers`, `kyc_requests`, `kyc_documents` e `audit_logs`
- rotas internas para cadastro, edição, criação de KYC, decisão, upload e listagem de documentos
- telas operacionais de Recebedores e Aprovação KYC
- bucket privado para documentos
- geração de URLs assinadas
- `provider_reference` já previsto no modelo
- adapter formal `AcquirerProvider -> MygProvider`

O problema não é ausência total de módulo. O problema é que a implementação atual está **incompleta para o ciclo interno robusto** e possui lacunas de:

- modelagem de dados PF/PJ
- padronização de status
- integridade por organização
- segurança e validação de upload
- clareza de UX sobre aprovação interna vs integração futura com MyGateway
- preparação do adapter para Recebedores/KYC sem chamadas reais ao provider

## O que já está pronto

### Banco de dados

- `public.receivers` já existe com:
  - `name`
  - `document`
  - `bank_account`
  - `kyc_status`
  - `status`
  - `provider_reference`
  - `type`
  - `legal_name`
  - `email`
  - `phone`
  - `address`
- `public.kyc_requests` já existe com:
  - `status`
  - `risk`
  - `submitted_at`
  - `reviewed_at`
  - `decision_reason`
  - `evidence`
- `public.kyc_documents` já existe com:
  - `receiver_id`
  - `kyc_request_id`
  - `doc_type`
  - `storage_bucket`
  - `storage_path`
  - `original_filename`
  - `mime_type`
  - `size_bytes`
- Bucket `kyc-documents` já existe e é privado
- As tabelas principais já usam RLS

### APIs

- `GET/POST /api/receivers`
- `PATCH /api/receivers/[id]`
- `GET/POST /api/kyc-requests`
- `PATCH /api/kyc-requests/[id]`
- `POST /api/kyc/upload`
- `GET /api/kyc-requests/[id]/documents`
- `GET/POST /api/public/receivers`

### Telas

- tela de Recebedores já existe
- tela de Aprovação KYC já existe
- modal de edição/cadastro já existe
- upload de documentos já existe
- preview básico de documentos já existe

### Auditoria

- criação e edição de recebedor já auditadas
- criação e decisão de KYC já auditadas
- upload de documento já auditado

### Provider Adapter

- a abstração `AcquirerProvider` já existe
- `submitKyc` já está reservado no contrato
- `MygProvider.submitKyc()` hoje retorna erro controlado `501`
- não existe chamada real de Recebedor/KYC para a MyGateway no fluxo atual

## O que está incompleto

### Modelo interno de Recebedor

Faltam campos importantes para suportar PF/PJ adequadamente sem sobrecarregar JSONs genéricos:

- PF:
  - data de nascimento
- PJ:
  - nome fantasia
  - responsável legal
  - CPF do responsável legal

Observação:

- endereço já consegue armazenar:
  - CEP
  - número
  - complemento
  - cidade
  - estado
- dados bancários já conseguem armazenar:
  - banco
  - agência
  - conta
  - dígito
  - chave PIX
- ainda falta padronizar:
  - tipo de conta

### Status internos

O projeto hoje mistura:

- `receivers.status` com semântica operacional simples
- `receivers.kyc_status` com semântica simplificada
- `kyc_requests.status` com semântica simplificada

Estado atual encontrado:

- `pending`
- `under_review`
- `approved`
- `rejected`
- `active`
- `blocked`

Problemas:

- não existe um ciclo interno completo do recebedor
- `types/kyc.ts` usa `review`, mas o runtime usa `under_review`
- a documentação também diverge em alguns pontos (`in_review`)

### KYC interno

O fluxo existe, mas ainda não cobre bem:

- checklist documental estruturado
- observações internas
- analista responsável
- data clara da análise
- histórico operacional consolidado na própria entidade
- distinção explícita entre aprovação interna e futura validação no provider

### Upload e documentos

O upload atual ainda não protege adequadamente:

- formatos permitidos
- tamanho máximo
- tipos de documento aceitos
- duplicidade lógica do mesmo arquivo
- nome seguro completo do arquivo
- remoção controlada
- auditoria de leitura de documento

### Integridade e segurança

Faltam validações importantes:

- garantir que `receiverId` pertence à organização da sessão em todas as rotas de KYC/upload
- restringir documentos ao `kyc_request_id` atual em vez de listar tudo por `receiver_id`
- alinhar permissões entre UI e API

### UX

As telas atuais ainda não deixam explícito para o usuário leigo que:

- o recebedor é quem receberá os valores
- a aprovação atual é interna da Connekt Pay
- a sincronização com a MyGateway ainda não está ativa
- o próximo passo do usuário depende do status interno

## O que está duplicado ou inconsistente

- status de KYC duplicados/inconsistentes entre:
  - runtime
  - tipos TypeScript
  - documentação
- APIs internas e públicas criam recebedor com comportamento parecido, mas sem camada comum de validação
- há deduplicação parcial de KYC aberto, mas não há proteção estrutural suficiente contra:
  - recebedores duplicados por CPF/CNPJ dentro da organização
  - `provider_reference` duplicado
- a UI já mostra parte do fluxo de KYC, mas a semântica ainda não acompanha a nova Fase 2A

## O que realmente precisa ser criado

### Banco

Criar apenas o que está realmente ausente:

- campos explícitos para completar PF/PJ
- um status interno de recebedor separado do status operacional atual
- metadados de revisão interna do KYC
- metadados de checklist/observação interna
- metadados de integridade/segurança do documento

### Backend

- camada comum de validação e sanitização para Recebedores/KYC
- validação de ownership por organização
- validação forte de upload
- feature flags para:
  - fluxo interno ativo
  - sync com provider desativado
  - KYC MyGateway desativado
- contratos internos futuros do provider sem chamadas reais

### Frontend

- evolução da tela de Recebedores sem refazer o módulo
- evolução da tela de Aprovação KYC sem trocar fluxo
- mensagens mais claras para usuário leigo
- status em português
- explicação explícita do que é interno e do que depende da MyGateway

### Testes

Criar testes focados em:

- PF
- PJ
- CPF/CNPJ inválidos
- obrigatoriedade de campos
- upload válido/inválido
- aprovação/reprovação internas
- RBAC por perfil
- isolamento por organização
- ausência de chamadas reais à MyGateway
- flags desativadas

## Estratégia de compatibilidade

Para não quebrar a Fase 1:

- `receivers.status` **não deve** ser reaproveitado para todo o novo ciclo interno, porque ele já impacta fluxos operacionais existentes
- `receivers.kyc_status` **não deve** perder compatibilidade com `approved`, pois isso afeta Split e outros fluxos existentes
- a solução mais segura é:
  - manter compatibilidade dos campos existentes
  - introduzir um status interno separado para o ciclo completo da Fase 2A

## Arquivos impactados

### Já existentes e que devem ser revisados

- `app/api/receivers/route.ts`
- `app/api/receivers/[id]/route.ts`
- `app/api/kyc-requests/route.ts`
- `app/api/kyc-requests/[id]/route.ts`
- `app/api/kyc/upload/route.ts`
- `app/api/kyc-requests/[id]/documents/route.ts`
- `app/api/public/receivers/route.ts`
- `components/screens.tsx`
- `components/ui/Badge.tsx`
- `types/kyc.ts`
- `lib/kyc-core.ts`
- `lib/env.ts`
- `lib/acquirer/provider.ts`
- `lib/acquirer/myg-provider.ts`

### Tabelas impactadas

- `public.receivers`
- `public.kyc_requests`
- `public.kyc_documents`
- `public.audit_logs`
- bucket `kyc-documents`

### Arquivos novos prováveis

- uma nova migration para completar o modelo interno
- helpers internos de Recebedor/KYC
- testes específicos da Fase 2A
- relatórios da implementação e QA

## Riscos de regressão

### Alto

- quebrar Split/Assinaturas se `kyc_status` deixar de usar a semântica compatível atual
- quebrar Payment Links indiretamente se recebedor aprovado deixar de ser interpretado como antes pelos fluxos existentes

### Médio

- abrir brecha multi-tenant se o ownership do recebedor não for validado no upload/KYC
- expor documentos errados se a consulta continuar filtrando só por `receiver_id`
- permitir anexos indevidos sem limite de tipo/tamanho

### Baixo

- divergência visual de badges/status
- mensagens ainda técnicas em alguns erros

## Decisão recomendada para a implementação

Implementar a Fase 2A assim:

1. preservar compatibilidade do que já funciona
2. adicionar somente os campos realmente ausentes
3. criar um `internal_status` do recebedor
4. fortalecer o KYC interno sem tocar em MyGateway real
5. preparar flags e contratos futuros do provider
6. endurecer upload, signed URLs e auditoria
7. atualizar UX e testes focados

## Veredito

- O módulo de Recebedores/KYC **não precisa ser refeito**
- O módulo **precisa ser consolidado**
- Existe necessidade real de **migration**, mas somente para os campos e metadados que hoje não existem
- A implementação da Fase 2A pode ser feita sem chamar a MyGateway e sem alterar Payment Links
