# Connekt Pay — Documentação de Produto

A Connekt Pay é uma plataforma para processar pagamentos, gerenciar assinaturas e operar rotinas financeiras com foco em controle, rastreabilidade e operação por perfis (Owner/Admin/Financeiro).

## Ambiente validado

- Produção (Vercel): https://connektpay.vercel.app
- Documentação: https://connektpay.vercel.app/docs
- Status: pronto para homologação funcional

## Objetivo da plataforma

- Centralizar o ciclo de pagamento: criação de cobranças, acompanhamento de status e experiência de checkout.
- Dar visibilidade do negócio: dashboard com indicadores e relatórios operacionais.
- Suportar recorrência: assinaturas e planos para cobranças recorrentes.
- Controlar operação financeira: ledger, antecipação, repasses e conciliação.
- Garantir governança: auditoria e permissões por perfil (RBAC).

## Público-alvo

- Empresas que vendem por cobrança (link/checkout) e/ou recorrência (assinaturas).
- Times de operação e financeiro que precisam acompanhar transações, conciliar e auditar ações.
- Sócios/gestores que precisam de visão executiva via dashboard.

## Visão geral (como funciona)

1. O negócio cria um **Link de Pagamento** (ou define planos/assinaturas).
2. O cliente paga no **Checkout** (PIX e cartão dependem do provedor financeiro configurado).
3. A operação acompanha **Transações** e **Assinaturas**.
4. O financeiro acompanha **Ledger**, solicita **Antecipação**, visualiza **Repasses** e roda **Conciliação**.
5. Tudo fica registrado em **Auditoria**, com acesso controlado por perfil.

## Arquitetura (resumo, sem tecnicismos)

- Aplicação web com painel autenticado (para operação e financeiro).
- Área pública de checkout (para o cliente final).
- Integração com provedor financeiro (fase atual: base pronta; próxima fase: integração completa).

## Por onde começar

- Status do Projeto: veja o que está pronto e o que é da próxima fase.
- Guia de Homologação: checklist completo para validar a plataforma.
- Módulos: entendimento de como cada tela funciona e como usar no dia a dia.
