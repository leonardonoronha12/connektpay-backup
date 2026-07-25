# FASE 2E - ANTECIPACAO INTERNA - DIAGNOSTICO

Data: 2026-07-14

## Objetivo da fase

Construir a camada interna de Antecipacao da Connekt Pay para futura conexao com o ProviderAdapter da MyGateway, sem:

- integrar com MyGateway;
- chamar APIs externas;
- inventar endpoints;
- alterar Recebedores;
- alterar KYC;
- alterar Split;
- alterar Assinaturas;
- alterar Repasses;
- alterar Dashboard fora do necessario.

## Estrutura existente

### Banco

- Ja existe a tabela `public.pay_antecipacao` com:
  - `organization_id`
  - `recebedor_id`
  - `requested_amount_centavos`
  - `available_amount_centavos`
  - `net_amount_centavos`
  - `fee_centavos`
  - `fee_bps`
  - `status`
  - `acquirer_anticipation_id`
  - `provider_reference`
  - `provider_payload`
  - `provider_status`
  - `provider_last_error`
  - `requested_at`
  - `approved_at`
  - `executed_at`
  - `canceled_at`
  - `created_at`
  - `updated_at`
- Ja existe a tabela `public.pay_antecipacao_events` para trilha de eventos.
- Ja existe a view de compatibilidade `public.anticipation_requests`.
- Ja existe `public.ledger_entries`, hoje usada para refletir efeito financeiro quando uma antecipacao e executada pelo fluxo externo.
- Ja existe `public.audit_logs`, com `before`, `after`, `actor_profile_id`, `actor_user_id`, `origin` e isolamento por organizacao.

### APIs

- Existe `GET /api/anticipation`, hoje usada para listagem por Financeiro.
- Existe `POST /api/anticipation`, hoje acoplada ao provider.
- Existe `POST /api/anticipation/simulate`, hoje usada para simulacao.
- Existe `GET /api/anticipation/[id]`, hoje retornando detalhe e eventos.
- Existe `POST /api/anticipation/[id]/cancel`, hoje ainda acoplada ao provider quando ha id externo.
- Existe `GET /api/admin/anticipation` e `POST /api/admin/anticipation`, hoje focadas em aprovacao simples.
- Existe `GET /api/anticipations` e `POST /api/anticipations` como camada legado/compat.

### Telas

- Existe a tela `/antecipacao`, hoje focada em simular e solicitar antecipacao.
- Existe a tela `/admin/anticipation`, hoje focada em aprovar solicitacoes.
- A UX atual ja mostra:
  - saldo disponivel;
  - valor antecipavel;
  - taxa aplicada;
  - valor liquido estimado;
  - historico;
  - cancelamento;
  - modal de simulacao.
- A UX atual ainda comunica fluxo em "Em breve" e cria fallback visual quando o provider nao esta configurado, o que contraria a exigencia de uma camada interna real e sem comportamento de ressuscitar simulacoes no lugar da operacao.

### Status atuais

- O modulo legado usa:
  - `pending`
  - `approved`
  - `processing`
  - `executed`
  - `failed`
  - `canceled`

### Auditoria atual

- O fluxo atual registra:
  - `REQUEST`
  - `APPROVE`
  - `CANCEL`
  - `STATUS_UPDATE` por webhook
- Os eventos ficam em `pay_antecipacao_events`.
- A trilha atual esta desenhada para o fluxo provider-first.

### Dependencias atuais

- O fluxo atual depende de:
  - `getAcquirerProvider()`
  - `isMyGatewayConfigured()`
  - webhooks externos
  - atualizacao de ledger quando a antecipacao e executada
- O dashboard ja consome `getAvailableAnticipationAmount(...)` para expor `anticipable_cents`.

## O que pode ser reaproveitado

### Infraestrutura reutilizavel

- `public.pay_antecipacao` como tabela base da antecipacao.
- `public.pay_antecipacao_events` para timeline e historico.
- `public.audit_logs` para a trilha obrigatoria da fase.
- `public.ledger_entries` apenas como fonte de leitura para saldo elegivel.
- `requireSessionOrgContext()` e `assertRole(...)` para RBAC.
- A rota `POST /api/anticipation/simulate` como endpoint natural do simulador.
- As rotas existentes de `anticipation` e `admin/anticipation` como superficie publica da fase, sem criar endpoints novos.
- Os componentes de UX ja existentes em `components/screens.tsx` como base visual.

### Infraestrutura que NAO deve ser reaproveitada diretamente

- O trecho de `requestAnticipation(...)` que chama `provider.anticipate(...)`.
- O trecho de `cancelAnticipation(...)` que chama `provider.cancelAnticipation(...)`.
- O fluxo de webhook de antecipacao para mover estado interno da fase.
- O debito em ledger quando a antecipacao vai para `executed`.
- O fallback da tela que registra "simulacao" no historico quando a API retorna `501`.

## O que esta faltando para a Fase 2E

### Modelo interno

Faltam, de forma objetiva:

