# Diagnóstico e Alertas por Categoria — Design Spec

## Contexto e objetivo

Este é a Fase 3a de "Sistema de Gestão — Categorias de Atendimento e Indicadores de Performance". As Fases 1 e 2 (já em produção) entregaram todos os indicadores numéricos: distribuição por categoria e Índice de Público-Alvo (mensal), recorrência e conversão (histórico completo). Esta fase não adiciona nenhum indicador novo — ela **interpreta** os indicadores que já existem e mostra um diagnóstico em texto, no `/painel` do barbeiro, respondendo à pergunta central do pedido original: "o barbeiro está ocupado, mas está ocupado atendendo o cliente certo?".

A Fase 3b (painel comparativo entre barbeiros para o admin) fica para depois, como decisão explícita de fatiamento validada com o usuário — ela reaproveita as mesmas peças desta fase e da Fase 2, mas é uma tela nova, sem sobreposição de trabalho com esta.

## Decisões de escopo (validadas com o usuário)

- **Um diagnóstico único por prioridade**, não uma lista de alertas empilhados. As condições são checadas em ordem fixa; a primeira que bater é a única mostrada.
- **Limites fixos no código**, sem tela de configuração — o pedido original não define números exatos, e não foi pedida uma forma de ajustá-los por barbearia.
- **"Ticket baixo" é relativo à própria barbearia** (compara com a média de todos os barbeiros no mês), não um valor absoluto fixo nem uma meta cadastrada — não existe (nem foi pedido) um campo de meta de ticket médio.

## Modelo de dados e nova função SQL

Nenhuma tabela ou coluna nova. Uma função SQL pequena, `media_ticket_barbearia()`, que calcula o ticket médio de toda a barbearia no mês corrente — necessária porque um barbeiro comum não pode ler `atendimentos`/`vendas_produtos` de outros barbeiros por RLS (`"barbeiro le proprios atendimentos"` é escopada a `membro_id = auth_membro_id()`), então uma agregação cross-barbeiro exige `security definer`. A função só devolve um número agregado — não expõe nenhum dado individual de outro barbeiro ou cliente — usando o helper `auth_barbearia_id()` já existente no projeto, sem parâmetro (resolve a barbearia do chamador internamente, mesmo padrão de `auth_barbearia_id()`/`auth_papel()`/`auth_membro_id()`).

```sql
create or replace function public.media_ticket_barbearia()
returns numeric
language sql stable security definer set search_path = public as $$
  with faturamento as (
    select
      coalesce((select sum(a.preco) from atendimentos a
        where a.barbearia_id = auth_barbearia_id() and a.data >= date_trunc('month', current_date)::date), 0)
      + coalesce((select sum(vp.preco_unitario * vp.quantidade) from vendas_produtos vp
        where vp.barbearia_id = auth_barbearia_id() and vp.data >= date_trunc('month', current_date)::date), 0)
      as total
  ),
  realizados as (
    select count(*) as total
    from agendamentos ag
    where ag.barbearia_id = auth_barbearia_id()
      and ag.status = 'realizado'
      and ag.data >= date_trunc('month', current_date)::date
  )
  select round(f.total / nullif(r.total, 0), 2)
  from faturamento f, realizados r;
$$;

grant execute on function public.media_ticket_barbearia() to authenticated;
```

"Ticket" aqui é faturamento total (serviços + produtos) dividido por visitas `realizado` no mês — a mesma definição usada para o ticket médio do próprio barbeiro (ver seção seguinte), para a comparação fazer sentido. Retorna `null` quando a barbearia inteira não teve nenhuma visita `realizado` no mês (divisão por zero via `nullif`).

## Lógica do diagnóstico (função pura)

Nova função `calcularDiagnostico` em `src/lib/diagnostico.ts`, no mesmo padrão de `calcularOciosidade`/`calcularDistribuicaoCategorias` — lógica isolada e testável:

```ts
export type TipoDiagnostico = 'ocupacao_alta_alvo_baixo' | 'ticket_baixo_so_cabelo' | 'ticket_baixo_so_barba' | 'positivo' | 'neutro'

export type Diagnostico = {
  tipo: TipoDiagnostico
  mensagem: string
}

export function calcularDiagnostico(input: {
  percentualOcupacao: number
  indicePublicoAlvo: number
  ticketMedio: number
  mediaTicketBarbearia: number | null
  percentualSoCabelo: number
  percentualSoBarba: number
}): Diagnostico
```

As cinco condições, checadas nessa ordem — a primeira que bater vence:

| # | Condição | Tipo |
|---|---|---|
| 1 | `percentualOcupacao >= 80 && indicePublicoAlvo < 40` | `ocupacao_alta_alvo_baixo` |
| 2 | ticket abaixo da média da barbearia **e** `percentualSoCabelo >= 50` | `ticket_baixo_so_cabelo` |
| 3 | ticket abaixo da média da barbearia **e** `percentualSoBarba >= 50` | `ticket_baixo_so_barba` |
| 4 | `percentualOcupacao >= 80 && indicePublicoAlvo >= 60` | `positivo` |
| — | nenhuma das anteriores | `neutro` |

"Ticket abaixo da média da barbearia" = `mediaTicketBarbearia !== null && ticketMedio < mediaTicketBarbearia`. Quando `mediaTicketBarbearia` é `null` (barbearia sem nenhuma visita `realizado` no mês ainda), essa condição nunca é verdadeira — as condições 2 e 3 ficam inalcançáveis nesse caso, o que é o comportamento correto (não dá pra dizer que alguém está "abaixo da média" quando não existe média).

