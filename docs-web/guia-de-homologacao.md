# Guia de Homologação

Este guia orienta a validação (homologação) da Connekt Pay como produto: navegação, uso por módulo, permissões por perfil e comportamento esperado.

## Objetivo da homologação

- Confirmar que os fluxos principais funcionam ponta a ponta no painel
- Garantir que cada perfil (Owner/Admin/Financeiro) vê apenas o que deve ver
- Validar a experiência (estados vazios, mensagens e consistência de navegação)

## Como acessar

- Ambiente oficial (produção): https://connektpay.vercel.app
- Documentação: https://connektpay.vercel.app/docs

## Validações em produção (resumo)

- Login em produção (sessão real): validado para perfis Owner/Admin/Financeiro
- Dashboard em produção: abre após login válido
- RBAC em produção: validado por perfil (telas, sidebar e APIs)
- Endpoints em produção (sem sessão): retornam 401/403 quando esperado (evita 500 em rotas principais)

## Usuários QA

Perfil | E-mail | Senha
---|---|---
Owner | qa.owner@connektpay.com | QaOwner@2026!
Admin | qa.admin@connektpay.com | QaAdmin@2026!
Financeiro | qa.financeiro@connektpay.com | QaFin@2026!

## Checklist de homologação

### Autenticação

- Login funciona para os 3 usuários
- Logout funciona e retorna para login
- Acesso direto por URL sem sessão redireciona para login

### Permissões (RBAC)

- Sidebar mostra apenas itens permitidos por perfil
- Páginas proibidas são bloqueadas (redireciona/bloqueia)
- Endpoints internos proibidos retornam 403 quando logado

### Dashboard

- Tela abre e carrega indicadores
- Não exibe erros genéricos de backend (ex.: “Internal Server Error”)

### Transações

- Lista carrega
- Filtros funcionam
- Exportação (quando aplicável) não quebra a navegação

### Links de Pagamento

- Owner/Admin: listar e criar novo link
- Financeiro: não deve acessar nem visualizar menu

### Checkout

- Acessar um link público abre o checkout
- Gerar tentativa de pagamento (quando o provedor estiver configurado)
- Validar mensagens/estado quando o provedor não estiver configurado

### Assinaturas e Planos

- Listagem abre
- Detalhe de assinatura abre (quando houver dados)
- Owner/Admin: criar plano e criar assinatura
- Financeiro: pode visualizar assinaturas, mas não deve acessar páginas de planos/criação

### Recebedores

- Owner/Admin: listar e cadastrar
- Financeiro: não deve acessar nem visualizar menu

### KYC

- Owner/Admin: acessar e operar o fluxo de aprovação
- Financeiro: não deve acessar nem visualizar menu

### Ledger

- Owner/Financeiro: acessar e navegar
- Admin: não deve acessar nem visualizar menu

### Antecipação

- Owner/Financeiro: acessar e simular
- Admin: não deve acessar nem visualizar menu

### Repasses

- Owner/Financeiro: acessar e navegar
- Admin: não deve acessar nem visualizar menu

### Conciliação

- Owner/Admin/Financeiro: acessar e navegar
- Validar execução/estados e tratamento de divergências (conforme dados disponíveis)

### Auditoria

- Owner/Admin: acessar e navegar
- Financeiro: não deve acessar nem visualizar menu

### Configurações e Integrações

- Apenas Owner deve acessar
- Admin e Financeiro não devem ver no menu nem acessar por URL

### Responsividade

- Verificar layout no mobile (menu, tabelas e telas longas)

## Como reportar bugs

Ao abrir um ticket, informar:

- Perfil (Owner/Admin/Financeiro) e e-mail usado
- Tela/URL
- Passo a passo para reproduzir
- Resultado obtido e resultado esperado
- Evidência (print ou gravação curta)

## O que não faz parte desta homologação (por enquanto)

Fluxos que dependem de integração completa com o provedor financeiro (próxima fase), por exemplo:

- Confirmação real de pagamentos por PIX/cartão via provedor
- Webhooks reais do provedor e reconciliação 100% automática
- Execução real de repasses e antecipação com regras/taxas finais do provedor
