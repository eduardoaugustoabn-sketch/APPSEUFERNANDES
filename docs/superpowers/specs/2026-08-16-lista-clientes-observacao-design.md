# Lista de clientes cadastrados + campo de observação — Design Spec

## Contexto e objetivo

A ficha do cliente (`/admin/clientes/[id]` e `/painel/clientes/[id]`, ambas já implementadas via o componente `FichaCliente`, que mostra histórico completo, "mais usados por ele" e prospecção) hoje não é alcançável clicando em lugar nenhum da UI — não existe uma tela de lista de clientes cadastrados. Além disso, `clientes` só tem policy de **leitura** no RLS: nenhum campo pode ser editado depois de criado, incluindo `bairro`/`cidade` (adicionados numa spec anterior desta rodada, que explicitamente adiou a edição "pra quando construirmos a tela de clientes cadastrados").

Este spec resolve os dois: cria a lista (que também serve de "aba de clientes cadastrados" pedida originalmente) e adiciona edição de bairro/cidade/observação — sendo `observacao` um campo novo, texto livre.

Este é o terceiro dos três pedidos relacionados a clientes desta rodada — os outros dois (bairro/cidade no cadastro; busca por telefone parcial) já foram implementados e mesclados. Um quarto pedaço, categoria de origem no agendamento, é uma spec separada, ainda por vir.

## Modelo de dados

```sql
alter table clientes add column observacao text;

create policy "membros atualizam clientes da barbearia" on clientes for update
  using (barbearia_id = auth_barbearia_id())
  with check (barbearia_id = auth_barbearia_id());
```

Mesmo escopo da policy de leitura já existente (`"membros leem clientes da barbearia"`) — qualquer membro ativo (admin ou barbeiro) da barbearia pode editar qualquer cliente dela, sem distinção de papel. Não há policy column-level restringindo quais campos podem ser alterados — a proteção contra editar `nome`/`telefone` por acidente (que passam por normalização/deduplicação em `criar_ou_obter_cliente`, com `unique (barbearia_id, telefone)`) vem inteiramente da UI: o formulário de edição só envia `bairro`/`cidade`/`observacao` no payload do `update`, nunca `nome`/`telefone` — mesmo padrão já usado em `BarbeiroRow.salvar()` (que só envia `nome`/`telefone`, nunca os outros campos de `membros`).

## Lista de clientes

Duas páginas novas, uma por lado: `src/app/admin/clientes/page.tsx` e `src/app/painel/clientes/page.tsx` (ambas ao lado do `[id]/page.tsx` já existente). Cada uma ganha um item "Clientes" no `NAV_ITEMS` do respectivo layout.

Cada página busca todos os clientes da barbearia (`id`, `nome`, `telefone`, `cidade`), ordenados por nome. Uma caixa de busca no topo filtra a lista já carregada no navegador — sem round-trip novo ao banco — por nome ou telefone contendo o texto digitado (mesma ideia de "não precisa digitar tudo" da spec de busca parcial, mas aqui é filtro client-side sobre uma lista já em mãos, não uma nova função RPC). Cada linha é um link pra `/admin/clientes/[id]` ou `/painel/clientes/[id]`.

## Edição na ficha do cliente

Um componente cliente novo, `EditarClienteForm`, renderizado no topo de `FichaCliente` (antes da linha de cabeçalho nome/telefone/etc., que continua somente-leitura). Segue o padrão já estabelecido em `BarbeiroRow`: um botão "Editar" que troca bairro/cidade/observação (observação como `<textarea>`, os outros dois como `<Input>`) para campos editáveis, com "Salvar"/"Cancelar". Salvar faz um `update` direto via `getBrowserSupabaseClient()` (RLS protege), enviando só esses três campos, e recarrega a página (`router.refresh()`).

## Testes

Sem lógica de cálculo nova. A policy de update é nova e merece cobertura pgTAP: um teste confirmando que um membro autenticado da Barbearia A não consegue atualizar um cliente da Barbearia B (mesmo sabendo o `id`), e que um membro da própria barbearia consegue. Cobertura via `npx supabase test db` + `npm run build` + passada manual (abrir a lista, buscar por nome parcial e por telefone parcial, confirmar que filtra certo; abrir a ficha de um cliente, editar bairro/cidade/observação, salvar, confirmar que persiste; confirmar que nome/telefone continuam intocáveis nessa tela).

## Fora de escopo (explicitamente adiado)

- Editar nome/telefone de um cliente existente — operação mais arriscada (mexe na chave única de deduplicação), fica pra uma spec própria se for pedida.
- Paginação da lista — client-side simples é suficiente na escala de uma barbearia; revisitar se a base crescer muito.
- Excluir um cliente.
- Categoria de origem no agendamento — spec separada, ainda por vir.
