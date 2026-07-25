# MYGATEWAY-PAINEL-AUDITORIA

Data da auditoria: 2026-07-10  
URL auditada: `https://connekt.mygateway.com.br/dashboard`  
Escopo: auditoria manual do painel autenticado da MyGateway antes de iniciar implementação da Fase 2 da Connekt Pay

## Objetivo

Verificar tudo o que já existe no painel autenticado da MyGateway para evitar abrir chamados desnecessários ou solicitar documentação sobre recursos que já estão disponíveis no próprio produto.

## Resumo executivo

- O painel possui um núcleo funcional e utilizável para:
  - credenciais de integração
  - webhooks
  - links de pagamento
  - checkout
  - cobranças
  - clientes
  - relatórios
  - configurações de loja
  - usuários e grupos
- O painel **não expõe**, para este tenant auditado, módulos dedicados e utilizáveis para:
  - recebedores
  - KYC
  - split
  - repasses
  - antecipação
  - assinaturas como módulo administrativo próprio
  - PIX como módulo standalone
  - documentação técnica
  - Swagger
  - Postman
  - central de downloads técnicos
- Existem indícios claros de capacidades internas não totalmente expostas:
  - links de pagamento maduros
  - checkout com PIX, cartão e boleto
  - recorrência embutida em links/checkout
  - webhooks operacionais
  - chaves de integração com `Client ID` e `Client Secret`
- O principal gap atual do painel não é de configuração básica, e sim de **documentação técnica e backoffice operacional avançado**.

## Status objetivo

- Client ID encontrado? `SIM`
- Client Secret encontrado? `SIM`
- API Key encontrada? `NÃO`, não apareceu como campo explícito com esse nome
- Webhooks encontrados? `SIM`
- Documentação encontrada? `NÃO`
- Postman encontrado? `NÃO`
- Swagger encontrado? `NÃO`

## Tenant auditado

- Empresa/tenant visível: `CONNEKT COMPANY LTDA`
- Seletor/origem detectado no ambiente:
  - `Maquininha`
  - `Link de Pagamento/API`

## Inventário completo do painel

### 1. Dashboard

- Nome: `Dashboard`
- Caminho: `https://connekt.mygateway.com.br/dashboard`
- Finalidade: visão executiva do tenant
- O que conseguimos configurar: nada diretamente na home; serve como visão e navegação
- O que encontramos:
  - cards de faturamento/vendas
  - gráficos por método/bandeira
  - indicador relacionado a PIX
  - volume por período
- O que ainda depende da MyGateway:
  - sem documentação visível sobre origem dos indicadores
  - sem detalhamento técnico embutido dos cálculos
