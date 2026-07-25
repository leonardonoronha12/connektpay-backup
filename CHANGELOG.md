# Changelog — Connekt Pay

Este changelog segue um formato pragmático para o projeto (entrega orientada a demo/homologação).

## v1.0.0 — 2026-06-24

### Adicionado

- Painel autenticado (AppShell) com proteção por sessão e RBAC
- Dashboard com KPIs principais
- Transações: listagem, filtros, busca e export CSV
- Links de Pagamento: listar/criar/visualizar; geração de slug; checkout público por slug
- Checkout público com métodos PIX/cartão conforme configuração do link
- Recorrência: Assinaturas (listar/criar/cancelar/detalhe) e Planos (gestão)
- Recebedores com status e dados bancários
- KYC: upload de documentos, gestão e fila de aprovação (admin)
- Ledger: extrato e export CSV
- Antecipação: simulação/solicitação/listagem (modo preparado)
- Repasses: solicitação/listagem/status (modo preparado)
- Conciliação: execução e revisão de divergências (por referência quando aplicável)
- Auditoria: audit logs imutáveis e export CSV
- Eventos/Webhooks: persistência de eventos e reprocessamento
- Configurações: perfil/organização e integrações (tokens/API keys)
- Navegação mobile via menu hamburguer/drawer

### Melhorias

- Robustez de APIs internas (tratamento de falhas e payload seguro para UI)
- Melhorias de UX em ações de tabela (dropdowns funcionais, feedback e desabilitação em estados de loading)
- Melhorias de consistência de mensagens de erro (sem stacktrace no frontend)

### Correções

- Checkout pós-pagamento: “Voltar ao início” deixou de redirecionar para rota protegida; passou a usar `/checkout/success`
- Botões “…” sem ação em tabelas substituídos por dropdowns com ações válidas
- Exportações (Ledger/Auditoria/Repasses) implementadas e desabilitadas quando não há dados
- KYC Docs: visualização em modal único (evita múltiplos popups)
- Responsividade: tabelas com scroll horizontal; navegação mobile habilitada

### Ajustes de UX

- Remoção de affordances “fantasmas” (elementos clicáveis sem ação)
- Melhorias pontuais de microcopy e estados de carregamento em fluxos críticos

### Ajustes de segurança

- RLS ativo e reforçado (FORCE RLS) nas tabelas sensíveis do schema `public`
- API pública com API key + rate limit por organização
- Webhooks com assinatura (fail-closed em produção quando segredo está ausente)
- `audit_logs` cobrindo ações críticas (origem `internal_api`/`public_api`)
- Headers de segurança configurados para produção (Next/Vercel)

### Ajustes de testes

- Auditoria E2E Playwright com 17 fluxos e evidências (screenshots/vídeos/traces)
- Setup idempotente de dados para execução confiável em ambiente de demo

