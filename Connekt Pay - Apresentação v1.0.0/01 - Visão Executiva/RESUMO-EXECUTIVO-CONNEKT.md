Connekt Pay v1.0.0 (pré-apresentação) — 23/06/2026

Entrega pronta para demo com foco em estabilidade e UX do painel:
- Login/cadastro/reset + rotas protegidas
- Dashboard, Transações (filtros + export CSV)
- Links de pagamento + Checkout público (PIX/cartão conforme métodos)
- Assinaturas (planos, criação, cancelamento, detalhes)
- Recebedores + KYC (upload/gestão + fila de aprovação)
- Ledger (extrato + export CSV)
- Repasses (solicitação, status, export CSV)
- Auditoria (logs + export CSV), Eventos/Webhooks (reprocessar), Configurações e Integrações
- Navegação mobile via menu no header

Correções críticas aplicadas:
- Checkout pós-pagamento não redireciona mais para área logada; usa /checkout/success (público)
- Remoção de botões “fantasmas”: menus e exportações agora funcionam
- KYC Docs: visualização em modal único (sem abrir várias abas)

Testes executados:
- npm run lint / npm run build / npm run test:smoke (Playwright)

QA E2E (auditoria):
- QA E2E concluído para os fluxos com evidência disponível neste workspace (4/17)
- 17 fluxos automatizados/definidos no auditor E2E (qa-e2e-audit.spec.ts); evidências Playwright presentes em test-results para 7, 8, 9 e 17
- 4 falhas corrigidas (Assinaturas, Planos, Recebedores, Navegação mobile) e revalidadas com SUCESSO
- Pronto para demo interna/homologação com ressalva: para “17/17 com evidência” é necessário preservar artefatos de execução completa (ou reexecutar a auditoria completa)

Dependências de MyGateway (pendente de endpoints oficiais):
- Payouts/Repasse no provider (get/list), KYC submit no provider, Pix Automático
- Antecipação no provider (request/get/cancel) está preparada, aguardando confirmação de contrato
