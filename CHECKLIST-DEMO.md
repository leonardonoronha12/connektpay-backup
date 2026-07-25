# Checklist de Demo — Connekt Pay (v1.0.0)

Objetivo: roteiro rápido, previsível e sem surpresas para apresentação.

## Preparação (antes de abrir a call)

- Garantir ambiente ok (variáveis, banco e seeds/dados).
- Abrir a aplicação em uma janela e deixar a sessão logada.
- Manter uma aba separada com `/checkout?slug=...` pronta para o fluxo público.

## 1) Login

- Acessar `/login`
- Entrar com usuário demo (owner/admin)
- Validar: redireciona para `/dashboard`

## 2) Dashboard

- Acessar `/dashboard`
- Mostrar KPIs, cards e visão geral
- Mostrar navegação (sidebar + menu mobile no header, se necessário)

## 3) Payment Link

- Acessar `/links-pagamento`
- Criar um link (ou abrir um existente)
- Copiar a URL do link e abrir em aba anônima

## 4) Split

- No fluxo do payment link (ou tela de integrações/split, conforme configurado no ambiente), mostrar:
  - Preview/metadata de split (quando disponível)
  - Regras cadastradas (se estiverem no ambiente)
- Reforçar: split é aplicado no backend (sem expor segredos no front)

## 5) Ledger

- Acessar `/ledger`
- Mostrar KPIs (saldo/créditos/débitos)
- Mostrar extrato completo
- Exportar CSV (botão “Exportar CSV”)

## 6) Recorrência

- Acessar `/subscriptions/plans`
- Mostrar planos existentes
- Acessar `/subscriptions`
- Criar assinatura (ou abrir uma existente) e mostrar detalhe `/subscriptions/[id]`
- Demonstrar cancelamento (se aplicável ao ambiente)

## 7) Antecipação

- Acessar `/antecipacao`
- Mostrar saldo/antecipável/taxa e simulação
- Solicitar antecipação (fluxo demonstrativo)

## 8) Conciliação

- Acessar `/admin/conciliacao`
- Executar uma conciliação e abrir a execução
- Mostrar itens matched/divergent/pending/resolved e ações disponíveis

## 9) KYC

- Acessar `/recebedores`
- Abrir um recebedor e mostrar envio de documentos KYC
- Acessar `/admin/aprovacao-kyc`
- Abrir “Docs” (modal único) e aprovar/rejeitar (se permitido)

## 10) Repasses

- Acessar `/repasses`
- Mostrar KPIs e lista
- Solicitar repasse (valor pequeno)
- Exportar CSV (botão “Exportar”)

## 11) Notificações

- No header: clicar no sino
- Mostrar dropdown “Nenhuma notificação no momento”

## 12) Auditoria

- Acessar `/admin/auditoria`
- Buscar por uma ação recente (approve/reject KYC, create link, etc.)
- Exportar CSV

## 13) Configurações

- Acessar `/configuracoes`
- Atualizar um campo simples (ex.: telefone) e salvar
- Acessar `/configuracoes/integracoes` e mostrar tokens/keys/settings

## Encerramento

- No header: abrir menu do usuário → “Sair”
- Confirmar redirecionamento para `/login`

