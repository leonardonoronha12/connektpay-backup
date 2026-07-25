# Playwright Flaky Investigation

## Escopo desta rodada

- Objetivo: identificar flakiness, vazamento de estado e dependência de ordem sem executar a suíte completa.
- Fontes usadas: `artifacts/playwright-run-2/`, `artifacts/playwright-run-3/`, `artifacts/playwright-run-4/`, `artifacts/playwright-repeat-menu-usuario-2/`, `artifacts/playwright-repeat-qa-e2e-mobile-1/`.
- Preservação local confirmada por `PW_RUN_ID` e snapshots arquivados em `artifacts/playwright-run-*`.
- Reporter simultâneo confirmado em `playwright.config.ts`: `line`, `json`, `html`.
- Observação metodológica: quando um artefato não contém erro detalhado suficiente, os campos ficam como `PENDENTE` para evitar inferência indevida.

## Recuperação Da Primeira Rodada

- Total recuperado da primeira execução serializada: `25` casos únicos.
- Composição:
  - `22` casos de `tests/qa-e2e-audit.spec.ts`
  - `1` caso de `tests/menu-usuario-regression.spec.ts`
  - `1` caso de `tests/homologacao-final-ux.spec.ts`
  - `1` caso de `tests/ui-modal-stay-open.spec.ts`

## Achados Confirmados

### 1. `tests/menu-usuario-regression.spec.ts`

- Título completo: `Menu do usuário — regressão >> owner: itens navegam e fecham o menu`
- Projetos com falha recuperada: `Desktop Chrome`, `Desktop Edge`, `Desktop Firefox`
- Erro recuperado: espera por heading `Configurações` não estabilizava após clique do menu.
- Evidência: `error-context.md` mostra timeout em `getByRole('heading', { name: 'Configurações', level: 1 })`.
- Causa confirmada: sincronização frágil de navegação/estado do menu.
- Classificação: `seletor frágil`
- Status atual:
  - passa isoladamente: `SIM`
  - passa repetido isoladamente: `SIM`
  - evidência: `artifacts/playwright-repeat-menu-usuario-2/report.json` com `20 expected`, `0 unexpected`, `0 flaky`
  - falha em conjunto: `PENDENTE`

### 2. `tests/homologacao-final-ux.spec.ts`

- Título completo: `Homologação final (UX/Qualidade) >> fluxo completo sem erros de console e sem 4xx/5xx`
- Projetos com falha recuperada: `Desktop Chrome`, `Desktop Edge`, `Desktop Firefox`, depois `Desktop Safari` em rodadas posteriores
- Erro recuperado: `strict mode violation` em `getByRole('button', { name: /Adicionar recebedor/i })` resolvendo para `2 elements`.
- Evidência: `error-context.md` aponta falha em `await expect(addReceiverButton).toBeEnabled(...)`.
- Causa confirmada: seletor ambíguo em tela com mais de um CTA compatível.
- Classificação: `seletor frágil`
- Status atual:
  - passa isoladamente: `PENDENTE`
  - passa repetido isoladamente: `PENDENTE`
  - falha em conjunto: `PENDENTE`

### 3. `tests/qa-e2e-audit.spec.ts` - `5) Checkout público`

- Projeto com falha confirmada nesta rodada: `Mobile Android`
- Erro confirmado: botão `Finalizar pagamento` visível/enabled, porém clique interceptado por `div` sobreposto.
- Evidência: `artifacts/playwright-repeat-qa-e2e-mobile-1/...Checkout-público-Mobile-Android-repeat1/error-context.md`
- Sinal adicional da rodada atual: `playwright-repeat-qa-e2e-mobile-3` continua reproduzindo falha parcial no checkout mobile, com `Avançou no fluxo sem pagamento real: NÃO`, `Erros no console: SIM (3)` e `Request HTTP >= 400: SIM (1)`.
- Causas confirmadas:
  - interferência de layout/overlay mobile
  - dependência residual de slug explícito em `E2E_CHECKOUT_SLUG`, embora a dependência de ordem por slug compartilhado interno já tenha sido removida
- Classificações:
  - `responsividade/mobile`
  - `ordem de execução` (corrigida no código, antes da nova reprodução)
- Status atual:
  - passa isoladamente: `NÃO`
  - passa repetido isoladamente: `NÃO`
  - falha em conjunto: `PENDENTE`

### 4. `tests/qa-e2e-audit.spec.ts` - `22) Navegação mobile`

