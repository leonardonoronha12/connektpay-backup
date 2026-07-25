# Split Validacao Final

## Resumo Executivo

- Ambiente validado: `https://connektpay.vercel.app`
- Resultado geral: **NÃO APROVADO**
- Bloqueio principal: o frontend envia `value` para `POST /api/split-rules`, mas a API exige `percentageBps` para `percentage` e `valueCents` para `fixed`
- Efeito principal: a configuração que deveria ser válida falha com `400` e expõe `Missing percentageBps`
- Impacto de UX: nos cenários com erro, o feedback fica fora do modal via `Notice` na tela, e o modal não permanece aberto

## Matriz Final

| Cenário | Esperado | Obtido | Evidência | Correção necessária |
|---|---|---|---|---|
| Sem recebedores cadastrados | Bloquear o fluxo, manter contexto visual estável e informar claramente que é preciso cadastrar recebedor | O bloqueio textual foi comprovado apenas via mock controlado de `GET /api/receivers` com lista vazia. A UI exibiu `Cadastre um recebedor antes de configurar split.`. O tenant real em produção já possui recebedores, então o cenário não é reproduzível nativamente hoje. | HTTP `200` com payload mockado `{"receivers":[]}`. Sem `POST /api/split-rules`. Sem toast visível comprovado. Modal não abriu. Código: `components/screens.tsx` em `runSplitConfigurationFlow`. | Revalidar em tenant limpo ou adicionar ambiente/tenant de QA sem recebedores. Garantir evidência visual do toast acima do modal ou manter mensagem inline consistente. |
| Recebedor inválido | Exibir feedback amigável, não chamar API de criação, manter modal aberto | Ao informar um índice inválido, a UI exibiu `Escolha um recebedor da lista para continuar.`. Não houve `POST /api/split-rules`. O modal fechou após confirmar, então o erro saiu do contexto do modal. | HTTP `200` em `GET /api/receivers`. Sem payload de criação. Toast visível não comprovado. Modal permaneceu aberto: **NÃO**. Tela mostrou `Notice` fora do modal em `PaymentLinksScreen`. | Manter o `PromptDialog` aberto quando a validação falhar. Exibir o erro no próprio campo/modal e só fechar em sucesso ou cancelamento explícito. |
| Tipo de split inválido | Exibir toast/mensagem amigável e manter modal aberto | Ao informar tipo inválido, a UI exibiu `Escolha um tipo de split válido: percentage ou fixed.`. Não houve chamada à API de criação. O modal fechou após a confirmação. | HTTP `200` em `GET /api/receivers`. Sem `POST /api/split-rules`. Toast visível não comprovado. Modal permaneceu aberto: **NÃO**. | Mesmo ajuste estrutural do fluxo por etapas: validação precisa acontecer sem encerrar o modal corrente. |
| Valor inválido | Exibir toast, destacar campo e manter modal aberto | Ao informar valor inválido, a UI exibiu `Informe um valor válido para o split.`. Não houve requisição de criação. Não ficou comprovado destaque visual adicional do campo. O modal fechou após a confirmação. | Sem `POST /api/split-rules`. Toast visível não comprovado. Modal permaneceu aberto: **NÃO**. Sem evidência clara de `aria-invalid`, borda ou estado visual destacado no campo. | Validar e bloquear no próprio modal/campo, com destaque visual explícito do input inválido. |
| Erro da API | Exibir toast amigável, não mostrar erro técnico e manter modal aberto | Com erro de API controlado via mock, a UI exibiu `Erro simulado da API`. O modal fechou e o erro apareceu fora dele. Em execução real, o erro técnico apareceu ao usuário quando a API retornou `Missing percentageBps`. | HTTP `500` no mock de `POST /api/split-rules` com payload `{"receiverId":"3db4fed6-75be-4a8f-9123-d21227c648ac","paymentLinkId":"6e9d6672-d9c9-4dae-8898-8b6d39eb2d2c","type":"percentage","value":10,"status":"active"}`. Em produção real, HTTP `400` com `{"error":"Missing percentageBps"}`. Toast visível não comprovado. Modal permaneceu aberto: **NÃO**. | Corrigir contrato do payload e impedir exposição de erro técnico via `toUserFacingError`. O modal deve continuar aberto enquanto houver erro. |
| Configuração válida | Criar a regra com sucesso, exibir toast de sucesso, fechar modal e atualizar a tela | O cenário falhou. A UI enviou payload incorreto e a API respondeu `400 Missing percentageBps`. Não houve persistência de regra. Não houve toast de sucesso comprovado. | HTTP `400` em `POST /api/split-rules`. Payload real enviado pelo frontend: `{"receiverId":"3db4fed6-75be-4a8f-9123-d21227c648ac","paymentLinkId":"6e9d6672-d9c9-4dae-8898-8b6d39eb2d2c","type":"percentage","value":10,"status":"active"}`. Resposta: `{"error":"Missing percentageBps"}`. Código responsável: `components/screens.tsx` e `app/api/split-rules/route.ts`. | Corrigir o frontend para enviar `percentageBps` ou `valueCents` conforme o tipo, e revalidar o fluxo até `201 Created`. |

