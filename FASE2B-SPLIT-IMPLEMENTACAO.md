# FASE 2B - Split Interno - Implementação

Data: 2026-07-13

## Objetivo entregue

Implementar a camada interna de Split da Connekt Pay, desacoplada da MyGateway, preparada para receber futuramente apenas um adapter de provider quando o contrato oficial estiver disponível.

## Escopo implementado

### Modelo interno

- Configuração interna de split com:
  - nome;
  - recebedor principal;
  - múltiplos recebedores;
  - percentual em basis points;
  - valor fixo em centavos;
  - prioridade;
  - vigência;
  - ativo/inativo;
  - observações internas.

### Banco

- Migration criada:
  - `supabase/migrations/20260713000002_phase2b_split_internal.sql`
- Estrutura adicionada:
  - tabela `split_configs`;
  - coluna `split_rules.split_config_id`;
  - índices e restrições para uso interno;
  - RLS e policy por organização.
- Compatibilidade preservada com:
  - Fase 1;
  - Fase 2A;
  - fluxo atual de `split_rules` em Links de Pagamento.

### Backend interno

- Serviço interno dedicado:
  - `lib/split-internal-core.ts`
  - `lib/split-internal-service.ts`
- APIs internas entregues:
  - `GET /api/split-configs`
  - `POST /api/split-configs`
  - `GET /api/split-configs/[id]`
  - `PATCH /api/split-configs/[id]`
  - `DELETE /api/split-configs/[id]`
  - `POST /api/split-configs/validate`
  - `POST /api/split-configs/simulate`

### Funcionalidades internas

- Criar regra/configuração de split.
- Editar configuração e regras.
- Excluir configuração.
- Listar configurações.
- Ativar e desativar configuração.
- Validar conflitos e dados inválidos.
- Simular distribuição sem criar pagamento real.

### Validações implementadas

- Bloqueio de percentual acima de 100%.
- Bloqueio de percentual negativo.
- Bloqueio de valor fixo inválido.
- Bloqueio de recebedor inexistente ou fora da organização.
- Bloqueio de recebedor sem KYC aprovado internamente.
- Bloqueio de regra duplicada.
- Bloqueio de conflito de vigência para o mesmo recebedor principal.
- Mensagens voltadas a usuário leigo na interface.

### Auditoria

- Registro de:
  - criação;
  - edição;
  - ativação;
  - desativação;
  - exclusão.
- A auditoria reutiliza a infraestrutura existente de `audit_logs`.

### UX

- Nova rota protegida:
  - `/split`
- Nova tela dedicada:
  - `components/split/SplitInternalScreen.tsx`
- Navegação, onboarding textual, alerts, checklist visual, ajuda contextual e toasts alinhados ao padrão atual da plataforma.
- Nenhuma alteração no fluxo atual de Payment Links.

### Feature flag

- Flag adicionada:
  - `SPLIT_PROVIDER_ENABLED`
- Comportamento adotado:
  - default seguro em `false`;
  - nenhuma chamada à MyGateway na Fase 2B.

## Arquivos principais

- `supabase/migrations/20260713000002_phase2b_split_internal.sql`
- `supabase/setup.sql`
- `lib/env.ts`
- `lib/split-internal-core.ts`
- `lib/split-internal-service.ts`
- `app/api/split-configs/route.ts`
- `app/api/split-configs/[id]/route.ts`
- `app/api/split-configs/validate/route.ts`
- `app/api/split-configs/simulate/route.ts`
- `components/split/SplitInternalScreen.tsx`
- `app/(app)/split/page.tsx`
- `components/layout/Sidebar.tsx`
- `components/layout/AppShell.tsx`
- `lib/rbac.ts`
- `tests/split-internal.spec.ts`
- `tests/split-internal-service.spec.ts`

## Decisões de isolamento

- Não integrar com a MyGateway nesta fase.
- Não inventar payload, contrato ou adapter externo.
- Não executar pagamento real.
- Não alterar:
  - Payment Links existentes;
  - Recebedores/KYC;
  - Assinaturas;
  - Antecipação;
  - Repasses;
  - Dashboard fora do necessário ao novo menu/tela.

## Ajustes de engenharia nesta rodada

- A aplicação do SQL remoto foi feita de forma isolada via CLI `supabase db query --linked --file`, seguida de `migration repair`, para evitar empurrar migrations antigas pendentes no histórico remoto.
- O serviço `split-internal-service` foi ajustado para usar carregamento lazy das dependências de auditoria/taxa e ficar testável fora do bundler do Next.
- O pacote `server-only` foi instalado no workspace, pois já era referenciado por múltiplos serviços do projeto.