- Projeto com falha recuperada: `Desktop Chrome`, `Desktop Edge`; falha equivalente depois observada em `Mobile Android`
- Erro confirmado: ausência do drawer/sidebar visível após clique no botão `Abrir menu`.
- Evidência:
  - `artifacts/playwright-run-2/...22-Navegação-mobile-Desktop-Chrome/error-context.md`
  - `artifacts/playwright-repeat-qa-e2e-mobile-1/...22-Navegação-mobile-Mobile-Android/error-context.md`
- Causa confirmada: sincronização incorreta com o drawer mobile; o teste assumia `aside:visible` cedo demais.
- Classificação: `responsividade/mobile`
- Status atual:
  - passa isoladamente: `PENDENTE`
  - passa repetido isoladamente: `PENDENTE`
  - falha em conjunto: `PENDENTE`

### 5. `tests/ui-modal-stay-open.spec.ts`

- Título completo: `UI — modal não deve fechar ao digitar >> Adicionar recebedor: digitar mantém modal aberto`
- Projeto com falha recuperada: `Desktop Edge`
- Erro detalhado recuperado: `PENDENTE`
- Evidência disponível: `artifacts/playwright-run-2/test-results/ui-modal-stay-open-.../error-context.md`
- Classificação: `PENDENTE`
- Status atual:
  - passa isoladamente: `PENDENTE`
  - passa repetido isoladamente: `PENDENTE`
  - falha em conjunto: `PENDENTE`

## Casos Recuperados Da Primeira Rodada

Campos:

- `passa isoladamente`, `passa repetido isoladamente`, `falha em conjunto`: resultado desta rodada quando já reproduzido; caso contrário `PENDENTE`
- `altera sessão`: inclui cookie, `storageState`, `localStorage` ou `sessionStorage`
- `id fixo`: criação com slug/e-mail/nome fixo

