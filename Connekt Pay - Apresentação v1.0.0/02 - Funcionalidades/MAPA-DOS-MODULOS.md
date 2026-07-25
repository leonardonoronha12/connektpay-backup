# Mapa dos Módulos — Connekt Pay v1.0.0

Objetivo: oferecer uma visão “executiva” do produto, conectando módulos, responsabilidades e dependências.

## Visão em camadas

### Camada 1 — Experiência (UI)

- Painel autenticado (módulos operacionais e financeiros)
- Checkout público (venda por link)
- Admin (governança, auditoria e reprocessamento)

### Camada 2 — Orquestração (APIs)

- APIs internas (`/api/*`): usadas pelo painel autenticado
- APIs públicas (`/api/public/*`): consumo externo controlado por API key + rate limit
- Webhook (`/api/webhooks`): ingestão de eventos do provider

### Camada 3 — Dados (Supabase)

- Postgres (RLS por organização)
- Storage (documentos de KYC)
- Auth (sessões e identidade)

### Camada 4 — Provedor financeiro (MyGateway)

- Provider implementado e integrado para operações base
- Pendências do contrato para completar “real” (v1.1)

## Mapa (18 módulos)

Comercial:
- Dashboard
- Transações
- Links de Pagamento
- Checkout Público

Recorrência:
- Assinaturas
- Planos

Recebedores/Compliance:
- Recebedores
- KYC

Financeiro:
- Ledger
- Antecipação
- Repasses
- Conciliação

Governança/Operação:
- Auditoria
- Eventos/Webhooks

Configuração e acesso:
- Autenticação
- Configurações
- Integrações
- Navegação Mobile

## Dependências por domínio (resumo)

- Autenticação / RBAC: Supabase Auth + middleware
- Isolamento por organização: RLS no Supabase
- Checkout/Payments/Subscriptions: MyGateway (real) ou modo controlado quando não configurado
- Webhooks/assentamento: assinatura + persistência + reprocessamento
- KYC: Storage + filas/admin; submit real no provider é pendente (v1.1)

