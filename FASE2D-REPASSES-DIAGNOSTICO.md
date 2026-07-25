# FASE 2D - REPASSES INTERNOS - DIAGNOSTICO

Data: 2026-07-13

## Objetivo da fase

Construir a camada interna de Repasses da Connekt Pay para futura conexao com o endpoint oficial de payout da MyGateway, sem:

- integrar com MyGateway;
- chamar APIs externas;
- executar movimentacao financeira real;
- alterar Recebedores/KYC;
- alterar Split;
- alterar Assinaturas.

## O que ja existe

### Tabelas

- Existe a tabela `public.payouts` com:
  - `organization_id`
  - `receiver_id`
  - `gross_amount`
  - `fee_amount`
  - `net_amount`
  - `status`
  - `scheduled_for`
  - `provider_reference`
  - `provider_payload`
  - `requested_at`
  - `paid_at`
  - `failed_at`
  - `canceled_at`
  - `provider_status`
  - `provider_last_error`
  - `provider_last_error_at`
- Existe a tabela `public.payout_events` para trilha de eventos do repasse.
- Existe `public.ledger_entries`, usada hoje para refletir impacto financeiro quando um repasse e marcado como `paid`.
- Existe `public.audit_logs`, com suporte a `before`, `after`, `origin`, `actor_profile_id` e `actor_user_id`.

### APIs

- Existe `GET /api/payouts`, hoje usada para listagem interna.
- Existe `POST /api/payouts`, hoje acoplada ao provider via `provider.createPayout(...)`.
- Existe `GET /api/payouts/[id]`, hoje retornando detalhes e eventos.
- Existe `PATCH /api/payouts/[id]`, hoje permitindo atualizacao manual de status.
- Existe `GET /api/public/payouts` e `POST /api/public/payouts`, ambos ainda acoplados ao provider.

### Telas

- Existe a tela `/repasses`, hoje ligada ao modulo legado de `payouts`.
- A tela atual ja mostra:
  - saldo disponivel vindo do ledger;
  - valor bruto, taxa e valor liquido;
  - conta destino do recebedor;
  - filtros por status;
  - exportacao CSV;
  - acao manual para marcar como liquidado.

### Status atuais

- O modulo legado usa:
  - `requested`
  - `processing`
  - `paid`
  - `failed`
  - `canceled`
  - `scheduled`

### Auditoria atual

- O fluxo legado grava auditoria `CREATE` e `UPDATE` em `audit_logs`.
- Os eventos ficam em `payout_events`.
- O webhook do provider tambem atualiza `payouts` e `payout_events`, mas a trilha esta desenhada para o fluxo externo.

### Simulacao atual

- Nao existe simulador interno dedicado de repasses.
- O calculo de taxa existente esta restrito a `calculatePayoutFee(...)`.

### Dependencias atuais

- O modulo legado depende de:
  - `getAcquirerProvider()`
  - `isMyGatewayConfigured()`
  - webhooks do provider
  - atualizacao de ledger ao marcar `paid`
- O modulo atual tambem depende da tela antiga em `components/screens.tsx`, que nao foi desenhada para o fluxo interno isolado da Fase 2D.

## O que pode ser reaproveitado

### Infraestrutura reutilizavel

- `public.payouts` e `public.payout_events` como base do modelo de repasse.
- `audit_logs` para trilha obrigatoria da fase.
- `requireSessionOrgContext()` e `assertRole(...)` para RBAC.
- `calculatePayoutFee(...)` como base do simulador de valor liquido.
- filtros, exportacao CSV e estrutura visual da tela atual como referencia de UX.

### Infraestrutura que NAO deve ser reaproveitada diretamente

- `POST /api/payouts` atual, porque chama provider.
- `POST /api/public/payouts` atual, porque chama provider.
- fluxo de webhook/eventos externos, porque a Fase 2D exige operacao 100% interna.
- regra atual que marca `paid` e debita ledger, porque a fase nao pode executar movimentacao financeira real.

## O que precisa ser criado ou ajustado

### Modelo interno

Faltam, de forma objetiva:

- snapshot dos dados bancarios usados no momento da solicitacao;
- `approved_at`;
- motivo de reprovacao;
- observacoes internas separadas do payload do provider;
- status internos novos da fase:
  - `draft`
  - `requested`
  - `under_review`
  - `approved`
  - `rejected`
  - `scheduled`
  - `provider_pending`
  - `provider_processing`
  - `paid`
  - `failed`
  - `cancelled`
- bloqueio explicito para nunca marcar `paid` ou `provider_processing` sem resposta real do provider.

### Backend interno

Precisa existir uma camada interna isolada que permita:

- criar solicitacao;
- revisar;
- aprovar;
- reprovar;
- cancelar;
- consultar historico;
- filtrar;
- exportar;
- simular valor liquido;
- validar duplicidade e conflito.

Essa camada deve operar sem:

- `provider.createPayout(...)`;
- webhooks externos;
- retries externos;
- `provider_reference` inventado.

### Validacoes faltantes no legado

O backend atual nao garante de forma suficiente:

- valor acima do disponivel;
- recebedor bloqueado;
- KYC interno aprovado;
- duplicidade;
- solicitacao simultanea conflitante;
- congelamento de alteracao apos estado final.

### UX faltante

Falta uma experiencia explicita de repasse interno com:

- onboarding;
- explicacao leiga do que e repasse;
- mensagem obrigatoria:
  - `O repasse real sera habilitado apos a integracao com a MyGateway.`
- status em portugues;
- empty states educativos;
- ajuda contextual;
- fluxo de simulacao sem repasse real;
- mascaramento de dados bancarios.

### Feature flag

Falta a flag:

- `PAYOUT_PROVIDER_ENABLED=false`

Enquanto `false`, o sistema deve garantir:

- nenhuma chamada real ao provider;
- nenhuma transferencia;
- nenhum `provider_reference` inventado;
- nenhum webhook externo executando fluxo do modulo interno.

### Testes faltantes

Precisa ampliar a cobertura para:

- solicitacao valida;
- valor invalido;
- saldo insuficiente;
- aprovacao;
- reprovacao;
- cancelamento;
- duplicidade;
- RBAC;
- organizacao;
- auditoria;
- ausencia de chamadas a MyGateway.

## Riscos de regressao

### Risco alto

- Reaproveitar diretamente `POST /api/payouts` quebraria a regra principal da fase, porque o endpoint chama `provider.createPayout(...)`.
- Reaproveitar a marcacao atual de `paid` geraria efeito em `ledger_entries`, o que contraria a exigencia de nao executar movimentacao financeira real.
- Misturar a Fase 2D com o fluxo legado publico de `payouts` pode manter chamadas externas ativas sem perceber.

### Risco medio

- Reutilizar a tela antiga `/repasses` sem isolamento pode expor status antigos, acoes de liquidacao e textos nao compatveis com a fase interna.
- Alterar o modulo legado sem camada separada aumenta risco de regressao em fluxos ja existentes de webhook, dashboard e API publica.

### Risco baixo

- O calculo de taxa pode ser reaproveitado desde que o simulador nao gere nenhuma acao financeira.

## Conclusao objetiva

- O projeto ja possui um modulo legado de `payouts`, mas ele esta acoplado ao provider e nao atende a Fase 2D.
- A Fase 2D nao deve reutilizar diretamente o fluxo atual que cria repasse real ou que atualiza ledger como pagamento efetivo.
- O reaproveitamento correto e:
  - base de tabela `payouts`;
  - tabela `payout_events`;
  - auditoria;
  - RBAC;
  - calculo de taxa;
  - padroes visuais da tela atual.
- Precisa ser criada uma camada interna isolada para repasses, com status internos, simulacao, historico e validacoes completas.

## Necessidade de migration

Conclusao objetiva:

Migration necessaria: **SIM**

Motivo:

- faltam campos para snapshot bancario, aprovacao, rejeicao e observacoes internas;
- os status internos da fase precisam ser representados de forma consistente;
- a estrutura atual nao cobre integralmente o ciclo interno pedido.
