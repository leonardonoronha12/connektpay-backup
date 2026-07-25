# Security Audit (npm) — Connekt Pay

Data: 2026-06-23

## Resumo

- Antes: 4 vulnerabilidades (`2 high`, `2 moderate`) reportadas pelo `npm audit`.
- Depois: `0 vulnerabilities` após atualizações compatíveis (sem `npm audit fix --force`).

## Vulnerabilidades encontradas (antes)

### Playwright (high)

- Pacotes afetados:
  - `playwright` (direto)
  - `@playwright/test` (direto)
- Classe do problema:
  - download/instalação de browsers sem verificação adequada de autenticidade do certificado SSL (CWE-347)
- Ação:
  - Atualizado `playwright` e `@playwright/test` para `1.61.0`.

### PostCSS (moderate) via Next.js (moderate)

- Pacote afetado:
  - `postcss` (transitivo via `next`, instalado como `next/node_modules/postcss@8.4.31`)
- Classe do problema:
  - XSS via output de stringify do PostCSS quando CSS contém `</style>` não escapado.
- Ação:
  - Adicionado `overrides` no `package.json` para forçar `postcss@8.5.15` também para dependências transitivas.

Arquivo: [package.json](file:///c:/Users/Leonardo/Desktop/ConnektPay/package.json)

## Mudanças realizadas

- Atualizações:
  - `@playwright/test`: `1.55.0` → `1.61.0`
  - `playwright`: `1.55.0` → `1.61.0`
- Hardening de dependência transitiva:
  - `overrides.postcss = 8.5.15`

## Verificação

- `npm audit` retorna `0 vulnerabilities`.
- `npm ls postcss` mostra resolução sem PostCSS vulnerável sob `next`.

## Riscos residuais

- `overrides` aumenta acoplamento do lockfile: manter o `npm install` e `npm audit` como passo obrigatório antes de deploy.
- Atualizações futuras do Next.js podem mudar a árvore de dependências; manter revisão periódica.

