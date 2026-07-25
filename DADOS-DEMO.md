# Dados de Demo (fictícios) — Connekt Pay

Objetivo: preparar um conjunto “coeso” de dados para a apresentação (números que batem, nomes consistentes e fluxos com histórico).

## 1) Organização (empresa demo)

- Nome fantasia: Connekt Store
- Razão social: Connekt Store Comércio Digital LTDA
- CNPJ: 12.345.678/0001-90
- Segmento: E-commerce
- Site: https://connekt.store

## 2) Usuários (para login)

Owner (apresentação):
- Nome: Ana Lima
- E-mail: ana@connekt.store
- Telefone: (11) 98888-7777
- Role: owner

Operacional (KYC/Backoffice):
- Nome: Bruno Costa
- E-mail: bruno@connekt.store
- Telefone: (11) 97777-6666
- Role: operacional

Financeiro:
- Nome: Camila Rocha
- E-mail: camila@connekt.store
- Telefone: (11) 96666-5555
- Role: financeiro

## 3) Recebedores (merchants internos)

Recebedor A (ativo, KYC aprovado):
- Nome: Loja Alpha
- Documento: 45.678.901/0001-23
- E-mail: financeiro@lojaalpha.com.br
- Telefone: (11) 91234-5678
- Banco: 001 · 1234/56789-0

Recebedor B (ativo, KYC pendente):
- Nome: Clínica Horizonte
- Documento: 12.345.678/0001-90
- E-mail: contato@clinicahorizonte.com.br
- Telefone: (21) 93456-7890
- Banco: 341 · 4321/12345-6

Recebedor C (ativo, em análise):
- Nome: Escola Vértice
- Documento: 23.456.789/0001-01
- E-mail: financeiro@escolavertice.com.br
- Telefone: (31) 94567-8901
- Banco: 033 · 0001/99887-7

## 4) Documentos KYC (para upload e fila)

Sugestão de arquivos (nomes amigáveis):
- contrato_social_loja_alpha.pdf
- documento_socio_frente.jpg
- documento_socio_verso.jpg
- comprovante_endereco.pdf
- selfie_socio.jpg

Boas práticas:
- Usar 1–3 documentos por recebedor para não poluir a demo.
- Preferir PDF/JPG leves (até alguns MB) para upload rápido.

## 5) Links de pagamento (payment links)

Link A — compra única (PIX + Cartão):
- Nome: “Kit Connekt — Plano Essencial”
- Valor: R$ 149,90
- Métodos: PIX e Cartão
- Max parcelas: 3x
- Status: ativo
- Objetivo na demo: gerar transação e mostrar atualização no painel.

Link B — compra única (PIX apenas):
- Nome: “Taxa de adesão”
- Valor: R$ 19,90
- Métodos: PIX
- Objetivo na demo: mostrar checkout com PIX e copy/paste.

Link C — recorrência (Cartão apenas):
- Nome: “Assinatura Pro”
- Valor: R$ 99,00/mês
- Métodos: Cartão
- Objetivo na demo: criar assinatura e mostrar ciclo/eventos.

## 6) Planos de assinatura (recorrência)

Plano 1:
- Nome: Pro Mensal
- Valor: R$ 99,00
- Ciclo: monthly
- Recebedor: Loja Alpha

Plano 2:
- Nome: Pro Anual
- Valor: R$ 999,00
- Ciclo: yearly
- Recebedor: Loja Alpha

## 7) Transações (histórico para o painel)

Criar histórico com variedade (status/método):
- 6 transações PIX pagas (R$ 19,90 / 49,90 / 149,90)
- 2 transações cartão pagas (parcelado 2x e 3x)
- 1 transação recusada (cartão)
- 1 transação estornada (simular se existir fluxo no ambiente)

## 8) Ledger (para bater saldo/entradas/saídas)

Para demo ficar “crível”:
- Pelo menos 10 entradas (sales/credits) e 3 saídas (fees/debits)
- Manter saldo positivo para permitir:
  - solicitação de repasse
  - simulação/solicitação de antecipação

## 9) Repasses

Repasses sugeridos:
- 1 repasse agendado (R$ 300,00)
- 1 repasse liquidado (R$ 1.200,00)
- 1 repasse processando/falhou (se o ambiente permitir estados)

## 10) Conciliação

Para a apresentação:
- Executar conciliação com um conjunto pequeno de itens
- Garantir que apareça ao menos:
  - 1 matched
  - 1 divergent
  - 1 pending

## 11) Auditoria

Gerar ações que apareçam no log:
- Criar/editar link de pagamento
- Aprovar/rejeitar KYC
- Cancelar assinatura
- Atualizar configurações

