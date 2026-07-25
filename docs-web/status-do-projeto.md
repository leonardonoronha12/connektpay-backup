# Status do Projeto

Esta página resume o que está pronto na Connekt Pay, o que está em validação e o que faz parte da próxima fase.

## Status atual

- Ambiente validado: Produção / Vercel (https://connektpay.vercel.app)
- Status: pronto para homologação funcional

## Funcionalidades concluídas (base pronta)

Legenda:

- ✅ Funcionalidade pronta
- 🟡 Funcionalidade em simulação / pré-visualização
- 🔵 Funcionalidade aguardando integração MyGateway
- ❌ Ainda não implementada

| Módulo | Status | Observação |
|---|---|---|
| Login | ✅ | Acesso por perfil (Owner/Admin/Financeiro) |
| Dashboard | ✅ | Indicadores e visão geral operacional |
| Transações | ✅ | Listagem, filtros e exportação |
| Links de Pagamento | 🟡 | Fluxo completo com simulação; valores finais e sincronização dependem do provedor |
| Checkout | 🟡 | Experiência pronta; pagamentos reais dependem do provedor financeiro |
| Assinaturas | 🔵 | Gestão/listagem pronta; criação/cobrança real depende do provedor |
| Planos | ✅ | Criação e manutenção de planos |
| Recebedores | ✅ | Cadastro e gestão de recebedores |
| KYC | 🟡 | Workflow e gestão de documentos; automação externa é próxima fase |
| Ledger | ✅ | Extrato e indicadores financeiros |
| Antecipação | 🟡 | Simulação/fluxo pronto; confirmação financeira real depende do provedor |
| Repasses | 🟡 | Visão e rotinas; execução real depende do provedor |
| Conciliação | 🟡 | Rotina e divergências; dados reais do provedor são próxima fase |
| Auditoria | ✅ | Trilhas de ações e eventos |
| Configurações | ✅ | Ajustes gerais e parâmetros da organização |
| Integrações | 🔵 | Integração financeira (MyGateway) em andamento |
| RBAC (perfis) | ✅ | Permissões por perfil e bloqueio de telas/APIs |
| Documentação | ✅ | Visão de produto e guia de homologação |
| Testes | 🟡 | Cobertura base; rodada de QA multi-navegador é etapa contínua |

## Funcionalidades em desenvolvimento (próxima fase)

### Integração completa com o provedor financeiro (MyGateway)

Itens previstos para a próxima etapa:

- PIX real (criação, confirmação e atualização de status)
- Cartão (tokenização, autorização/captura, status e antifraude conforme contrato)
- Split financeiro (regras e repasse no provedor)
- Webhooks reais (assinatura, idempotência e retries de eventos do provedor)
- Repasses reais (criação, acompanhamento e reconciliação completa)
- Antecipação real (solicitar/cancelar com regras e taxas reais)
- KYC integrado ao provedor (validação e retorno automatizado)
- Pix Automático (quando aplicável ao contrato do provedor)

## O que isso significa na prática

- A plataforma já permite operar o painel e validar fluxos completos de navegação e permissões.
- O “pagamento real” e a “reconciliação 100% automática” fazem parte da próxima fase (integração completa).
