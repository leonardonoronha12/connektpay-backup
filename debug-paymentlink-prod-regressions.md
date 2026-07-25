[OPEN] paymentlink-prod-regressions

# Debug Session

- Session ID: `paymentlink-prod-regressions`
- Scope: regressões em produção após publicação de `Auth v2 + Payment Links`
- Rule: sem alteração de lógica até coletar evidência runtime suficiente

## Objetivo

Revalidar produção e identificar precisamente quaisquer regressões reais, distinguindo:

- regressão causada pela integração MyGateway;
- problema pré-existente apenas descoberto nesta rodada;
- falso positivo sem impacto funcional.

## Hipóteses Iniciais

1. O status `Regressões: SIM` foi marcado por sintomas não bloqueantes e não por falhas reais do fluxo homologado.
2. Existe regressão visual de sessão/perfil no shell da aplicação, independente da integração MyGateway.
3. Existe inconsistência de rota/navegação em áreas admin, descoberta durante a rodada de homologação, mas não causada por Payment Links.
4. O fluxo de `Payment Links` em produção está saudável e as regressões observadas pertencem a módulos adjacentes ou ao layout global.
5. Pode haver pelo menos uma regressão funcional real em RBAC, navegação ou carregamento de alguma tela interna, que precisa ser isolada com evidência de rede/UI.

## Evidências a coletar

- login e persistência de sessão
- dashboard e menu
- create/get/list de Payment Links
- recebedores e KYC
- split interno
- assinaturas internas
- repasses internos
- antecipação interna
- RBAC e rotas admin
- erros visuais, erros de console e erros de rede

## Status

- Diagnóstico iniciado
- Aguardando coleta de evidências
