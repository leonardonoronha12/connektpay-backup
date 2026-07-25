# AUDITORIA FINAL — Connekt Pay v1.0.0

Data: 2026-06-25T21:01:49.302Z
Base URL: https://connektpay.vercel.app
Ferramenta: Playwright (navegação automática + coleta de console/network/performance)

## Critério de aprovação para homologação
- A plataforma só é considerada pronta para homologação quando não existir nenhum problema CRÍTICO nem ALTO.

## Resumo
- CRÍTICO: 0
- ALTO: 0
- MÉDIO: 1
- BAIXO: 0
- INFO: 12

## Ambiente de execução
- BASE_URL: https://connektpay.vercel.app
- E2E_EMAIL: definido
- E2E_PASSWORD: definido

## Resultados por módulo

### Autenticação — APROVADO

1) [INFO] Comportamento esperado após encerramento da sessão. (401 GET https://connektpay.vercel.app/api/transactions)
- Onde ocorreu: Logout (passed)
- Motivo: Comportamento esperado após encerramento da sessão. (401 GET https://connektpay.vercel.app/api/transactions)
- Como reproduzir:
  - 1. Defina BASE_URL=https://connektpay.vercel.app
  - 2. Defina E2E_EMAIL e E2E_PASSWORD válidos
  - 3. Rode: `node scripts/qa-e2e-report.mjs --run --no-setup`
  - 4. Etapas do fluxo:
  -    - Abrir /login
  -    - Preencher credenciais
  -    - Submeter login
  -    - Abrir menu do usuário
  -    - Sair
- Evidência:
  - test-results/qa-e2e-audit-QA-E2E-—-Connekt-Pay-2-Logout/network.json
  - test-results/qa-e2e-audit-QA-E2E-—-Connekt-Pay-2-Logout/performance.json
  - test-results/qa-e2e-audit-QA-E2E-—-Connekt-Pay-2-Logout/test-finished-1.png
  - test-results/qa-e2e-audit-QA-E2E-—-Connekt-Pay-2-Logout/trace.zip
  - test-results/qa-e2e-audit-QA-E2E-—-Connekt-Pay-2-Logout/video.webm
- Sugestão de correção: Nenhuma ação necessária.

2) [INFO] Comportamento esperado após encerramento da sessão. (401 GET https://connektpay.vercel.app/api/dashboard?days=30)
- Onde ocorreu: Logout (passed)
- Motivo: Comportamento esperado após encerramento da sessão. (401 GET https://connektpay.vercel.app/api/dashboard?days=30)
- Como reproduzir:
  - 1. Defina BASE_URL=https://connektpay.vercel.app
  - 2. Defina E2E_EMAIL e E2E_PASSWORD válidos
  - 3. Rode: `node scripts/qa-e2e-report.mjs --run --no-setup`
  - 4. Etapas do fluxo:
  -    - Abrir /login
  -    - Preencher credenciais
  -    - Submeter login
  -    - Abrir menu do usuário
  -    - Sair
- Evidência:
  - test-results/qa-e2e-audit-QA-E2E-—-Connekt-Pay-2-Logout/network.json
  - test-results/qa-e2e-audit-QA-E2E-—-Connekt-Pay-2-Logout/performance.json
  - test-results/qa-e2e-audit-QA-E2E-—-Connekt-Pay-2-Logout/test-finished-1.png
  - test-results/qa-e2e-audit-QA-E2E-—-Connekt-Pay-2-Logout/trace.zip
  - test-results/qa-e2e-audit-QA-E2E-—-Connekt-Pay-2-Logout/video.webm
- Sugestão de correção: Nenhuma ação necessária.

3) [INFO] Comportamento esperado após encerramento da sessão. (401 GET https://connektpay.vercel.app/api/me)
- Onde ocorreu: Logout (passed)
- Motivo: Comportamento esperado após encerramento da sessão. (401 GET https://connektpay.vercel.app/api/me)
- Como reproduzir:
  - 1. Defina BASE_URL=https://connektpay.vercel.app
  - 2. Defina E2E_EMAIL e E2E_PASSWORD válidos
  - 3. Rode: `node scripts/qa-e2e-report.mjs --run --no-setup`
  - 4. Etapas do fluxo:
  -    - Abrir /login
  -    - Preencher credenciais
  -    - Submeter login
  -    - Abrir menu do usuário
  -    - Sair
- Evidência:
  - test-results/qa-e2e-audit-QA-E2E-—-Connekt-Pay-2-Logout/network.json
  - test-results/qa-e2e-audit-QA-E2E-—-Connekt-Pay-2-Logout/performance.json
  - test-results/qa-e2e-audit-QA-E2E-—-Connekt-Pay-2-Logout/test-finished-1.png
  - test-results/qa-e2e-audit-QA-E2E-—-Connekt-Pay-2-Logout/trace.zip
  - test-results/qa-e2e-audit-QA-E2E-—-Connekt-Pay-2-Logout/video.webm
- Sugestão de correção: Nenhuma ação necessária.

4) [INFO] Comportamento esperado após encerramento da sessão. (ERROR: Failed to load resource: the server responded with a status of 401 () (https://connektpay.vercel.app/api/transactions:0:0))
- Onde ocorreu: Logout (passed)
- Motivo: Comportamento esperado após encerramento da sessão. (ERROR: Failed to load resource: the server responded with a status of 401 () (https://connektpay.vercel.app/api/transactions:0:0))
- Como reproduzir:
  - 1. Defina BASE_URL=https://connektpay.vercel.app
  - 2. Defina E2E_EMAIL e E2E_PASSWORD válidos
  - 3. Rode: `node scripts/qa-e2e-report.mjs --run --no-setup`
  - 4. Etapas do fluxo:
  -    - Abrir /login
  -    - Preencher credenciais
  -    - Submeter login
  -    - Abrir menu do usuário
  -    - Sair
- Evidência:
  - test-results/qa-e2e-audit-QA-E2E-—-Connekt-Pay-2-Logout/network.json
  - test-results/qa-e2e-audit-QA-E2E-—-Connekt-Pay-2-Logout/performance.json
  - test-results/qa-e2e-audit-QA-E2E-—-Connekt-Pay-2-Logout/test-finished-1.png
  - test-results/qa-e2e-audit-QA-E2E-—-Connekt-Pay-2-Logout/trace.zip
  - test-results/qa-e2e-audit-QA-E2E-—-Connekt-Pay-2-Logout/video.webm
- Sugestão de correção: Nenhuma ação necessária.

5) [INFO] Comportamento esperado após encerramento da sessão. (ERROR: Failed to load resource: the server responded with a status of 401 () (https://connektpay.vercel.app/api/dashboard?days=30:0:0))
- Onde ocorreu: Logout (passed)
- Motivo: Comportamento esperado após encerramento da sessão. (ERROR: Failed to load resource: the server responded with a status of 401 () (https://connektpay.vercel.app/api/dashboard?days=30:0:0))
- Como reproduzir:
  - 1. Defina BASE_URL=https://connektpay.vercel.app
  - 2. Defina E2E_EMAIL e E2E_PASSWORD válidos
  - 3. Rode: `node scripts/qa-e2e-report.mjs --run --no-setup`
  - 4. Etapas do fluxo:
  -    - Abrir /login
  -    - Preencher credenciais
  -    - Submeter login
  -    - Abrir menu do usuário
  -    - Sair
- Evidência:
  - test-results/qa-e2e-audit-QA-E2E-—-Connekt-Pay-2-Logout/network.json
  - test-results/qa-e2e-audit-QA-E2E-—-Connekt-Pay-2-Logout/performance.json
  - test-results/qa-e2e-audit-QA-E2E-—-Connekt-Pay-2-Logout/test-finished-1.png
  - test-results/qa-e2e-audit-QA-E2E-—-Connekt-Pay-2-Logout/trace.zip
  - test-results/qa-e2e-audit-QA-E2E-—-Connekt-Pay-2-Logout/video.webm
- Sugestão de correção: Nenhuma ação necessária.

6) [INFO] Comportamento esperado após encerramento da sessão. (ERROR: Failed to load resource: the server responded with a status of 401 () (https://connektpay.vercel.app/api/me:0:0))
- Onde ocorreu: Logout (passed)
- Motivo: Comportamento esperado após encerramento da sessão. (ERROR: Failed to load resource: the server responded with a status of 401 () (https://connektpay.vercel.app/api/me:0:0))
- Como reproduzir:
  - 1. Defina BASE_URL=https://connektpay.vercel.app
  - 2. Defina E2E_EMAIL e E2E_PASSWORD válidos
  - 3. Rode: `node scripts/qa-e2e-report.mjs --run --no-setup`
  - 4. Etapas do fluxo:
  -    - Abrir /login
  -    - Preencher credenciais
  -    - Submeter login
  -    - Abrir menu do usuário
  -    - Sair
- Evidência:
  - test-results/qa-e2e-audit-QA-E2E-—-Connekt-Pay-2-Logout/network.json
  - test-results/qa-e2e-audit-QA-E2E-—-Connekt-Pay-2-Logout/performance.json
  - test-results/qa-e2e-audit-QA-E2E-—-Connekt-Pay-2-Logout/test-finished-1.png
  - test-results/qa-e2e-audit-QA-E2E-—-Connekt-Pay-2-Logout/trace.zip
  - test-results/qa-e2e-audit-QA-E2E-—-Connekt-Pay-2-Logout/video.webm
- Sugestão de correção: Nenhuma ação necessária.

### Dashboard — APROVADO

### Transações — APROVADO

1) [INFO] Comportamento esperado após encerramento da sessão. (GET https://connektpay.vercel.app/api/receivers :: net::ERR_ABORTED)
- Onde ocorreu: Transações (passed)
- Motivo: Comportamento esperado após encerramento da sessão. (GET https://connektpay.vercel.app/api/receivers :: net::ERR_ABORTED)
- Como reproduzir:
  - 1. Defina BASE_URL=https://connektpay.vercel.app
  - 2. Defina E2E_EMAIL e E2E_PASSWORD válidos
  - 3. Rode: `node scripts/qa-e2e-report.mjs --run --no-setup`
  - 4. Etapas do fluxo:
  -    - Abrir /login
  -    - Preencher credenciais
  -    - Submeter login
  -    - Fazer login
  -    - Abrir /transacoes
  -    - Confirmar lista carrega
  -    - Validar filtros e busca (se existirem)
  -    - Abrir dropdown de ações e ver detalhes (se existir)
  -    - Export CSV (se existir)
  -    - Validar ausência de erros
- Evidência:
  - test-results/qa-e2e-audit-QA-E2E-—-Conn-a9034-m-storageState-6-Transações/network.json
  - test-results/qa-e2e-audit-QA-E2E-—-Conn-a9034-m-storageState-6-Transações/performance.json
  - test-results/qa-e2e-audit-QA-E2E-—-Conn-a9034-m-storageState-6-Transações/test-finished-1.png
  - test-results/qa-e2e-audit-QA-E2E-—-Conn-a9034-m-storageState-6-Transações/trace.zip
  - test-results/qa-e2e-audit-QA-E2E-—-Conn-a9034-m-storageState-6-Transações/video.webm
- Sugestão de correção: Nenhuma ação necessária.

2) [INFO] Comportamento esperado após encerramento da sessão. (GET https://connektpay.vercel.app/api/transactions :: net::ERR_ABORTED)
- Onde ocorreu: Transações (passed)
- Motivo: Comportamento esperado após encerramento da sessão. (GET https://connektpay.vercel.app/api/transactions :: net::ERR_ABORTED)
- Como reproduzir:
  - 1. Defina BASE_URL=https://connektpay.vercel.app
  - 2. Defina E2E_EMAIL e E2E_PASSWORD válidos
  - 3. Rode: `node scripts/qa-e2e-report.mjs --run --no-setup`
  - 4. Etapas do fluxo:
  -    - Abrir /login
  -    - Preencher credenciais
  -    - Submeter login
  -    - Fazer login
  -    - Abrir /transacoes
  -    - Confirmar lista carrega
  -    - Validar filtros e busca (se existirem)
  -    - Abrir dropdown de ações e ver detalhes (se existir)
  -    - Export CSV (se existir)
  -    - Validar ausência de erros
- Evidência:
  - test-results/qa-e2e-audit-QA-E2E-—-Conn-a9034-m-storageState-6-Transações/network.json
  - test-results/qa-e2e-audit-QA-E2E-—-Conn-a9034-m-storageState-6-Transações/performance.json
  - test-results/qa-e2e-audit-QA-E2E-—-Conn-a9034-m-storageState-6-Transações/test-finished-1.png
  - test-results/qa-e2e-audit-QA-E2E-—-Conn-a9034-m-storageState-6-Transações/trace.zip
  - test-results/qa-e2e-audit-QA-E2E-—-Conn-a9034-m-storageState-6-Transações/video.webm
- Sugestão de correção: Nenhuma ação necessária.

3) [INFO] Comportamento esperado após encerramento da sessão. (GET https://connektpay.vercel.app/api/dashboard?days=30 :: net::ERR_ABORTED)
- Onde ocorreu: Transações (passed)
- Motivo: Comportamento esperado após encerramento da sessão. (GET https://connektpay.vercel.app/api/dashboard?days=30 :: net::ERR_ABORTED)
- Como reproduzir:
  - 1. Defina BASE_URL=https://connektpay.vercel.app
  - 2. Defina E2E_EMAIL e E2E_PASSWORD válidos
  - 3. Rode: `node scripts/qa-e2e-report.mjs --run --no-setup`
  - 4. Etapas do fluxo:
  -    - Abrir /login
  -    - Preencher credenciais
  -    - Submeter login
  -    - Fazer login
  -    - Abrir /transacoes
  -    - Confirmar lista carrega
  -    - Validar filtros e busca (se existirem)
  -    - Abrir dropdown de ações e ver detalhes (se existir)
  -    - Export CSV (se existir)
  -    - Validar ausência de erros
- Evidência:
  - test-results/qa-e2e-audit-QA-E2E-—-Conn-a9034-m-storageState-6-Transações/network.json
  - test-results/qa-e2e-audit-QA-E2E-—-Conn-a9034-m-storageState-6-Transações/performance.json
  - test-results/qa-e2e-audit-QA-E2E-—-Conn-a9034-m-storageState-6-Transações/test-finished-1.png
  - test-results/qa-e2e-audit-QA-E2E-—-Conn-a9034-m-storageState-6-Transações/trace.zip
  - test-results/qa-e2e-audit-QA-E2E-—-Conn-a9034-m-storageState-6-Transações/video.webm
- Sugestão de correção: Nenhuma ação necessária.

### Payment Links — APROVADO

1) [INFO] Comportamento esperado após encerramento da sessão. (GET https://connektpay.vercel.app/api/receivers :: net::ERR_ABORTED)
- Onde ocorreu: Payment Links (passed)
- Motivo: Comportamento esperado após encerramento da sessão. (GET https://connektpay.vercel.app/api/receivers :: net::ERR_ABORTED)
- Como reproduzir:
  - 1. Defina BASE_URL=https://connektpay.vercel.app
  - 2. Defina E2E_EMAIL e E2E_PASSWORD válidos
  - 3. Rode: `node scripts/qa-e2e-report.mjs --run --no-setup`
  - 4. Etapas do fluxo:
  -    - Abrir /login
  -    - Preencher credenciais
  -    - Submeter login
  -    - Fazer login
  -    - Abrir /links-pagamento
  -    - Confirmar lista de links carregou
  -    - Visualizar primeiro link (se existir)
  -    - Abrir criação de link
  -    - Criar link (form)
  -    - Validar ausência de erros
- Evidência:
  - test-results/qa-e2e-audit-QA-E2E-—-Conn-b1533-torageState-4-Payment-Links/network.json
  - test-results/qa-e2e-audit-QA-E2E-—-Conn-b1533-torageState-4-Payment-Links/performance.json
  - test-results/qa-e2e-audit-QA-E2E-—-Conn-b1533-torageState-4-Payment-Links/test-finished-1.png
  - test-results/qa-e2e-audit-QA-E2E-—-Conn-b1533-torageState-4-Payment-Links/trace.zip
  - test-results/qa-e2e-audit-QA-E2E-—-Conn-b1533-torageState-4-Payment-Links/video.webm
- Sugestão de correção: Nenhuma ação necessária.

2) [INFO] Comportamento esperado após encerramento da sessão. (GET https://connektpay.vercel.app/api/transactions :: net::ERR_ABORTED)
- Onde ocorreu: Payment Links (passed)
- Motivo: Comportamento esperado após encerramento da sessão. (GET https://connektpay.vercel.app/api/transactions :: net::ERR_ABORTED)
- Como reproduzir:
  - 1. Defina BASE_URL=https://connektpay.vercel.app
  - 2. Defina E2E_EMAIL e E2E_PASSWORD válidos
  - 3. Rode: `node scripts/qa-e2e-report.mjs --run --no-setup`
  - 4. Etapas do fluxo:
  -    - Abrir /login
  -    - Preencher credenciais
  -    - Submeter login
  -    - Fazer login
  -    - Abrir /links-pagamento
  -    - Confirmar lista de links carregou
  -    - Visualizar primeiro link (se existir)
  -    - Abrir criação de link
  -    - Criar link (form)
  -    - Validar ausência de erros
- Evidência:
  - test-results/qa-e2e-audit-QA-E2E-—-Conn-b1533-torageState-4-Payment-Links/network.json
  - test-results/qa-e2e-audit-QA-E2E-—-Conn-b1533-torageState-4-Payment-Links/performance.json
  - test-results/qa-e2e-audit-QA-E2E-—-Conn-b1533-torageState-4-Payment-Links/test-finished-1.png
  - test-results/qa-e2e-audit-QA-E2E-—-Conn-b1533-torageState-4-Payment-Links/trace.zip
  - test-results/qa-e2e-audit-QA-E2E-—-Conn-b1533-torageState-4-Payment-Links/video.webm
- Sugestão de correção: Nenhuma ação necessária.

3) [INFO] Comportamento esperado após encerramento da sessão. (GET https://connektpay.vercel.app/api/dashboard?days=30 :: net::ERR_ABORTED)
- Onde ocorreu: Payment Links (passed)
- Motivo: Comportamento esperado após encerramento da sessão. (GET https://connektpay.vercel.app/api/dashboard?days=30 :: net::ERR_ABORTED)
- Como reproduzir:
  - 1. Defina BASE_URL=https://connektpay.vercel.app
  - 2. Defina E2E_EMAIL e E2E_PASSWORD válidos
  - 3. Rode: `node scripts/qa-e2e-report.mjs --run --no-setup`
  - 4. Etapas do fluxo:
  -    - Abrir /login
  -    - Preencher credenciais
  -    - Submeter login
  -    - Fazer login
  -    - Abrir /links-pagamento
  -    - Confirmar lista de links carregou
  -    - Visualizar primeiro link (se existir)
  -    - Abrir criação de link
  -    - Criar link (form)
  -    - Validar ausência de erros
- Evidência:
  - test-results/qa-e2e-audit-QA-E2E-—-Conn-b1533-torageState-4-Payment-Links/network.json
  - test-results/qa-e2e-audit-QA-E2E-—-Conn-b1533-torageState-4-Payment-Links/performance.json
  - test-results/qa-e2e-audit-QA-E2E-—-Conn-b1533-torageState-4-Payment-Links/test-finished-1.png
  - test-results/qa-e2e-audit-QA-E2E-—-Conn-b1533-torageState-4-Payment-Links/trace.zip
  - test-results/qa-e2e-audit-QA-E2E-—-Conn-b1533-torageState-4-Payment-Links/video.webm
- Sugestão de correção: Nenhuma ação necessária.

### Checkout — APROVADO

### Recebedores — APROVADO

### KYC — APROVADO

### Assinaturas — APROVADO

### Planos — APROVADO

### Ledger — APROVADO

### Antecipação — APROVADO

### Repasses — APROVADO

### Conciliação — APROVADO

### Auditoria — APROVADO

### Configurações — REPROVADO

1) [MÉDIO] Fluxo falhou durante a navegação automatizada.
- Onde ocorreu: Configurações · Provedor (failed)
- Motivo: Fluxo falhou durante a navegação automatizada.
- Como reproduzir:
  - 1. Defina BASE_URL=https://connektpay.vercel.app
  - 2. Defina E2E_EMAIL e E2E_PASSWORD válidos
  - 3. Rode: `node scripts/qa-e2e-report.mjs --run --no-setup`
  - 4. Etapas do fluxo:
  -    - Abrir /configuracoes/provedor
- Evidência:
  - test-results/qa-e2e-audit-QA-E2E-—-Conn-590fe-21-Configurações-·-Provedor/error-context.md
  - test-results/qa-e2e-audit-QA-E2E-—-Conn-590fe-21-Configurações-·-Provedor/network.json
  - test-results/qa-e2e-audit-QA-E2E-—-Conn-590fe-21-Configurações-·-Provedor/performance.json
  - test-results/qa-e2e-audit-QA-E2E-—-Conn-590fe-21-Configurações-·-Provedor/test-failed-1.png
  - test-results/qa-e2e-audit-QA-E2E-—-Conn-590fe-21-Configurações-·-Provedor/trace.zip
  - test-results/qa-e2e-audit-QA-E2E-—-Conn-590fe-21-Configurações-·-Provedor/video.webm
- Sugestão de correção: Corrigir a causa raiz do erro do fluxo e reexecutar a auditoria (traces/screenshot/console/network).

### Admin — APROVADO

### Eventos/Webhooks — APROVADO

### Integrações — APROVADO

### Mobile — APROVADO

## Conclusão
- Pronta para homologação (sem CRÍTICO/ALTO): SIM