| Arquivo | Título completo | Projeto/browser recuperado | Status | Erro | Linha | Screenshot/trace | Passa isoladamente | Passa repetido isoladamente | Falha em conjunto | Login real | BASE_URL produção | Altera banco | Altera sessão | Id fixo | Depende de outro teste | Classificação |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `tests/menu-usuario-regression.spec.ts` | `Menu do usuário — regressão >> owner: itens navegam e fecham o menu` | `Desktop Chrome, Desktop Edge, Desktop Firefox` | `falhou` | `heading Configurações não ficava visível após navegação do menu` | `101` | `trace.zip`, `test-failed-1.png` | `SIM` | `SIM` | `PENDENTE` | `SIM` | `NÃO` | `NÃO` | `SIM` | `NÃO` | `NÃO` | `seletor frágil` |
| `tests/homologacao-final-ux.spec.ts` | `Homologação final (UX/Qualidade) >> fluxo completo sem erros de console e sem 4xx/5xx` | `Desktop Chrome, Desktop Edge, Desktop Firefox` | `falhou` | `strict mode violation em "Adicionar recebedor"` | `124` | `trace.zip`, `test-failed-1.png` | `PENDENTE` | `PENDENTE` | `PENDENTE` | `SIM` | `SIM` | `SIM` | `SIM` | `NÃO` | `PENDENTE` | `seletor frágil` |
| `tests/ui-modal-stay-open.spec.ts` | `UI — modal não deve fechar ao digitar >> Adicionar recebedor: digitar mantém modal aberto` | `Desktop Edge` | `falhou` | `PENDENTE` | `PENDENTE` | `trace.zip`, `test-failed-1.png` | `PENDENTE` | `PENDENTE` | `PENDENTE` | `SIM` | `NÃO` | `SIM` | `SIM` | `NÃO` | `PENDENTE` | `PENDENTE` |
| `tests/qa-e2e-audit.spec.ts` | `QA E2E — Connekt Pay >> 1) Login` | `Desktop Chrome, Desktop Edge` | `falhou` | `erro detalhado não recuperado do artefato bruto` | `625` | `notes.txt`, `network.json` | `PENDENTE` | `PENDENTE` | `PENDENTE` | `SIM` | `NÃO` | `NÃO` | `SIM` | `NÃO` | `NÃO` | `PENDENTE` |
| `tests/qa-e2e-audit.spec.ts` | `QA E2E — Connekt Pay >> 2) Logout` | `Desktop Chrome, Desktop Edge` | `falhou` | `erro detalhado não recuperado do artefato bruto` | `639` | `notes.txt`, `network.json` | `PENDENTE` | `PENDENTE` | `PENDENTE` | `SIM` | `NÃO` | `NÃO` | `SIM` | `NÃO` | `NÃO` | `sessão compartilhada` |
| `tests/qa-e2e-audit.spec.ts` | `QA E2E — Connekt Pay >> 3) Dashboard` | `Desktop Chrome, Desktop Edge` | `falhou` | `erro detalhado não recuperado do artefato bruto` | `663` | `notes.txt`, `network.json` | `PENDENTE` | `PENDENTE` | `PENDENTE` | `SIM` | `NÃO` | `NÃO` | `SIM` | `NÃO` | `PENDENTE` | `PENDENTE` |
| `tests/qa-e2e-audit.spec.ts` | `QA E2E — Connekt Pay >> 4) Payment Links` | `Desktop Chrome, Desktop Edge` | `falhou` | `erro detalhado não recuperado do artefato bruto` | `714` | `notes.txt`, `network.json` | `PENDENTE` | `PENDENTE` | `PENDENTE` | `SIM` | `NÃO` | `SIM` | `SIM` | `SIM` | `PENDENTE` | `PENDENTE` |
| `tests/qa-e2e-audit.spec.ts` | `QA E2E — Connekt Pay >> 5) Checkout público` | `Desktop Chrome, Desktop Edge`; confirmada também em `Mobile Android` nesta rodada | `falhou` | `interceptação de clique no CTA final / erro HTTP no fluxo` | `862` | `trace.zip`, `video.webm`, `test-failed-1.png` | `NÃO` | `NÃO` | `PENDENTE` | `NÃO` | `NÃO` | `SIM` | `SIM` | `SIM` | `SIM` | `responsividade/mobile` |
| `tests/qa-e2e-audit.spec.ts` | `QA E2E — Connekt Pay >> 6) Transações` | `Desktop Chrome, Desktop Edge` | `falhou` | `erro detalhado não recuperado do artefato bruto` | `936` | `notes.txt`, `network.json` | `PENDENTE` | `PENDENTE` | `PENDENTE` | `SIM` | `NÃO` | `SIM` | `SIM` | `SIM` | `SIM` | `ordem de execução` |
| `tests/qa-e2e-audit.spec.ts` | `QA E2E — Connekt Pay >> 7) Assinaturas` | `Desktop Chrome, Desktop Edge` | `falhou` | `erro detalhado não recuperado do artefato bruto` | `1097` | `notes.txt`, `network.json` | `PENDENTE` | `PENDENTE` | `PENDENTE` | `SIM` | `NÃO` | `NÃO` | `SIM` | `NÃO` | `PENDENTE` | `sessão compartilhada` |
| `tests/qa-e2e-audit.spec.ts` | `QA E2E — Connekt Pay >> 8) Planos` | `Desktop Chrome, Desktop Edge` | `falhou` | `erro detalhado não recuperado do artefato bruto` | `1132` | `notes.txt`, `network.json` | `PENDENTE` | `PENDENTE` | `PENDENTE` | `SIM` | `NÃO` | `NÃO` | `SIM` | `NÃO` | `PENDENTE` | `sessão compartilhada` |
| `tests/qa-e2e-audit.spec.ts` | `QA E2E — Connekt Pay >> 9) Recebedores` | `Desktop Chrome, Desktop Edge` | `falhou` | `erro detalhado não recuperado do artefato bruto` | `1170` | `notes.txt`, `network.json` | `PENDENTE` | `PENDENTE` | `PENDENTE` | `SIM` | `NÃO` | `SIM` | `SIM` | `NÃO` | `PENDENTE` | `PENDENTE` |
| `tests/qa-e2e-audit.spec.ts` | `QA E2E — Connekt Pay >> 10) KYC (admin)` | `Desktop Chrome, Desktop Edge` | `falhou` | `erro detalhado não recuperado do artefato bruto` | `1210` | `notes.txt`, `network.json` | `PENDENTE` | `PENDENTE` | `PENDENTE` | `SIM` | `NÃO` | `SIM` | `SIM` | `NÃO` | `PENDENTE` | `PENDENTE` |
| `tests/qa-e2e-audit.spec.ts` | `QA E2E — Connekt Pay >> 11) Ledger` | `Desktop Chrome, Desktop Edge` | `falhou` | `erro detalhado não recuperado do artefato bruto` | `1241` | `notes.txt`, `network.json` | `PENDENTE` | `PENDENTE` | `PENDENTE` | `SIM` | `NÃO` | `NÃO` | `SIM` | `NÃO` | `PENDENTE` | `PENDENTE` |
| `tests/qa-e2e-audit.spec.ts` | `QA E2E — Connekt Pay >> 12) Antecipação` | `Desktop Edge` | `falhou` | `erro detalhado não recuperado do artefato bruto` | `1256` | `notes.txt`, `network.json` | `PENDENTE` | `PENDENTE` | `PENDENTE` | `SIM` | `NÃO` | `NÃO` | `SIM` | `NÃO` | `PENDENTE` | `PENDENTE` |
| `tests/qa-e2e-audit.spec.ts` | `QA E2E — Connekt Pay >> 13) Repasses` | `Desktop Chrome, Desktop Edge` | `falhou` | `erro detalhado não recuperado do artefato bruto` | `1271` | `notes.txt`, `network.json` | `PENDENTE` | `PENDENTE` | `PENDENTE` | `SIM` | `NÃO` | `NÃO` | `SIM` | `NÃO` | `PENDENTE` | `PENDENTE` |
| `tests/qa-e2e-audit.spec.ts` | `QA E2E — Connekt Pay >> 14) Conciliação` | `Desktop Chrome, Desktop Edge` | `falhou` | `erro detalhado não recuperado do artefato bruto` | `1286` | `notes.txt`, `network.json` | `PENDENTE` | `PENDENTE` | `PENDENTE` | `SIM` | `NÃO` | `NÃO` | `SIM` | `NÃO` | `PENDENTE` | `PENDENTE` |
| `tests/qa-e2e-audit.spec.ts` | `QA E2E — Connekt Pay >> 15) Auditoria` | `Desktop Chrome, Desktop Edge` | `falhou` | `erro detalhado não recuperado do artefato bruto` | `1301` | `notes.txt`, `network.json` | `PENDENTE` | `PENDENTE` | `PENDENTE` | `SIM` | `NÃO` | `NÃO` | `SIM` | `NÃO` | `PENDENTE` | `PENDENTE` |
| `tests/qa-e2e-audit.spec.ts` | `QA E2E — Connekt Pay >> 16) Configurações` | `Desktop Chrome, Desktop Edge` | `falhou` | `erro detalhado não recuperado do artefato bruto` | `1316` | `notes.txt`, `network.json` | `PENDENTE` | `PENDENTE` | `PENDENTE` | `SIM` | `NÃO` | `NÃO` | `SIM` | `NÃO` | `PENDENTE` | `PENDENTE` |
| `tests/qa-e2e-audit.spec.ts` | `QA E2E — Connekt Pay >> 17) Admin · Painel` | `Desktop Chrome, Desktop Edge` | `falhou` | `erro detalhado não recuperado do artefato bruto` | `1331` | `notes.txt`, `network.json` | `PENDENTE` | `PENDENTE` | `PENDENTE` | `SIM` | `NÃO` | `NÃO` | `SIM` | `NÃO` | `PENDENTE` | `PENDENTE` |
| `tests/qa-e2e-audit.spec.ts` | `QA E2E — Connekt Pay >> 18) Admin · Eventos & Webhooks` | `Desktop Chrome, Desktop Edge` | `falhou` | `erro detalhado não recuperado do artefato bruto` | `1346` | `notes.txt`, `network.json` | `PENDENTE` | `PENDENTE` | `PENDENTE` | `SIM` | `NÃO` | `NÃO` | `SIM` | `NÃO` | `PENDENTE` | `PENDENTE` |
| `tests/qa-e2e-audit.spec.ts` | `QA E2E — Connekt Pay >> 19) Admin · Antecipações` | `Desktop Chrome, Desktop Edge` | `falhou` | `erro detalhado não recuperado do artefato bruto` | `1361` | `notes.txt`, `network.json` | `PENDENTE` | `PENDENTE` | `PENDENTE` | `SIM` | `NÃO` | `NÃO` | `SIM` | `NÃO` | `PENDENTE` | `PENDENTE` |
| `tests/qa-e2e-audit.spec.ts` | `QA E2E — Connekt Pay >> 20) Configurações · Integrações` | `Desktop Chrome, Desktop Edge` | `falhou` | `erro detalhado não recuperado do artefato bruto` | `1376` | `notes.txt`, `network.json` | `PENDENTE` | `PENDENTE` | `PENDENTE` | `SIM` | `NÃO` | `NÃO` | `SIM` | `NÃO` | `PENDENTE` | `PENDENTE` |
| `tests/qa-e2e-audit.spec.ts` | `QA E2E — Connekt Pay >> 21) Configurações · Provedor` | `Desktop Chrome, Desktop Edge` | `falhou` | `erro detalhado não recuperado do artefato bruto` | `1391` | `notes.txt`, `network.json` | `PENDENTE` | `PENDENTE` | `PENDENTE` | `SIM` | `NÃO` | `NÃO` | `SIM` | `NÃO` | `PENDENTE` | `PENDENTE` |
| `tests/qa-e2e-audit.spec.ts` | `QA E2E — Connekt Pay >> 22) Navegação mobile` | `Desktop Chrome, Desktop Edge`; depois confirmada em `Mobile Android` | `falhou` | `drawer mobile não ficou visível após clicar no botão de menu` | `1405/1406` | `error-context.md`, `trace.zip`, `test-failed-1.png` | `PENDENTE` | `PENDENTE` | `PENDENTE` | `SIM` | `NÃO` | `NÃO` | `SIM` | `NÃO` | `NÃO` | `responsividade/mobile` |

