# Debug Session: split-final-pass
- **Status**: [OPEN]
- **Issue**: O fluxo de Split ainda não está homologado em produção, e o Guia Rápido precisa de refinamento visual e responsivo sem ampliar escopo funcional.
- **Debug Server**: n/a
- **Log File**: n/a

## Reproduction Steps
1. Abrir `https://connektpay.vercel.app`
2. Validar o fluxo de Split em `Links de Pagamento`
3. Exercitar cenários de erro, sucesso, cancelamento e reabertura
4. Revisar o Guia Rápido em múltiplas resoluções
5. Corrigir apenas causas raiz dentro do escopo permitido

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | O backend de `POST /api/split-rules` rejeita recebedores do próprio tenant por inconsistência de contexto/filtro. | High | Medium | Confirmed |
| B | O alias `connektpay.vercel.app` não está entregando a mesma build validada no deploy direto. | High | Low | Confirmed |
| C | O fluxo de Split ainda prioriza erro inline e não torna o toast visualmente confiável em todos os cenários. | Medium | Medium | Confirmed |
| D | O duplo clique restante no Split vem de corrida no estado local do modal, não da API. | Medium | Low | Confirmed |
| E | O Guia Rápido ocupa altura e densidade visual excessivas nas resoluções menores, afetando hierarquia e escaneabilidade. | High | Medium | Confirmed |

## Log Evidence
- `GET/POST /api/split-rules` falharam inicialmente por diferença entre schema disponível e schema esperado
- Rotas de Split foram compatibilizadas com schema legado e expandido, eliminando os `500`
- O deploy final passou a responder `201` para split percentual e fixo em produção
- A linha dos links passou a refletir o estado salvo com `Editar split`
- O modal passou a reabrir com a configuração persistida
- O viewport de toast foi migrado para renderização reativa, tornando sucesso e erro visíveis acima do modal
- O Guia Rápido passou a recolher por padrão quando apropriado e deixou de reabrir automaticamente após onboarding iniciado
- Evidências detalhadas foram consolidadas em `SPLIT-VALIDACAO-DEFINITIVA.md` e `ONBOARDING-USUARIO-LEIGO.md`

## Verification Conclusion
- O fluxo de Split foi validado com sucesso em produção no alias final.
- O Guia Rápido foi refinado e revalidado nas resoluções alvo.
- A sessão permanece aberta até confirmação final do usuário.
