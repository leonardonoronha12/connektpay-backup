# MYGATEWAY-PERGUNTAS-PENDENTES

Lista objetiva do que a Connekt Pay precisa confirmar com a MyGateway antes de iniciar a implementação da Fase 2 com segurança.

## Ambiente e credenciais

1. Qual é a URL oficial de sandbox?
2. Qual é a URL oficial de produção?
3. Existe diferença de autenticação entre sandbox e produção?
4. O `authData` é o formato oficial definitivo?
5. O token retornado em `POST /authentication/v1/auth` tem qual TTL?
6. Existe endpoint de refresh de token?
7. Há limite de tokens/sessões simultâneas por credencial?

## Pagamentos e status

1. `POST /payments/v1/create` é o endpoint oficial definitivo para:
   - PIX
   - cartão
   - payment link
2. O mesmo endpoint cobre todos os cenários ou existem variações por produto?
3. `GET /payments/v1/situation/{id}` aceita quais identificadores exatamente?
4. O `id` deve ser:
   - id do payment
   - id do link
   - provider reference interno
   - external reference
5. Qual é o contrato oficial de status retornado nesse endpoint?
6. Quais campos de valor são definitivos:
   - `value`
   - `amount`
   - outro campo

## Cartão

1. `POST /payments/v1/creditcard/generate/token` é o endpoint oficial definitivo?
2. Há exigência de antifraude, 3DS ou device fingerprint?
3. Quais erros específicos de cartão precisam ser tratados?
4. Existe tokenização distinta para assinatura e cobrança avulsa?

## Webhooks

1. Qual é o catálogo oficial de eventos da MyGateway?
2. Quais eventos são obrigatórios para:
   - pagamentos
   - assinaturas
   - antecipações
   - payouts
   - chargebacks
3. Qual header oficial de assinatura deve ser usado?
4. O algoritmo oficial é HMAC-SHA256?
5. O identificador único do evento é qual campo?
6. Existe garantia de unicidade global do `provider_event_id`?
7. Qual política de retry da MyGateway para webhooks?
8. Qual timeout esperado para resposta do webhook?
9. A ordem dos eventos é garantida?
10. Há replay oficial de eventos antigos?

## Idempotência

1. A MyGateway suporta idempotência para criação de pagamentos?
2. A MyGateway suporta idempotência para criação de assinaturas?
3. A MyGateway suporta idempotência para payouts?
4. A MyGateway suporta idempotência para antecipações?
5. Qual header ou campo oficial deve ser enviado como chave de idempotência?
6. Por quanto tempo a chave é respeitada pelo provider?

## Rate limits e timeouts

1. Quais são os rate limits por endpoint?
2. O limite é por conta, por API key ou por IP?
3. O provider retorna headers de limite e consumo?
4. O comportamento em `429` inclui `Retry-After`?
5. Qual timeout recomendado por endpoint?
6. Existe política oficial de retry para integrações server-to-server?

## Erros

1. Qual é a tabela oficial de códigos de erro da MyGateway?
2. Existe contrato fixo para payloads de erro?
3. Quais erros são transitórios e podem ser repetidos?
4. Quais erros devem ser tratados como definitivos?
5. Existem códigos específicos para:
   - credencial inválida
   - receiver inválido
   - KYC pendente
   - saldo insuficiente
   - split inválido
   - cartão recusado

## Recebedores e KYC

1. Existe endpoint oficial para criação de recebedor/recipient?
2. Existe endpoint oficial para consulta do recebedor?
3. Existe endpoint oficial para submit KYC?
4. Quais campos são obrigatórios para PF?
5. Quais campos são obrigatórios para PJ?
6. Quais documentos são obrigatórios por tipo?
7. Como é feito upload documental:
   - multipart
   - URL pré-assinada
   - base64
8. Quais são os status oficiais de KYC?
9. Existe webhook para mudança de status de KYC?

## Split

1. Qual é o contrato oficial de split da MyGateway?
2. O split é enviado no payment, no payment link ou nos dois?
3. O provider aceita split por percentual, valor fixo ou ambos?
4. Existe exigência de recebedor previamente cadastrado?
5. Existe bloqueio para split com recebedor sem KYC aprovado?

## Assinaturas

1. Além de `create` e `cancel`, existem endpoints oficiais de:
   - pause
   - resume
   - update payment method
   - retry charge
2. Quais eventos de assinatura são disparados oficialmente?
3. Existe diferença entre status da assinatura e status da cobrança recorrente?

## Repasses / payouts

1. Qual é o endpoint oficial de criação de payout?
2. Qual é o endpoint oficial de consulta de payout?
3. Qual é o endpoint oficial de listagem de payouts?
4. Quais status oficiais de payout existem?
5. Existe webhook específico de payout?
6. Há regras de janela, corte ou saldo mínimo para payout?

## Antecipação

1. Quais são os endpoints oficiais de:
   - solicitar
   - consultar
   - cancelar
   - listar antecipações
2. Quais status oficiais de antecipação existem?
3. Existe webhook específico de antecipação?
4. Como o provider representa valor líquido, taxa e prazo?

## Conciliação e ledger

1. A MyGateway oferece endpoints de listagem consolidados para conciliação?
2. Existe endpoint de relatório diário ou extrato?
3. Existe endpoint equivalente a ledger/balance?
4. Existe identificador estável para reconciliar:
   - payment
   - payout
   - anticipation
   - subscription charge

## Pix Automático

1. A MyGateway suporta Pix Automático oficialmente?
2. Quais endpoints existem para:
   - autorização
   - cobrança
   - cancelamento
   - consulta
3. Quais webhooks existem para Pix Automático?
4. Quais status e payloads oficiais devem ser tratados?

## Materiais que precisamos solicitar

- OpenAPI/Swagger ou documentação oficial equivalente
- coleção Postman ou Insomnia
- credenciais de sandbox
- exemplos reais de payload de sucesso e erro
- exemplos reais de webhook por evento
- tabela oficial de códigos de erro
- documentação de rate limit
- documentação de idempotência
- documentação de ambientes e homologação
