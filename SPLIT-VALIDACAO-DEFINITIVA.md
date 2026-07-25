# Split Validacao Definitiva

## Resultado Final

- Status final do fluxo de Split em produção: **APROVADO**
- URL da produção: [connektpay.vercel.app](https://connektpay.vercel.app)
- URL do deploy final: [connektpay-avci2gnch-leonardonoronha12-2214s-projects.vercel.app](https://connektpay-avci2gnch-leonardonoronha12-2214s-projects.vercel.app)
- Deployment ID final: `dpl_2ExSDCSNMgw3mRsrBfkCNsrMxN1J`
- Build validado com `npm run lint` e `npm run build`
- Publicação validada com `npx vercel deploy --prod --yes`

## Problemas Encontrados

- O frontend já havia sido corrigido para enviar `percentageBps` e `valueCents`, mas a API ainda quebrava em produção quando o schema remoto não expunha as colunas novas de `split_rules`
- `GET /api/split-rules` e `POST /api/split-rules` ficavam vulneráveis a erro de schema e retornavam `500`, impedindo o fluxo válido real
- O fluxo já persistia no backend, mas a tela não refletia claramente o estado salvo após sucesso
- Os toasts eram renderizados via manipulação imperativa de DOM dentro de um viewport controlado pelo React, o que fazia o feedback visual desaparecer em rerenders
- O modal mantinha boa UX de erro, mas o usuário não recebia confirmação visual suficientemente confiável após salvar

## Causa Raiz

- Causa raiz 1: incompatibilidade entre o código do Split e o schema efetivamente disponível em produção para a tabela `split_rules`
- Causa raiz 2: ausência de sincronização visual entre a regra persistida e a listagem/modal do Split
- Causa raiz 3: implementação do toast fora do fluxo reativo do React, sujeita a limpeza em rerenders

## Correções Aplicadas

- API de Split compatibilizada com schema expandido e schema legado sem alterar banco de dados
- Rotas `GET`, `POST`, `PATCH` e `DELETE` de `split-rules` alinhadas para usar client consistente e mapear corretamente `value`, `value_cents` e `percentage_bps`
- Modal do Split ajustado para:
  - manter o contexto aberto em erro
  - carregar recebedores e regras já salvas
  - reabrir com dados previamente persistidos
  - manter loading e bloqueio de dupla submissão
- Listagem de links ajustada para refletir estado salvo:
  - `Configurar split` muda para `Editar split`
  - badge `Split configurado` aparece quando a regra existe
- Toast global migrado para renderização reativa em `AppToastViewport`, com duração estável e camada acima do modal

## Antes e Depois

### Antes

- `POST /api/split-rules` falhava em produção com `500`
- A regra válida não podia ser confirmada ponta a ponta com confiança
- O usuário podia salvar, mas a tela não refletia claramente o split salvo
- O toast não era visualmente confiável

### Depois

- `POST /api/split-rules` retorna `201` em sucesso real
- Split percentual e fixo foram gravados em produção com persistência confirmada
- O modal fecha apenas no sucesso e permanece aberto em erro
- A linha do link muda visualmente para `Editar split`
- Reabrindo o modal, os dados salvos já aparecem preenchidos
- Toast de erro e sucesso aparecem acima do modal com auto-dismiss

## Evidências da Validação em Produção

- Split percentual válido: **aprovado**
- Split por valor fixo válido: **aprovado**
- Recebedor inexistente: **aprovado**
- Recebedor inválido: **aprovado**
- Valor inválido: **aprovado**
- Percentual inválido: **aprovado**
- API retornando erro: **aprovado**
- API retornando sucesso: **aprovado**
- Clique duplo: **aprovado**
- Cancelar: **aprovado**
- Reabrir modal: **aprovado**
- Toast acima do modal: **aprovado**
- Toast com duração adequada: **aprovado**
- Toast sem duplicidade visual: **aprovado**
- Modal fecha apenas no sucesso: **aprovado**
- Atualização visual após sucesso: **aprovado**

## Payloads Validados

### Percentual

```json
{
  "receiverId": "3db4fed6-75be-4a8f-9123-d21227c648ac",
  "paymentLinkId": "6e9d6672-d9c9-4dae-8898-8b6d39eb2d2c",
  "type": "percentage",
  "percentageBps": 1000,
  "status": "active"
}
```

### Valor Fixo

```json
{
  "receiverId": "3db4fed6-75be-4a8f-9123-d21227c648ac",
  "paymentLinkId": "6e9d6672-d9c9-4dae-8898-8b6d39eb2d2c",
  "type": "fixed",
  "valueCents": 1000,
  "status": "active"
}
```

## Screenshots e Evidências Visuais

- `final-guia-dashboard-1920-expandido.png`
- `final-guia-dashboard-1920-recolhido-topo.png`
- `final-guia-dashboard-1366-expandido.png`
- Evidência visual do Split em produção:
  - modal com `Salvar split`
  - linha alterando de `Configurar split` para `Editar split`
  - toast de sucesso acima do modal
  - toast de erro acima do modal

## Observações

- A validação de produção foi concluída com sucesso no domínio final
- A validação de resoluções do Guia Rápido foi concluída com sucesso nas larguras-alvo
- A validação browser-based foi executada no ambiente disponível de automação; referências cross-browser devem ser interpretadas com base nessa execução assistida
