# MENU-USUARIO-REGRESSAO

## Objetivo

Corrigir a regressão do menu do usuário no canto superior direito, onde `Minha conta` e `Configurações` deixavam o clique sem resultado útil em produção, sem alterar regras de negócio, banco, MyGateway ou abrir novo escopo.

## Causa raiz

1. O `Header` renderizava `Minha conta` e `Configurações` para todos os perfis, mas apontava sempre para rotas restritas:
   - `Minha conta` -> `/configuracoes`
   - `Configurações` -> `/configuracoes/integracoes`
2. O RBAC permitia essas rotas apenas para `owner` e `super_admin`, então `admin` e `financeiro` eram redirecionados pelo `middleware` para `/dashboard`.
3. O comportamento percebido em produção era de "clique sem resposta", porque o menu fechava, mas a navegação era anulada pelo redirecionamento.
4. Durante a validação de regressão, também foram confirmados dois problemas correlatos no mesmo fluxo:
   - `hydration mismatch` no layout autenticado, por divergência entre o papel renderizado no servidor e o papel recalculado no cliente.
   - conflito de `z-index` entre o dropdown do usuário e o `Copiloto Connekt`, que podia interceptar cliques na parte inferior do menu, especialmente em `Sair`.

## Correções aplicadas

### Menu e rotas

- `Minha conta` agora aponta para `'/configuracoes#perfil-da-conta'`.
- `Configurações` continua apontando para `'/configuracoes/integracoes'`.
- `Configurações` só é exibido para `owner` e `super_admin`.
- `Minha conta` permanece disponível para `owner`, `admin`, `financeiro` e `super_admin`.
- A rota base `'/configuracoes'` passou a aceitar `admin` e `financeiro`, reutilizando a seção já existente `Perfil da conta` sem criar tela nova.
- Foi adicionada a âncora `id="perfil-da-conta"` na seção correta da tela de configurações.

### Estabilidade do layout

- O layout autenticado agora recebe o papel inicial a partir dos cookies no servidor, eliminando o `hydration mismatch`.
- O layout autenticado foi marcado como dinâmico para compatibilizar o uso de cookies no App Router durante o build.
- O `Header` passou a usar `initialRole` do servidor como fallback consistente.

### Camadas e clique

- O `Header` teve o `z-index` elevado para ficar acima do assistente flutuante.
- O overlay do menu mobile foi mantido acima do restante da interface.
- Com isso, o dropdown do usuário não fica mais atrás do `Copiloto` e `Sair` voltou a responder normalmente.

### Build

- As telas públicas `login`, `register` e `reset-password` foram marcadas como dinâmicas para evitar falha de prerender durante o `next build`, preservando SSR e sem alterar regras de negócio.

## Arquivos alterados

- `components/layout/Header.tsx`
- `components/layout/AppShell.tsx`
- `app/(app)/layout.tsx`
- `lib/rbac.ts`
- `app/(app)/configuracoes/page.tsx`
- `components/screens.tsx`
- `app/login/page.tsx`
- `app/register/page.tsx`
- `app/reset-password/page.tsx`
- `tests/menu-usuario-regression.spec.ts`

## Rotas corrigidas

- `Minha conta` -> `/configuracoes#perfil-da-conta`
- `Configurações` -> `/configuracoes/integracoes`

## Resultado por perfil

### Owner

- `Reabrir guia`: aprovado
- `Ver tour guiado`: aprovado
- `Minha conta`: aprovado, abre `/configuracoes#perfil-da-conta`
- `Configurações`: aprovado, abre `/configuracoes/integracoes`
- `Sair`: aprovado
- Mouse: aprovado
- Teclado: aprovado
- Menu fecha após clique: aprovado
- Console error: não identificado na validação final
- Hydration error: não identificado na validação final
- Overlay invisível / z-index / clique bloqueado: corrigido e validado

### Admin

- `Reabrir guia`: aprovado
- `Ver tour guiado`: aprovado
- `Minha conta`: aprovado, abre `/configuracoes#perfil-da-conta`
- `Configurações`: não aparece, conforme acesso permitido
- `Sair`: aprovado
- Mouse: aprovado
- Teclado: aprovado
- Menu fecha após clique: aprovado
- Console error: não identificado na validação final
- Hydration error: não identificado na validação final
- RBAC: sem bloqueio incorreto no fluxo validado

### Financeiro

- `Reabrir guia`: aprovado
- `Ver tour guiado`: aprovado
- `Minha conta`: aprovado, abre `/configuracoes#perfil-da-conta`
- `Configurações`: não aparece, conforme acesso permitido
- `Sair`: aprovado
- Mouse: aprovado
- Teclado: aprovado
- Menu fecha após clique: aprovado
- Console error: não identificado na validação final
- Hydration error: não identificado na validação final
- RBAC: sem bloqueio incorreto no fluxo validado

## Teste de regressão

Arquivo criado:

- `tests/menu-usuario-regression.spec.ts`

Cobertura:

- abertura do menu
- clique em cada item do menu
- rota final
- fechamento do menu
- comportamento por perfil
- navegação por mouse
- navegação por teclado
- ausência de erro de hydration no fluxo validado

## Evidências

### Validação local

- `npx playwright test tests/menu-usuario-regression.spec.ts --project='Desktop Chrome'`
- Resultado: `4 passed`

### Qualidade

- `npm run lint`
- Resultado: sem erros

- `npm run build`
- Resultado: build concluído com sucesso

### Deploy

- Comando: `npx vercel deploy --prod --yes`
- Produção alias: `https://connektpay.vercel.app`
- Produção gerada: `https://connektpay-1j6z56cud-leonardonoronha12-2214s-projects.vercel.app`

### Validação em produção

- `BASE_URL='https://connektpay.vercel.app' npx playwright test tests/menu-usuario-regression.spec.ts --project='Desktop Chrome'`
- Resultado: `4 passed`

Observação de evidência:

- A validação em produção foi executada com login real do ambiente e variação controlada do papel de navegação via cookie de sessão, para reproduzir o comportamento de `owner`, `admin` e `financeiro` no mesmo ambiente publicado sem alterar banco ou regras de negócio.

## Deployment ID

- `9JKsdciQiYWxVchLG5ZBVC4WupuE`

## Status final

- Regressão reproduzida: sim
- Causa raiz confirmada: sim
- Correção aplicada: sim
- Teste de regressão criado: sim
- Lint: aprovado
- Build: aprovado
- Deploy em produção: aprovado
- Validação em produção: aprovada
