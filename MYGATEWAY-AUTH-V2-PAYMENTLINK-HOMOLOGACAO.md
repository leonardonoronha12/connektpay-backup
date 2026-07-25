# MyGateway — Auth v2 + Payment Link (Homologação)

Data: 2026-07-14

Objetivo:

- validar com credenciais reais, em ambiente seguro, apenas:
  - autenticação v2
  - Payment Link (create/get/list)

Regras:

- não testar pagamento avulso PIX/cartão;
- não testar split externo;
- não testar assinaturas externas;
- não alterar recebedores/KYC/repasses/antecipações.

## Ambiente utilizado

- Workspace local: `c:\Users\Leonardo\Desktop\ConnektPay`
- Base URL alvo informada para homologação:
  - `https://api.whitelabel.mygateway.com.br/connekt`
- Data/hora da tentativa:
  - 2026-07-14

## Pré-checagens executadas

### 1) Variáveis e escopo

Validação executada:

- checagem de `.env.local`
- checagem de `.env.example`
- checagem de environment variables da Vercel com `vercel env ls`
- checagem de uso indevido de `NEXT_PUBLIC_MYGATEWAY*`

Resultado sanitizado:

- `NEXT_PUBLIC_MYGATEWAY*`: **não encontrado**
- `.env.local`: **preparado** com placeholders seguros para `MYGATEWAY_BASE_URL`, `MYGATEWAY_X_API_KEY`, `MYGATEWAY_AUTH_DATA`, `MYGATEWAY_AUTH_HEADER` e `MYGATEWAY_PAYMENT_LINKS_ENABLED`
- Vercel `Production/Preview`: **não contém** `MYGATEWAY_X_API_KEY` nem `MYGATEWAY_AUTH_DATA` para esta etapa
- o código atual foi padronizado para `MYGATEWAY_BASE_URL`

Conclusão:

- o ambiente local está **preparado**, mas ainda não está apto para chamada real autenticada até receber os segredos reais

### 2) Sanitização e logs

Validação de segurança:

- não foram escritos valores de API Key, `authData`, `clientSecret` ou `auth_token` em relatório
- o provider não contém `console.log` para segredos no fluxo de autenticação
- `auth_token` é tratado em memória no provider

Observação:

- durante a inspeção local houve ruído do `PSReadLine` no terminal PowerShell, mas **sem vazamento intencional** de credenciais da MyGateway

## Status da homologação real

### Execução desta rodada

Data/hora da execução real:

- `2026-07-14 14:44:02-03:00`

Forma de execução:

- processo local reiniciado com carregamento explícito de `.env.local`
- uso do provider real da aplicação (`MygProvider`) com saída sanitizada
- sem impressão de `x-api-key`, `authData`, `clientSecret` ou `auth_token`

Pré-validação operacional:

- `.env.local` preenchido localmente: **SIM**
- `.env.local` ignorado pelo Git: **SIM**
- segredos ausentes de `git diff`: **SIM**

### Autenticação v2

Endpoint executado:

- `POST /authentication/v2/auth`

Status:

- **executado**

Resultado:

- HTTP: **401**
- `auth_token` recebido: **NÃO**
- `expires_in` recebido: **NÃO**
- mensagem sanitizada: `Invalid authentication data`

Conclusão objetiva:

- a chamada real chegou ao endpoint correto de autenticação v2
- a autenticação falhou antes de qualquer operação de Payment Link
- o bloqueio atual não é de ambiente local, e sim de credencial/dado de autenticação aceito pela MyGateway

### Cache do token

Status:

- **não validado**

Motivo:

- sem `auth_token` válido não foi possível comprovar reutilização do token em memória
- a implementação de cache continua existente no provider, mas a validação real ficou bloqueada pela resposta `401`

### Header autenticado

Ordem aplicada:

1. `Authorization: <auth_token>`
2. `Authentication: <auth_token>` apenas como teste secundário controlado após falha

Status:

- **não validado**

Motivo:

- a falha ocorreu na autenticação v2 (`Invalid authentication data`), antes da obtenção de token utilizável
- portanto, não houve evidência suficiente para concluir se `Authorization` ou `Authentication` é o header autenticado correto para os endpoints de Payment Link

