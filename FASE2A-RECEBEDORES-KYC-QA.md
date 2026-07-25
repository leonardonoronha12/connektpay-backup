# FASE 2A - Recebedores e KYC Interno - QA

## Escopo validado

Validacao executada apenas em ambiente local, sem deploy.

Objetivos desta rodada:

- confirmar integridade do fluxo interno de Recebedores e KYC;
- confirmar ausencia de chamadas reais a MyGateway;
- garantir compatibilidade com a Fase 1;
- validar tipagem, lint e build apos as alteracoes.

## Comandos executados

### Testes focados

```bash
npm run test:kyc
```

Resultado:

- `90 passed (2.1s)`

Cobertura adicionada nesta rodada:

- validacao de CPF;
- validacao de CNPJ;
- inferencia PF/PJ;
- perfil PF completo;
- perfil PJ completo;
- CPF invalido;
- checklist documental PF/PJ;
- upload valido;
- upload invalido;
- ciclo interno de status;
- labels internas em portugues;
- flags internas ativadas/desativadas por padrao.

Observacao:

- a tentativa inicial de importar diretamente o adapter server-only no teste foi descartada, porque o runner do Playwright nao resolve `server-only` fora do pipeline do Next;
- a comprovacao de que nao ha chamada real a MyGateway nesta fase fica sustentada pelo proprio contrato em `lib/receiver-provider-sync.ts`, pelas flags desligadas por padrao e pela ausencia de qualquer execucao remota nesta rodada local.

### Lint

```bash
npm run lint
```

Resultado:

- `OK`
- sem warnings;
- sem erros de ESLint.

### Build

```bash
npm run build
```

Resultado:

- `OK`
- build de producao concluido com sucesso;
- validacao de tipos concluida com sucesso;
- rotas de Recebedores/KYC compiladas normalmente.

## Ajustes feitos durante a QA

### Correcao de UI

- corrigido o trecho quebrado no `map` dos documentos em `RecipientsScreen`;
- corrigida a sincronizacao de estado do recebedor apos salvar, enviar documento, remover documento e iniciar analise interna;
- corrigido o fluxo para permitir iniciar a analise interna quando houver KYC pendente;
- corrigido o carregamento automatico da lista de documentos quando existir `kyc_request_id`.

### Correcao de tipagem

- ajustado `lib/acquirer/index.ts` para retornar explicitamente `AcquirerProvider`;
- isso eliminou a quebra de build causada pela leitura dos novos contratos opcionais do adapter.

### Correcao de hooks

- removida dependencia desnecessaria do `useMemo`;
- corrigida dependencia do `useEffect` que carregava documentos.

## Riscos reavaliados

### Sem regressao funcional identificada nesta rodada

- Payment Links: nao alterado;
- Split: nao alterado;
- Assinaturas: nao alterado;
- PIX/cartao/payout/antecipacao/Pix Automatico: nao alterados;
- RBAC: mantido no mesmo conjunto operacional previsto para Recebedores/KYC interno.

### Riscos residuais

- ainda nao houve homologacao manual completa com usuarios reais por perfil nesta rodada;
- ainda nao houve deploy controlado para validar fluxo visual em ambiente publicado;
- a integracao externa com MyGateway continua propositalmente indisponivel.

## Evidencias tecnicas

### Arquivos principais validados na rodada

- `components/screens.tsx`
- `lib/receiver-kyc.ts`
- `app/api/receivers/route.ts`
- `app/api/receivers/[id]/route.ts`
- `app/api/kyc-requests/route.ts`
- `app/api/kyc-requests/[id]/route.ts`
- `app/api/kyc/upload/route.ts`
- `app/api/kyc-requests/[id]/documents/route.ts`
- `app/api/kyc-documents/[id]/route.ts`
- `lib/receiver-provider-sync.ts`
- `lib/acquirer/index.ts`
- `tests/kyc.spec.ts`

## Conclusao desta rodada

- Recebedores internos: prontos para validacao controlada;
- KYC interno: pronto para validacao controlada;
- adapter do provider: preparado apenas no nivel de contrato interno;
- chamadas reais a MyGateway: nao realizadas;
- deploy: ainda nao executado, conforme solicitado para esta primeira execucao.

## Rodada adicional de deploy controlado

### Revalidacao local antes da publicacao

Comandos rerodados apos os ajustes finais de UI/copy:

```bash
npm run test:kyc
npm run lint
npm run build
```

Resultado:

- `npm run test:kyc`: `90 passed (2.1s)`;
- `npm run lint`: sem erros;
- `npm run build`: build de producao concluido com sucesso.

### Ajustes validados nesta rodada

- o modal principal de `Recebedor e KYC interno` voltou a expor a acao de salvar os dados usando a logica `saveReceiver`;
- as mensagens obrigatorias da Fase 2A foram alinhadas para explicitar que a analise e interna e que a sincronizacao com a MyGateway permanece desabilitada.

### Publicacao em producao

Tentativas executadas:

```bash
npx vercel deploy --prod --yes
npx vercel deploy --prod --yes --archive=tgz
```

Resultado objetivo:

- ambas as tentativas falharam antes da publicacao por limite de upload da conta Vercel;
- erro retornado: `Too many requests - try again in 24 hours (more than 5000, code: "api-upload-free")`;
- nenhum novo deployment foi gerado nesta rodada;
- o alias de producao permaneceu apontando para o deployment anterior `dpl_BMh9vQXVRRXCqEeFM92S7zodJPwQ`.

### Homologacao no alias atual

- foi possivel autenticar com usuarios QA reais em producao;
- foi possivel criar recebedor PF no alias atual;
- a homologacao completa nao pode ser concluida no alias atual porque a versao publicada ainda nao contem os ajustes finais desta rodada;
- evidencias operacionais adicionais:
  - `test-results/phase2a-prod-2026-07-13T17-59-32-254Z/phase2a-production-report.json`
  - `test-results/phase2a-prod-2026-07-13T18-01-46-572Z/phase2a-production-report.json`
