# Connekt Pay — QA Report

Data: 2026-06-23  
Escopo: QA funcional e UX por inspeção do código + verificação de build/lint + suite Playwright existente (smoke/unit).  
Observação: itens de alta prioridade (B1, B2, B3, R1, R2) foram corrigidos após este relatório.

## 1) Telas testadas

Rotas públicas:
- `/` (redirect/landing)
- `/login`
- `/register`
- `/reset-password`
- `/checkout?slug=...`

Rotas autenticadas (AppShell):
- `/dashboard`
- `/transacoes`
- `/links-pagamento`
- `/links-pagamento/novo`
- `/assinaturas`
- `/subscriptions`
- `/subscriptions/new`
- `/subscriptions/plans`
- `/subscriptions/[id]`
- `/recebedores`
- `/ledger`
- `/antecipacao`
- `/repasses`

Rotas admin:
- `/admin/painel`
- `/admin/aprovacao-kyc`
- `/admin/eventos`
- `/admin/anticipation`
- `/admin/conciliacao`
- `/admin/auditoria`
- `/admin/provedor-financeiro`

## 2) Fluxos testados

Autenticação:
- Login/logout (inspeção de telas + smoke de redirect de rotas protegidas).
- Reset de senha (tela + chamadas).

Comercial:
- Listagem e busca de transações (filtro por status + export CSV).
- Links de pagamento: listar, copiar link, abrir checkout.
- Checkout: escolher método, gerar cobrança PIX, pagar cartão, polling de status.
- Assinaturas: listar, ver detalhes (`/subscriptions/[id]`), criar nova (`/subscriptions/new`), gerenciar planos (`/subscriptions/plans`).

Financeiro:
- Ledger: KPIs, listagem e tentativa de export.
- Antecipação: simulação, listagem, criação (sem validação com provider real).
- Repasses: listar, solicitar repasse manual, “liquidar” manualmente.

Admin:
- Fila de aprovação KYC: listar, aprovar/rejeitar e abrir docs.
- Eventos: listagem, filtros e reprocessar evento.
- Auditoria: listagem e tentativa de export.
- Provedor financeiro: status/configuração.
- Conciliação: executar e revisar divergências (dependente de MyGateway para parte do fluxo).

## 3) Bugs encontrados

