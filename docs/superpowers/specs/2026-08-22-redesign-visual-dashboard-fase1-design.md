# Redesign Visual — Sistema de Design + Sidebar + Dashboard (Fase 1) — Design Spec

## Contexto e objetivo

O usuário criou, no Claude Design, um protótipo hi-fi de repaginação visual completa do
sistema "Seu Fernandes" — 5 telas do barbeiro (Dashboard, Agenda, Prospecção, Clientes,
Sonhos), com nova paleta, tipografia e um shell de navegação em sidebar escura substituindo
a barra horizontal atual. O protótipo (`Layout barbeiro/handoff/Seu Fernandes.dc.html`) usa
dados de exemplo que batem exatamente com os dados reais já testados no sistema — é um
reskin visual fiel, não uma reformulação de funcionalidade.

Escopo total é grande (5 telas do barbeiro + 9 páginas do admin). Esta é a **Fase 1**,
fatiada deliberadamente pequena: entrega o sistema de design (tokens, fontes), o novo shell
de sidebar para `/painel/*`, e o Dashboard redesenhado por completo. As fases seguintes
(Agenda, Prospecção, Clientes, Sonhos, depois todo o `/admin`) reaproveitam essa base e vêm
depois, como decisão explícita de fatiamento validada com o usuário.

## Decisões de escopo (validadas com o usuário)

- **Painel do barbeiro e admin serão redesenhados eventualmente**, mas nesta fase só o
  Dashboard do barbeiro ganha conteúdo novo. As demais páginas (`/painel/agenda`,
  `/painel/prospeccao`, `/painel/clientes(+[id])`, `/painel/sonhos`, e todo `/admin/*`)
  **herdam automaticamente** os novos tokens de cor/fonte (por já usarem o componente `Card`
  e as variáveis CSS compartilhadas), mas seu conteúdo interno não é reescrito agora.
- **Widget "Meta do mês" na sidebar**: incluído nesta fase. Usa
  `membros.meta_faturamento_mes` (já existe) + faturamento do mês já calculado.
- **Resumo de "Sonhos" no Dashboard**: mantido (o protótipo não o mostra, mas é
  funcionalidade existente — decisão explícita de não removê-la), reestilizado com os
  tokens novos.
- **Simplificações deliberadas em relação ao protótipo** (para não introduzir consultas
  novas nesta fase):
  - O card "Faturamento do mês" **não terá o mini-gráfico de barras** (sparkline) do
    protótipo — exigiria uma consulta nova de série temporal (receita por dia/semana), fora
    de escopo aqui. Vira: rótulo + número + chip "+N transações" (contagem de
    atendimentos + vendas do mês, dado que já existe).
  - A barra de progresso da meta que hoje aparece **dentro** do card "Faturamento do mês"
    é **removida** dali — a meta passa a viver só no widget da sidebar, evitando duplicação.
  - Os chips de status dos KPIs "Ocupação" (crítico/moderado/ótimo) e "Índice de
    público-alvo" (texto derivado) são **novos elementos puramente apresentacionais**,
    derivados de dados já buscados na página (sem novas queries) — ver seção de KPIs abaixo.
- **Diagnóstico**: o protótipo mostra só o estado "positivo" (verde, ícone de check) porque
  seu dado de exemplo caiu nesse estado. O sistema real tem 3 tratamentos visuais
  distintos (`positivo` verde / `neutro` sem destaque / os 3 tipos de alerta em âmbar) — essa
  distinção de 3 estados é **preservada**, só usando os tokens de cor novos. Não faz sentido
  aplicar o verde "tudo em ordem" a um estado de alerta.

## Sistema de design — tokens

Atualização de `src/app/globals.css` (`:root`), mantendo a estrutura de variáveis do shadcn
já usada em todo o projeto — só os valores mudam:

| Token | Valor atual | Valor novo |
|---|---|---|
| `--background` | `#f8f9fb` | `#F6F7F4` |
| `--foreground` | `#111827` | `#16201C` |
| `--card` | `#ffffff` | `#ffffff` (sem mudança) |
| `--primary` | `#0ea472` | `#0F9D6E` |
| `--primary-foreground` | `#ffffff` | `#06231A` (texto escuro sobre botão verde, como no protótipo) |
| `--muted` | `#f1f2f4` | `#F0F1EE` |
| `--muted-foreground` | `#6b7280` | `#8A968F` |
| `--border` | `#e5e7eb` | `#E8E9E5` |
| `--input` | `#e5e7eb` | `#E4E6E1` |
| `--ring` | `#0ea472` | `#0F9D6E` |
| `--radius` | `0.625rem` | `0.85rem` (faz `--radius-xl`, usado pelo `Card`, chegar em ~18px) |

Novos tokens (não existem hoje, adicionados a `:root`):

