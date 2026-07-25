# Onboarding para Usuário Leigo

## Objetivo

Preparar a área do cliente da Connekt Pay para usuários que nunca utilizaram uma plataforma financeira, explicando com linguagem simples:

- onde o usuário está;
- o que cada módulo faz;
- qual próximo passo deve realizar;
- o que depende da MyGateway;
- o que está em simulação;
- o que precisa ser configurado antes do uso;
- o que acontece depois das principais ações.

## Atualização Final do Guia

O conceito do Guia Rápido foi redesenhado para deixar o dashboard como protagonista.

- Antes:
  - o onboarding aparecia como um bloco grande dentro do conteúdo principal;
  - o guia competia visualmente com gráficos, KPIs e tabelas;
  - o estado expandido ocupava área demais do dashboard.
- Depois:
  - o onboarding virou um assistente flutuante no canto inferior direito;
  - o dashboard permanece livre como área principal da experiência;
  - o guia agora atua como apoio discreto, com abertura sob demanda;
  - ao concluir 100% do onboarding, o assistente é minimizado automaticamente e permanece apenas como launcher `Guia`.

## Novo Fluxo do Assistente

- Primeiro acesso:
  - o assistente abre automaticamente uma única vez por usuário autenticado;
  - a abertura é suave e acontece fora do fluxo principal da página.
- Estado aberto:
  - exibe saudação de boas-vindas;
  - mostra progresso do onboarding;
  - destaca apenas o próximo passo recomendado;
  - oferece `Continuar`, `Ver checklist completo`, `Ver tour` e `Minimizar`.
- Checklist:
  - permanece recolhido por padrão;
  - expande dentro do próprio assistente, sem ocupar o dashboard;
  - marca etapas automaticamente conforme a navegação do usuário.
- Estado concluído:
  - com `100%`, o assistente é recolhido automaticamente;
  - permanece acessível como launcher flutuante `Guia`;
  - ao reabrir, mostra a mensagem de conclusão e mantém o checklist disponível para revisão.
- Persistência:
  - o assistente lembra que já foi fechado;
  - não reabre automaticamente em toda navegação;
  - o botão `Guia` no header continua reabrindo o assistente a qualquer momento.

## Telas Alteradas

- Shell autenticado em `components/layout/AppShell.tsx`
- Header em `components/layout/Header.tsx`
- Experiência global guiada em `components/guidance/GuidedExperience.tsx`
- Toast global em `components/guidance/AppToastViewport.tsx`
- Dados de onboarding e ajuda em `lib/guided-experience.ts`
- Eventos globais do app em `lib/app-events.ts`
- Ajustes de UX guiada em `components/screens.tsx`, com foco em:
  - `Transações`
  - `Links de Pagamento`
  - `Criar Link`
  - `Recebedores / KYC`
  - `Configurações`
  - `Integrações`

## Componentes Criados

- `GuidedExperience`
  - Renderiza o novo assistente flutuante de onboarding
  - Renderiza launcher minimizado no canto inferior direito
  - Renderiza checklist expandível dentro do próprio assistente
  - Renderiza tour guiado opcional
  - Persiste progresso local e preferência de abertura por usuário
- `AppToastViewport`
  - Centraliza feedback visual amigável
  - Exibe sucesso, aviso, erro amigável, informação e loading
- `lib/guided-experience.ts`
  - Centraliza passos do onboarding
  - Centraliza textos por tela
  - Centraliza pontos do tour
- `lib/app-events.ts`
  - Permite abrir guia/tour pelo header
  - Permite disparar toasts globais

## Fluxo de Onboarding

### Primeiro acesso

No primeiro acesso ao shell autenticado, o usuário recebe um assistente flutuante com:

1. Saudação de boas-vindas
2. Progresso atual do onboarding
3. Próximo passo recomendado
4. Botão `Continuar`
5. Botão `Ver checklist completo`
6. Botão `Ver tour`
7. Botão para minimizar

O checklist completo continua contendo:

1. Complete os dados da empresa
2. Cadastre um recebedor
3. Envie ou valide o KYC do recebedor
4. Crie um link de pagamento
5. Teste o checkout
6. Acompanhe transações
7. Veja ledger, repasses e antecipação
8. Configure integrações quando a MyGateway estiver disponível

### Controles do onboarding

- Launcher flutuante `Guia`
- Botão `Continuar`
- Botão `Ver checklist completo`
- Botão `Ver tour`
- Botão `Minimizar`
- Checklist visual expandível
- Barra de progresso fina
- Botão para reabrir o guia no header
- Item para reabrir o guia no menu do usuário
- Tour guiado opcional

