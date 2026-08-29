# Filtro de período nos relatórios (Visão geral + Ranking) — Design Spec

## Contexto

Pedido original do usuário: "Adicionar filtro em todas as áreas do sistema para facilitar visualização e relatórios". Dado o tamanho do pedido, foi decomposto em 4 entregas independentes, nesta ordem acordada com o usuário:

1. **Filtro de período nos relatórios (Visão geral + Ranking, admin)** — esta spec.
2. Filtro de status/categoria em Clientes.
3. Filtro de canal/status em Prospecção.
4. Filtro de produto/período/barbeiro em Loja.

O dashboard próprio do barbeiro (`/painel`) tem a mesma limitação (só "mês atual" fixo), mas foi deliberadamente excluído desta entrega — é uma página muito mais densa (quase 20 métricas amarradas ao período, várias RPCs), e o usuário concordou em tratá-la como uma entrega futura separada, se necessário.

## Problema

`/admin` (Visão geral) e `/admin/ranking` calculam todas as suas métricas com `inicioMes = new Date(ano, mes, 1)` fixo no código — sempre "desde o início do mês atual até agora", sem limite superior e sem nenhuma forma de ver dados de um mês anterior ou de um intervalo customizado. Não existe nenhum controle de UI pra isso hoje.

## Arquitetura

### 1. Helper de resolução de período — `src/lib/periodo.ts`

```ts
export type PeriodoPreset = 'este_mes' | 'mes_passado' | 'personalizado'

export type Periodo = {
  preset: PeriodoPreset
  inicio: string // YYYY-MM-DD, inclusive
  fim: string // YYYY-MM-DD, inclusive
  label: string // ex: "Agosto de 2026", "Julho de 2026", "01/07/2026 a 15/07/2026"
}

export function resolverPeriodo(searchParams: { [key: string]: string | string[] | undefined }): Periodo
```

Regras de `resolverPeriodo`:
- `searchParams.periodo` ausente ou inválido → trata como `'este_mes'`.
- `'este_mes'` → `inicio` = primeiro dia do mês corrente, `fim` = hoje (YYYY-MM-DD). `label` = mês/ano por extenso capitalizado (ex: "Agosto de 2026"), reaproveitando o padrão de capitalização já usado em `painel/page.tsx` (`charAt(0).toUpperCase() + resto`).
- `'mes_passado'` → `inicio` = primeiro dia do mês anterior ao corrente, `fim` = último dia do mês anterior. `label` = mês/ano por extenso do mês anterior.
- `'personalizado'` → lê `searchParams.inicio` e `searchParams.fim` (strings YYYY-MM-DD). Se ausentes ou `inicio > fim`, faz fallback silencioso pro comportamento de `'este_mes'` (nunca lança erro — é uma tela de leitura, não uma mutação). `label` = `"${inicio_br} a ${fim_br}"` com datas formatadas `dd/mm/aaaa`.
- Todas as datas são strings `YYYY-MM-DD` (mesmo formato que os campos `data` do Postgres e que o resto do código já usa via `.toISOString().slice(0, 10)`), nunca objetos `Date` cruzando a fronteira pro componente cliente.

### 2. Componente de filtro — `src/components/periodo-filtro.tsx`

Client Component. Recebe o período atual (via `searchParams` já resolvidos pelo Server Component pai, repassados como props simples) e re-navega a própria página com os query params atualizados ao mudar a seleção — sem estado de carregamento próprio, o Server Component pai re-executa a query ao re-renderizar com a nova URL (mesmo padrão de navegação usado pelas outras telas do app, ex. `router.push` em `barbeiro-row.tsx`).

```tsx
'use client'

export function PeriodoFiltro({ preset, inicio, fim }: { preset: PeriodoPreset; inicio: string; fim: string }) {
  // usePathname() + useRouter() do next/navigation
  // <select> com as 3 opções (este_mes / mes_passado / personalizado)
  // ao mudar pra "personalizado", revela dois <Input type="date">
  //   (início e fim), com um botão "Aplicar" (não dispara navegação a
  //   cada keystroke — só quando o usuário confirma, evitando um
  //   fetch por dígito digitado)
  // troca de preset para este_mes/mes_passado navega imediatamente
  //   (router.push com os query params corretos), sem precisar de botão
}
```