## Diagnostico Completo por Cenário

### 1. Sem recebedores cadastrados

1. Cenário testado: `GET /api/receivers` interceptado com retorno vazio para simular tenant sem recebedores
2. Resultado esperado: bloquear o split com mensagem clara e sem fechamento silencioso
3. Resultado obtido: a UI exibiu `Cadastre um recebedor antes de configurar split.` e não abriu a etapa de escolha do recebedor
4. Status HTTP da API: `200`
5. Payload retornado: `{"receivers":[]}`
6. Toast apareceu?: **NÃO comprovado visualmente**
7. Modal permaneceu aberto?: **NÃO se aplica**, porque o modal não abriu
8. Mensagem exibida ao usuário: `Cadastre um recebedor antes de configurar split.`
9. Console error: `net::ERR_ABORTED https://connektpay.vercel.app/links-pagamento` sem relação causal comprovada com o split
10. Network error: nenhum além do mock controlado da listagem
11. Stacktrace: não houve
12. Causa raiz: o tenant real já possui recebedores, então o cenário só foi reproduzido com mock
13. Arquivo responsável: `components/screens.tsx`
14. Como pretende corrigir: validar em tenant limpo e garantir evidência visual consistente do feedback

### 2. Recebedor inválido

1. Cenário testado: informar índice inexistente na etapa de recebedor
2. Resultado esperado: feedback amigável, sem chamada de criação, com modal aberto
3. Resultado obtido: a UI exibiu `Escolha um recebedor da lista para continuar.`, não chamou a API de criação e fechou o modal
4. Status HTTP da API: `200` em `GET /api/receivers`
5. Payload retornado: lista de recebedores carregada com sucesso; nenhum payload enviado para criação
6. Toast apareceu?: **NÃO comprovado visualmente**
7. Modal permaneceu aberto?: **NÃO**
8. Mensagem exibida ao usuário: `Escolha um recebedor da lista para continuar.`
9. Console error: `net::ERR_ABORTED` na navegação, sem stack útil
10. Network error: nenhum `POST /api/split-rules`
11. Stacktrace: não houve
12. Causa raiz: o `PromptDialog` resolve a promise e fecha o modal antes do fluxo decidir manter a etapa aberta
13. Arquivo responsável: `components/screens.tsx` em `usePromptDialog()` e `runSplitConfigurationFlow()`
14. Como pretende corrigir: fazer a validação no próprio diálogo e só resolver/fechar em sucesso

### 3. Tipo de split inválido

1. Cenário testado: informar tipo diferente de `percentage` ou `fixed`
2. Resultado esperado: feedback amigável, com modal aberto
3. Resultado obtido: a UI exibiu `Escolha um tipo de split válido: percentage ou fixed.` e fechou o modal
4. Status HTTP da API: `200` em `GET /api/receivers`
5. Payload retornado: lista de recebedores carregada; sem payload de criação
6. Toast apareceu?: **NÃO comprovado visualmente**
7. Modal permaneceu aberto?: **NÃO**
8. Mensagem exibida ao usuário: `Escolha um tipo de split válido: percentage ou fixed.`
9. Console error: sem erro causal útil
10. Network error: não houve `POST /api/split-rules`
11. Stacktrace: não houve
12. Causa raiz: mesma estrutura do `PromptDialog`, que fecha antes de manter o erro no contexto do modal
13. Arquivo responsável: `components/screens.tsx`
14. Como pretende corrigir: validar e reapresentar a mesma etapa sem encerrar o modal

### 4. Valor inválido

1. Cenário testado: informar valor inválido na etapa final
2. Resultado esperado: toast, destaque do campo e modal aberto
3. Resultado obtido: a UI exibiu `Informe um valor válido para o split.`. O modal fechou. Não ficou comprovado destaque visual do campo
4. Status HTTP da API: não houve chamada de criação
5. Payload retornado: não se aplica
6. Toast apareceu?: **NÃO comprovado visualmente**
7. Modal permaneceu aberto?: **NÃO**
8. Mensagem exibida ao usuário: `Informe um valor válido para o split.`
9. Console error: nenhum erro causal útil
10. Network error: não houve `POST /api/split-rules`
11. Stacktrace: não houve
12. Causa raiz: validação acontece após fechamento da etapa do `PromptDialog`, e o campo não entra em estado visual inválido persistente
13. Arquivo responsável: `components/screens.tsx`
14. Como pretende corrigir: adicionar estado inválido no campo e impedir fechamento do modal quando o valor for inválido