### B1 — Checkout “Voltar ao início” leva usuário não autenticado para /dashboard
- Onde: [CheckoutScreen](file:///c:/Users/Leonardo/Desktop/ConnektPay/components/screens.tsx#L1312-L1333)
- Como reproduzir: abrir checkout público, finalizar pagamento, clicar “Voltar ao início”.
- Comportamento atual: redireciona para `/dashboard`, que exige login (cliente final cai em tela de login).
- Esperado: redirecionar para uma página pública (ex.: “/checkout?slug=...”, “/” com confirmação, ou uma “thank you” pública).
- Prioridade: Alta
- Status: Corrigido (agora redireciona para `/checkout/success`, que é público).

### B2 — Ações de “…” sem handler em tabelas (botão clicável não faz nada)
- Onde:
  - Transações: [TransactionsScreen](file:///c:/Users/Leonardo/Desktop/ConnektPay/components/screens.tsx#L860-L864)
  - Assinaturas (lista): [SubscriptionsScreen](file:///c:/Users/Leonardo/Desktop/ConnektPay/components/screens.tsx#L1638-L1642)
- Como reproduzir: passar mouse na linha e clicar em “…” (MoreHorizontal).
- Comportamento atual: não há `onClick` → clique não executa ação.
- Esperado: abrir detalhes, menu contextual (ver, reprocessar, copiar, etc.) ou remover o botão.
- Prioridade: Alta
- Status: Corrigido (dropdown funcional com ações: Transações “Ver detalhes/Copiar ID”; Assinaturas “Ver detalhes/Cancelar”).

### B3 — Botões “Exportar”/“Exportar OFX” sem ação
- Onde:
  - Ledger: [LedgerScreen](file:///c:/Users/Leonardo/Desktop/ConnektPay/components/screens.tsx#L2510-L2516)
  - Auditoria: [AuditLogsScreen](file:///c:/Users/Leonardo/Desktop/ConnektPay/components/screens.tsx#L3486-L3494)
  - Repasses: [RepassesScreen](file:///c:/Users/Leonardo/Desktop/ConnektPay/components/screens.tsx#L3860-L3862)
- Comportamento atual: botões aparentam exportar, mas não há `onClick`.
- Esperado: export real ou botão desabilitado/oculto até existir endpoint.
- Prioridade: Alta
- Status: Corrigido (export CSV implementado; botões desabilitam quando não há dados).

### B4 — Header: sino de notificações e avatar são clicáveis mas não fazem nada
- Onde: [Header](file:///c:/Users/Leonardo/Desktop/ConnektPay/components/layout/Header.tsx#L26-L74)
- Comportamento atual: UI indica interação (cursor pointer), mas sem ação.
- Esperado: abrir central de notificações/perfil ou remover affordance.
- Prioridade: Média
- Status: Corrigido (dropdown de notificações + menu do usuário com “Minha conta/Configurações/Sair”).

### B5 — Abertura de múltiplas abas para documentos KYC pode ser bloqueada por popup blocker
- Onde: botão “Docs” abre várias `window.open` em loop: [KycApprovalScreen](file:///c:/Users/Leonardo/Desktop/ConnektPay/components/screens.tsx#L2970-L2985)
- Comportamento atual: navegadores podem bloquear parte/todas as abas; experiência inconsistente.
- Esperado: abrir uma única página/galeria, ou abrir um arquivo por vez com confirmação.
- Prioridade: Média
- Status: Corrigido (visualização em modal único com preview + botão explícito “Abrir documento”).

## 4) Botões sem ação (inventário)

- “…” (MoreHorizontal) em tabelas de:
  - Transações: [TransactionsScreen](file:///c:/Users/Leonardo/Desktop/ConnektPay/components/screens.tsx#L860-L864)
  - Assinaturas: [SubscriptionsScreen](file:///c:/Users/Leonardo/Desktop/ConnektPay/components/screens.tsx#L1638-L1642)
- Exportações:
  - Ledger “Exportar OFX”: [LedgerScreen](file:///c:/Users/Leonardo/Desktop/ConnektPay/components/screens.tsx#L2510-L2516)
  - Auditoria “Exportar”: [AuditLogsScreen](file:///c:/Users/Leonardo/Desktop/ConnektPay/components/screens.tsx#L3486-L3494)
  - Repasses “Exportar”: [RepassesScreen](file:///c:/Users/Leonardo/Desktop/ConnektPay/components/screens.tsx#L3860-L3862)
- Header:
  - Sino: [Header](file:///c:/Users/Leonardo/Desktop/ConnektPay/components/layout/Header.tsx#L27-L55)
  - Avatar: [Header](file:///c:/Users/Leonardo/Desktop/ConnektPay/components/layout/Header.tsx#L56-L73)

## 5) Formulários com problema

Checkout:
- Campos de cartão e documento sem máscara/validação de formato no frontend (risco de erro “misterioso” no backend): [CheckoutScreen](file:///c:/Users/Leonardo/Desktop/ConnektPay/components/screens.tsx#L1429-L1456)
- “Copiar PIX” usa clipboard sem tratar erro (permissão do navegador pode falhar silenciosamente): [CheckoutScreen](file:///c:/Users/Leonardo/Desktop/ConnektPay/components/screens.tsx#L1405-L1414)

Recebedores/KYC:
- Criação de recebedor via `window.prompt` (sem validação guiada, pode gerar dados inválidos e fricção na demo): [RecipientsScreen](file:///c:/Users/Leonardo/Desktop/ConnektPay/components/screens.tsx#L2115-L2140)
- KYC rejeitar via prompt de motivo (pouco controlado): [KycApprovalScreen](file:///c:/Users/Leonardo/Desktop/ConnektPay/components/screens.tsx#L2895-L2905)

Planos/Assinaturas:
- Criação de plano via prompts (nome/valor/ciclo/método), com alto risco de input inválido e UX fraca para apresentação: [SubscriptionPlansScreen](file:///c:/Users/Leonardo/Desktop/ConnektPay/components/screens.tsx#L1595-L1629)

## 6) Problemas de responsividade

### R1 — Tabelas podem “cortar” conteúdo em telas menores
- Onde: [TableCard](file:///c:/Users/Leonardo/Desktop/ConnektPay/components/ui/Table.tsx#L5-L18)
- Causa provável: `overflow: hidden` no container sem scroll horizontal; tabelas com muitas colunas (ex.: Repasses, Auditoria, Transações) podem ficar ilegíveis no mobile/tablet.
- Prioridade: Alta
- Status: Corrigido (TableCard agora permite scroll horizontal com `overflowX: auto`).

### R2 — Sidebar some no mobile e não há navegação alternativa
- Onde:
  - Sidebar está `hidden md:flex`: [Sidebar](file:///c:/Users/Leonardo/Desktop/ConnektPay/components/layout/Sidebar.tsx#L115-L120)
  - Header não oferece menu/hamburger: [Header](file:///c:/Users/Leonardo/Desktop/ConnektPay/components/layout/Header.tsx)
- Impacto: em mobile não existe caminho de navegação entre telas.
- Prioridade: Alta (se mobile fizer parte da apresentação); Média (se demo for só desktop).
- Status: Corrigido (menu hamburguer no header abre drawer de navegação no mobile).

### R3 — Login/Checkout com colunas fixas podem estourar em telas pequenas
- Onde:
  - Login tem painel lateral com largura fixa: [LoginScreen](file:///c:/Users/Leonardo/Desktop/ConnektPay/components/screens.tsx#L72-L79)
  - Checkout tem painel lateral com largura fixa: [CheckoutScreen](file:///c:/Users/Leonardo/Desktop/ConnektPay/components/screens.tsx#L1336-L1340)
- Prioridade: Média (desktop ok, mobile pode quebrar).

## 7) Problemas de loading

- Várias telas usam “Carregando...” mas não desabilitam todas as ações relacionadas; risco de double-submit em redes lentas (ex.: fluxos que dependem de múltiplos fetchs).
- Checkout faz polling a cada 2,5s enquanto `transactionId` estiver setado; funciona, mas não há feedback de “tentativas/tempo” e o usuário pode ficar preso esperando sem guidance: [CheckoutScreen](file:///c:/Users/Leonardo/Desktop/ConnektPay/components/screens.tsx#L1292-L1311)

Prioridade: Média

## 8) Mensagens de erro ruins

- Mensagens genéricas repetidas (“Falha ao carregar …”, “Internal Server Error”) dificultam troubleshooting e passam pouca confiança em demo.
- Em alguns fluxos o erro exibido pode ser `e.message` (pode vazar mensagens técnicas/inglês do runtime/Supabase).

Prioridade: Média

## 9) Fluxos que precisam de dados reais da MyGateway

Esses fluxos dependem de endpoints/webhooks reais para validação completa e UX confiável:
- Checkout:
  - PIX: geração de cobrança, QR real, confirmação de pagamento e transição para “pago”.
  - Cartão: tokenização e aprovação/recusa real.
- Assinaturas:
  - Criação/cancelamento e eventos de cobrança recorrente.
- Repasses (payouts):
  - Status real (`requested/processing/paid/failed`) via webhook/provider; hoje existe fallback/manual de “Liquidar”.
- Conciliação:
  - Consulta de transações/payouts no provider para comparação completa.
- KYC no provider:
  - Ainda não há endpoint oficial integrado para “submit KYC” no provider (onboarding full).

Referência: [MYGATEWAY-INTEGRATION-STATUS.md](file:///c:/Users/Leonardo/Desktop/ConnektPay/docs/MYGATEWAY-INTEGRATION-STATUS.md)

## 10) Prioridade de correção

Alta:
- B1 (Checkout redireciona cliente para área logada) — corrigido.
- B2 (botões “…” sem ação em Transações e Assinaturas) — corrigido.
- B3 (exportações sem ação em Ledger/Auditoria/Repasses) — corrigido.
- R1 (tabelas sem scroll horizontal e possível corte de conteúdo) — corrigido.
- R2 (sem navegação em mobile, se for requisito) — corrigido.

Média:
- B4 (Header com botões “fantasmas”) — corrigido.
- B5 (Docs KYC abrindo múltiplas abas) — corrigido.
- Melhorias de loading/feedback (desabilitar botões durante submit + estados de ação) — corrigido.
- Padronização/qualidade de mensagens de erro — parcialmente melhorado (mensagens mais claras em ações críticas).

Baixa:
- Ajustes de microcopy (labels que não acompanham filtros, textos estáticos “últimos 30 dias” em algumas áreas).
- Máscaras de input (desde que backend valide e a apresentação seja controlada).
