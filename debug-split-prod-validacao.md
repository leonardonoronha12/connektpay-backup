# Debug Session: split-prod-validacao
- **Status**: [OPEN]
- **Issue**: O fluxo de Split em produção não atende os critérios de aprovação de UX e persistência da regra.
- **Debug Server**: n/a
- **Log File**: n/a

## Reproduction Steps
1. Acessar `https://connektpay.vercel.app`
2. Entrar na área autenticada
3. Abrir `Links de Pagamento`
4. Acionar `Configurar split`
5. Exercitar os cenários obrigatórios e registrar rede, console e comportamento da UI

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | O modal fecha antes do retorno do `POST /api/split-rules`, então o erro não permanece dentro do modal. | High | Low | Confirmed |
| B | O frontend envia `value`, mas a API exige `percentageBps` ou `valueCents`. | High | Low | Confirmed |
| C | As validações de recebedor/tipo/valor dependem do `PromptDialog` e não geram toast consistente acima do modal. | High | Medium | Confirmed |
| D | O cenário sem recebedores não é reproduzível no tenant atual de produção porque já existem recebedores cadastrados. | Medium | Low | Confirmed |
| E | Mesmo com payload correto, a regra pode falhar em casos reais por pré-requisitos do recebedor no backend de split. | Medium | Medium | Pending |

## Log Evidence
- `GET /api/receivers` com lista real de recebedores em produção: cenário sem recebedores não reproduzível nativamente
- `POST /api/split-rules` no fluxo real: `400` com `{"error":"Missing percentageBps"}`
- Payload real enviado pelo frontend: `{ receiverId, paymentLinkId, type, value, status }`
- `usePromptDialog()` fecha o modal em `submit()` ao chamar `state.resolve(...)` seguido de `setState(null)`
- `PaymentLinksScreen` renderiza `Notice` fora do modal quando `setError(...)` é acionado
- Infraestrutura de toast existe em `lib/app-events.ts`, mas não foi comprovada visualmente no fluxo de Split durante a validação
- Detalhamento completo registrado em `SPLIT-VALIDACAO-FINAL.md`

## Verification Conclusion
- O fluxo de Split não é aprovável em produção.
- A causa principal confirmada é a incompatibilidade de contrato entre frontend e backend.
- A causa secundária confirmada é estrutural de UX: o modal fecha antes do desfecho da operação, então o feedback de erro sai do contexto do modal.
