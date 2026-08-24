# Redesign Visual — Admin: Sidebar + Visão Geral (Fase 3) — Design Spec

## Contexto e objetivo

Continuação do redesign visual iniciado na Fase 1 (`docs/superpowers/specs/2026-08-22-redesign-visual-dashboard-fase1-design.md`, sistema de tokens/fontes + sidebar do `/painel` + Dashboard) e na Fase 2 (`docs/superpowers/specs/2026-08-22-redesign-visual-agenda-fase2-design.md`, Agenda). As duas fases anteriores previam explicitamente adiar `/admin/*` para "fase separada, depois do painel do barbeiro completo".

O `/admin` tem 9 páginas (Visão geral, Serviços, Produtos, Planos de carreira, Barbeiros, Ranking, Prospecção, Clientes, Sonhos). Diferente do painel do barbeiro, **não existe protótipo do Claude Design pro admin** — o design desta fase é feito direto no código, estendendo o sistema visual já estabelecido (tokens, `Card`, `Select`, `Input`, `KpiCard`) em vez de seguir um mockup.

`/admin/*` já herda cor/fonte via as variáveis CSS globais desde a Fase 1 (o `Card` já usa `border-border` + sombra sutil, `font-heading` já aponta pra `--font-sans`). O que **não** foi atualizado é o shell de navegação: `src/app/admin/layout.tsx` ainda usa uma `<nav>` horizontal simples, em vez da sidebar escura fixa que o `/painel` já tem.

## Decisões de escopo (validadas com o usuário)

- **Fatiamento pequeno, espelhando a Fase 1**: esta fase entrega só a sidebar do admin e a página "Visão geral" redesenhada. As outras 8 páginas (Serviços, Produtos, Planos de carreira, Barbeiros, Ranking, Prospecção, Clientes, Sonhos) **herdam automaticamente** a sidebar/tokens novos, mas seu conteúdo interno não muda nesta fase — viram fases seguintes.
- **Sem protótipo visual**: os componentes já existentes (`KpiCard`, `Card`, ícones de linha no estilo dos 5 já usados em `painel/sidebar.tsx`) são o guia de estilo — não há mockup a seguir pixel a pixel.
- **Sidebar do admin é um componente novo, duplicado** (`src/components/admin/sidebar.tsx`), não uma generalização de `painel/sidebar.tsx` — mesmo padrão já usado no projeto entre `nav-links.tsx` e a sidebar do painel (contextos visualmente diferentes o bastante pra não valer a pena abstrair agora).
- **Sem widget de meta na sidebar do admin** — "Meta do mês" é uma meta pessoal do barbeiro (`membros.meta_faturamento_mes`); não existe equivalente agregado pro admin nesta fase.
- **Nenhuma lógica de dados muda** — toda a fase é apresentação. As queries de `admin/page.tsx` continuam exatamente as mesmas.

## Shell: sidebar do admin

`src/app/admin/layout.tsx` troca a `<nav>` horizontal pela sidebar fixa lateral, mesmo padrão estrutural de `src/app/painel/layout.tsx`:

```tsx
<div className="flex min-h-screen items-stretch">
  <AdminSidebar navItems={NAV_ITEMS} nomeAdmin={membro.nome} />
  <div className="flex-1 min-w-0 p-6 md:p-8 lg:p-10">{children}</div>
</div>
```

Isso exige buscar `nome` além de `papel` na query de `membros` que o layout já faz (`select('papel')` → `select('nome, papel')`).

Novo componente `src/components/admin/sidebar.tsx` (client component, `usePathname` pra rota ativa — mesma lógica de "href mais longo que casa" já usada em `painel/sidebar.tsx`):

- **Cabeçalho**: idêntico ao da sidebar do painel (logo "SF" + "Seu Fernandes" / "Barbearia").
- **Nav**: os mesmos 9 itens de hoje (`NAV_ITEMS` em `admin/layout.tsx`), cada um com um ícone de linha novo, no mesmo estilo visual dos 5 já existentes (`stroke="var(--color-sidebar-icon)"`, `strokeWidth 1.8`, `viewBox 24x24`). Os 3 itens que também existem no painel (Prospecção, Clientes, Sonhos) reusam exatamente o mesmo desenho de ícone do painel, por consistência de conceito; os 6 exclusivos do admin (Visão geral, Serviços, Produtos, Planos de carreira, Barbeiros, Ranking) ganham ícones novos e simples (ex.: Visão geral reusa o mesmo ícone de grid do Dashboard do painel, já que é o mesmo conceito de "visão geral").
- **Sem** widget de meta.
- **Rodapé**: iniciais + nome do admin logado + rótulo **"Admin"** (em vez de "Barbeiro") + `SignOutButton` reestilizado, mesmo padrão visual do painel.

## Página "Visão geral" (`src/app/admin/page.tsx`)

Todos os dados e toda a lógica de cálculo continuam exatamente os mesmos — só a apresentação muda:

| Seção atual | Mudança |
|---|---|
| 3 cards do topo (Faturamento do mês, Comissões acumuladas, Produtos com estoque baixo) | Trocam de `Card`/`<p>` simples para o componente `KpiCard` (`src/components/painel/kpi-card.tsx`, já genérico e sem dependência do painel). "Produtos com estoque baixo" ganha `chip={{ text: 'X itens', tone: 'amber' }}` quando `produtosBaixos.length > 0` (sem chip quando `0`); os outros dois KPIs ficam sem chip (não há dado histórico pra comparar ainda). |
| Tabela "Barbeiros" | Mantida como está — já usa o `Table` compartilhado, que já herda os tokens da Fase 1. |
| Card "Indicadores de agendamento (mês, toda a barbearia)" | Mantido como está — já segue o padrão de card+grid+números grandes estabelecido na Fase 1. |
| Card "Prospecção (mês, toda a barbearia)" | Mantido como está, mesmo motivo. |
| `<h1>` "Visão geral" | Mantido como texto simples (`font-heading text-2xl font-bold`) — sem virar um header decorado tipo o do Dashboard do painel (fora de escopo, não haveria protótipo/dado novo pra justificar). |

## Componentização

Novo arquivo: `src/components/admin/sidebar.tsx` (sidebar completa: nav + rodapé, sem widget de meta).

Reaproveitados sem mudança de interface: `KpiCard`, `Card`/`CardContent`, `Table`, `SignOutButton`.

## Fora de escopo (explicitamente adiado)

- Redesenho de conteúdo de `/admin/servicos`, `/admin/produtos`, `/admin/planos-carreira`, `/admin/barbeiros`, `/admin/ranking`, `/admin/prospeccao`, `/admin/clientes(+[id])`, `/admin/sonhos` — próximas fases, reaproveitando a sidebar e os tokens/componentes desta fase.
- Qualquer mudança de comportamento/regra de negócio na Visão geral — só apresentação.
- Generalizar `painel/sidebar.tsx` e `admin/sidebar.tsx` num componente compartilhado — decisão deliberada de manter duplicado, seguindo o padrão já existente no projeto.

## Testes

- **Build**: `npm run build` sem erros de tipo.
- **Manual (navegador)**: login como admin, confirmar visualmente a sidebar (nav com os 9 itens, destaque de rota ativa, rodapé com nome e rótulo "Admin") e a página Visão geral redesenhada (os 3 `KpiCard` do topo, incluindo o chip âmbar quando há produto com estoque baixo e sem chip quando não há). Confirmar que as outras 8 páginas do admin carregam sem erro dentro da sidebar nova, mesmo com conteúdo interno ainda no visual antigo.
- Sem testes de unidade novos — nenhuma lógica de cálculo muda nesta fase, só apresentação.
