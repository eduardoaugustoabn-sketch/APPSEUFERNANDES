# Metas de faturamento (mês) e prospecção (dia/semana) — Design

## Contexto

**Esta spec substitui `2026-08-12-metas-diarias-design.md`** — aquela nunca chegou a virar plano/implementação. A ideia original (meta diária de faturamento) mudou: o usuário agora quer uma meta **mensal** de faturamento, e a meta de prospecção deixa de ser só diária para poder ter **diária e semanal ao mesmo tempo**, cada uma com acompanhamento explícito de "quantos feitos, quantos faltam".

Hoje `membros.meta_prospeccao_dia` já existe e alimenta uma barra em `/painel/prospeccao`, mas sem texto explícito de "faltam N". Não existe nenhuma meta de faturamento em lugar nenhum do sistema.

## Decisões de escopo (confirmadas com o usuário)

- **Meta de faturamento é por barbeiro** (não uma meta única da barbearia), definida pelo admin — mesmo padrão de `meta_prospeccao_dia` hoje.
- **Meta de faturamento é mensal**, não diária.
- **Meta de prospecção ganha uma segunda opção, semanal, coexistindo com a diária** — um barbeiro pode ter as duas definidas ao mesmo tempo, cada uma com sua própria barra.
- **Semana = segunda a domingo** (semana ISO), consistente com o resto do sistema não ter seletor de período customizado em lugar nenhum.
- **Faturamento do mês conta serviços + produtos vendidos** — mesma composição que "Faturamento do mês" já usa em `/painel` hoje (decisão já tomada na spec anterior, mantida).
- **Todo lugar que mostra progresso de meta passa a ter texto explícito "X de Y — faltam Z"**, não só a barra visual — inclusive a meta diária de prospecção já existente, que hoje só mostra a barra sem esse texto.

## Banco de dados

Nova migration (próximo número disponível em `supabase/migrations/`, verificar antes de escrever — o último hoje é `0018`):

```sql
alter table membros
  add column meta_faturamento_mes numeric(10,2) check (meta_faturamento_mes >= 0);
alter table membros
  add column meta_prospeccao_semana int check (meta_prospeccao_semana >= 0);
```

Mesmo padrão de `meta_prospeccao_dia` (migration `0003_planos_carreira.sql`): nullable — sem meta definida, sem barra/texto exibido. `numeric(10,2)` para dinheiro (mesma convenção de `preco`/`comissao_valor` no resto do schema), `int` para contagem de contatos (mesmo tipo de `meta_prospeccao_dia`).

## `/admin/barbeiros` — formulário de metas

O `<form>` existente dentro de `BarbeiroRow` (ação `vincularPlano`) ganha dois novos `<input type="number">`, ao lado dos já existentes (plano de carreira, meta de prospecção diária): meta de faturamento do mês (R$) e meta de prospecção semanal. Placeholders claros: "Meta faturamento/mês (R$)" e "Meta prospecção/semana". A Server Action `vincularPlano` passa a salvar os dois campos novos junto dos que já salva.

## `/painel` — progresso da meta de faturamento

O card "Faturamento do mês" (um dos 3 cartões de KPI no topo) ganha, quando `meta_faturamento_mes` estiver definida: uma barra fina de progresso abaixo do valor, e o texto "R$ {total} de R$ {meta} — faltam R$ {diferença}" (ou "Meta batida!" quando o total já alcançou ou passou a meta, sem mostrar valor negativo de "faltam"). Sem meta definida, o cartão continua exatamente como está hoje.

## `/painel/prospeccao` — progresso diário e semanal

A barra "Meta diária de contatos" que já existe ganha o texto explícito "{hoje} de {meta} — faltam {diferença}" (hoje só mostra a contagem dentro da barra, sem essa frase). Abaixo dela, quando `meta_prospeccao_semana` estiver definida, uma segunda barra igual, "Meta semanal de contatos", contando contatos prospectados desde a segunda-feira da semana corrente até hoje, com o mesmo texto "X de Y — faltam Z". Mesma regra de "meta batida" do faturamento quando o valor alcançar ou passar a meta.

## Fora de escopo

- Meta de faturamento por semana ou por dia — só mensal, como pedido.
- Meta de prospecção mensal — só diária e semanal, como pedido.
- Metas no `/admin` (visão agregada de todos os barbeiros) — essas metas são individuais, acompanhadas no painel de cada barbeiro; o admin só as *define*, não vê um resumo comparativo nesta rodada.

## Testes

Sem lógica de cálculo isolada nova equivalente a `calcularOciosidade` — é subtração simples (meta − realizado) e uma consulta a mais (contatos da semana corrente, mesmo padrão de `gte('data', ...)` já usado para "do mês", só que com a segunda-feira como início). Verificação via `npm run build` + passada manual (definir as 3 metas num barbeiro, confirmar que os textos "X de Y — faltam Z" aparecem certos em `/painel` e `/painel/prospeccao`, incluir o caso de meta já batida).