Mensagens (adaptadas do pedido original — "abaixo da meta" virou "abaixo da média da barbearia", já que não existe meta de ticket cadastrada nesse projeto):

- **`ocupacao_alta_alvo_baixo`:** "Sua agenda apresenta alta ocupação, porém a participação de clientes Cabelo + Barba está abaixo do esperado. Avalie estratégias para converter clientes de Só Cabelo e Só Barba para o serviço completo."
- **`ticket_baixo_so_cabelo`:** "Seu ticket médio está abaixo da média da barbearia. Uma das oportunidades identificadas é aumentar a conversão de clientes Só Cabelo para Cabelo + Barba."
- **`ticket_baixo_so_barba`:** "Seu ticket médio está abaixo da média da barbearia e existe alta concentração de clientes que realizam apenas barba. Trabalhe oportunidades de conversão para Cabelo + Barba."
- **`positivo`:** "Excelente desempenho. Sua ocupação está acompanhada de uma boa concentração no público-alvo e isso está contribuindo para seu ticket e faturamento."
- **`neutro`:** "Nenhum ponto de atenção identificado no momento. Continue acompanhando seus indicadores ao longo do mês."

## Captura na UI (painel do barbeiro)

`src/app/painel/page.tsx`:

- Novo cálculo: `ticketMedio = realizados > 0 ? totalGanhos / realizados : 0` (`totalGanhos` e `realizados` já existem na página).
- Nova chamada: `supabase.rpc('media_ticket_barbearia')` — diferente das RPCs já usadas nesta página (`ociosidade`, `indicadores_recorrencia_conversao`), essa não usa `returns table(...)`, então `data` já vem como o escalar direto (`string | null`, mesma razão de sempre — `numeric` chega como string via PostgREST), sem precisar de `.single()`.
- Chama `calcularDiagnostico(...)` com os valores já computados na página (`ociosidade.percentualOcupacao`, `distribuicaoCategorias.indicePublicoAlvo`, `percentualSoCabelo`, `percentualSoBarba`, mais os dois novos).
- Novo Card **"Diagnóstico"**, no topo da página, antes do card de "Faturamento do mês" — é o primeiro card que um barbeiro vê ao abrir o painel. Estilo com cor de destaque conforme o tipo (um padrão visual novo nesta página, não existia antes): borda/fundo verde suave para `positivo`, âmbar suave para os três tipos de alerta, neutro (sem cor extra) para `neutro`.

```tsx
<Card className={`mb-5 border-2 ${
  diagnostico.tipo === 'positivo' ? 'border-emerald-500/40 bg-emerald-500/5' :
  diagnostico.tipo === 'neutro' ? '' :
  'border-amber-500/40 bg-amber-500/5'
}`}>
  <CardContent className="p-6">
    <p className="font-heading text-base font-bold mb-2">Diagnóstico</p>
    <p className="text-sm text-foreground/90">{diagnostico.mensagem}</p>
  </CardContent>
</Card>
```

## Casos de borda

- Barbearia sem nenhuma visita `realizado` no mês (barbearia nova, ou início do mês) → `media_ticket_barbearia()` retorna `null` → condições de ticket baixo nunca disparam → diagnóstico cai em `ocupacao_alta_alvo_baixo`, `positivo` ou `neutro`, dependendo de ocupação/público-alvo.
- Barbeiro sem nenhuma visita no mês → `percentualOcupacao = 0`, `indicePublicoAlvo = 0` (já garantidos pelas Fases 1/2) → nenhuma das quatro condições de alerta bate (todas exigem `>= 80` ou coisas que dependem de ticket > 0) → cai em `neutro`.
- Empate exato nos limites (ex: ocupação exatamente 80%) → inclusivo (`>=`), conta como tendo batido a condição.

## Testes

- **Unitário (vitest):** `calcularDiagnostico` — um caso por tipo de diagnóstico (5 casos), mais: prioridade correta quando duas condições bateriam ao mesmo tempo (ex: ocupação alta + público-alvo baixo E ticket baixo + muito só-cabelo simultaneamente — deve escolher a primeira da ordem, `ocupacao_alta_alvo_baixo`); `mediaTicketBarbearia: null` nunca aciona as condições de ticket baixo mesmo com `percentualSoCabelo`/`percentualSoBarba` altos.
- **pgTAP:** nenhuma policy de RLS nova — `media_ticket_barbearia()` não expõe nenhuma tabela nova, só agrega dados que a própria função (via `security definer`) já tem permissão de ler. Cobertura: chamando como um barbeiro autenticado, confirma que o valor bate com faturamento/realizados calculados manualmente para uma barbearia com 2+ barbeiros (prova que agrega TODOS os barbeiros, não só o chamador); confirma retorno `null` quando não há nenhum `realizado` no mês.
- **Build:** `npm run build` sem erros de tipo.
- **Manual (se navegador disponível):** como barbeiro com ocupação alta e poucos atendimentos cabelo+barba, confirmar que o card "Diagnóstico" mostra a mensagem de `ocupacao_alta_alvo_baixo`. Registrar atendimentos cabelo+barba suficientes para subir o Índice de Público-Alvo acima de 60% mantendo ocupação alta, confirmar que o diagnóstico muda para a mensagem positiva.

## Fora de escopo (explicitamente adiado)

- Painel comparativo entre todos os barbeiros para o admin (Fase 3b) — tela nova, decisão de fatiamento já validada com o usuário.
- Qualquer forma de configurar os limites (80%, 40%, 60%, 50%) por barbearia — limites fixos no código, conforme decisão de escopo.
- Histórico de diagnósticos anteriores ou notificações — o card sempre mostra o diagnóstico calculado na hora, para o mês corrente; nada é salvo.
