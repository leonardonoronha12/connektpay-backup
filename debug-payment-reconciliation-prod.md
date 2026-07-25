[OPEN] payment-reconciliation-prod

## Escopo

- Checkout público de Payment Link em produção retorna `502`
- Conciliação admin em produção retorna `500`

## Sintomas

- `POST /api/payments` falha ao finalizar pagamento de checkout público
- `POST /api/reconciliation` falha no fluxo padrão da UI

## Hipóteses Iniciais

1. O checkout ainda está enviando `split` para a MyGateway em produção.
2. O checkout já não envia `split`, mas outro campo do payload está sendo rejeitado e a mensagem atual está mascarando a causa.
3. As flags de `PAYOUT` e/ou `ANTICIPATION` estão ligadas em produção e fazem a conciliação chamar módulos não homologados.
4. A conciliação já respeita as flags, mas quebra em persistência, auditoria ou criação do run.
5. O deployment publicado ou as variáveis efetivas em produção divergem do esperado.

## Próximos Passos

- Coletar evidência runtime em produção antes de nova alteração lógica
- Confirmar payload efetivo do checkout em produção
- Confirmar escopo efetivo da conciliação em produção