- `eligible_amount_centavos` ou campo equivalente dedicado para saldo elegivel congelado na solicitacao;
- `effective_fee_bps` separado de `estimated_fee_bps`;
- `estimated_fee_bps` separado do valor efetivo;
- `estimated_fee_centavos` e/ou mapeamento explicito entre taxa estimada e taxa efetiva;
- `estimated_settlement_days` ou estrutura equivalente para prazo estimado;
- `scheduled_for` ou `expected_settlement_at` para data prevista;
- `paid_at` para data de pagamento da antecipacao interna;
- `rejected_at` para data de reprovacao;
- `rejection_reason` para motivo de reprovacao;
- `internal_notes` para observacoes internas;
- marcador de elegibilidade interno persistido ou snapshot suficiente da analise no momento da solicitacao.

### Status internos

Faltam os status da fase:

- `draft`
- `eligible`
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

Tambem falta o bloqueio explicito para nunca marcar:

- `provider_processing`
- `paid`

sem integracao real ativa.

### Fluxos

Falta uma camada interna coerente para:

- consultar elegibilidade por recebedor;
- solicitar antecipacao sem provider;
- aprovar;
- reprovar;
- cancelar;
- consultar historico detalhado;
- impedir alteracao apos estado final;
- simular sem depender de fallback de UX.

### Elegibilidade

O projeto ja possui dados para avaliar:

- saldo disponivel via ledger;
- recebedor ativo;
- KYC aprovado;
- bloqueio via `internal_status`;

mas nao possui uma regra interna consolidada da Fase 2E para:

- saldo elegivel;
- limites internos;
- duplicidade;
- solicitacao simultanea conflitante;
- disponibilidade por recebedor;
- snapshot da elegibilidade no momento da solicitacao.

### UX

Falta uma experiencia realmente interna com:

- onboarding explicando o que e antecipacao;
- simulador elegante com resumo e proximos passos;
- timeline de transicao;
- status em portugues coerentes com a fase;
- estados vazios educativos;
- alertas e toasts claros;
- mensagem obrigatoria:
  - `A antecipacao financeira sera habilitada apos a integracao com a MyGateway.`

### Feature flag

Falta a flag:

- `ANTICIPATION_PROVIDER_ENABLED=false`

Enquanto `false`, o sistema deve garantir:

- nenhuma chamada a MyGateway;
- nenhuma antecipacao real;
- nenhuma referencia externa inventada;
- nenhuma movimentacao financeira real;
- nenhuma dependencia de webhook externo para o fluxo interno.

### Auditoria

Falta cobrir todas as acoes obrigatorias da fase:

- `CREATE`
- `REQUEST`
- `APPROVE`
- `REJECT`
- `UPDATE`
- `CANCEL`
- `DELETE`

### Testes

Falta cobertura focada para:

- elegibilidade;
- solicitacao;
- aprovacao;
- reprovacao;
- cancelamento;
- simulacao;
- saldo insuficiente;
- duplicidade;
- organizacao;
- RBAC;
- auditoria;
- ausencia de chamadas a MyGateway.

## Riscos

### Risco alto

- Reaproveitar o fluxo atual de `POST /api/anticipation` quebraria a regra principal da fase, porque ele chama o provider.
- Reaproveitar o cancelamento atual manteria dependencia externa quando existir `acquirer_anticipation_id`.
- Reaproveitar o fluxo de webhook manteria o lifecycle da antecipacao dependente de eventos externos.
- Reaproveitar a execucao financeira atual manteria debito real em `ledger_entries`, o que e proibido na fase.

### Risco medio

- Adaptar a UX atual sem remover o fallback de simulacao pode continuar mascarando falhas reais como se fossem registros internos validos.
- Manter o modelo atual de status (`pending`, `approved`, `processing`, `executed`) limitaria o controle interno exigido pela fase.
- Alterar o dashboard fora do minimo necessario pode introduzir regressao em indicadores ja homologados.

### Risco baixo

- Reaproveitar as telas existentes como base visual tem baixo risco, desde que o dominio e as validacoes sejam isolados na camada interna.

## Recomendacao arquitetural

Decisao objetiva recomendada:

- NAO criar novos endpoints.
- Reaproveitar `pay_antecipacao` e `pay_antecipacao_events` como base do dominio.
- Introduzir uma camada interna nova no service e no core, semelhante ao padrao da Fase 2D.
- Adaptar as rotas existentes:
  - `GET /api/anticipation`
  - `POST /api/anticipation`
  - `POST /api/anticipation/simulate`
  - `GET /api/anticipation/[id]`
  - `POST /api/anticipation/[id]/cancel`
  - `GET /api/admin/anticipation`
  - `POST /api/admin/anticipation`
- Tratar o provider como desligado por feature flag.
- Impedir qualquer transicao para estados de provider ou pagamento real quando a flag estiver `false`.

## Necessidade de migration

Conclusao objetiva:

Migration necessaria: **SIM**

Justificativa:

- a estrutura atual nao cobre todos os campos exigidos pela Fase 2E;
- a camada interna precisa separar taxa estimada de taxa efetiva;
- a fase exige datas de reprovacao, pagamento e previsao que hoje nao existem integralmente;
- a fase exige observacoes internas, motivo de reprovacao e suporte a elegibilidade interna.

## Implementacao recomendada

Implementar somente o que estiver faltando:

- migration minima complementar em `pay_antecipacao`;
- novo core interno de antecipacao;
- refatoracao do service atual para fluxo provider-off;
- ajuste das rotas existentes sem inventar endpoints;
- ajuste das telas existentes para remover fallback enganoso e assumir fluxo interno real;
- testes focados;
- validacao com `lint`, `build`, deploy e homologacao.
