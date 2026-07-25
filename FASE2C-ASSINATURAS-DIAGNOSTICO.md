# FASE 2C - Assinaturas e Recorrencia Interna - Diagnostico

Data: 2026-07-13

## Objetivo

Preparar a camada interna de Assinaturas da Connekt Pay para operar com planos, clientes, simulacao, gestao e auditoria proprios, sem qualquer chamada a provider externo e sem alterar Payment Links, Recebedores/KYC, Split, Antecipacao ou Repasses.

## Estado atual encontrado

### O que ja existe

- Modelagem de recorrencia ja criada no banco com:
  - `pay_plano`;
  - `pay_pagador`;
  - `pay_assinatura`;
  - `pay_subscription_events`.
- Logica de recorrencia em `lib/subscription-core.ts`, com suporte a:
  - calculo de proxima cobranca;
  - MRR;
  - churn;
  - dunning.
- Servico de assinaturas em `lib/subscription-service.ts`, com suporte a:
  - criar plano;
  - listar planos;
  - atualizar plano;
  - criar assinatura;
  - listar assinaturas;
  - detalhar assinatura;
  - cancelar assinatura;
  - metricas.
- APIs ja existentes em:
  - `app/api/plans/route.ts`;
  - `app/api/plans/[id]/route.ts`;
  - `app/api/subscriptions/route.ts`;
  - `app/api/subscriptions/[id]/route.ts`;
  - `app/api/subscriptions/[id]/cancel/route.ts`.
- UX ja existente para listagem, detalhe e planos em:
  - `app/(app)/assinaturas/page.tsx`;
  - `app/(app)/subscriptions/plans/page.tsx`;
  - `app/(app)/subscriptions/new/page.tsx`;
  - `components/screens.tsx`.
- Auditoria base ja disponivel por `insertAuditLog()`.
- RBAC ja definido para o modulo de assinaturas em `lib/rbac.ts`.

### O que pode ser reaproveitado

- O nucleo puro de recorrencia em `lib/subscription-core.ts`.
- A modelagem base de:
  - `pay_plano`;
  - `pay_pagador`;
  - `pay_assinatura`;
  - `pay_subscription_events`.
- O padrao de auditoria via `insertAuditLog()`.
- O padrao de UX usado na plataforma:
  - `Notice`;
  - `emitAppToast()`;
  - `EmptyState`;
  - `KpiCard`;
  - `Modal`;
  - tabelas e estados vazios.
- O padrao de isolamento adotado na Fase 2B:
  - nova tela dedicada;
  - novos endpoints internos;
  - nova feature flag;
  - nao tocar em fluxos antigos aprovados.

### O que esta acoplado ao provider e nao deve ser reaproveitado diretamente

- `createPlan()` em `lib/subscription-service.ts` cria `payment_link` recorrente automaticamente.
- `createSubscription()` em `lib/subscription-service.ts`:
  - tokeniza cartao;
  - busca provider por `getAcquirerProvider()`;
  - calcula split para provider;
  - cria assinatura externa real.
- `POST /api/subscriptions` retorna `501` sem provider configurado.
- `PATCH /api/subscriptions/[id]` esta stubado e nao entrega gestao operacional interna.
- O webhook de recorrencia continua preparado para eventos externos reais.

Conclusao:

- O motor interno pode ser reaproveitado.
- O fluxo operacional atual nao pode ser a base da Fase 2C, porque ele continua centrado em provider e cobranca real.

## Lacunas objetivas da Fase 2C

### Planos

Hoje `pay_plano` nao cobre integralmente o escopo pedido. Faltam campos internos claros para:

- moeda;
- quantidade de cobrancas;
- recorrencia infinita;
- data de inicio;
- data de termino;
- observacoes.

Tambem existe acoplamento indevido com `payment_link_id`, embora esse campo seja opcional.

### Clientes e assinaturas

Hoje `pay_assinatura` cobre parte da estrutura, mas faltam campos e semantica interna claros para:

- data de adesao explicita;
- pausa/reativacao/cancelamento interno com rastreio objetivo;
- expirar por fim de vigencia;
- motivo ou observacoes internas;
- total de recorrencias contratadas e executadas;
- status internos completos exigidos nesta fase.

### Simulacao

Nao existe simulador visual interno de assinaturas mostrando:

- proxima cobranca;
- recorrencias futuras;
- calendario;
- estimativa de faturamento.

### Gestao operacional

Nao existe hoje uma camada interna completa para:

- duplicar plano;
- pausar assinatura;
- reativar assinatura;
- desativar/ativar internamente sem depender de provider;
- cancelar como fluxo interno puro.

### Flag dedicada

Nao existe `SUBSCRIPTIONS_PROVIDER_ENABLED=false` em `lib/env.ts`.