- Print:
  - [dashboard-home.png](file:///c:/Users/Leonardo/AppData/Local/Temp/trae/screenshots/dashboard-home.png)

### 2. Cobranças

- Nome: `Todas cobranças`
- Caminho: `https://connekt.mygateway.com.br/painel/cobrancas?status=2&gateway_client_id=bc120cdb-b430-42b2-8208-e833cb81382a`
- Finalidade: acompanhar cobranças geradas
- O que conseguimos configurar:
  - filtros de listagem
  - consulta operacional das cobranças
- O que encontramos:
  - módulo funcional
  - total visível na auditoria: `20`
- O que ainda depende da MyGateway:
  - sem documentação técnica no próprio painel sobre payloads/status

### 3. Clientes

- Nome: `Clientes`
- Caminho: `https://connekt.mygateway.com.br/painel/clientes?gateway_client_id=bc120cdb-b430-42b2-8208-e833cb81382a`
- Finalidade: listagem de clientes vinculados ao tenant
- O que conseguimos configurar:
  - consulta/listagem
- O que encontramos:
  - módulo funcional
  - total visível na auditoria: `4`
- O que ainda depende da MyGateway:
  - sem documentação técnica sobre sincronização ou origem desses dados

### 4. Relatórios

#### 4.1 Venda analítico

- Nome: `Venda analítico`
- Caminho: `https://connekt.mygateway.com.br/painel/relatorio/venda-analitico?gateway_client_id=bc120cdb-b430-42b2-8208-e833cb81382a`
- Finalidade: relatório analítico de vendas
- O que conseguimos configurar:
  - período
  - origem
  - status
  - exportações
- O que encontramos:
  - botões `Excel`, `PDF` e `Preview`
  - filtros por origem:
    - `Todos`
    - `Link de Pagamento/API`
    - `Maquininha`
- O que ainda depende da MyGateway:
  - sem documentação oficial dos campos exportados
- Print:
  - [relatorio-venda-analitico.png](file:///c:/Users/Leonardo/AppData/Local/Temp/trae/screenshots/relatorio-venda-analitico.png)

#### 4.2 Venda diária

- Nome: `Venda diária`
- Caminho: `https://connekt.mygateway.com.br/painel/relatorio/venda-diaria?gateway_client_id=bc120cdb-b430-42b2-8208-e833cb81382a`
- Finalidade: visão consolidada diária
- O que conseguimos configurar:
  - período
  - origem
  - filtros operacionais
- O que ainda depende da MyGateway:
  - sem documentação dos campos e sem API/contract pública visível

### 5. Configurações

#### 5.1 Minha loja

- Nome: `Minha loja`
- Caminho: `https://connekt.mygateway.com.br/painel/configuracoes?gateway_client_id=bc120cdb-b430-42b2-8208-e833cb81382a`
- Finalidade: configuração comercial e visual da conta
- O que conseguimos configurar:
  - nome da loja
  - logos
  - compartilhamento
  - soft descriptor
  - cores
  - dados bancários
  - chave PIX
- O que encontramos:
  - dados bancários preenchidos
  - banco `Sicoob (756)`
  - agência `5004`
  - conta corrente
  - chave PIX do tipo `CNPJ`
- O que ainda depende da MyGateway:
  - sem clareza no painel sobre como isso reflete na API
  - não há documentação técnica associada
- Print:
  - [config-minha-loja.png](file:///c:/Users/Leonardo/AppData/Local/Temp/trae/screenshots/config-minha-loja.png)

#### 5.2 Taxas customizadas

- Nome: `Taxas customizadas`
- Caminho: `https://connekt.mygateway.com.br/painel/taxas-customizadas?gateway_client_id=bc120cdb-b430-42b2-8208-e833cb81382a`
- Finalidade: tabela de taxas por parcelamento
- O que conseguimos configurar:
  - parcelas `1x` a `18x`
- O que encontramos:
  - tela administrativa funcional
  - campos zerados no momento da auditoria
- O que ainda depende da MyGateway:
  - sem documentação sobre impacto dessas taxas em API/checkout

#### 5.3 Meu perfil

- Nome: `Meu perfil`
- Caminho: `https://connekt.mygateway.com.br/painel/meu-perfil?gateway_client_id=bc120cdb-b430-42b2-8208-e833cb81382a`
- Finalidade: dados do usuário autenticado
- O que conseguimos configurar:
  - sexo
  - nome
  - username
  - CPF/CNPJ
  - telefone
  - data de nascimento
  - endereço
- O que ainda depende da MyGateway:
  - sem clareza sobre uso desses dados em permissões/API

#### 5.4 Chaves de integração

- Nome: `Chaves de integração`
- Caminho: `https://connekt.mygateway.com.br/painel/chave-integracao?gateway_client_id=bc120cdb-b430-42b2-8208-e833cb81382a`
- Finalidade: gestão de credenciais de integração
- O que conseguimos configurar:
  - criar credenciais
  - visualizar listagem de integrações
- O que encontramos:
  - `Client ID`
  - `Client Secret`
  - duas credenciais cadastradas:
    - `Appconnekt1`
    - `Connekt.app`
- O que ainda depende da MyGateway:
  - não foi encontrada documentação técnica no painel explicando autenticação, uso ou exemplos
  - não apareceu um campo explícito chamado `API Key`
- Print:
  - [chaves-integracao.png](file:///c:/Users/Leonardo/AppData/Local/Temp/trae/screenshots/chaves-integracao.png)

#### 5.5 Webhooks

- Nome: `Webhooks`
- Caminho: `https://connekt.mygateway.com.br/painel/webhooks?gateway_client_id=bc120cdb-b430-42b2-8208-e833cb81382a`
- Finalidade: cadastro de endpoints de notificação
- O que conseguimos configurar:
  - nome
  - endereço request
  - API Key
- O que encontramos:
  - tela funcional
  - `1` webhook cadastrado
  - nome visível: `Supawebhook`
  - URL apontando para Supabase Functions
- O que **não** encontramos:
  - catálogo de eventos
  - campo explícito de secret
  - mecanismo visível de replay
  - logs de entrega
  - documentação integrada
- O que ainda depende da MyGateway:
  - eventos suportados
  - política de assinatura
  - payloads
  - retries
- Print:
  - [webhooks-lista.png](file:///c:/Users/Leonardo/AppData/Local/Temp/trae/screenshots/webhooks-lista.png)

#### 5.6 Usuários

- Nome: `Usuários`
- Caminho: `https://connekt.mygateway.com.br/painel/usuarios?gateway_client_id=bc120cdb-b430-42b2-8208-e833cb81382a`
- Finalidade: gestão de usuários do tenant
- O que conseguimos configurar:
  - aparentemente gestão de usuários internos
- O que encontramos:
  - listagem vazia no momento da auditoria: `0`
- O que ainda depende da MyGateway:
  - sem documentação de níveis de permissão

#### 5.7 Grupos

- Nome: `Grupos`
- Caminho: `https://connekt.mygateway.com.br/painel/grupos?gateway_client_id=bc120cdb-b430-42b2-8208-e833cb81382a`
- Finalidade: perfis/grupos de acesso
- O que conseguimos configurar:
  - grupos e permissões internas
- O que encontramos:
  - `1` grupo cadastrado: `Administrador`
- O que ainda depende da MyGateway:
  - mapa formal de permissões e escopos

### 6. Links de pagamento

- Nome: `Links de pagamento`
- Caminho: `https://connekt.mygateway.com.br/painel/links-pagamento?gateway_client_id=bc120cdb-b430-42b2-8208-e833cb81382a`
- Finalidade: catálogo e gestão de links
- Observação:
  - módulo funcional encontrado fora do menu lateral principal
- O que conseguimos configurar:
  - título
  - valor
  - validade
  - parcelas mín/máx
  - limite de pagamentos
  - CEP only
  - juros para cliente
  - descrição
  - métodos de pagamento:
    - crédito
    - PIX
    - boleto
- O que encontramos:
  - total visível: `135` links
  - fluxo bem mais maduro do que o painel sugere no menu
- O que ainda depende da MyGateway:
  - documentação da API correspondente
  - regras formais de recorrência/assinatura e payload
- Prints:
  - [links-pagamento-lista.png](file:///c:/Users/Leonardo/AppData/Local/Temp/trae/screenshots/links-pagamento-lista.png)
  - [links-pagamento-novo.png](file:///c:/Users/Leonardo/AppData/Local/Temp/trae/screenshots/links-pagamento-novo.png)

### 7. Checkout público

- Nome: `Checkout`
- Caminho: URL pública de checkout `v2/checkout/...`
- Finalidade: captura de pagamento do link
- O que conseguimos configurar a partir do painel:
  - métodos aceitos
  - parâmetros do link
  - comportamento do link recorrente
- O que encontramos:
  - métodos disponíveis:
    - cartão
    - PIX
    - boleto
  - evidência de recorrência embutida:
    - `teste (mensal)`
    - `Assinatura do plano teste`
- O que ainda depende da MyGateway:
  - documentação do fluxo de assinatura
  - eventos e contratos do ciclo recorrente
- Print:
  - [checkout-link-pagamento.png](file:///c:/Users/Leonardo/AppData/Local/Temp/trae/screenshots/checkout-link-pagamento.png)

## Auditoria por tema solicitado

### Configurações

#### Chaves de integração

- Encontradas: `SIM`
- Client ID: `SIM`
- Client Secret: `SIM`
- API Key explícita com esse nome: `NÃO`
- Ambiente Sandbox/Produção visível na tela: `NÃO`
- URLs visíveis na tela: `NÃO`
- Permissões: parcialmente visíveis por `Usuários` e `Grupos`, sem documentação técnica

### Webhooks

- Existe tela? `SIM`
- Quais eventos podem ser cadastrados? `NÃO VISÍVEL`
- Existe secret? `NÃO VISÍVEL`
- Existe assinatura? `NÃO VISÍVEL`
- Existe replay? `NÃO VISÍVEL`
- Existe documentação? `NÃO`

### Recebedores

- Existe módulo? `NÃO ENCONTRADO`
- É possível cadastrar? `NÃO IDENTIFICADO`
- Existe documentação? `NÃO`
- Quais campos existem? `NÃO APLICÁVEL`

### KYC

- Existe área? `NÃO ENCONTRADA`
- Como funciona? `NÃO VISÍVEL`
- Quais status aparecem? `NÃO VISÍVEL`
- Existe documentação? `NÃO`
- Existe upload de documentos? `NÃO VISÍVEL`

### Payment Links

- Existe configuração adicional que ainda não utilizamos? `SIM`
- Itens relevantes encontrados:
  - validade
  - número máximo de pagamentos
  - parcelas mínimas e máximas
  - `CEP only`
  - juros para cliente
  - boleto além de PIX/cartão
  - recorrência embutida no checkout/link

### Split

- Existe configuração? `NÃO ENCONTRADA`
- Existe documentação? `NÃO`
- Existe tela administrativa? `NÃO ENCONTRADA`

### Assinaturas

- Existe módulo? `NÃO COMO MÓDULO DEDICADO`
- Quais funcionalidades existem?
  - indício de assinatura recorrente via links/checkout
  - recorrência mensal encontrada no checkout
- O que falta:
  - console administrativo próprio
  - gestão de planos/assinaturas no painel
  - documentação funcional/técnica

### Repasses

- Existe tela? `NÃO ENCONTRADA`
- Existe configuração? `NÃO ENCONTRADA`
- Existe consulta? `NÃO ENCONTRADA`

### Antecipação

- Existe área? `NÃO ENCONTRADA`
- Existe configuração? `NÃO ENCONTRADA`

### PIX

- Existe alguma configuração específica? `SIM`
- Onde aparece:
  - chave PIX em `Minha loja`
  - método de pagamento no checkout
  - indicadores no dashboard
- Existe Pix Automático? `NÃO IDENTIFICADO`

### API / Desenvolvedores / Integrações / Documentação / Swagger / Postman / Downloads

- Área de API? `NÃO ENCONTRADA COMO CENTRAL PRÓPRIA`
- Área de Desenvolvedores? `NÃO ENCONTRADA`
- Área de Integrações? `NÃO ENCONTRADA`
- Documentação? `NÃO ENCONTRADA`
- Swagger? `NÃO ENCONTRADO`
- Postman? `NÃO ENCONTRADO`
- Downloads? `NÃO COMO ÁREA TÉCNICA`
- Observação:
  - há exportação de relatórios em `Excel` e `PDF`, mas não uma central de downloads técnicos

## Recursos disponíveis

- Dashboard operacional
- Cobranças
- Clientes
- Relatórios
- Minha loja
- Taxas customizadas
- Meu perfil
- Chaves de integração
- Webhooks
- Usuários
- Grupos
- Links de pagamento
- Checkout com cartão, PIX e boleto
- Exportação de relatórios em Excel/PDF

## Recursos ocultos ou parcialmente ocultos

- Links de pagamento funcional fora do menu lateral principal
- Recorrência/assinatura embutida em links e checkout
- Uso de origens diferentes:
  - `Link de Pagamento/API`
  - `Maquininha`
- Gestão de integrações com `Client ID` e `Client Secret`, mas sem documentação técnica navegável

## Recursos não encontrados

- Recebedores
- KYC
- Split
- Repasses
- Antecipação
- Assinaturas como módulo administrativo
- PIX como módulo dedicado
- Swagger
- Postman
- documentação técnica autenticada
- central de downloads técnicos

## Configurações encontradas

- Dados bancários da loja
- Chave PIX
- Branding da loja
- Taxas customizadas
- Perfil do usuário
- Credenciais de integração
- Cadastro de webhook
- Grupos e usuários
- Configuração detalhada de link de pagamento

## Rotas testadas com falha ou indisponíveis

As rotas abaixo foram testadas como candidatas a módulos administrativos e retornaram erro `500` ou não funcionaram como área válida do painel:

- `/recebedores`
- `/repasses`
- `/assinaturas`
- `/subscriptions/plans`
- `/pix`
- `/split`
- `/kyc`
- `/antecipacao`
- `/api/docs`
- `/downloads`

## Suporte e documentação dentro do painel

- Não foi localizada área escondida de ajuda, docs, swagger, postman ou downloads dentro do painel autenticado
- Não foi localizada central autenticada de documentação técnica
- O atalho `Fale com o suporte` encontrado no painel apontava para `https://wa.me/55`, aparentando estar incompleto

## Conclusões

### 1. Precisamos realmente abrir chamado para a MyGateway?

`SIM`

Motivo:

- O painel já nos entrega credenciais e webhooks, mas **não entrega documentação suficiente** para integrar com segurança módulos críticos além do básico.
- Não encontramos contrato técnico visível para:
  - auth
  - webhooks
  - assinaturas
  - KYC
  - recebedores
  - split
  - repasses
  - antecipação
  - Pix Automático

### 2. O que já conseguimos implementar apenas com o que existe hoje no painel?

- Configuração inicial de credenciais de integração
- Cadastro e gestão básica de webhook
- Homologação do fluxo de links de pagamento
- Homologação de checkout com:
  - cartão
  - PIX
  - boleto
- Exploração funcional de recorrência embutida em links/checkout
- Mapeamento operacional de origens e relatórios

### 3. O que obrigatoriamente depende de documentação adicional?

- Autenticação formal da API
- Payloads e eventos de webhook
- Recebedores
- KYC
- Split
- Assinaturas como contrato de API
- Repasses/payouts
- Antecipação
- Pix Automático
- Rate limits
- retries
- erros oficiais

### 4. Existe algum recurso importante que ainda não estamos utilizando?

`SIM`

Os principais são:

- configurações mais completas de links de pagamento
- boleto no checkout
- recorrência embutida em links/checkout
- taxação customizada
- relatórios com exportação Excel/PDF
- gestão de grupos/usuários do tenant

### 5. Existe alguma configuração recomendada antes de iniciar a integração?

`SIM`

Recomendado antes de começar:

- revisar e organizar as `Chaves de integração`
- confirmar qual credencial será usada pela Connekt
- revisar `Webhooks` e padronizar endpoint de homologação
- validar se a `API Key` do webhook é obrigatória e como deve ser assinada
- revisar `Minha loja`, especialmente:
  - dados bancários
  - chave PIX
  - identidade visual
- validar recorrência e métodos habilitados nos `Links de pagamento`
- validar grupos/permissões do tenant para evitar dependência de usuário individual

## Recomendação prática

Antes de implementar:

1. Extrair do painel tudo o que já está disponível:
   - credenciais
   - webhook
   - parâmetros de link
   - checkout
2. Abrir chamado curto e objetivo para obter:
   - documentação de auth
   - documentação de webhook
   - documentação de payment links/checkout
   - confirmação sobre assinaturas
   - confirmação sobre módulos ausentes:
     - recebedores
     - KYC
     - split
     - repasses
     - antecipação
     - Pix Automático
3. Iniciar a integração apenas pelo bloco que já se mostrou maduro no painel:
   - links de pagamento
   - checkout
   - credenciais
   - webhook