```css
--color-emerald-tint: #EAF6F0;
--color-emerald-tint-border: #CFE8DC;
--color-emerald-dark: #0B7F58;
--color-amber: #E0942F;
--color-amber-text: #B26A00;
--color-amber-tint: #FDF3E3;
--color-indigo: #5B5BD6;
--color-indigo-tint: #EEEEFB;
--color-sidebar-bg: #101A16;
--color-sidebar-fg: #E8EFEA;
--color-sidebar-muted: #7E8C85;
--color-sidebar-icon: #8FE3C2;
```

O componente `Card` (`src/components/ui/card.tsx`) troca `ring-1 ring-foreground/10` por
`border border-border shadow-[0_1px_2px_rgba(20,32,27,0.04)]`, batendo com o protótipo
(borda + sombra sutil, não ring).

## Fontes

`src/app/layout.tsx` troca `Geist`/`Geist_Mono` (de `next/font/google`) por
`Plus_Jakarta_Sans` (weights 400/500/600/700/800, exposta como `--font-geist-sans` — mantém
o nome da variável CSS para não precisar tocar `globals.css` além do necessário) e
`IBM_Plex_Mono` (weights 400/500, como `--font-geist-mono`). `--font-heading` continua
apontando pra `--font-sans` (mesma fonte pro corpo e pros títulos, como no protótipo — sem
serifa). Carregado via `next/font/google` (padrão já usado no projeto), não via tag
`<link>` do Google Fonts como no HTML do protótipo.

## Shell: sidebar

`src/app/painel/layout.tsx` troca a `<nav>` horizontal atual por uma sidebar fixa lateral
(250px, `#101A16`, `position: sticky; top:0; height:100vh`), num novo componente
`src/components/painel/sidebar.tsx`:

- Logo "SF" + nome da barbearia (hoje o layout não busca `barbearias.nome` — passa a
  buscar, já que membro tem `barbearia_id`).
- Os mesmos 5 links de hoje (Dashboard/Agenda/Prospecção/Clientes/Sonhos), reaproveitando a
  lógica de "rota ativa" (mais longo `href` que casa com o pathname) já existente em
  `nav-links.tsx` — client component novo (`'use client'`, usa `usePathname`), já que a
  sidebar precisa saber a rota ativa para o destaque visual.
- Widget "Meta do mês": buscado no layout (que já é `async` e já busca `membro`), usando
  `membro.meta_faturamento_mes` e uma soma leve de faturamento do mês (mesma lógica de
  `totalGanhos` que já existe em `painel/page.tsx` — soma `atendimentos.preco` +
  `vendas_produtos.preco_unitario*quantidade` do mês corrente, filtrado por
  `membro_id`) — replicada no layout porque a sidebar aparece em toda página do painel, não
  só no Dashboard. Se `meta_faturamento_mes` for `null`, o widget não aparece (mesmo
  comportamento condicional que já existe hoje para a barra de meta).
- Rodapé: iniciais do barbeiro + nome + "Barbeiro" + botão "Sair" (reaproveita
  `SignOutButton` já existente, só resestilizado).

## Dashboard (`src/app/painel/page.tsx`)

Todos os *dados* já calculados na página continuam os mesmos — só a apresentação muda.
Mapeamento seção a seção:

