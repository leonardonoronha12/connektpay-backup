# Connekt Pay — Release Notes

Versão: v1.0.0  
Data: 2026-06-23  
Objetivo: versão de pré-apresentação (demo-ready), com foco em UX estável e fluxos end-to-end no painel.

## Módulos implementados

Autenticação e acesso:
- Login, cadastro e reset de senha (Supabase Auth).
- Proteção de rotas do painel (layout autenticado).

Painel (App):
- Dashboard (KPIs e visão geral).
- Transações: listagem, filtro, busca e export CSV.
- Links de pagamento: listagem, criação e checkout público.
- Checkout público: pagamento PIX/cartão (conforme métodos do link) e confirmação.
- Assinaturas: listagem, detalhe, criação, cancelamento; gestão de planos.
- Recebedores: cadastro, edição e fluxo de KYC (upload/gestão e fila de aprovação).
- Ledger: KPIs e extrato com export CSV.
- Antecipação: simulação/solicitação/listagem (sem alterar lógica do módulo).
- Repasses: solicitação, listagem, atualização de status e export CSV.

Admin:
- Painel administrativo.
- Aprovação KYC (fila, status, decisão).
- Eventos & webhooks (listagem e reprocessamento).
- Auditoria (log imutável + export CSV).
- Provedor financeiro (status/configuração).
- Conciliação (execução e análise de divergências).

Configurações:
- Perfil e dados da empresa.
- Integrações (tokens/api keys/settings).

## Bugs críticos corrigidos (pré-apresentação)

Checkout (público):
- Pós-pagamento: “Voltar ao início” não redireciona mais para área logada (`/dashboard`); agora vai para rota pública de sucesso (`/checkout/success`).

Tabelas e ações:
- Botões “…” sem ação em Transações e Assinaturas foram substituídos por dropdowns com ações funcionais (ex.: ver detalhes/cancelar).
- Botões de exportação sem ação (Ledger/Auditoria/Repasses) agora exportam CSV e desabilitam quando não há dados.

UX e responsividade:
- Tabelas com muitas colunas não “cortam” conteúdo em telas menores: scroll horizontal habilitado no container.
- Navegação mobile: menu hamburguer no header abre drawer lateral com a navegação do painel.

Header e KYC:
- Header: sino e avatar agora abrem dropdowns (notificações vazio / menu de usuário com sair).
- KYC: “Docs” não abre múltiplas abas; agora usa modal único com preview e botão explícito “Abrir documento”.

## Melhorias de robustez (sem mudar arquitetura)

- Estados de loading e bloqueio de duplo clique em ações sensíveis (ex.: aprovar/rejeitar KYC, salvar perfil/empresa, criar/cancelar assinatura).
- Máscaras básicas de input em pontos-chave (CPF/CNPJ, telefone, valores em R$ e campos de cartão).

## Testes executados

Executados nesta versão:
- `npm run lint`
- `npm run build`
- `npm run test:smoke`

Suites adicionais disponíveis (Playwright):
- `npm run test:dashboard`
- `npm run test:split`
- `npm run test:recurrence`
- `npm run test:anticipation`
- `npm run test:reconciliation`
- `npm run test:kyc`
- `npm run test:payouts`
- `npm run test:notifications`
- `npm run test:mygateway`

## Pendências restantes (pós-demo)

Baixa prioridade:
- Ajustes de microcopy (ex.: labels que não acompanham filtros; textos estáticos).
- Evolução de máscaras/validações para consistência total em todos os formulários.

## Itens que dependem da MyGateway (status)

Referência: [MYGATEWAY-INTEGRATION-STATUS.md](file:///c:/Users/Leonardo/Desktop/ConnektPay/docs/MYGATEWAY-INTEGRATION-STATUS.md)

Funcionalidades com endpoint real (OK para demo com credenciais):
- Autenticação no provider.
- Criar payment link.
- Consultar situação (payment/link).
- Tokenizar cartão.
- Criar/cancelar assinatura.

Funcionalidades preparadas/pendentes (dependem de confirmação/contrato MyGateway):
- Antecipação (request/get/cancel): preparado (mock/shape aguardando confirmação).
- Repasses/payouts (create/get/list no provider): pendente de endpoints oficiais.
- KYC do recebedor (submit no provider): pendente de endpoint oficial.
- Pix Automático (autorização/cobrança/eventos): pendente de endpoints oficiais.
- Listagens para conciliação completa (transactions/payouts/anticipations): pendente; conciliação atual usa consultas por referência quando aplicável.

