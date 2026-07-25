# MyGateway — Ambiente Configurado (Auth v2 + Payment Links)

Data: 2026-07-14

Objetivo:

- preparar o ambiente local e a Vercel para homologar:
  - autenticação v2
  - Payment Links (`/payments/v1/paymentlink`)
- sem executar autenticação ainda e sem chamar a MyGateway nesta etapa.

Escopo explicitamente fora:

- PIX avulso / cartão avulso
- Split externo
- Assinaturas externas
- Recebedores, KYC, Repasses, Antecipações
- banco/migrations

## 1) Variáveis oficiais do projeto

O projeto foi padronizado para utilizar **exatamente** estas variáveis:

- `MYGATEWAY_BASE_URL`
- `MYGATEWAY_X_API_KEY`
- `MYGATEWAY_AUTH_DATA`
- `MYGATEWAY_AUTH_HEADER`
- `MYGATEWAY_PAYMENT_LINKS_ENABLED`

## 2) Local (.env.local)

Foi preparado um bloco de placeholders em `.env.local` (arquivo não versionado), com:

- `MYGATEWAY_BASE_URL=https://api.whitelabel.mygateway.com.br/connekt`
- `MYGATEWAY_X_API_KEY=` (vazio)
- `MYGATEWAY_AUTH_DATA=` (vazio)
- `MYGATEWAY_AUTH_HEADER=Authorization`
- `MYGATEWAY_PAYMENT_LINKS_ENABLED=true`

Importante:

- nenhum valor real de `x-api-key` ou `authData` foi inventado;
- nenhum segredo foi escrito em documentação/relatório;
- `.env.local` é ignorado pelo git neste repositório.

## 3) Example (.env.example)

`.env.example` foi ajustado para refletir o padrão oficial:

- inclui as 5 variáveis oficiais (com valores vazios ou default seguro);
- não inclui `MYGATEWAY_API_URL`;
- não incentiva `MYGATEWAY_CLIENT_ID`/`MYGATEWAY_CLIENT_SECRET` como input do projeto.

## 4) Segurança (NEXT_PUBLIC_)

Validação:

- não foi encontrado `NEXT_PUBLIC_MYGATEWAY*` nos arquivos `.env*` do repo.

Regra:

- nenhuma variável MyGateway deve usar prefixo `NEXT_PUBLIC_`.

## 5) Vercel (verificação)

Foi verificado via Vercel CLI que as variáveis desta etapa **ainda não estão cadastradas** no projeto.

Variáveis a cadastrar por ambiente (`development`, `preview`, `production`):

- `MYGATEWAY_BASE_URL`
- `MYGATEWAY_X_API_KEY`
- `MYGATEWAY_AUTH_DATA`
- `MYGATEWAY_AUTH_HEADER`
- `MYGATEWAY_PAYMENT_LINKS_ENABLED`

### Comandos sugeridos (Vercel CLI)

Os comandos abaixo **não incluem valores** e irão solicitar input interativo no terminal:

```bash
npx vercel env add MYGATEWAY_BASE_URL development
npx vercel env add MYGATEWAY_X_API_KEY development
npx vercel env add MYGATEWAY_AUTH_DATA development
npx vercel env add MYGATEWAY_AUTH_HEADER development
npx vercel env add MYGATEWAY_PAYMENT_LINKS_ENABLED development

npx vercel env add MYGATEWAY_BASE_URL preview
npx vercel env add MYGATEWAY_X_API_KEY preview
npx vercel env add MYGATEWAY_AUTH_DATA preview
npx vercel env add MYGATEWAY_AUTH_HEADER preview
npx vercel env add MYGATEWAY_PAYMENT_LINKS_ENABLED preview

npx vercel env add MYGATEWAY_BASE_URL production
npx vercel env add MYGATEWAY_X_API_KEY production
npx vercel env add MYGATEWAY_AUTH_DATA production
npx vercel env add MYGATEWAY_AUTH_HEADER production
npx vercel env add MYGATEWAY_PAYMENT_LINKS_ENABLED production
```

## 6) Validação de prontidão (sem chamadas externas)

O projeto está pronto para homologação real assim que:

- `MYGATEWAY_X_API_KEY` e `MYGATEWAY_AUTH_DATA` forem preenchidos no ambiente server-side;
- `MYGATEWAY_PAYMENT_LINKS_ENABLED=true` estiver habilitado no ambiente de homologação.

O fluxo de Payment Link continua **sem chamar a MyGateway** enquanto:

- `MYGATEWAY_PAYMENT_LINKS_ENABLED=false`; ou
- o provider não estiver configurado.

## 7) Resultado

- Variáveis locais preparadas: SIM
- Variáveis da Vercel verificadas: SIM
- NEXT_PUBLIC_MYGATEWAY encontrado: NÃO
- MYGATEWAY_BASE_URL padronizado: SIM
- Projeto pronto para homologação real: SIM