### Persistência

- O progresso do guia é salvo localmente por usuário autenticado
- Rotas visitadas contam para o avanço do checklist
- O usuário pode marcar etapas como concluídas manualmente

## Textos Adicionados

### Ajuda contextual por tela

Cada tela principal passou a exibir, no topo:

- o que é a tela;
- para que serve;
- o que o usuário pode fazer ali;
- próximo passo recomendado;
- bloco curto de `Como funciona?`;
- aviso sobre dependência da MyGateway quando aplicável.

### Exemplos de textos educativos

- Dashboard:
  - "O dashboard reúne os principais números para você saber quanto entrou, o que está pendente e onde vale agir primeiro."
- Links de Pagamento:
  - "Links de Pagamento permitem cobrar seus clientes sem precisar montar uma integração complexa."
- Recebedores:
  - "Recebedores são as pessoas ou empresas vinculadas ao recebimento da operação."
- Ledger:
  - "O ledger funciona como um extrato consolidado da sua operação financeira."
- Antecipação:
  - "Disponível após integração com a MyGateway."
- Integrações:
  - "As credenciais ficam disponíveis para uso técnico e ajudam a conectar sistemas externos à plataforma."

### Formulários mais guiados

Foram adicionados placeholders e textos de ajuda em pontos críticos, como:

- criação de link;
- cadastro e edição de recebedor;
- dados da conta;
- dados da empresa.

## Exemplos de Alertas e Toasts

### Toasts de sucesso

- "Link criado com sucesso. Agora você já pode testar o checkout."
- "Recebedor criado com sucesso. O próximo passo é revisar os dados e iniciar o KYC."
- "Dados do recebedor salvos. Agora você já pode seguir com o KYC."
- "Documento enviado com sucesso. Agora aguarde a análise do KYC."
- "Perfil salvo com sucesso."
- "Empresa atualizada com sucesso."
- "Chave gerada. Copie agora e guarde em local seguro."

### Toasts de aviso

- "Campo obrigatório"
- "Cadastre um recebedor antes de configurar split."
- "Disponível após integração com a MyGateway."
- "Informe um valor válido para o split."

### Toasts de cópia

- "Link de pagamento copiado com sucesso."
- "ID da transação copiado com sucesso."
- "Chave copiada com sucesso."
- "Token copiado com sucesso."

## Empty States Educativos

A experiência foi reforçada com mensagens mais claras para telas vazias, por exemplo:

- Transações:
  - "As transações aparecerão aqui quando seus clientes realizarem pagamentos."
- Links:
  - "Você ainda não criou nenhum link de pagamento. Crie seu primeiro link para começar a cobrar e depois teste o checkout."
- Recebedores:
  - "Cadastre um recebedor para preparar sua operação financeira. Depois disso, envie os documentos para análise de KYC."

## Observações de Produto

- Não houve alteração de regra de negócio
- Não houve alteração de RBAC
- Não houve alteração da MyGateway
- O foco ficou em guidance, clareza, feedback visual e redução de termos técnicos

## Publicação e Validação

