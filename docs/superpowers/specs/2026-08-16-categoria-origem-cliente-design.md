# Categoria de origem do cliente — Design Spec

## Contexto e objetivo

Este é o quarto e último pedaço do lote de pedidos relacionados a clientes desta rodada — os outros três (bairro/cidade no cadastro; busca por telefone parcial; lista de clientes cadastrados + campo de observação) já foram implementados e mesclados.

O pedido original era "categorias de por onde o cliente veio na hora do agendamento". `agendamentos` já tem uma coluna chamada `origem`, mas ela significa outra coisa (`'publico' | 'interno'` — como o agendamento em si foi criado, não como o cliente conheceu a barbearia). Este spec introduz um conceito novo e sem relação com aquele: uma categoria de aquisição do **cliente**, perguntada no momento em que ele é cadastrado (em qualquer um dos fluxos de agendamento, interno ou público) e editável depois pela tela de clientes já existente.

## Modelo de dados e validação

```sql
alter table clientes add column categoria_origem text
  check (categoria_origem in ('indicacao', 'redes_sociais', 'google_internet', 'passou_na_rua', 'outro'));
```

Nullable no banco — clientes já cadastrados ficam com `null`, e a obrigatoriedade "no cadastro novo" não pode ser um `not null` (quebraria todo o histórico). A obrigatoriedade é aplicada de forma procedural dentro de `criar_ou_obter_cliente`.

`criar_ou_obter_cliente` ganha um parâmetro `p_categoria_origem text default null`, seguindo exatamente o padrão já usado por `p_bairro`/`p_cidade` (mesmo `insert ... on conflict (barbearia_id, telefone) do update ... coalesce(...)` — nunca sobrescreve uma categoria já existente, só faz backfill se estava nula). A função detecta se acabou de inserir um cliente genuinely novo usando o truque padrão `(xmax = 0)` no `returning`; se for um insert novo e `p_categoria_origem` for nulo, levanta uma exceção. Um conflito (cliente já existe) nunca dispara essa exceção, independente do que o formulário mandou.

`criar_agendamento_publico` ganha o mesmo parâmetro novo, repassado para `criar_ou_obter_cliente`.

## Captura na UI

`ClienteAutocomplete` (componente compartilhado por `AgendarSlotForm`, `AtenderAgoraForm` e `LancamentoForm` — cobre todo caminho interno de criação de cliente num só lugar) ganha um `<select>` "Como conheceu a barbearia?" ao lado dos campos de bairro/cidade já existentes, mais um booleano `reconhecido` que vira `true` quando uma sugestão é selecionada na busca por telefone (`selecionar()`) e volta a `false` se o usuário editar nome/telefone depois. Cada um dos três formulários ganha uma checagem client-side, no mesmo padrão da checagem "Preencha o cliente" já existente:

```tsx
if (!cliente.reconhecido && !cliente.categoriaOrigem) {
  setMensagem('Escolha como o cliente conheceu a barbearia.')
  return
}
```

Essa checagem é só uma cortesia — a função do banco é o backstop real, então um `reconhecido` errado nunca bloqueia por engano um cliente genuinamente existente (o caminho de conflito não precisa da categoria) nem deixa passar por engano um cliente genuinamente novo (a exceção do banco ainda dispara).

`PublicBookingFlow` não usa `ClienteAutocomplete` (tem seus próprios inputs inline), então recebe o mesmo tratamento de forma independente: um `<select>` de categoria ao lado de bairro/cidade, obrigatório só quando o `reconhecimento` (via `reconhecer_cliente` no blur do telefone) estiver vazio.

## Edição posterior

`EditarClienteForm` ganha um quarto campo, `categoria_origem`, ao lado de bairro/cidade/observação, com as mesmas cinco opções. A linha de exibição somente-leitura (mostrada antes do botão "Editar") ganha uma linha "Como conheceu:" com o texto da categoria (ou nada, se nula — mesmo padrão de bairro/cidade). O payload do update passa a incluir `categoria_origem`, continuando restrito a esses quatro campos — nunca nome/telefone.

## Testes

Cobertura pgTAP nova em `criar_ou_obter_cliente`: um cliente novo com `p_categoria_origem` preenchido é aceito; um cliente novo sem esse parâmetro é rejeitado (exceção); um cliente já existente (caminho de conflito) nunca é bloqueado por falta de categoria, mesmo essa mesma função exigindo isso para inserts; comportamento de coalesce — uma categoria nula existente recebe backfill numa chamada seguinte, mas uma categoria não-nula existente nunca é sobrescrita. Uma asserção de integração via `criar_agendamento_publico` confirma que o parâmetro novo é repassado corretamente ao caminho público. Nenhuma policy de RLS nova é necessária — `categoria_origem` é só mais uma coluna já coberta pelas policies de SELECT/UPDATE de `clientes` do ciclo anterior.

Sem testes unitários novos no frontend (mesmo precedente de bairro/cidade e observação — nenhuma lógica de função pura aqui). Cobertura via `npm run build` + `npx supabase test db` + passada manual (se navegador disponível): cliente genuinamente novo bloqueado sem categoria; um sucesso escolhendo uma categoria; cliente reconhecido/existente não sendo bloqueado; editar a categoria depois pela ficha.

## Fora de escopo (explicitamente adiado)

- Mostrar ou filtrar por categoria de origem na tela de lista de clientes — não foi pedido nesta rodada.
- Alterar o significado ou os valores da coluna `agendamentos.origem` já existente — são conceitos diferentes, sem relação.
- Tornar a categoria obrigatória também no fluxo de prospecção — esse fluxo não cria clientes novos diretamente (não usa `criar_ou_obter_cliente`), fica fora do alcance desta mudança.