### Create Payment Link

Endpoint planejado:

- `POST /payments/v1/paymentlink`

Payload de homologação preparado:

- título: `Homologação Connekt Pay - Não pagar`
- valor baixo
- validade futura
- `numberOfAllowedSales=1`
- `acceptedPaymentsType=['PIX']`
- sem split
- sem recorrência

Status:

- **não executado com sucesso**

Motivo:

- bloqueado pela falha de autenticação v2

### Get Payment Link por ID

Endpoint planejado:

- `GET /payments/v1/paymentlink/{id}`

Status:

- **não executado**

Motivo:

- depende da criação real bem-sucedida de um link

### List Payment Links

Endpoint planejado:

- `GET /payments/v1/paymentlink`

Status:

- **não executado**

Motivo:

- bloqueado porque a autenticação não retornou token válido

## Painel MyGateway

Status do acesso:

- sessão autenticada utilizada com sucesso
- navegação até `Configurações > Chaves de integração` concluída

Resultado sanitizado:

- credencial apropriada para homologação: **SIM**
- nome seguro da credencial: `CONNEKT-HML-20260714`
- identificador seguro visível: `...1817`
- API Key disponível no fluxo da credencial: **SIM**

Limitação operacional:

- o painel exibiu os segredos apenas no próprio fluxo autenticado;
- os segredos **não foram extraídos automaticamente** para evitar exposição em saídas, logs ou relatórios;
- por isso, o `.env.local` continua com placeholders aguardando preenchimento seguro local.

## Erros encontrados

- autenticação real rejeitada com:
  - HTTP `401`
  - mensagem sanitizada: `Invalid authentication data`
- ruído operacional do terminal:
  - `PSReadLine` corrompeu parte da saída interativa do PowerShell
  - a evidência sanitizada final foi preservada em arquivo temporário local e refletida neste relatório

## Correções aplicadas nesta etapa

- `.env.local` preenchido localmente sem versionamento
- confirmação de que `.env.local` permanece ignorado pelo Git
- confirmação de que os segredos não aparecem em `git diff`
- reinício do processo local para carregar as variáveis
- execução real do provider com resultado sanitizado
- atualização do relatório para refletir o estado real da homologação

## Próximos passos para concluir a homologação real

1. revisar no painel MyGateway se a credencial `ConnektPay-HML` continua ativa e se `Client ID`, `Client Secret` e `API Key` pertencem ao mesmo conjunto válido
2. regerar `MYGATEWAY_AUTH_DATA` a partir do par atual `clientId:clientSecret`, caso a credencial tenha sido recriada ou rotacionada
3. reexecutar `POST /authentication/v2/auth`
4. somente após HTTP `200`, validar:
   - cache do token
   - header autenticado
   - create de Payment Link
   - get por id
   - listagem
5. só depois executar:
   - `npm run lint`
   - `npm run build`
   - deploy controlado

## Deployment ID

- **não executado**

## Diagnóstico isolado da autenticação

Escopo desta rodada:

- apenas `POST https://api.whitelabel.mygateway.com.br/connekt/authentication/v2/auth`
- sem criação de Payment Link
- sem deploy
- sem alteração de outros módulos

Checklist técnico solicitado:

1. `MYGATEWAY_BASE_URL` carregada: **SIM**
2. `MYGATEWAY_X_API_KEY` preenchida: **SIM**
3. `MYGATEWAY_AUTH_DATA` preenchida: **SIM**
4. Base64 decodifica para `clientId:clientSecret`: **SIM**
5. URL final chamada:
   - `https://api.whitelabel.mygateway.com.br/connekt/authentication/v2/auth`
6. Método HTTP:
   - `POST`
7. Headers enviados, com valores mascarados:
   - `x-api-key: jJLl...4sXj`
   - `Content-Type: application/json`
8. Status HTTP retornado:
   - `401`
9. Corpo da resposta, sanitizado:
   - `Invalid authentication data`
10. Houve erro de DNS, TLS, CORS, timeout ou rede?
   - **NÃO**
