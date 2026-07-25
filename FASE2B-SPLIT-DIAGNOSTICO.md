# FASE 2B - Split Interno - Diagnóstico

Data: 2026-07-13

## Objetivo

Preparar a camada interna de Split da Connekt Pay para operar com configuração, validação e simulação próprias, sem qualquer chamada à MyGateway e sem alterar os módulos já estabilizados da Fase 1 e da Fase 2A.

## Estado atual encontrado

### O que já existe

- Motor interno de cálculo em `lib/split-core.ts`, com suporte a:
  - percentual;
  - valor fixo;
  - prioridade;
  - arredondamento em centavos;
  - fallback para recebedor padrão;
  - taxa Connekt.
- Serviço de split em `lib/split-service.ts`, com suporte a:
  - carga de taxa;
  - leitura de regras;
  - leitura de recebedores;
  - persistência de snapshot em `pay_transacao` e `pay_split`;
  - materialização em `ledger_entries` e `pay_ledger`.
- CRUD parcial de regras em:
  - `app/api/split-rules/route.ts`
  - `app/api/split-rules/[id]/route.ts`
- Fluxo visual básico de split dentro de Links de Pagamento em `components/screens.tsx`.
- Estrutura de banco já existente:
  - `split_rules`
  - `pay_taxa_config`
  - `pay_transacao`
  - `pay_split`
  - `pay_ledger`
- Auditoria já disponível por `insertAuditLog()`.

### O que está incompleto para a Fase 2B

- Não existe conceito de configuracao interna de split como entidade própria.
- `split_rules` armazena linhas isoladas, mas não resolve bem:
  - recebedor principal;
  - validade da configuração;
  - observações internas;
  - ativação/desativação da configuração como conjunto.
- O split atual está fortemente orientado ao fluxo operacional de provider:
  - `createSplitPayloadForMyGateway()` exige `provider_reference`;
  - o fluxo público de pagamento retorna `501` sem provider;
  - a execução real do split continua acoplada ao contrato externo.
- Não existe simulador visual dedicado.
- Não existe API própria para:
  - validar uma configuração interna de split antes de salvar;
  - simular distribuição sem criar cobrança;
  - ativar/desativar uma configuração inteira.
- Não existe feature flag dedicada para o provider de split.

### O que não deve ser reaproveitado diretamente

- A dependência de `provider_reference` e payload de provider em `createSplitPayloadForMyGateway()`.
- O acoplamento do split operacional em:
  - `app/api/payments/route.ts`
  - `app/api/public/payments/route.ts`
  - `app/api/payment-links/route.ts`
  - `app/api/public/payment-links/route.ts`

Esses fluxos devem permanecer intactos nesta fase.

## Duplicações e limites atuais

### Duplicação funcional parcial

- O projeto já tem:
  - regras de split orientadas a cobrança/link;
  - snapshot de distribuição por transação.
- O que ainda não existe é:
  - um módulo interno de gestão e simulação de split como produto independente.

Conclusão:

- Não é necessário recriar o motor matemático.
- É necessário criar a camada de configuração interna e a experiência de uso.

## Necessidade de migration

### Conclusão objetiva

Migration necessária: **SIM**

### Justificativa

Hoje o banco não possui uma entidade que represente uma configuracao interna de split como conjunto. Sem isso, não há modelagem adequada para:

- recebedor principal;
- validade;
- observações internas;
- status ativo/inativo da configuração;
- agrupamento de múltiplas regras em uma configuração única.

### Estratégia recomendada

- Criar tabela de cabeçalho para a configuração interna de split.
- Reaproveitar `split_rules` como linhas da configuração, adicionando somente a referência necessária ao cabeçalho.
- Preservar compatibilidade com o uso atual de `split_rules` em Links de Pagamento.

## Arquivos e áreas impactadas

### Banco

- `supabase/migrations/*`:
  - nova migration da Fase 2B para configuração interna de split.

### Backend

- `lib/env.ts`
- novo serviço interno de split em `lib/*`
- novas rotas internas em `app/api/*`

### Frontend

- nova rota em `app/(app)/*`
- navegação em `components/layout/Sidebar.tsx`
- metadados de página em `components/layout/AppShell.tsx`
- nova tela de Split Interno

### Testes

- `tests/*`

## Requisitos internos confirmados

### Validações obrigatórias

O módulo deve impedir:

- percentual acima de 100%;
- percentual negativo;
- valor fixo inválido;
- recebedor inexistente;
- recebedor sem KYC interno aprovado;
- regra duplicada;
- conflito entre regras.

### Regras de elegibilidade do recebedor

Para Split Interno, o recebedor deve:

- pertencer à organização atual;
- estar ativo;
- ter KYC interno aprovado.

### Escopo de RBAC recomendado

Gestão do módulo:

- `owner`
- `admin`
- `super_admin`

Perfis fora desse conjunto não devem conseguir criar, editar, excluir, ativar ou desativar configurações.

## Riscos de regressão

### Riscos técnicos

- Reutilizar diretamente o fluxo antigo de `split-rules` pode reabrir dependência com provider.
- Alterar `split_rules` sem isolamento pode afetar Links de Pagamento.
- Misturar configurações internas novas com regras antigas sem cabeçalho tende a gerar conflito semântico.

### Estratégia de mitigação

- Isolar a Fase 2B em:
  - nova tabela de configuração;
  - novos endpoints;
  - nova tela;
  - nova flag.
- Não alterar a execução atual de pagamentos ou links nesta fase.

## Decisão de implementação

### Será criado

- modelo interno de configuração de split;
- APIs internas de:
  - criar;
  - editar;
  - excluir;
  - listar;
  - ativar;
  - desativar;
  - validar;
  - simular;
- simulador visual;
- auditoria de configuração;
- feature flag `SPLIT_PROVIDER_ENABLED=false`;
- testes da camada interna.

### Não será criado nesta fase

- integração com MyGateway;
- execução financeira real;
- alteração do fluxo atual de Payment Links;
- alteração de Recebedores/KYC;
- alteração de Assinaturas, Antecipação, Repasses ou Dashboard fora do necessário.

## Conclusão

- O núcleo matemático de split já existe e pode ser reaproveitado.
- A Fase 2B exige uma camada interna própria de produto e persistência.
- A migration é necessária para representar configuração interna de split de forma coerente e compatível com a base atual.
