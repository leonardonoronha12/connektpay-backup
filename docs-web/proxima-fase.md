# Próxima Fase

A próxima fase da Connekt Pay é focada em **integração completa com o provedor financeiro (MyGateway)** para transformar os fluxos “base” em fluxos “reais” (com status, conciliação e automações do provedor).

## Objetivo

- Tornar pagamentos (PIX e cartão) plenamente operacionais em produção
- Automatizar recebimento de eventos via webhooks e manter status sempre atualizado
- Fechar o ciclo financeiro com repasses, split e conciliação com dados do provedor

## O que será desenvolvido

### Pagamentos (PIX e cartão)

- PIX real: criação, QR Code/“copia e cola”, confirmação e atualização de status
- Cartão: autorização/captura, antifraude conforme contrato, status e estornos (quando aplicável)

### Webhooks e eventos

- Webhooks reais do provedor (assinatura, idempotência, retries)
- Processamento de eventos para refletir status no painel em tempo real

### Split, repasses e conciliação

- Split financeiro efetivo (regra no provedor)
- Repasses reais (criação, acompanhamento e conciliação)
- Conciliação completa com dados do provedor (comparação e divergências)

### Antecipação e KYC integrados

- Antecipação real com taxas e regras do provedor
- KYC integrado ao provedor (quando aplicável ao contrato)

### Pix Automático

- Implementação/validação conforme disponibilidade e contrato do provedor

## Resultado esperado ao fim da próxima fase

- Fluxos de checkout e cobrança com status real (sem dependência de simulação)
- Operação financeira com conciliação e repasses integrados
- Redução de trabalho manual (eventos e atualizações automáticas)
