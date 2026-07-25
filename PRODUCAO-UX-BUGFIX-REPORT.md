## Connekt Pay — Produção (Vercel) — UX + Bugfix (500/Internal Server Error)

Base URL auditada: https://connektpay.vercel.app  
Data: 2026-06-25

### Objetivos do pedido
- Identificar endpoints com erro 500 e corrigir causa raiz
- Evitar exibir “Internal Server Error” (mensagem técnica crua) para o usuário
- Melhorar estados de loading/vazio e feedback de interação
- Corrigir responsividade do menu (hambúrguer apenas mobile/tablet)
- Rodar auditoria com Playwright em produção (Dashboard/Transações/Links/Assinaturas/Recebedores/Ledger/Antecipação/Repasses/Conciliação/Auditoria/Configurações/Mobile)
- Não mexer em MyGateway e não criar novas funcionalidades financeiras

---

## 1) Achados e causas prováveis

### 1.1 Divergência de rotas (Antecipação)
- Sintoma: telas/fluxos de Antecipação chamavam `/api/anticipation` e `/api/anticipation/simulate`, mas existia apenas `/api/anticipations` (plural).
- Impacto: falhas de carregamento e mensagens genéricas na UI (dependendo do tratamento de erro do front).
- Correção aplicada: criar rotas compatíveis com a UI e retornar shape esperado.
  - [route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/anticipation/route.ts)
  - [simulate/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/anticipation/simulate/route.ts)

### 1.2 Mensagens técnicas cruas (“Internal Server Error”) propagando para a UI
- Encontrado em múltiplos handlers e telas:
  - APIs retornando `{ error: 'Internal Server Error' }` em casos de erro do Supabase.
  - Telas exibindo diretamente `json.error` sem sanitização (o que torna “Internal Server Error” visível ao usuário).
- Correção aplicada:
  - Padronização de mensagem amigável no mapeamento de erro interno: [api-error.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/lib/api-error.ts)
  - Troca de retornos “Internal Server Error” para mensagens amigáveis + `console.error` server-side nos endpoints mais sensíveis para os módulos reportados:
    - Repasses: [payouts/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/payouts/route.ts), [[id]/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/payouts/%5Bid%5D/route.ts)
    - Onboarding ensure: [ensure/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/onboarding/ensure/route.ts)
    - Assinaturas (criação de plano automático): [subscriptions/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/subscriptions/route.ts)
    - Recebedores: [receivers/route.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/api/receivers/route.ts)
  - Sanitização/UI: helper `toUserFacingError` aplicado em fluxos de telas para substituir mensagens técnicas por textos amigáveis e registrar no console:
    - [screens.tsx](file:///c:/Users/Leonardo/Desktop/ConnektPay/components/screens.tsx)

---

## 2) Correções de UX/Loading/Estados vazios

### 2.1 Skeleton/Loading e feedback
- Cards KPI com skeleton (quando `loading=true`): [KpiCard.tsx](file:///c:/Users/Leonardo/Desktop/ConnektPay/components/ui/KpiCard.tsx)
- Botões com estado de loading (spinner) para submits/ações: [Buttons.tsx](file:///c:/Users/Leonardo/Desktop/ConnektPay/components/ui/Buttons.tsx)
- Tabelas já possuem estados “Carregando…” / “Nenhum item encontrado” em várias telas e foram mantidos/ajustados em telas críticas (Dashboard/Ledger/Antecipação/Repasses/Conciliação/Auditoria/Recebedores).

### 2.2 Mensagens amigáveis
- Telas passam a converter mensagens técnicas para mensagens amigáveis (ex.: erro interno, unauthorized, forbidden) e logar detalhes no console para diagnóstico:
  - [screens.tsx](file:///c:/Users/Leonardo/Desktop/ConnektPay/components/screens.tsx)

---

## 3) Responsividade (Hambúrguer no desktop)
- Causa: o botão de menu mobile tinha `style` com `display` inline interferindo no `md:hidden` do Tailwind.
- Correção aplicada:
  - Removido `display` inline e aplicado `className="flex md:hidden"` no botão.
  - Em desktop: sidebar continua visível via `Sidebar` com `hidden md:flex`.
  - Referências:
    - [Header.tsx](file:///c:/Users/Leonardo/Desktop/ConnektPay/components/layout/Header.tsx)
    - [Sidebar.tsx](file:///c:/Users/Leonardo/Desktop/ConnektPay/components/layout/Sidebar.tsx)
    - [AppShell.tsx](file:///c:/Users/Leonardo/Desktop/ConnektPay/components/layout/AppShell.tsx)

---

## 4) Build/Deploy

### 4.1 Falha no `next build` (SSG) em `/login`
- Sintoma: erro durante “Collecting/Generating static pages” ao prerenderizar `/login`.
- Correção aplicada: forçar `/login` como dinâmica para impedir prerender/SSG do fluxo de login.
  - [login/page.tsx](file:///c:/Users/Leonardo/Desktop/ConnektPay/app/login/page.tsx)

### 4.2 Validação local
- `npm run lint`: OK
- `npm run build`: OK (após o ajuste de `/login` e rebuild)

---

## 5) Playwright — Auditoria em produção (status)

### 5.1 Execução
- Suite usada: [qa-e2e-audit.spec.ts](file:///c:/Users/Leonardo/Desktop/ConnektPay/tests/qa-e2e-audit.spec.ts)
- Resultado: falha no passo de login por credenciais inválidas (não foi possível completar os fluxos autenticados).
- Evidência visual: screenshot do teste mostra mensagem “Invalid login credentials” em produção.

### 5.2 Como rodar corretamente
- Necessário fornecer `E2E_EMAIL` e `E2E_PASSWORD` válidos para a produção.
- Com variáveis corretas, a suite coleta automaticamente:
  - endpoints HTTP >= 400 (incluindo 500)
  - request failures
  - console errors
  - navegações/redirects
  - tráfego Supabase

---

## 6) Itens corrigidos diretamente ligados ao incidente (“Internal Server Error” nas telas)
- Antecipação: rotas compatíveis + mensagens amigáveis (UI e API)
- Ledger: tratamento de erro amigável e logging (UI e API)
- Repasses: mensagens amigáveis e logging (UI e API)
- Conciliação: mensagens amigáveis e logging (UI)
- Auditoria: mensagens amigáveis e logging (UI e API)
- Assinaturas: mensagens amigáveis e logging (UI e API)
- Recebedores: mensagens amigáveis e logging (UI e API)
- Dashboard: mensagens amigáveis e logging (UI)

