## Connekt Pay — Go-live checklist

### Configuração do provedor (MyGateway)
- [ ] Credenciais MyGateway configuradas no ambiente (Vercel + local quando necessário)
- [ ] Webhook do provedor configurado apontando para `/api/webhooks`
- [ ] Assinatura do webhook configurada (`MYGATEWAY_WEBHOOK_SECRET`) e validada em produção

### Pagamentos
- [ ] Pagamento PIX testado (criação, consulta e webhook de confirmação)
- [ ] Pagamento cartão testado (tokenização no backend, criação, consulta e webhook)
- [ ] Split testado (regra ativa, snapshot, payload do provedor e lançamentos)

### Recorrência
- [ ] Recorrência testada (criação de plano, criação/cancelamento de assinatura, eventos e dunning)
- [ ] Pix Automático revisado (modelo preparado e bloqueio ativo até integração real do provedor)

### Antecipação
- [ ] Antecipação testada (simulação, solicitação, aprovação/executada via webhook, ledger idempotente)

### Repasses (Payouts)
- [ ] Repasse testado (solicitação, eventos `payout.*`, atualização de status, ledger idempotente no `paid`)

### Conciliação
- [ ] Conciliação rodada (execução criada, itens gerados, divergências tratadas, auditoria)

### Notificações
- [ ] E-mails transacionais funcionando (provider configurado ou fallback registrado em `email_logs`)

### Segurança e auditoria
- [ ] RLS validado (tabelas sensíveis com FORCE RLS; políticas por `organization_id`)
- [ ] `audit_logs` funcionando (ações críticas registradas)

### Deploy
- [ ] Deploy Vercel OK (build/lint/test passando no pipeline)