### 5. Erro da API

1. Cenário testado: falha de backend simulada e falha real observada em produção
2. Resultado esperado: toast amigável, sem erro técnico, modal aberto
3. Resultado obtido: com mock `500`, a UI exibiu `Erro simulado da API`; no fluxo real, exibiu `Missing percentageBps`; em ambos os casos o modal fechou
4. Status HTTP da API: `500` no mock e `400` no fluxo real
5. Payload retornado: mock com erro controlado; real `{"error":"Missing percentageBps"}`
6. Toast apareceu?: **NÃO comprovado visualmente**
7. Modal permaneceu aberto?: **NÃO**
8. Mensagem exibida ao usuário: `Erro simulado da API` no mock e `Missing percentageBps` no fluxo real
9. Console error: sem stack útil; apenas ocorrências de `net::ERR_ABORTED` na navegação
10. Network error: `POST /api/split-rules 500` no mock e `POST /api/split-rules 400` no fluxo real
11. Stacktrace: não houve
12. Causa raiz: além do fechamento precoce do modal, `toUserFacingError()` deixa a mensagem técnica passar quando ela não bate nos filtros de sanitização
13. Arquivo responsável: `components/screens.tsx` e `app/api/split-rules/route.ts`
14. Como pretende corrigir: padronizar erro amigável para split e não propagar a string técnica da API para o usuário

### 6. Configuração válida

1. Cenário testado: recebedor válido, tipo `percentage`, valor `10`
2. Resultado esperado: `201`, toast de sucesso, fechamento do modal e atualização da tela
3. Resultado obtido: a UI enviou payload incompatível e recebeu `400 Missing percentageBps`
4. Status HTTP da API: `400`
5. Payload retornado: resposta `{"error":"Missing percentageBps"}`
6. Toast apareceu?: **NÃO comprovado visualmente**
7. Modal permaneceu aberto?: **NÃO**
8. Mensagem exibida ao usuário: `Missing percentageBps`
9. Console error: sem stack útil
10. Network error: `POST /api/split-rules 400`
11. Stacktrace: não houve
12. Causa raiz: incompatibilidade de contrato entre frontend e backend
13. Arquivo responsável: `components/screens.tsx` e `app/api/split-rules/route.ts`
14. Como pretende corrigir: enviar `percentageBps` ou `valueCents` conforme o tipo e revalidar o caminho de sucesso completo

## Validações Transversais

### Toast aparece acima do modal?

- Em código, sim: o viewport usa `z-index: 130` em `lib/app-events.ts`
- Em runtime no fluxo de Split, **NÃO ficou comprovado**, porque não houve toast visível capturado

### Toast fica visível por tempo suficiente?

- Em código, sim: auto-dismiss padrão de `3600ms`
- Em runtime no fluxo de Split, **NÃO ficou comprovado**, porque não houve toast visível capturado

### Toast é disparado apenas uma vez?

- Em runtime, **NÃO ficou comprovado**
- Em código, não existe deduplicação explícita; existe apenas limite de 3 toasts simultâneos

### Modal nunca fecha quando houver erro?

- **NÃO**
- O modal fecha nos cenários de recebedor inválido, tipo inválido, valor inválido, erro da API e até na configuração que deveria ser válida

### Modal fecha apenas quando a operação for concluída com sucesso?

- **NÃO**
- O modal já fecha antes do sucesso, porque o `PromptDialog` resolve a etapa e desmonta o modal ao confirmar cada input

## Causa Raiz Consolidada

- Causa raiz 1: o `PromptDialog` fecha a etapa ao confirmar, então qualquer erro posterior aparece fora do modal
- Causa raiz 2: o frontend envia `value` em vez de `percentageBps` ou `valueCents`
- Causa raiz 3: a sanitização de erro não cobre mensagens como `Missing percentageBps`, deixando erro técnico visível ao usuário
- Causa raiz 4: embora exista infraestrutura de toast global, ela não ficou comprovada visualmente no fluxo de Split testado

## Arquivos Responsáveis

- `components/screens.tsx`
- `app/api/split-rules/route.ts`
- `lib/app-events.ts`
- `components/ui/Modal.tsx`

## Correções Necessárias

