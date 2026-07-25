# FASE 2A - Falhas em Produção

Data: 2026-07-13
Ambiente: `https://connektpay.vercel.app`

## Resumo executivo

- Recebedor PF: reprovado em edicao e persistencia;
- Recebedor PJ: reprovado em edicao e persistencia;
- KYC interno: aprovado;
- Documentos privados e signed URLs: aprovados;
- Regressões confirmadas:
  - `Assinaturas > Planos` com `GET /api/plans = 500`;
  - modal de Split com `Cancelar` navegando para `/recebedores`.

## 1. Recebedor PF

### Cenário revalidado

- criacao;
- edicao;
- persistencia;
- CPF;
- data de nascimento;
- endereco;
- banco;
- agencia;
- conta;
- chave PIX.

### Resultado

- criacao: aprovada;
- edicao: reprovada;
- persistencia: reprovada.

### Passo exato em que falhou

1. acessar `/recebedores`;
2. abrir o card `QA PF 1783965849673`;
3. revisar o footer do modal;
4. tentar salvar os dados do recebedor;
5. revalidar o submit equivalente por `PATCH /api/receivers/{id}`.

### Resultado esperado

- o modal deve exibir `Salvar dados`;
- o submit deve responder `200`;
- os dados devem persistir na listagem e na reabertura do modal.

### Resultado obtido

- o modal abriu com os campos do recebedor PF;
- o footer exibiu apenas `Fechar`, `Atualizar lista` e `Iniciar análise interna`;
- o botao `Salvar dados` nao apareceu na UI publicada;
- o `PATCH /api/receivers/69626604-e9f8-47be-834b-4ed26156bcf2` respondeu `404`.

### Mensagem exibida

- `Recebedor e KYC interno`
- `1 de 4 etapas concluidas`
- `Aguardando envio para análise`
- `Envie todos os documentos obrigatórios para liberar a análise interna.`

### Status HTTP

- `GET /api/receivers` -> `200`
- `PATCH /api/receivers/69626604-e9f8-47be-834b-4ed26156bcf2` -> `404`

### Payload enviado

```json
{
  "type": "pf",
  "name": "QA PF 1783965849673",
  "legalName": null,
  "tradeName": null,
  "document": "96584967336",
  "birthDate": "1990-01-01",
  "legalResponsibleName": null,
  "legalResponsibleDocument": null,
  "email": "pf.revalidacao@connektpay.test",
  "phone": "11999990000",
  "address": {
    "zip": "01310930",
    "street": "Avenida Paulista",
    "number": "1000",
    "complement": "Sala PF",
    "city": "São Paulo",
    "state": "SP"
  },
  "bankAccount": {
    "bank_code": "001",
    "agency": "1234",
    "account": "987654",
    "account_digit": "1",
    "account_type": "corrente",
    "pix_key": "pf.revalidacao@connektpay.test"
  }
}
```

### Payload recebido

```json
{
  "error": "Recebedor não encontrado."
}
```

### Erro de console

- nao houve erro de console funcional especifico do fluxo PF;
- houve ruído de navegacao do Next com `net::ERR_ABORTED` em prefetches e `_rsc`.

### Erro de network

- `PATCH /api/receivers/69626604-e9f8-47be-834b-4ed26156bcf2` -> `404`

### Stacktrace

```text
[error] net::ERR_ABORTED https://connektpay.vercel.app/api/me
at .../app/(app)/layout-dd1899e895d74494.js
at .../9572-826af85d49f426b1.js
...
```

Observacao:

- o stacktrace capturado e de abortos de navegacao/prefetch do Next; nao houve stacktrace especifico do `PATCH`.

### Causa raiz

Falha dupla:

1. **Lookup inconsistente no backend**
   - `GET /api/receivers` usa `getSupabaseAdminClient()` quando o service role esta configurado;
   - `PATCH /api/receivers/[id]` usa `getSupabaseServerClient()`;
   - em producao, isso cria uma assimetria: o GET lista registros com bypass de RLS e o PATCH tenta reler o mesmo registro com client de sessao, caindo no ramo `if (!before) return 404`.

2. **UI publicada divergente do footer esperado**
   - o codigo local renderiza `Salvar dados` de forma incondicional no footer do modal;
   - a UI publicada nao exibiu esse botao durante a homologacao.

### Arquivo responsável

