# FASE 2B - Split Interno - QA

Data: 2026-07-13

## Estratégia de validação

Validação executada em quatro camadas:

- testes do núcleo e do serviço interno;
- lint;
- build de produção;
- homologação em produção da rota `/split`.

## Testes automatizados executados

### Suíte

Comando validado:

```bash
npx playwright test tests/split-internal.spec.ts tests/split-internal-service.spec.ts
```

### Resultado

- `72 passed (3.0s)`

### Cobertura confirmada

- criação de configuração interna;
- edição e regravação de regras;
- alteração de status;
- exclusão;
- auditoria;
- simulação;
- conflito de vigência;
- percentual acima de 100%;
- recebedor duplicado;
- múltiplos recebedores;
- RBAC;
- isolamento por organização.

## Validação estática

### Lint

Comando:

```bash
npm run lint
```

Resultado:

- sem warnings;
- sem erros.

### Build

Comando:

```bash
npm run build
```

Resultado:

- build concluído com sucesso;
- rota `/split` presente no artefato final;
- APIs de `split-configs` presentes no artefato final.

## Homologação funcional em produção

### Publicação

- rota publicada: `https://connektpay.vercel.app/split`

### Verificações positivas

- a página `Split Interno` carregou com sucesso;
- a sessão autenticada de QA abriu diretamente o módulo;
- o menu lateral exibiu o novo item de Split;
- a tela mostrou indicadores, simulador e estado vazio controlado;
- nenhuma ação de pagamento real foi executada.

### Verificações de segurança/integridade

- nenhuma chamada à MyGateway foi encontrada no carregamento da tela;
- as chamadas de aplicação observadas foram internas ao domínio `connektpay.vercel.app`;
- chamadas externas observadas no carregamento ficaram restritas a assets do Google Fonts;
- o conteúdo visível da tela indicou provider externo desabilitado.

## Regressões

### Resultado objetivo

Regressões confirmadas nesta rodada: **NÃO**

### Base para a conclusão

- `lint` verde;
- `build` verde;
- suíte dedicada de split interno verde;
- rota publicada e acessível em produção;
- sem evidência de reabertura de integração com MyGateway;
- sem alteração no fluxo atual de Payment Links.

## Pendências funcionais

- a homologação visual em produção encontrou o módulo carregando em estado vazio controlado, sem configuração criada no tenant de QA naquele momento;
- isso não bloqueou a entrega porque:
  - a camada de persistência e auditoria foi validada por testes;
  - a tela carregou corretamente em produção;
  - não houve dependência de provider externo.