11. A requisição chegou ao servidor da MyGateway?
   - **SIM**
12. Causa raiz provável:
   - o endpoint `/authentication/v2/auth` respondeu normalmente e o body com `authData` foi aceito sintaticamente, porém a credencial foi rejeitada pela MyGateway
13. Área provável da falha:
   - `API Key`
   - `Client ID/Secret`
   - `authData`
   - `ambiente/tenant`
   - `bloqueio da credencial`

Confirmação controlada do contrato:

- endpoint confirmado para esta tentativa: `/authentication/v2/auth`
- campo do body enviado exatamente como solicitado: `authData`
- não houve teste de `v1`
- não houve troca de header autenticado nesta rodada, porque a falha ocorreu antes da obtenção de token

Conclusão objetiva:

- a falha **não** indica problema de DNS, TLS, timeout, CORS, URL base ou método HTTP
- a falha **não** aponta para erro de parsing do body no nível mais provável
- a causa mais provável continua concentrada em:
  - combinação incorreta entre `x-api-key` e `authData`
  - `authData` gerado a partir de um `clientId:clientSecret` que não corresponde à mesma credencial/tenant da API Key
  - credencial expirada, rotacionada, desativada ou bloqueada no tenant

## Rodada validada com nova credencial

Credencial usada nesta rodada:

- nome seguro: `connekypay`
- `MYGATEWAY_X_API_KEY`: mantida
- `MYGATEWAY_AUTH_DATA`: substituída pela nova credencial
- `MYGATEWAY_AUTH_HEADER`: `Authorization`

Preparação do ambiente:

- processo local reiniciado com novo carregamento explícito do `.env.local`: **SIM**
- `.env.local` permanece fora do Git: **SIM**
- Vercel ainda não configurada nesta etapa: **SIM**

### Autenticação v2

Resultado sanitizado:

- endpoint: `POST /authentication/v2/auth`
- status HTTP: **200**
- `auth_token` recebido: **SIM**
- `expires_in` recebido: **SIM**
- body sanitizado:
  - `auth_token: [REDACTED]`
  - `expires_in: 2026-07-14T18:49:35.018875Z`

### Cache e reutilização do token

Validação:

- requests de autenticação observadas no fluxo completo: **1**
- reutilização do token em memória no mesmo provider: **SIM**
- cache validado: **SIM**

### Header autenticado

Validação:

- header funcional nesta rodada: **Authorization**
- troca para `Authentication`: **não necessária**

### Payment Link de homologação

Criação:

- endpoint: `POST /payments/v1/paymentlink`
- status HTTP: **201**
- criado com valor baixo, somente `PIX`, sem split e sem recorrência: **SIM**
- id mascarado: `68a5...9448`
- url mascarada: `https://connekt.mygateway.com.br/v2/checkout/0...`

Consulta por ID:

- endpoint: `GET /payments/v1/paymentlink/{id}`
- status HTTP: **200**
- link localizado: **SIM**

Listagem:

- endpoint: `GET /payments/v1/paymentlink`
- status HTTP: **200**
- link localizado na lista: **SIM**

Conclusão desta rodada:

- a nova credencial autenticou com sucesso
- a integração local de `Auth v2 + Payment Links` ficou homologada
- o ambiente está pronto para a próxima etapa de configuração segura na Vercel, sem necessidade de novo deploy nesta rodada

## Produção

Ambiente:

- Vercel `Production`
- alias final: `https://connektpay.vercel.app`

Data/hora:

- deploy concluído em `2026-07-14`

### Variáveis na Vercel

Configuradas como server-side em `Production`:

- `MYGATEWAY_BASE_URL`
- `MYGATEWAY_X_API_KEY`
- `MYGATEWAY_AUTH_DATA`
- `MYGATEWAY_AUTH_HEADER`
- `MYGATEWAY_PAYMENT_LINKS_ENABLED`

Observações:

- nenhuma variável `NEXT_PUBLIC_MYGATEWAY_*` foi usada
- `Preview` não foi configurado, pois não foi necessário para esta homologação

### Segurança confirmada