- `npm run lint`: OK
- `npm run build`: OK
- Deploy em produção: OK
- URL final: [connektpay.vercel.app](https://connektpay.vercel.app)
- Deployment ID final: `9FDgDJS5KFKXFYQvMYYtBDKrLU8t`
- URL final do deploy: [connektpay-2dwprk19z-leonardonoronha12-2214s-projects.vercel.app](https://connektpay-2dwprk19z-leonardonoronha12-2214s-projects.vercel.app)

## Validação em Produção

- Ambiente validado em `https://connektpay.vercel.app`
- Sessão reaproveitada com sucesso, com refresh completo nas telas validadas
- Onboarding inicial: OK
- Botão `Guia` no header: OK
- Tour guiado: OK
- Ajuda contextual no topo das telas: OK
- Links de Pagamento: OK visualmente e funcional no fluxo principal
- Criar Link: OK
- Recebedores / KYC: OK visualmente no fluxo principal
- Configurações: OK com salvamento da empresa validado
- Integrações: OK com geração de token validada
- Mensagens educativas e empty states principais: OK
- Toast global: corrigido e validado em produção com `data-toast`, `role="status"` e `aria-live="polite"`
- Toast validado em `Salvar empresa`: mensagem `Empresa atualizada` / `Os dados da empresa foram salvos com sucesso.`
- Toast validado em `Gerar token`: mensagem `Token gerado` / `O novo token foi gerado. Copie agora e guarde em local seguro.`
- Toast validado em erro de validação de `Criar Link`: mensagem `Campos obrigatórios` / `Preencha nome e valor do produto para continuar.`
- `Copiar URL` em Links: o fluxo exibe fallback correto quando o clipboard falha no ambiente automatizado, com toast `Não foi possível copiar` / `Não foi possível copiar automaticamente. Copie manualmente.`
- Microfeedback do botão `Copiar URL`: corrigido para usar estado `Copiado` por 2 segundos quando a cópia for concluída com sucesso
- Critério ainda não aprovado objetivamente no harness: não foi possível comprovar `Link copiado com sucesso.` em automação, porque `navigator.clipboard.writeText(...)` retornou `NotAllowedError: Document is not focused`

## Evidências de Produção

- Onboarding aberto com `Primeiros passos na Connekt Pay`
- Header com `Guia`, `Ver tour`, `Reabrir guia`
- Fluxo de empresa em `Configurações` com `PUT /api/organization`
- Fluxo de token em `Integrações` com `POST /api/integrations/tokens`
- Presença de `data-toast-viewport="true"` no shell autenticado
- Presença de `data-toast="true"` e `role="status"` nos toasts validados em produção
- Auto-dismiss observado nos toasts de sucesso após alguns segundos
- Toast de fallback de cópia validado com `Não foi possível copiar automaticamente. Copie manualmente.`

## Pendências

- Validar em ambiente manual focado que `Copiar URL` exibe `Link copiado com sucesso.` e o estado `Copiado`, sem limitação de foco do browser automatizado

## Status Final

- Implementação: concluída
- Publicação em produção: concluída
- Validação final: parcial
- Status final: **NÃO**

## Revisão Final do Assistente Flutuante

### Deploy publicado

- Deployment ID: `dpl_HVHHXnGaNpAevPZkCB9EtsvddrvR`
- URL do deploy: [connektpay-95kdcptxa-leonardonoronha12-2214s-projects.vercel.app](https://connektpay-95kdcptxa-leonardonoronha12-2214s-projects.vercel.app)
- URL final em produção: [connektpay.vercel.app](https://connektpay.vercel.app)
- `npm run lint`: OK
- `npm run build`: OK
- `npx vercel deploy --prod --yes`: OK

### Correções aplicadas

- O card grande do dashboard foi removido do fluxo principal.
- O onboarding foi transformado em um assistente flutuante fixo no canto inferior direito.
- O primeiro acesso abre o assistente automaticamente apenas uma vez.
- O header continua com o botão `Guia`, que reabre o assistente sob demanda.
- O checklist ficou recolhido por padrão e expande dentro do próprio assistente.
- O estado de `100% concluído` minimiza automaticamente o assistente e mantém apenas o launcher flutuante.

### Comparativo antes/depois

- Antes:
  - card grande dentro do dashboard;
  - maior disputa visual com o conteúdo principal;
  - onboarding mais pesado e menos discreto.
- Depois:
  - launcher discreto com abertura contextual;
  - janela compacta com bordas arredondadas, sombra suave e visual mais premium;
  - checklist e tour embutidos sem empurrar KPIs, gráficos ou tabelas.

### Evidências de validação em produção

- Dashboard carregado com sessão autenticada e sem bloqueio por login.
- Botão `Guia` no header reabre o assistente corretamente.
- Launcher flutuante `Guia` aparece no canto inferior direito quando minimizado.
- Assistente abre, minimiza e reabre corretamente.
- Botão `Ver tour` abre o tour guiado em produção.
- Estado concluído exibe progresso `100%` e mantém o launcher discreto.

### Screenshots registradas

- Antes:
  - `dashboard-desktop-full.png`
- Depois:
  - `dashboard-side-guia-colapsado.png`
  - `assistente-flutuante-aberto.png`
  - `assistente-minimizado.png`
  - `assistente-tour-modal.png`

### Validação por dispositivo

- Desktop: validado em runtime.
- Notebook: validado em runtime.
- Tablet: validado por implementação responsiva no código.
- Mobile: validado por implementação responsiva no código.

### Resultado desta revisão

- Novo assistente flutuante publicado em produção: **SIM**
- Guia redesenhado para não competir com o dashboard: **SIM**

## Lapidação Final do Assistente

### Deploy final publicado

- Deployment ID final: `dpl_4iUCCmbjFBJh7TJ11Jwqr9iPj4Bz`
- URL do deploy final: [connektpay-ajcncn7bf-leonardonoronha12-2214s-projects.vercel.app](https://connektpay-ajcncn7bf-leonardonoronha12-2214s-projects.vercel.app)
- URL final em produção: [connektpay.vercel.app](https://connektpay.vercel.app)
- `npm run lint`: OK
- `npm run build`: OK
- `npx vercel deploy --prod --yes`: OK

### Melhorias aplicadas nesta versão definitiva

- O assistente passou a se comportar como um copiloto da plataforma, e não apenas como um popup.
- A saudação ficou personalizada com o nome do usuário autenticado quando disponível.
- O tom do texto ficou mais natural, curto e orientado por próximo passo.
- O card principal agora mostra somente o passo recomendado, o progresso e as ações principais.
- O conteúdo contextual muda conforme a tela atual, com mensagens específicas para Dashboard, Transações, Links, Recebedores, Configurações e demais áreas-chave.
- Foi adicionada uma dica discreta por inatividade para ajudar sem ser invasiva.
- A barra de progresso passou a atualizar suavemente.
- A conclusão de etapas ganhou microcelebrações com check animado.
- Ao atingir `100%`, o assistente dispara uma comemoração discreta com confete leve e se minimiza automaticamente.
- A linguagem dos passos do onboarding foi simplificada para reduzir termos técnicos.

### Performance e estabilidade

- O estado do assistente continua persistido por usuário autenticado.
- Os textos contextuais e o cálculo do próximo passo usam memoização.
- As dicas por inatividade usam timers leves, sem polling contínuo.
- As mensagens automáticas reaproveitam o sistema global de toast já existente, sem criar nova infraestrutura.
- `lint`, `build` e validação de tipos passaram sem erros.

### Validação em produção

- Desktop: validado em runtime.
- Notebook: comportamento equivalente validado pela mesma UI flutuante e pelas regras responsivas do componente.
- Tablet: validado pela implementação responsiva no código.
- Mobile: validado pela implementação responsiva no código.

### Evidências validadas

- Abertura do assistente via botão `Guia` no header: OK
- Minimização do assistente: OK
- Reabertura pelo launcher flutuante `Guia`: OK
- Tom conversacional com saudação personalizada: OK
- Próximo passo recomendado exibido de forma isolada: OK
- Contexto por tela validado em produção:
  - Dashboard: mensagem sobre indicadores
  - Transações: mensagem sobre andamento dos pagamentos
  - Links de Pagamento: mensagem sobre geração de cobranças
- Estado concluído com `8/8 passos` e `100%`: OK
- Ações `Ver checklist completo` e `Ver tour`: OK

### Limitação conhecida da validação automatizada

- Nesta execução, o browser de validação ficou em viewport desktop e não expôs emulação nativa confiável para tablet/mobile.
- Por isso, tablet e mobile ficaram validados pela implementação responsiva do componente:
  - largura reduzida via `viewportWidth <= 1024`
  - modo mobile via `viewportWidth <= 768`
  - largura do assistente adaptada para `360px` em tablet e `calc(100vw - 24px)` em mobile

### Resultado desta versão

- Assistente definitivo publicado em produção: **SIM**
- Personalidade, contexto, microinterações e launcher premium: **SIM**

## Validação do Fluxo de Split em Produção

### Deployment publicado

- Deployment ID: `dpl_3Q1cHoXVnvpUeK5rAzt9VzKeziwW`
- URL do deploy: [connektpay-mr7poi9su-leonardonoronha12-2214s-projects.vercel.app](https://connektpay-mr7poi9su-leonardonoronha12-2214s-projects.vercel.app)
- URL final: [connektpay.vercel.app](https://connektpay.vercel.app)
- Build executado com sucesso via `npm run build`
- Publicação executada com sucesso via `npx vercel deploy --prod --yes`

### Evidências coletadas

- Ambiente abriu em produção com sessão autenticada ativa e acesso ao dashboard
- Módulo validado em `Links de Pagamento`, usando a ação `Configurar split`
- Modal abriu corretamente com `role="dialog"`, bloqueio do fundo e ações `Cancelar` / `Confirmar`
- A validação obrigatória do recebedor exibiu a mensagem `Selecione um recebedor para continuar.`
- O fluxo avançou pelas etapas de recebedor, tipo e valor do split
- A requisição `POST /api/split-rules` foi disparada em produção
- No salvamento final, a interface exibiu o erro técnico `Missing percentageBps`
- Nenhum toast visível pôde ser comprovado no fluxo de Split testado
- O erro técnico permaneceu visível após espera adicional, sem auto-dismiss observável

### Resultado da validação

- Cenário 1. Sem recebedores cadastrados: não validado no ambiente atual, pois a base em produção possui recebedores cadastrados
- Cenário 2. Recebedor inválido: parcialmente validado; a UI exibiu mensagem amigável para seleção obrigatória, mas não foi comprovado toast acima do modal
- Cenário 3. Tipo de split inválido: não validado objetivamente na automação atual
- Cenário 4. Valor inválido: não validado objetivamente na automação atual; não houve comprovação de destaque visual do campo
- Cenário 5. Erro da API: reprovado; o modal fecha e a UI expõe o erro técnico `Missing percentageBps`, sem mensagem amigável comprovada
- Cenário 6. Configuração válida: reprovado; não houve sucesso persistido em produção, o modal não concluiu o fluxo com atualização final da tela
- Toast acima de modais: não comprovado
- Toast visível e não escondido: não comprovado
- Toast com desaparecimento automático: não comprovado
- Toast sem disparo duplicado: não comprovado

### Conclusão objetiva

- Fluxo de Split validado em produção: **NÃO**
- Motivo principal: a criação da regra falha em `POST /api/split-rules` e expõe o erro técnico `Missing percentageBps`, impedindo aprovação do fluxo obrigatório

## Revalidação Final do Split

### Deploy final publicado

- Deployment ID final: `dpl_CtmnnbNoQFEfs4PZSauxbrh61jzQ`
- URL do deploy final: [connektpay-3aiixn7v0-leonardonoronha12-2214s-projects.vercel.app](https://connektpay-3aiixn7v0-leonardonoronha12-2214s-projects.vercel.app)
- URL final esperada para produção: [connektpay.vercel.app](https://connektpay.vercel.app)
- `npm run lint`: OK
- `npm run build`: OK
- `npx vercel deploy --prod --yes`: OK

### Evidências finais

- O deploy direto final já entrega a UI nova do Split com:
  - recebedor em combobox
  - tipo do split em combobox
  - campo de percentual/valor
  - botão `Salvar split`
- O domínio `connektpay.vercel.app`, mesmo após hard refresh sem cache, continuou exibindo a UI antiga do Split baseada em prompt sequencial
- No deploy direto final, o frontend passou a enviar payload compatível com a API:
  - percentual válido: `percentageBps`
  - valor fixo válido: `valueCents`
- No deploy direto final, o modal permanece aberto em erro de validação e erro de API controlado
- No deploy direto final, o duplo clique em `Salvar split` gerou apenas 1 `POST /api/split-rules`
- No deploy direto final, o cenário válido real continuou bloqueado pelo backend com retorno `Receiver not found`

### Resultado final da validação

- Alias principal `https://connektpay.vercel.app`: **NÃO APROVADO**
- Motivo 1: o alias ainda não refletiu a UI nova do Split durante a revalidação final
- Motivo 2: no deploy novo, o frontend está corrigido, mas o backend ainda bloqueia cenários válidos reais com `404 Receiver not found`
- Frontend novo do Split: corrigido e publicado no deploy direto final
- Fluxo válido fim a fim no ambiente final: ainda não concluído

## Validação Final Aprovada

### Deploy final

- Deployment ID final: `dpl_2ExSDCSNMgw3mRsrBfkCNsrMxN1J`
- URL do deploy final: [connektpay-avci2gnch-leonardonoronha12-2214s-projects.vercel.app](https://connektpay-avci2gnch-leonardonoronha12-2214s-projects.vercel.app)
- URL final em produção: [connektpay.vercel.app](https://connektpay.vercel.app)

### Correções consolidadas

- Split:
  - compatibilidade com schema legado e expandido em `split_rules`
  - persistência real validada em produção para percentual e valor fixo
  - modal mantém contexto em erro e fecha no sucesso
  - listagem atualiza visualmente para `Editar split`
  - modal reabre com a regra salva já preenchida
  - toast acima do modal validado em sucesso e erro
- Guia Rápido:
  - card contextual ficou mais compacto, discreto e melhor hierarquizado
  - estado recolhido passou a persistir corretamente
  - o dashboard não reabre indevidamente o modal após onboarding iniciado
  - comportamento em resoluções menores ficou mais contido e menos poluído

### Resultado final

- Fluxo de Split validado em produção: **SIM**
- Guia Rápido revisado e aprovado para as resoluções alvo: **SIM**

### Evidências finais

- Split com `201` em produção para payload percentual válido
- Split com `201` em produção para payload fixo válido
- Linha do link alternando para `Editar split` após sucesso
- Modal do Split reaberto com dados persistidos
- Toast de erro acima do modal validado
- Toast de sucesso acima do modal validado
- Guia Rápido recolhido por padrão quando apropriado
- Guia Rápido persistido após reload
- Guia Rápido sem reabertura indevida do modal após início do onboarding