- Corrigir o payload enviado pelo frontend para respeitar o contrato da API de split
- Reestruturar o fluxo de prompt para manter o modal aberto em qualquer erro de validação ou falha da API
- Exibir o erro dentro do modal e destacar claramente o campo inválido
- Garantir sanitização amigável para erros de backend no split
- Revalidar em produção a aparição, duração e não duplicidade dos toasts

## Revalidação Após Correção

- Data da revalidação final: `2026-07-09`
- Deployment ID final: `dpl_CtmnnbNoQFEfs4PZSauxbrh61jzQ`
- URL do deploy final: [connektpay-3aiixn7v0-leonardonoronha12-2214s-projects.vercel.app](https://connektpay-3aiixn7v0-leonardonoronha12-2214s-projects.vercel.app)
- URL final validada: [connektpay.vercel.app](https://connektpay.vercel.app)

## Matriz Final Atualizada

| Cenário | Esperado | Obtido | Evidência | Correção necessária |
|---|---|---|---|---|
| Alias em produção | Entregar o modal novo de Split no domínio final | O alias `connektpay.vercel.app` continuou servindo a UI antiga, mesmo após hard refresh sem cache | No alias, o modal ainda mostra lista numerada + campo `Ex: 1`; no deploy direto, o modal novo mostra combobox de recebedor, tipo e valor | Confirmar propagação/publicação do alias para a build mais recente antes da homologação final |
| Percentual válido | Enviar `percentageBps`, salvar com sucesso, fechar modal e atualizar tela | No deploy novo, o frontend enviou payload correto e manteve o modal aberto em erro, mas o backend respondeu `404 Receiver not found` | Payload capturado: `{"receiverId":"6a4f1162-157c-4adc-89db-95a188f96037","paymentLinkId":"7d0f4bc9-c1f4-4cf4-ae9f-93427258876f","type":"percentage","percentageBps":1000,"status":"active"}` | Corrigir a aceitação do recebedor no backend/tenant para permitir persistência real da regra |
| Valor fixo válido | Enviar `valueCents`, salvar com sucesso, fechar modal e atualizar tela | No deploy novo, o frontend enviou payload correto, mas o backend respondeu `404 Receiver not found` | Payload capturado: `{"receiverId":"e697cee7-c4ff-4652-806e-e5e7dbb7588e","paymentLinkId":"2f45d494-b6dd-4391-ad09-d842d91aab40","type":"fixed","valueCents":1000,"status":"active"}` | Corrigir a aceitação do recebedor no backend/tenant para permitir persistência real da regra |
| Percentual inválido | Validar no cliente, destacar campo e manter modal aberto | A validação funcionou no deploy novo; sem request e com mensagem amigável dentro do modal | Mensagem: `Informe um percentual válido para o split.`; nenhum `POST /api/split-rules` | Sem correção adicional no frontend para este cenário |
| Valor inválido | Validar no cliente, destacar campo e manter modal aberto | A validação funcionou no deploy novo; sem request e com mensagem amigável dentro do modal | Mensagem: `Informe um valor válido para o split.`; nenhum `POST /api/split-rules` | Sem correção adicional no frontend para este cenário |
| Sem recebedor | Exibir mensagem amigável e manter modal aberto | A validação funcionou no deploy novo; sem request e com mensagem amigável dentro do modal | Mensagem: `Selecione um recebedor.`; nenhum `POST /api/split-rules` | Sem correção adicional no frontend para este cenário |
| Erro da API | Exibir erro amigável, manter modal aberto e não expor erro técnico | Em mock controlado no deploy novo, o modal permaneceu aberto e exibiu mensagem amigável | Mensagem: `Não foi possível salvar a regra de split. Tente novamente.` | Sem correção adicional no frontend para este cenário |
| Duplo clique | Disparar apenas uma submissão | A correção final bloqueou o duplo clique no deploy novo; somente 1 `POST` foi registrado | Dois cliques imediatos em `Salvar split` resultaram em 1 request | Sem correção adicional no frontend para este cenário |

## Conclusão Final Atualizada

- O frontend do Split foi corrigido no workspace e no deploy final direto:
  - envia `percentageBps` para percentual
  - envia `valueCents` para valor fixo
  - nunca envia ambos
  - mantém o modal aberto em erro
  - bloqueia duplo clique
  - não expõe `Missing percentageBps`
- O domínio final `https://connektpay.vercel.app` ainda não refletiu essa UI nova durante a revalidação, portanto a homologação em produção no alias principal não pôde ser aprovada
- Mesmo no deploy novo, o cenário válido real ainda falha por retorno de backend `Receiver not found`, o que impede concluir a gravação real da regra de split
- Status final da validação em produção: **NÃO**