## Duplicacoes e limites atuais

### O que nao deve ser recriado

- Regras puras de calendario e recorrencia em `lib/subscription-core.ts`.
- Estrutura principal de banco de recorrencia.
- Componentes base de UI e padroes de feedback.

### O que precisa ser criado

- Camada interna desacoplada do provider:
  - servico interno de planos;
  - servico interno de assinaturas;
  - validacoes internas;
  - simulacao interna;
  - tela dedicada;
  - APIs internas proprias.
- Ajustes minimos de schema para representar o escopo faltante sem inventar contrato externo.

## Necessidade de migration

### Conclusao objetiva

Migration necessaria: **SIM**

### Justificativa

Embora o projeto ja possua tabelas de recorrencia, a modelagem atual nao cobre integralmente a Fase 2C como modulo interno. Faltam campos persistidos para o escopo pedido pelo usuario, especialmente em planos e na operacao interna da assinatura.

Sem migration, ficariam sem representacao adequada no banco:

- moeda do plano;
- quantidade limite de cobrancas;
- recorrencia infinita;
- inicio e fim de vigencia do plano;
- observacoes internas do plano;
- data de adesao interna da assinatura;
- estado de pausa/reativacao com rastreabilidade clara;
- controle de recorrencias executadas;
- observacoes internas da assinatura.

### Estrategia recomendada

- Reaproveitar `pay_plano` e `pay_assinatura` como base.
- Adicionar somente os campos faltantes para a camada interna.
- Nao remover nem remodelar o que ja existe para evitar regressao.
- Nao criar qualquer tabela ou contrato de provider.
- Manter `payment_link_id` apenas como legado/opcional, sem uso na Fase 2C interna.

## Arquivos e areas impactadas

### Banco

- `supabase/migrations/*`
- `supabase/setup.sql`

### Backend

- `lib/env.ts`
- novos servicos internos de assinaturas em `lib/*`
- novas rotas internas em `app/api/*`

### Frontend

- nova rota protegida para o modulo interno
- navegacao em `components/layout/Sidebar.tsx`
- metadados de pagina em `components/layout/AppShell.tsx`
- nova tela dedicada de Assinaturas Internas

### Testes

- `tests/*`

## Requisitos internos confirmados

### Status internos obrigatorios

O modulo deve padronizar:

- `draft`
- `active`
- `trial`
- `scheduled`
- `paused`
- `cancelled`
- `expired`
- `payment_pending`
- `payment_failed`
- `provider_pending`
- `provider_synced`

### Regra critica

- Nunca marcar `provider_synced` sem integracao real.

### Escopo de RBAC recomendado

Gestao do modulo:

- `owner`
- `admin`
- `super_admin`

Consulta operacional:

- `financeiro`

Perfis fora desse conjunto nao devem conseguir criar, editar, pausar, reativar, cancelar ou excluir registros.

## Riscos de regressao

### Riscos tecnicos

- Reaproveitar `createPlan()` como esta reabre o acoplamento com `payment_links`.
- Reaproveitar `createSubscription()` como esta reabre tokenizacao, split para provider e cobranca real.
- Alterar as rotas antigas existentes pode quebrar o modulo legado de assinaturas ja publicado.
- Misturar a Fase 2C interna com webhook/provider pode gerar marcacao incorreta de `provider_synced`.

### Estrategia de mitigacao

- Isolar a Fase 2C em:
  - nova flag;
  - novos endpoints internos;
  - novo servico interno;
  - nova tela dedicada.
- Reaproveitar somente o que for puro e interno.
- Nao disparar webhook, cobranca, retry ou provider nesta fase.

## Decisao de implementacao

### Sera criado

- modelo interno de planos e assinaturas sobre a base atual;
- APIs internas de:
  - criar;
  - editar;
  - duplicar plano;
  - listar;
  - ativar;
  - desativar;
  - pausar;
  - reativar;
  - cancelar;
  - simular;
- simulador visual;
- auditoria de plano e assinatura;
- feature flag `SUBSCRIPTIONS_PROVIDER_ENABLED=false`;
- testes da camada interna.

### Nao sera criado nesta fase

- integracao com MyGateway;
- cobranca real;
- webhook externo;
- retry externo;
- novos contratos de provider;
- alteracao de Payment Links;
- alteracao de Recebedores/KYC;
- alteracao de Split, Antecipacao ou Repasses.

## Conclusao

- O projeto ja possui uma base de recorrencia reutilizavel.
- A Fase 2C nao deve reutilizar o fluxo atual que cria cobranca real ou depende de provider.
- A migration e necessaria para completar a representacao interna pedida.
- A implementacao recomendada e uma camada interna isolada, apoiada no schema existente e preparada para receber um adapter oficial no futuro.
