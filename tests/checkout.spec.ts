import { expect, test } from '@playwright/test'

import { validateCheckoutCustomer } from '@/lib/checkout-validation'

test.describe('Checkout público', () => {
  test('bloqueia submissão quando faltam dados obrigatórios', async () => {
    expect(validateCheckoutCustomer({ name: '', email: '', document: '' })).toEqual({
      ok: false,
      message: 'Informe seu nome para continuar.',
    })
  })

  test('bloqueia e-mail e documento inválidos', async () => {
    expect(validateCheckoutCustomer({ name: 'Cliente', email: 'invalido', document: '123' })).toEqual({
      ok: false,
      message: 'Informe um e-mail válido para continuar.',
    })

    expect(validateCheckoutCustomer({ name: 'Cliente', email: 'cliente@connektpay.com', document: '123' })).toEqual({
      ok: false,
      message: 'Informe um CPF ou CNPJ válido para continuar.',
    })
  })

  test('normaliza dados válidos antes do envio', async () => {
    expect(
      validateCheckoutCustomer({
        name: '  Cliente Final  ',
        email: '  CLIENTE@connektpay.com  ',
        document: '111.444.777-35',
        phone: '(11) 99999-0000',
      }),
    ).toEqual({
      ok: true,
      customer: {
        name: 'Cliente Final',
        email: 'cliente@connektpay.com',
        document: '111.444.777-35',
        phone: '11999990000',
      },
    })
  })

  test('exige telefone quando o método requer dado adicional do provider', async () => {
    expect(
      validateCheckoutCustomer(
        {
          name: 'Cliente Final',
          email: 'cliente@connektpay.com',
          document: '111.444.777-35',
        },
        { requirePhone: true },
      ),
    ).toEqual({
      ok: false,
      message: 'Informe seu telefone para continuar.',
    })
  })
})