| Seção do protótipo | Dado já existente | Mudança |
|---|---|---|
| Header (data + saudação + seletor de mês + botão) | `membro.nome` | Adiciona data mono uppercase; seletor de mês e botão "Novo atendimento" são **decorativos nesta fase** (sem navegação nova — não há outro mês pra selecionar ainda, não há fluxo de "novo atendimento" fora da Agenda) |
| Banner de Diagnóstico | `diagnostico` (calcularDiagnostico) | Reestiliza mantendo os 3 estados (positivo/neutro/alerta) com os tokens novos; ícone de check só no estado positivo |
| KPI Faturamento | `totalGanhos`, `membro.meta_faturamento_mes` | Chip "+N transações" (`atendimentos.length + vendas.length`) no lugar do sparkline; barra de meta **removida** (mudou pra sidebar) |
| KPI Comissão | `comissaoCortes+comissaoExtras+comissaoProdutos`, `totalGanhos` | Chip "N% do total" (comissão/faturamento) + barra de progresso desse percentual |
| KPI Ocupação | `ociosidade.percentualOcupacao`, `ociosidadeRaw.minutos_disponiveis/60`, `ociosidadeRaw.minutos_ocupados/60` | Chip de status por faixa (`>=80` "ótimo" verde, `40–79` "moderado" neutro, `<40` "crítico" âmbar) + legenda "X de Y horários possíveis" |
| KPI Índice de público-alvo | `distribuicaoCategorias.indicePublicoAlvo`, `distribuicaoCategorias.cabeloEBarba` | Chip "sem cabelo+barba" quando 0, senão "N cabelo+barba" |
| Ganhos por categoria | `faturamentoCortes/Extras/Produtos`, `comissaoCortes/Extras/Produtos`, `custoProdutos`, `lucroProdutos`, `detalheCortes/Extras/Produtos` | Mesma estrutura de hoje (barras + chips + detalhamento), só reestilizada — nenhum dado novo |
| Perfil dos clientes | `distribuicaoCategorias.{soCabelo,soBarba,cabeloEBarba,totalClassificado}` | Vira donut (`conic-gradient`) + legenda, no lugar das 3 barras horizontais de hoje; adiciona a nota de oportunidade ("todo cliente atendido é oportunidade...") como texto estático condicionado a `cabeloEBarba < totalClassificado` |
| Prospecção do mês | `prospectados`, `convertidosProspeccao`, `naoConvertidosProspeccao`, `faturamentoProspeccao` | Move para o lado do card "Perfil dos clientes" (grid 2 colunas), mesmos 4 números |
| Recorrência e Conversão | `recorrencia*`, `conversaoCategoriaAlvo`, `clientesSoCabelo/BarbaForaAlvo`, `potencialConversao` | Mesma estrutura (2 fileiras de 4 números + divisor), reestilizada |
| Tempo de cadeira | `ociosidade.{percentualOcupacao,ganhoPorHoraOcupada,valorPerdidoEstimado,atendimentosPerdidosEstimado}`, `realizados` | Vira card escuro (`#101A16`), mesmos 4 números |
| Indicadores de agendamento | `totalAgendamentos`, `realizados`, `naoCompareceram`, `cancelados`, `remarcados` | Mesma estrutura (lista de linhas com divisor), reestilizada |
| Sonhos (mantido, fora do protótipo) | `sonhosComProgresso` | Reestilizado com os mesmos tokens/Card novos, mantém a lógica condicional de só aparecer se houver sonhos ativos |

## Componentização

Novos arquivos:
- `src/components/painel/sidebar.tsx` — sidebar completa (nav + widget de meta + perfil).
- `src/components/painel/kpi-card.tsx` — card de KPI reutilizável (rótulo mono, número
  grande, chip, barra/legenda opcional) — usado pelos 4 KPIs do Dashboard.
- `src/components/painel/donut-chart.tsx` — donut simples via `conic-gradient` inline
  (sem biblioteca de gráficos — mesma técnica do protótipo), recebe segmentos
  `{ valor, cor }[]`.

Reaproveitados sem mudança de interface: `Card`/`CardContent` (só o estilo interno muda),
`SignOutButton`, a lógica de rota-ativa de `nav-links.tsx` (extraída/adaptada, não duplicada
do zero).

## Testes

- **Build**: `npm run build` sem erros de tipo.
- **Manual (navegador)**: login como barbeiro, confirmar visualmente a sidebar (nav,
  destaque de rota ativa, widget de meta com e sem `meta_faturamento_mes` cadastrada) e
  todas as seções do Dashboard redesenhado, incluindo os 3 estados do banner de Diagnóstico
  (criar dados que produzam `positivo`, `neutro` e ao menos um tipo de alerta) e o card de
  Sonhos (com e sem sonhos ativos). Confirmar que `/painel/agenda`, `/painel/clientes`,
  `/painel/prospeccao`, `/painel/sonhos` e `/admin/*` carregam sem erro com os novos
  tokens de cor/fonte (mesmo com conteúdo interno ainda no layout antigo).
- Sem testes de unidade novos — nenhuma lógica de cálculo muda nesta fase, só apresentação.
  Os testes existentes (`calcularOciosidade`, `calcularDistribuicaoCategorias`,
  `calcularDiagnostico`) continuam cobrindo os dados que alimentam as telas novas.

## Fora de escopo (explicitamente adiado)

- Redesenho de conteúdo de `/painel/agenda`, `/painel/prospeccao`, `/painel/clientes`,
  `/painel/clientes/[id]`, `/painel/sonhos` — próximas fases, reaproveitando os tokens e
  componentes desta fase.
- Redesenho de `/admin/*` (9 páginas) e sua própria sidebar — fase separada, depois do
  painel do barbeiro completo.
- Sparkline de faturamento no KPI card — precisaria de uma consulta de série temporal nova.
- Botões decorativos do protótipo sem função real ainda: o seletor de mês (mostra só
  "Agosto 2026", sem dropdown funcional — não existe ainda navegação entre meses) e o botão
  "Novo atendimento" do header (sem `onClick` — o fluxo real de lançar atendimento continua
  vivendo em `/painel/agenda`, via "Atender agora") ficam **presentes visualmente, mas
  inertes** nesta fase, para manter a fidelidade ao protótipo sem inventar navegação nova.
- Login (`/login`) e página pública de agendamento (`/[barbeariaSlug]`) — não fazem parte do
  protótipo, ficam com o visual atual (só herdam cor/fonte via tokens globais).