- [route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/receivers/[id]/route.ts)
- [route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/receivers/route.ts)
- [screens.tsx](file:///c:/Users/Leonardo/Desktop/ConnektPay/components/screens.tsx#L4071-L4079)

## 2. Recebedor PJ

### Cenário revalidado

- criacao;
- edicao;
- persistencia;
- CNPJ;
- razao social;
- nome fantasia;
- responsavel legal;
- CPF do responsavel;
- endereco;
- dados bancarios.

### Resultado

- criacao: aprovada;
- edicao: reprovada;
- persistencia: reprovada.

### Passo exato em que falhou

1. acessar `/recebedores`;
2. abrir o card `QA PJ Revalidacao 20260713`;
3. revisar o footer do modal;
4. tentar salvar os dados do recebedor;
5. revalidar o submit equivalente por `PATCH /api/receivers/{id}`.

### Resultado esperado

- o modal deve exibir `Salvar dados`;
- o submit deve responder `200`;
- os dados PJ devem persistir na reabertura do modal e na listagem.

### Resultado obtido

- o modal abriu com os campos PJ e `Responsável legal`;
- o botao `Salvar dados` nao apareceu;
- o `PATCH /api/receivers/81efa44d-0be0-4c90-940d-629228dc70a9` respondeu `404`.

### Mensagem exibida

- `Recebedor e KYC interno`
- `1 de 4 etapas concluidas`
- `Aguardando envio para análise`
- `Envie todos os documentos obrigatórios para liberar a análise interna.`

### Status HTTP

- `GET /api/receivers` -> `200`
- `PATCH /api/receivers/81efa44d-0be0-4c90-940d-629228dc70a9` -> `404`

### Payload enviado

```json
{
  "type": "pj",
  "name": "QA PJ Revalidacao 20260713",
  "legalName": "QA PJ Revalidacao LTDA",
  "tradeName": "QA PJ Revalidacao",
  "document": "11444777000161",
  "birthDate": null,
  "legalResponsibleName": "Maria Gestora QA",
  "legalResponsibleDocument": "39053344705",
  "email": "pj.revalidacao@connektpay.test",
  "phone": "11999990000",
  "address": {
    "zip": "01310930",
    "street": "Avenida Paulista",
    "number": "1000",
    "complement": "Sala PJ",
    "city": "São Paulo",
    "state": "SP"
  },
  "bankAccount": {
    "bank_code": "001",
    "agency": "1234",
    "account": "987654",
    "account_digit": "1",
    "account_type": "corrente",
    "pix_key": "pj.revalidacao@connektpay.test"
  }
}
```

### Payload recebido

```json
{
  "error": "Recebedor não encontrado."
}
```

### Erro de console

- nao houve erro de console funcional especifico do fluxo PJ;
- permaneceu apenas o ruído de `net::ERR_ABORTED` em prefetches e navegacao RSC do Next.

### Erro de network

- `PATCH /api/receivers/81efa44d-0be0-4c90-940d-629228dc70a9` -> `404`

### Stacktrace

- nao houve stacktrace especifico do `PATCH`;
- apenas stacktrace dos abortos de navegacao do Next, sem relacao causal direta com a edicao PJ.

### Causa raiz

- mesma causa do PF:
  - inconsistencia de client entre GET e PATCH;
  - UI publicada sem renderizacao confiavel do botao `Salvar dados`.

### Arquivo responsável

- [route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/receivers/[id]/route.ts)
- [route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/receivers/route.ts)
- [screens.tsx](file:///c:/Users/Leonardo/Desktop/ConnektPay/components/screens.tsx#L4071-L4079)

## 3. Regressões

### 3.1 Dashboard

- módulo afetado: Dashboard
- perfil afetado: owner, admin, financeiro
- comportamento anterior: carregava normalmente
- comportamento atual: continua carregando normalmente
- severidade: nenhuma
- causa provável: sem regressao detectada

### 3.2 Links de Pagamento

- módulo afetado: Links de Pagamento
- perfil afetado: owner, admin
- comportamento anterior: carregava normalmente
- comportamento atual: continua carregando normalmente
- severidade: nenhuma
- causa provável: sem regressao detectada

### 3.3 Split

- módulo afetado: modal de Split em Links de Pagamento
- perfil afetado: owner, admin
- comportamento anterior: `Cancelar` fechava o modal
- comportamento atual: `Cancelar` levou a navegacao para `/recebedores`
- severidade: alta
- causa provável:
  - disputa de camada/captura de clique;
  - `Modal` e `Header` compartilham `z-index: 70`, compativel com interceptacao indevida;
  - o handler esperado de `Cancelar` apenas resolve o dialogo, mas o runtime navegou para outra rota.
- arquivo responsável:
  - [screens.tsx](file:///c:/Users/Leonardo/Desktop/ConnektPay/components/screens.tsx#L531-L549)
  - [Modal.tsx](file:///c:/Users/Leonardo/Desktop/ConnektPay/components/ui/Modal.tsx#L57-L84)
  - [Header.tsx](file:///c:/Users/Leonardo/Desktop/ConnektPay/components/layout/Header.tsx#L90-L99)

### 3.4 Assinaturas

- módulo afetado: Assinaturas
- perfil afetado: owner, admin
- comportamento anterior: tela principal carregava
- comportamento atual: tela principal continua carregando, mas `Planos` falha
- severidade: alta
- causa provável:
  - a API `GET /api/plans` consulta `public.pay_plano`;
  - a tabela `public.pay_plano` nao existe no schema remoto homologado, portanto a listagem falha e sobe como `500`.
- arquivo responsável:
  - [route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/plans/route.ts)
  - [subscription-service.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/lib/subscription-service.ts#L163-L170)

### 3.5 RBAC

- módulo afetado: RBAC visual e navegacao
- perfil afetado: owner, admin, financeiro
- comportamento anterior: menus e rotas protegidas coerentes
- comportamento atual: continuam coerentes
- severidade: nenhuma
- causa provável: sem regressao funcional confirmada

### 3.6 Menu

- módulo afetado: menu do usuario
- perfil afetado: owner, admin, financeiro
- comportamento anterior: corrigido
- comportamento atual: mantido
- severidade: nenhuma
- causa provável: correcao anterior permanece valida

### 3.7 Modais

- módulo afetado: modal de Recebedor/KYC e modal de Split
- perfil afetado: owner, admin
- comportamento anterior:
  - Recebedor: footer com `Salvar dados`
  - Split: `Cancelar` apenas fechava
- comportamento atual:
  - Recebedor: `Salvar dados` nao aparece na UI publicada
  - Split: `Cancelar` navega para `/recebedores`
- severidade: alta
- causa provável:
  - footer publicado divergente do esperado;
  - conflito de camada/captura de clique no modal de Split.

### 3.8 Login

- módulo afetado: login e redirecionamentos sem sessao
- perfil afetado: guest, owner, admin, financeiro
- comportamento anterior: aprovado
- comportamento atual: mantido
- severidade: nenhuma
- causa provável: sem regressao detectada

### 3.9 APIs relacionadas

- módulo afetado: APIs internas
- perfil afetado: owner, admin
- comportamento anterior:
  - `/api/dashboard`, `/api/payment-links`, `/api/receivers`, `/api/split-rules`, `/api/subscriptions` saudaveis
  - `/api/plans` problematico
- comportamento atual:
  - mesmas APIs principais seguem `200`
  - `/api/plans` continua `500`
  - `/api/receivers/[id]` via `PATCH` continua `404` para IDs validos
- severidade: alta
- causa provável:
  - `PATCH /api/receivers/[id]`: assimetria entre admin client no GET e session client no PATCH;
  - `GET /api/plans`: dependencia de tabela inexistente em producao.

## 4. Causas confirmadas

### 4.1 Recebedores PF/PJ

Causa confirmada:

- inconsistencia de acesso entre leitura e atualizacao do recebedor:
  - `GET /api/receivers` usa admin client quando `SUPABASE_SERVICE_ROLE_KEY` existe;
  - `PATCH /api/receivers/[id]` usa server client de sessao;
  - com RLS/FORCE RLS, o registro pode ser visivel no GET e nao ser reencontrado no PATCH.

Evidencia de codigo:

- [route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/receivers/route.ts#L31-L45)
- [route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/receivers/[id]/route.ts#L53-L62)

### 4.2 Planos de Assinatura

Causa confirmada:

- a API lista `public.pay_plano`, mas o schema remoto homologado nao possui essa relacao.

Evidencia:

- `GET /api/plans` -> `500`
- consulta direta ao banco:
  - `select count(*) from public.pay_plano;` -> `ERROR: relation "public.pay_plano" does not exist`

Evidencia de codigo:

- [route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/plans/route.ts#L12-L23)
- [subscription-service.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/lib/subscription-service.ts#L163-L170)

### 4.3 Split

Causa provável forte:

- conflito de camada/captura no modal, coerente com `z-index` igual entre `Modal` e `Header`.

Observacao:

- essa causa ainda precisa ser corrigida e revalidada em runtime para confirmacao final.

## 5. Escopo de correção recomendado

Corrigir apenas:

1. `PATCH /api/receivers/[id]` para alinhar o client e restaurar edicao/persistencia PF/PJ;
2. renderizacao/confiabilidade do footer do modal de Recebedor;
3. regressao do modal de Split em `Cancelar`;
4. `GET /api/plans` sem criar nova migration sem necessidade comprovada.

Nao mexer:

- KYC interno;
- fluxo documental;
- MyGateway;
- migration da Fase 2A, salvo necessidade comprovada e isolada.
