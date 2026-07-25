# HOMOLOGAÇÃO FINAL — Connekt Pay

Data: 2026-06-27

## 1. Performance

- Dashboard: gráfico passou a carregar sob demanda (lazy-load), reduzindo custo no carregamento inicial e melhorando a sensação de velocidade.
- Loadings: mantidos skeletons/estados de carregamento nas principais tabelas e KPIs para evitar “telas vazias” enquanto as APIs respondem.

## 2. Assinaturas

- “Criar plano”: fluxo corrigido para não parecer “quebrado” quando o usuário não tem permissão (Owner/Admin/Super Admin). Para perfis sem permissão, o botão fica desabilitado e exibe aviso.
- Planos: quando não há recebedor com KYC aprovado, o botão “Criar plano” fica desabilitado e a tela informa o requisito com atalho para Recebedores.

## 3. Links de Pagamento (Cartão)

- Checkout (Cartão): ao selecionar Cartão, exibe:
  - opções de parcelamento;
  - taxa estimada;
  - total estimado;
  - valor por parcela.
- Criação do Link (Cartão): mantém simulação de parcelamento com taxa por parcela e total.
- Transparência: mensagens deixam explícito que taxas/valores finais podem variar e que, enquanto a integração com o provedor financeiro (MyGateway) não estiver ativa, os valores exibidos são simulações.

## 4. Recorrência

- Criação de Link Recorrente: opção “Recorrente” desabilitada e bloqueada antes da criação, com mensagem explicando que está “em breve”.
- Resultado: o usuário não consegue mais configurar recorrência para depois receber uma recusa no final do fluxo.

## 5. Recebedores (bug de digitação)

- Máscaras e cursor: campos com máscara (CPF/CNPJ, telefone) e campos numéricos (CEP e dados bancários) passaram a preservar o cursor durante a digitação.
- Digitação contínua: correção aplicada para evitar “briga” entre máscara, cursor e estado controlado.

## 6. Cadastro de Recebedores (validações)

- CPF/CNPJ: validação completa usando o algoritmo de dígitos verificadores.
- Tipo PF/PJ: ajustado automaticamente conforme CPF/CNPJ quando detectável, e bloqueia inconsistências na hora de salvar.
- Nome: validação mínima para evitar envio vazio/inválido.
- Conta: validações aplicadas (banco/agência/conta/dígito) e normalização para dígitos.
- E-mail/Telefone: validações básicas quando preenchidos.

## 7. Antecipação

- Tela: fluxo visual completo (não fica “vazio”).
- Botão “Solicitar antecipação”: abre modal de solicitação com simulação de taxa e valor líquido.
- Confirmação: após confirmar, exibe modal de resultado.
- Sem MyGateway: quando o provedor não está configurado, o fluxo continua como simulação e registra um item visual no histórico com status “Em breve” apenas para a confirmação financeira real.

## 8. Revisão final (técnica)

- Lint: executado com sucesso (`npm run lint`).
- Build: executado com sucesso (`npm run build`).

## Checklist de re-homologação (manual)

- Dashboard: abrir e validar carregamento rápido do gráfico + skeleton durante load.
- Assinaturas:
  - Owner/Admin: navegar em Assinaturas → Criar plano → criar plano → listar planos.
  - Sem recebedor KYC aprovado: validar mensagem/CTA e bloqueio do “Criar plano”.
- Links de Pagamento:
  - Criar link com Cartão habilitado e parcelamento > 1.
  - Abrir checkout do link → selecionar Cartão → validar parcelas, taxa estimada, total estimado.
- Recorrência: validar que a opção fica desabilitada e informada antes de qualquer criação.
- Recebedores:
  - Abrir modal de edição → digitar CPF/CNPJ e telefone (inclusive editando no meio do texto) sem perder cursor.
  - Digitar dados bancários continuamente sem travamentos.
- Antecipação:
  - Abrir modal → simular → confirmar → validar modal de resultado.
  - Se MyGateway não estiver configurada: validar que aparece como simulação e “Em breve” apenas na confirmação financeira.