- `.env.local` continua fora do Git: **SIM**
- segredos não aparecem no `git diff`: **SIM**
- `auth_token` não é persistido em banco: **SIM**
- `API Key` e `authData` não chegam ao frontend: **SIM**
- provider roda server-side:
  - `isMyGatewayConfigured()` lê apenas `process.env`
  - `MygProvider` mantém `authToken` apenas em memória (`private authToken`)

### Validação antes do deploy

- `npm run lint`: **OK**
- `npm run build`: **OK**

### Deploy controlado

Deployment ID:

- `HquSJ6NFyqZH5f8mJLHwK4k1cdsu`

URL do deployment:

- `https://connektpay-lr8nezlz1-connekt-8e34459c.vercel.app`

Alias final:

- `https://connektpay.vercel.app`

### Homologação em produção pela Connekt Pay

Sessão:

- acesso ao app em produção redirecionou direto para `/dashboard`
- login/sessão válidos durante toda a navegação

Criação real pela UI:

- rota usada: `POST /api/payment-links`
- status HTTP: **201**
- tipo persistido: `one_time`
- método habilitado: somente `PIX`
- split: **não configurado**
- recorrência: **não ativa**
- valor baixo: **SIM**
- fallback demo observado: **NÃO**

Link criado:

- id mascarado: `dcbe...183c`
- slug mascarado: `4h4l...p9c4`
- checkout Connekt Pay mascarado: `https://connektpay.vercel.app/checkout?slug=4h4l...p9c4`

Sincronização com MyGateway:

- `providerSync.ok`: **true**
- `provider_reference`: confirmado pelo fluxo de persistência do backend após sync bem-sucedido
- `provider_url`: confirmado pelo mesmo fluxo de sync bem-sucedido
- `provider_status`: sincronizado sem erro visível
- `provider_last_error`: sem erro visível nesta rodada

Consulta por ID:

- rota usada: `GET /api/payment-links?slug=4h4l...p9c4`
- status HTTP: **200**
- link localizado: **SIM**

Listagem:

- rota usada: `GET /api/payment-links`
- status HTTP: **200**
- link encontrado na lista: **SIM**

Header validado:

- `Authorization`

Cache do token:

- validado localmente com uma única autenticação para o fluxo completo
- em produção não houve evidência de autenticação repetida desnecessária durante a criação homologada

### Regressões

Resultado geral:

- **SIM**, com pontos não bloqueantes

Pontos observados:

- em múltiplas telas, o nome da conta aparece como `—` enquanto o e-mail continua visível
- a rota pública `/conciliacao` mostrou indisponibilidade; a rota funcional observada foi `/admin/conciliacao`
- não houve regressão bloqueante em:
  - Dashboard
  - Recebedores
  - Split interno
  - Assinaturas internas
  - Repasses internos
  - Antecipação interna
  - RBAC
  - Login/sessão

## Registro final

- Credencial encontrada ou criada no painel: SIM
- API Key disponível: SIM
- Variáveis locais configuradas: SIM
- Credenciais reais utilizadas: SIM
- Autenticação real v2 validada: SIM
- Cache do token validado: SIM
- Header validado: Authorization
- ID do link de homologação: `68a5...9448`
- URL do link parcialmente mascarada: `https://connekt.mygateway.com.br/v2/checkout/0...`
- Consulta por ID: VALIDADA
- Listagem: VALIDADA
- Erros encontrados: ruído do `PSReadLine` no terminal PowerShell; sem erro funcional da MyGateway na rodada validada
- Correções aplicadas: troca para a nova credencial `connekypay`, reinício do ambiente local e homologação real concluída
- Variáveis configuradas na Vercel: SIM
- Deploy realizado: SIM
- Deployment ID: `HquSJ6NFyqZH5f8mJLHwK4k1cdsu`
- URL do deployment: `https://connektpay-lr8nezlz1-connekt-8e34459c.vercel.app`
- Alias final: `https://connektpay.vercel.app`
- Payment Link real criado pela Connekt Pay: SIM
- Consulta por ID em produção: SIM
- Listagem em produção: SIM
- Regressões em produção: SIM