## Auditoria De Isolamento

### Vazamento / acoplamento confirmados

- `tests/qa-e2e-audit.spec.ts` usava acoplamento entre casos via slug compartilhado (`checkoutSlugFromFlow`) entre `4) Payment Links`, `5) Checkout público` e `6) Transações`.
- O mesmo arquivo mantém estado em variáveis de escopo de arquivo:
  - `authOk`
  - `authBlockReason`
  - `authStorageCreds`
- O arquivo depende de `storageState` persistido em `tests/.auth/e2e-owner.json`.
- O fluxo alterna cookies/estado de sessão no mesmo spec (`login`, `logout`, `clearCookies`, `localStorage.clear`, `sessionStorage.clear`), o que aumenta risco de contaminação.

### Correções já aplicadas nesta rodada

- Removida a dependência interna de ordem por slug compartilhado em `tests/qa-e2e-audit.spec.ts`.
- Criado helper para gerar slug dedicado de checkout quando necessário.
- Endurecido o fluxo mobile para aguardar link real do drawer em vez de `aside:visible` genérico.
- Endurecida a interação do botão final do checkout mobile para reduzir falha por interceptação de clique.
- Em `tests/menu-usuario-regression.spec.ts`, a navegação pelo menu passou a esperar URL real e fechamento do menu.
- Em `tests/homologacao-final-ux.spec.ts`, o botão de recebedor foi escopado ao `main` e estabilizado.

