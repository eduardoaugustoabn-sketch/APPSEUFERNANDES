# Metas diárias — prospecção + faturamento — Design

## Contexto

`/admin/barbeiros` já tem um campo "Meta diária" que na verdade é a meta de contatos prospectados por dia (`membros.meta_prospeccao_dia`, usada em `/painel/prospeccao` para uma barra de progresso "Meta diária de contatos"). O rótulo genérico "Meta diária" não deixa claro do que se trata, e o barbeiro só enxerga essa meta na página de Prospecção — não existe nenhuma meta de faturamento diário hoje.

## Decisões de escopo (confirmadas com o usuário)

- **Renomear** o campo existente para deixar explícito que é sobre prospecção.
- **Adicionar uma segunda meta**, de faturamento diário, editável no mesmo lugar (mesma linha do barbeiro em `/admin/barbeiros`, ao lado da meta de prospecção e do plano de carreira).
- A meta de faturamento é exibida no **painel principal do barbeiro** (`/painel`), não na página de Prospecção — cada meta fica perto do assunto a que se refere.
- A meta de faturamento conta **serviços + produtos vendidos** no dia (mesma composição que "Faturamento do mês" já usa hoje em `/painel`), não só serviços.

## Banco de dados

Nova migration `supabase/migrations/0018_meta_faturamento_dia.sql`:

```sql
alter table membros
  add column meta_faturamento_dia numeric(10,2) check (meta_faturamento_dia >= 0);
```

Mesmo padrão de `meta_prospeccao_dia` (migration `0003_planos_carreira.sql`): nullable (sem meta definida = sem barra de progresso exibida), com `check >= 0`. Tipo `numeric(10,2)` por ser dinheiro, seguindo a mesma convenção de `preco`/`preco_venda`/`comissao_valor` no resto do schema.

## `/admin/barbeiros` — formulário de metas

O `<form>` existente (dentro de `BarbeiroRow`, ação `vincularPlano`) ganha um segundo `<input type="number">` para `meta_faturamento_dia`, ao lado do de `meta_prospeccao_dia`. Os dois inputs recebem rótulos visuais claros (hoje não há nenhum, é só placeholder) — "Meta prospecção/dia" e "Meta faturamento/dia (R$)" como `placeholder`, mesmo padrão minimalista do resto do formulário. A Server Action `vincularPlano` passa a salvar os dois campos.

## `/painel` — nova barra de progresso

Mesmo padrão visual e estrutural da barra "Meta diária de contatos" que já existe em `/painel/prospeccao` (`bg-muted rounded h-6`, preenchimento proporcional em `bg-primary`, texto "hoje / meta" centralizado) — só que com valor em R$ ao invés de contagem, e usando `meta_faturamento_dia`. Fica na seção "Ganhos por categoria" do painel (onde o faturamento já é mostrado), abaixo do que já existe, só quando `meta_faturamento_dia` estiver definida (mesma condicional `meta > 0 &&` já usada na versão de prospecção).

Precisa de uma consulta nova: faturamento **de hoje** (não do mês, que é o que a página já calcula) — soma de `atendimentos.preco` + `vendas_produtos.preco_unitario * quantidade` do membro logado, filtrando `data = hoje` em vez de `gte inicioMes`. Mesma composição (serviços + produtos) que "Faturamento do mês" já usa.

## Testes

Sem lógica de cálculo isolada nova (é soma direta, sem função pura equivalente a `calcularOciosidade`) — verificação via `npm run build` + passada manual (definir as duas metas num barbeiro em `/admin/barbeiros`, confirmar que aparecem as duas barras de progresso nos respectivos lugares, com os valores certos).
