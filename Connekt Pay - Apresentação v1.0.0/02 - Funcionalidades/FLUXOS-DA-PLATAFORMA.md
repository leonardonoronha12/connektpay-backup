# Fluxos da Plataforma — Connekt Pay v1.0.0

Este documento descreve os fluxos principais para apresentação, separando: (1) jornada do painel e (2) jornada pública via checkout.

## 1) Jornada do painel (B2B)

### Acesso e contexto (organização)

- Login → redireciona para `/dashboard`
- Sessão valida o contexto da organização (RLS) e papel do usuário (RBAC)

### Operação comercial

- Dashboard: KPIs (TPV, Receita Connekt, Saldo, MRR) e visão do período
- Transações: filtros e busca, abertura de detalhes e export CSV

### Venda por link

- Links de pagamento: criar link com produto/valor/métodos
- Visualizar link: abrir checkout e validar informações

### Recorrência

- Planos: listar/gerir planos (quando regras do negócio permitirem)
- Assinaturas: criar assinatura, acompanhar status e cancelar

### Recebedores e KYC

- Recebedores: cadastrar/editar, status e dados bancários
- KYC: subir documentos e acompanhar; aprovação via admin

### Financeiro e governança

- Ledger: extrato e export CSV
- Antecipação: simulação/solicitação/listagem (modo preparado)
- Repasses: solicitação/listagem/status (modo preparado)
- Conciliação: execução e revisão de divergências (parcial; depende de listagens do provider)
- Auditoria: audit logs e export CSV
- Eventos: fila de eventos, reprocessamento e rastreabilidade

## 2) Jornada pública (Checkout)

### Checkout por slug

- Acessa `/checkout?slug=...`
- Carrega os dados do link e habilita métodos (PIX/cartão)
- Finaliza pagamento e segue para confirmação/estado de aguardando (conforme provider e configuração)

### Pós-pagamento

- Página pública de sucesso: `/checkout/success`

## 3) Fluxos E2E (auditoria)

Referência do pacote de evidências: `QA-E2E-FINAL.md` e pasta `04 - Evidências`.