### Riscos ainda abertos

- `E2E_CHECKOUT_SLUG` explícito ainda pode reintroduzir dependência em dado compartilhado se apontar para slug fixo.
- `qa-e2e-audit.spec.ts` continua concentrando muitos fluxos heterogêneos em um único arquivo grande, o que dificulta diagnóstico fino de contaminação.
- Ainda faltam execuções em pares suspeitos nas duas ordens.

## Estado Das Reproduções Controladas

- `tests/menu-usuario-regression.spec.ts`
  - `Desktop Chrome`
  - `--workers=1 --repeat-each=5 --retries=0`
  - resultado: `verde`

- `tests/qa-e2e-audit.spec.ts`
  - `Mobile Android`
  - `--workers=1 --repeat-each=5 --retries=0`
  - rodada `playwright-repeat-qa-e2e-mobile-1`: falhas confirmadas em `5) Checkout público` e `22) Navegação mobile`
  - rodada `playwright-repeat-qa-e2e-mobile-3`: em andamento nesta rodada; até o momento segue reproduzindo problema no `Checkout público`

- `tests/homologacao-final-ux.spec.ts`
  - reprodução isolada desta rodada: `PENDENTE`

## Separação De Suítes

- Confirmado em `playwright.config.ts`:
  - suite padrão: `local-regression`
  - `integration` separado
  - `homologation` e `production-smoke` fora do fluxo local padrão
- Conclusão atual: a separação estrutural da suíte local da homologação já está implementada em configuração.

## Próximos Passos Imediatos

1. Concluir a rodada `playwright-repeat-qa-e2e-mobile-3` e registrar `report.json`/`.last-run.json`.
2. Rodar `tests/homologacao-final-ux.spec.ts` isoladamente com `repeat-each=5` no(s) projeto(s) afetado(s).
3. Rodar pares suspeitos em ordem fixa:
   - `menu-usuario-regression.spec.ts` antes/depois de `qa-e2e-audit.spec.ts`
   - `homologacao-final-ux.spec.ts` antes/depois de `qa-e2e-audit.spec.ts`
4. Reclassificar os itens ainda `PENDENTE` somente com evidência de artefato ou reprodução.
