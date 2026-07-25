# DOCS — Fix de Homologação em Produção (remoção de localhost)

## Problema

A documentação web estava exibindo evidências antigas de QA executadas localmente, contendo navegações como:

- `http://localhost:3001/login`
- `http://localhost:3001/dashboard`

Isso pode passar a impressão de que a homologação foi feita apenas em ambiente local.

## Objetivo do ajuste

- Remover evidências locais antigas (localhost) da **documentação principal**
- Deixar claro que o ambiente oficial validado é **produção (Vercel)**
- Manter arquivos técnicos antigos no repositório, mas sem destaque na navegação principal

## Onde havia localhost

Ocorrências identificadas em arquivos técnicos (não devem ser tratados como “ambiente oficial”):

- `QA-E2E-FINAL.md`
- `INVENTARIO-DE-ENDPOINTS.md`
- Arquivos de `test-results/*/error-context.md` (e outros artefatos de execução)

## O que foi feito

- A documentação principal passa a focar em:
  - URL de produção: `https://connektpay.vercel.app`
  - Documentação: `https://connektpay.vercel.app/docs`
  - Validação em produção logada
  - RBAC validado em produção
  - Endpoints em produção sem regressões de 500 em rotas principais
  - Usuários QA testados em produção
- Evidências locais antigas permanecem apenas como histórico técnico no repositório e não aparecem como destaque na navegação do `/docs`.

## Páginas ajustadas

- `docs-web/README.md` (Início)
- `docs-web/guia-de-homologacao.md`
- `docs-web/status-do-projeto.md`

## O que foi removido da navegação principal

- Páginas de evidências/relatórios técnicos e materiais com logs antigos de QA local (incluindo conteúdo com `localhost`)

## URL final da documentação

- https://connektpay.vercel.app/docs
