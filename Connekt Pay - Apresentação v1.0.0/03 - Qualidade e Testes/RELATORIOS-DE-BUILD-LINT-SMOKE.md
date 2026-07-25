# Relatórios — Build, Lint e Smoke Test (v1.0.0)

Este documento consolida a evidência “executiva” de qualidade do projeto sem reexecutar pipelines.

## Fontes de evidência já existentes no repositório

- Release notes (inclui lista de testes executados): [RELEASE-1.0.md](file:///c:/Users/Leonardo/Desktop/ConnektPay/RELEASE-1.0.md)
- QA E2E final (17 fluxos + evidências): [QA-E2E-FINAL.md](file:///c:/Users/Leonardo/Desktop/ConnektPay/QA-E2E-FINAL.md)
- QA report (correções/observações): [QA-REPORT.md](file:///c:/Users/Leonardo/Desktop/ConnektPay/QA-REPORT.md)

## Como ler (para apresentação)

- Build: validar que a aplicação compila e está pronta para deploy (referenciado no release)
- Lint: valida padrões do projeto e evita regressões simples (referenciado no release)
- Smoke test: valida rotas e principais telas (referenciado no release)
- Auditoria E2E: valida 17 fluxos com evidências (screenshots/vídeos/traces)

## Comandos (referência)

- `npm run lint`
- `npm run build`
- `npm run test:smoke`

