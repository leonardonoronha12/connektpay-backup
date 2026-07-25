# ESCOPO ENTREGUE

## Entregue nesta V1

- Autenticação via Supabase com login, logout e callback
- RBAC por rota e guards server-side
- Dashboard operacional
- Transações internas e leitura pública controlada
- Camada neutra de adquirência com `AcquirerProvider`, registry, capabilities e `ProviderError`
- Payment Links e checkout público preservados no estado atual sem regressão interna nesta rodada
- Recebedores internos
- KYC interno
- Split interno
- Assinaturas internas
- Repasses internos
- Antecipação interna
- Conciliação interna
- Ledger interno
- Auditoria
- Eventos e reprocessamento automático
- Configurações e provider settings
- Exportações CSV administrativas/internas previstas pelo produto
- Tratamento de indisponibilidade operacional com `503` para dependências externas não configuradas
- Mobile crítico validado

## Entregue com bloqueio externo explícito

- Recipients na Pagar.me
- KYC no provider
- Split externo
- Assinaturas externas
- Repasses externos
- Antecipação externa
- Webhooks oficiais
- Reconciliação externa/provider
- Homologação final dependente de credenciais e habilitações da conta Pagar.me

## Fora do escopo desta V1

- Pix Automático
- Webhooks outbound
- Pagamento avulso PIX/cartão sem contrato externo homologado
- Novos PSPs além da base atual multi-provider
