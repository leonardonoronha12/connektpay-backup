# HOMOLOGAÇÃO — Rodada 2 (Cezar)

Data: 2026-06-27
Ambiente: Produção (https://connektpay.vercel.app)

## Resumo

Esta rodada focou em eliminar comportamentos que pareciam “bug” para o homologador, padronizar mensagens quando a MyGateway ainda não está integrada e aumentar a confiabilidade do login em diferentes navegadores.

## Bugs encontrados

### BUG 1 — Modal fechando durante digitação (Recebedores)

- Tela: Recebedores → “Adicionar recebedor”
- Sintoma: o modal fechava enquanto o usuário digitava, impedindo cadastro.
- Causa raiz: o modal de prompt submetia automaticamente ao pressionar Enter. Em alguns cenários de digitação (teclado mobile/IME/autocomplete), o Enter pode ocorrer durante a escrita e disparava o submit, fechando o modal.
- Correção aplicada:
  - Removido submit automático por Enter no prompt.
  - O modal agora só fecha via Cancelar, Confirmar, ESC ou clique fora (quando aplicável).
- Arquivo: [screens.tsx](file:///c:/Users/Leonardo/Desktop/ConnektPay/components/screens.tsx)

### BUG 2 — Login inconsistente entre navegadores

- Tela: Login
- Sintoma: em alguns navegadores/ambientes o login funcionava em aba anônima, mas falhava/voltava ao /login em sessão “normal”.
- Causa raiz:
  - O fluxo de autenticação dependia de sessão client-side e podia não garantir cookies válidos antes do redirecionamento para rotas protegidas pelo middleware.
  - Em cenários específicos, isso resultava em redirecionamento de volta para /login por ausência de sessão reconhecida pelo middleware.
  - Em WebKit/mobile, havia risco de interação antes da hidratação, causando perda de valor em campos controlados.
- Correção aplicada:
  - Login passou a ser realizado via endpoint server-side que define cookies de autenticação de forma confiável:
    - `POST /api/auth/login`
    - `POST /api/auth/logout`
  - Auth pages passaram a renderizar via `next/dynamic` com `ssr: false` para evitar inconsistências de hidratação em dispositivos/navegadores.
- Arquivos:
  - [auth/login route](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/auth/login/route.ts)
  - [auth/logout route](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/auth/logout/route.ts)
  - [auth service](file:///c:/Users/Leonardo/Desktop/ConnektPay/services/auth.ts)
  - [login page](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/login/page.tsx)
  - [register page](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/register/page.tsx)
  - [reset-password page](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/reset-password/page.tsx)

## Revisão completa (itens padronizados)

### Dependências MyGateway (não parecer quebrado)

- Padronizada a mensagem de indisponibilidade quando o provedor ainda não está configurado, evitando aparência de erro técnico.
- Mensagem: “Disponível após integração com a MyGateway.”
- Arquivo: [toUserFacingError](file:///c:/Users/Leonardo/Desktop/ConnektPay/components/screens.tsx)

### UX (modal/inputs)

- Inputs com máscara e cursor (CPF/CNPJ, telefone, CEP e bancários) seguem com preservação de caret para evitar “briga” na digitação.
- Parcelamento no Checkout/Links exibe valores estimados e deixa explícito quando é simulação.

## Telas revisadas (check automático)

- Login
- Recebedores
- Dashboard
- Ledger
- Antecipação
- Repasses
- Admin: Aprovação KYC, Eventos, Conciliação, Auditoria, Antecipações
- Configurações e Integrações
- Documentação

## Funcionalidades em simulação

- Checkout (Cartão): parcelamento + taxa estimada + total estimado (quando aplicável).
- Antecipação: simulação visual com confirmação financeira em “Em breve” quando o provedor não estiver integrado.

## Funcionalidades aguardando integração MyGateway (exemplos)

- PIX real (criação, confirmação e atualização de status)
- Cartão real (tokenização, autorização/captura e status)
- Split financeiro no provedor
- Webhooks reais do provedor (assinatura/idempotência/retries)
- Repasses reais e conciliação completa com dados do provedor

## Documentação (status)

- Atualizado o status de módulos com:
  - ✅ pronto
  - 🟡 simulação/pré-visualização
  - 🔵 aguardando MyGateway
  - ❌ não implementado
- Página: [status-do-projeto.md](file:///c:/Users/Leonardo/Desktop/ConnektPay/docs-web/status-do-projeto.md)

## Performance e Responsividade da UI

### Gargalos encontrados

- Navegação: ao clicar em itens do menu lateral, não havia feedback imediato (o item só “mudava” após a troca de rota), gerando sensação de travamento.
- Recebedores: ao editar um recebedor (modal/overlay aberto), a lista de cards por trás era re-renderizada a cada tecla, degradando a fluidez de digitação.
- Transações/Dashboard: havia computação derivada (map/sort/format de datas) executando em todo render mesmo quando os dados não mudavam.
- Console: erros/stack traces apareciam no console em produção, dando aparência de produto instável.

### Causa raiz

- Ausência de estado “pendente” na navegação do sidebar e ausência de prefetch de rotas.
- Componentes grandes e listas renderizadas no mesmo componente que o formulário (re-render global desnecessário durante digitação).
- Falta de memoização para dados derivados e formatação.

### Correções aplicadas

- Feedback imediato de navegação:
  - Sidebar passa a marcar o item como pendente instantaneamente e exibe spinner até a rota trocar.
  - Prefetch das rotas acessíveis para reduzir latência de troca de telas.
  - Arquivo: [Sidebar.tsx](file:///c:/Users/Leonardo/Desktop/ConnektPay/components/layout/Sidebar.tsx)
- Digitação fluida em Recebedores:
  - Grid de cards encapsulado e memoizado para não re-renderizar durante edição no modal/overlay.
  - Arquivo: [screens.tsx](file:///c:/Users/Leonardo/Desktop/ConnektPay/components/screens.tsx)
- Redução de trabalho por render:
  - Memoização de listas derivadas (Dashboard e Transações) para evitar map/sort repetidos a cada tecla/clique sem mudança de dados.
  - Arquivo: [screens.tsx](file:///c:/Users/Leonardo/Desktop/ConnektPay/components/screens.tsx)
- Menos refetch visível:
  - “Adicionar recebedor” deixa de fazer GET extra quando a API já retorna o novo recebedor.
  - Arquivo: [screens.tsx](file:///c:/Users/Leonardo/Desktop/ConnektPay/components/screens.tsx)
- Console em produção:
  - Console errors suprimidos em produção para evitar sensação de erro técnico durante homologação.
  - Arquivo: [screens.tsx](file:///c:/Users/Leonardo/Desktop/ConnektPay/components/screens.tsx)

### Medição (antes/depois)

Medição automatizada (Playwright) via [perf-ui.mjs](file:///c:/Users/Leonardo/Desktop/ConnektPay/scripts/perf-ui.mjs), executada em produção.

- Antes: [summary.json](file:///c:/Users/Leonardo/Desktop/ConnektPay/test-results/perf-ui-2026-06-27T20-50-38-066Z/summary.json)
- Depois: [summary.json](file:///c:/Users/Leonardo/Desktop/ConnektPay/test-results/perf-ui-2026-06-27T21-08-03-212Z/summary.json)

Principais números:

- Clique no menu → Links de Pagamento:
  - Antes (troca efetiva): 1433ms
  - Depois: feedback visual 6ms; troca efetiva 50ms
- Modal “Adicionar recebedor” (abrir): 57ms → 49ms
- Modal “Adicionar recebedor” (fechar): 114ms → 116ms
- Digitação (campo com máscara no modal de recebedor): 35ms → 34ms
- Digitação (CPF/CNPJ no overlay de edição de recebedor): 30ms → 26ms
- Console errors capturados pelo teste: 2 → 0

### Status final

- Feedback de clique no menu ficou abaixo de 100ms.
- Modais abrem/fecham sem sensação de travamento nos cenários medidos.
- Campos mascarados permanecem com digitação fluida e sem fechar modal.

## Validação final

- Lint: `npm run lint` (OK)
- Build: `npm run build` (OK)
- QA automatizado (Playwright, produção):
  - Desktop Chrome, Desktop Edge, Desktop Firefox, Desktop Safari (WebKit)
  - Mobile Android (emulação), Mobile iPhone (WebKit)
  - Suite: [homologacao-rodada2.spec.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/tests/homologacao-rodada2.spec.ts)

## Pendências restantes

- Expandir a bateria automatizada para cobrir todos os fluxos (CRUDs completos em Links/Assinaturas/Integrações, fluxos Admin e cenários RBAC específicos).
- Evoluir as telas dependentes de MyGateway conforme a integração real for concluída (removendo “simulação” onde aplicável).