Comportamento de navegação: monta a URL como `${pathname}?periodo=${preset}` (e `&inicio=...&fim=...` quando personalizado) e chama `router.push(url)`. Isso preserva o padrão de Server Component puro nas duas páginas — nenhuma delas precisa virar Client Component nem duplicar fetch de dados no navegador.

### 3. Aplicação nas páginas

**`src/app/admin/page.tsx`** (Visão geral):
- Assinatura passa a receber `searchParams: Promise<{ [key: string]: string | string[] | undefined }>` (padrão Next.js 15+/16 confirmado em `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md` — prop é uma Promise, precisa de `await`).
- `const { inicio, fim, label, preset } = resolverPeriodo(await searchParams)`.
- Toda ocorrência de `inicioMes` nas queries (`atendimentos`, `vendas`, `agendamentosMes`, `prospeccoesMes`) passa a usar `.gte('data', inicio).lte('data', fim)` — hoje só há `.gte`, sem limite superior; isso precisa ser adicionado, senão "mês passado" incluiria indevidamente tudo até hoje.
- A chamada `ociosidade` RPC já aceita `p_data_inicio`/`p_data_fim` — troca `inicioMes`/`hoje` por `inicio`/`fim`.
- Título passa de `"Visão geral"` pra `"Visão geral — ${label}"`, com `<PeriodoFiltro preset={preset} inicio={inicio} fim={fim} />` logo abaixo do `<h1>`.

**`src/app/admin/ranking/page.tsx`**:
- Mesmo padrão: recebe `searchParams`, resolve período, troca `inicioMes` fixo por `inicio`/`fim` nas duas queries (`atendimentos`, `vendas`) com `.gte()` e `.lte()`.
- A query de `clientes_com_status` (ranking de clientes ativos) **não muda** — status de retorno (verde/amarelo/vermelho) é inerentemente "estado atual do cliente", não faz sentido histórico por período; fica de fora do filtro, mostrando sempre o estado atual independente do período selecionado. Isso é uma decisão deliberada, documentada aqui pra não ser retrabalhada achando que é uma omissão.
- Título passa de `"Ranking (mês)"` pra `"Ranking — ${label}"`.

## Testes

Sem lógica de banco nova (nenhuma migration, nenhuma RPC nova) — toda a lógica fica em `src/lib/periodo.ts`, testável como função pura. Cobertura via `vitest` em `tests/unit/periodo.test.ts`, seguindo o padrão já usado por `tests/unit/ociosidade.test.ts` e `tests/unit/diagnostico.test.ts`:
- `este_mes` sem searchParams → inicio/fim/label corretos pro mês corrente.
- `mes_passado` → inicio/fim corretos cruzando virada de ano (dezembro → janeiro do ano anterior) e mudança de dias no mês (ex: mês de 31 dias seguido de mês de 30).
- `personalizado` com `inicio`/`fim` válidos → usa os valores literais.
- `personalizado` com `inicio > fim` → fallback pra `este_mes`.
- `personalizado` sem `inicio`/`fim` → fallback pra `este_mes`.
- `periodo` com valor desconhecido/inválido → fallback pra `este_mes`.

Verificação manual em navegador (Playwright) nas duas páginas: trocar os 3 presets e confirmar que os números mudam coerentemente entre "este mês" e "mês passado" (dados de teste precisam ter pelo menos um atendimento em cada um dos dois meses pra essa verificação ser significativa).

## Fora de escopo (documentado para não ser retrabalhado)

- Dashboard do próprio barbeiro (`/painel`) — ver Contexto acima.
- Filtro de período no ranking de clientes ativos (verde/amarelo/vermelho) — ver nota na seção Ranking acima.
- Qualquer alteração de RLS ou schema de banco — não há necessidade, todas as tabelas já são filtráveis por `data` como estão.
