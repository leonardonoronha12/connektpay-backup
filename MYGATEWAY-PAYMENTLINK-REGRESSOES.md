# MYGATEWAY-PAYMENTLINK-REGRESSOES

## Status final pós-correção

Deploy final publicado em produção:

- Inspect: `https://vercel.com/connekt-8e34459c/connektpay/HEREcQBssCjRghrYSAs8adRBXaha`
- Production URL: `https://connektpay-mhe1ypip1-connekt-8e34459c.vercel.app`
- Alias: `https://connektpay.vercel.app`

Resultado da revalidação final em produção:

- Checkout público de Payment Link: corrigido. O fluxo em `https://connektpay.vercel.app/checkout?slug=eu14ihrel229qb` exibiu a transição para checkout hospedado e redirecionou corretamente para `https://connekt.mygateway.com.br/v2/checkout/e691502c1120`, sem `502`.
- RBAC em `/configuracoes`: corrigido. Em navegações frescas, os perfis `admin` e `financeiro` foram redirecionados para `/dashboard`.
- Links de Pagamento `create/get/list`: continuam funcionando no smoke pós-fix.
- Dashboard e navegação principal: sem regressão colateral bloqueadora confirmada nesta rodada final.

Conclusão atual:

- Não restam regressões confirmadas em produção dentro do escopo `Auth v2 + Payment Links`.
- As seções abaixo preservam o diagnóstico histórico da rodada anterior e a causa raiz encontrada antes das correções finais.

## Escopo revalidado

Revalidação executada em produção para:

- Login
- Dashboard
- Links de Pagamento
- criação de Payment Link
- consulta e listagem
- checkout público de Payment Link
- Recebedores
- KYC
- Split interno
- Assinaturas internas
- Repasses internos
- Antecipação interna
- RBAC
- Menu e navegação

## Resultado executivo

Regressões confirmadas em produção neste momento:

- Nenhuma dentro do escopo revalidado após o deploy final de correção.

Itens revalidados sem regressão confirmada nesta rodada:

- Login: OK
- Dashboard: OK
- Links de Pagamento `create/get/list`: OK
- Recebedores: OK
- KYC: OK
- Split interno: OK
- Assinaturas internas: OK
- Repasses internos: OK
- Antecipação interna: OK
- Menu e navegação geral: OK

Observações:

- O checkout público permanece corrigido em produção após o deploy final desta rodada.
- As regressões de KYC sem documentos e conciliação `500` haviam sido confirmadas em rodada anterior, mas não permaneceram como regressão confirmada dentro desta revalidação obrigatória atual.

## Regressão 1 (histórico corrigido)

- Módulo afetado: `Links de Pagamento / Checkout público`
- Tela ou endpoint: `https://connektpay.vercel.app/checkout?slug=5t0h2mxsb5c886` e `POST /api/payments`
- Perfil afetado: cliente final / pagador público
- Comportamento esperado: ao enviar um checkout PIX válido de Payment Link, a Connekt Pay deve criar a cobrança normalmente sem depender de split externo, já que `Auth v2 + Payment Links` foi o escopo homologado e split externo não faz parte deste fluxo
- Comportamento obtido: o checkout carrega corretamente, aceita os dados do pagador, envia `POST /api/payments` e recebe erro de backend antes de gerar QR Code ou PIX copia-e-cola
- Status HTTP: `502`
- Payload enviado:

```json
{
  "paymentLinkSlug": "5t0h2mxsb5c886",
  "method": "pix",
  "customer": {
    "name": "Cliente QA Produção",
    "email": "cliente.qa+prod.checkout@exemplo.com",
    "document": "123.456.789-09"
  }
}
```

- Payload recebido:

```json
{
  "error": "Falha ao processar o split no provedor financeiro."
}
```

- Mensagem exibida ao usuário: `Falha ao processar o split no provedor financeiro.`
- Erro de console: nenhum erro funcional relevante no browser; a falha está no backend
- Erro de rede: `POST /api/payments` → `502 Bad Gateway`
- Causa raiz:
  - o código publicado do checkout já valida os campos obrigatórios no frontend e no backend;
  - mesmo assim, o backend entra no ramo de split/provider ao processar o Payment Link público;
  - em `app/api/payments/route.ts`, o cálculo de split só ocorre quando `isSplitProviderEnabled()` retorna `true`;
  - o comportamento observado em produção prova que esse ramo está ativo no ambiente publicado;
  - ao entrar nesse ramo, `calculateSplitForProvider()` delega para `createSplitPayloadForMyGateway()`, que exige `provider_reference` de recebedor;
  - isso acopla indevidamente o checkout homologado de Payment Link ao fluxo de split externo, que não deveria ser pré-requisito para gerar o PIX
- Arquivo responsável:
  - `app/api/payments/route.ts`
  - `lib/env.ts`
  - `lib/split-service.ts`
  - `lib/split-core.ts`
- Severidade: `bloqueadora`
- Causada pela integração da MyGateway ou apenas descoberta nesta rodada: `causada pela integração da MyGateway`, com forte indício de acoplamento indevido ao split/provider ou divergência de flag/configuração em produção

## Regressão 2 (histórico corrigido)

- Módulo afetado: `RBAC / Configurações`
- Tela ou endpoint: `GET /configuracoes`
- Perfil afetado: `admin` e `financeiro`
- Comportamento esperado: apenas `owner` deve acessar `Configurações`; `admin` e `financeiro` não devem visualizar a tela nem acessar a rota por URL direta
- Comportamento obtido: ao acessar `/configuracoes` por URL direta, os perfis `admin` e `financeiro` carregam a página completa com seções sensíveis e botões de edição, apesar de um aviso visual dizer que não há permissão
- Status HTTP: `200` funcional observado na navegação; a ferramenta de browser não expôs o número bruto, mas a rota carregou/renderizou sem bloqueio, sem redirecionamento e sem `401/403`
- Payload enviado:

```json
null
```

- Payload recebido:

```json
{
  "page": "Configurações",
  "renderedSections": [
    "Perfil da conta",
    "Dados da empresa"
  ],
  "actionsVisible": [
    "Salvar alterações"
  ],
  "supportingRequests": [
    "GET /api/me",
    "GET /api/organization"
  ]
}
```

- Mensagem exibida ao usuário: `Você não tem permissão para acessar este recurso.`
- Erro de console: nenhum erro funcional associado à autorização da rota
- Erro de rede: nenhum erro de rede associado à autorização; a página e os dados carregaram normalmente
- Causa raiz:
  - a matriz de RBAC publicada permite explicitamente `/configuracoes` para `admin` e `financeiro`;
  - o menu lateral já esconde `Configurações` desses perfis, mas a regra de rota continua permitindo acesso direto por URL;
  - isso cria uma inconsistência entre navegação visível e autorização efetiva da página
- Arquivo responsável:
  - `lib/rbac.ts`
  - `components/layout/Sidebar.tsx`
- Severidade: `alta`
- Causada pela integração da MyGateway ou apenas descoberta nesta rodada: `apenas descoberta nesta rodada`; não foi causada pela integração MyGateway

## Itens não confirmados como regressão nesta rodada

- Auditoria: não confirmada; a tela renderiza registros e mantém exportação disponível
- Shell/Menu: não confirmada; nome e e-mail do usuário permanecem renderizados corretamente
- KYC: não reproduzida como regressão nesta rodada obrigatória
- Payment Links `create/get/list`: continuam funcionando

## Próximo passo

Escopo concluído nesta rodada. Manter monitoramento pós-publicação e preservar os contratos homologados da MyGateway sem abrir novos módulos externos fora do que já foi validado.
