# Redesign Visual — Admin: Serviços (Fase 4) — Design Spec

## Contexto e objetivo

Continuação do redesign visual do admin, iniciado na Fase 3 (`docs/superpowers/specs/2026-08-23-redesign-visual-admin-fase3-design.md`, sidebar + página "Visão geral"). Esta é a **Fase 4**: a página `/admin/servicos`, uma tela de CRUD simples — tabela com edição inline por linha (`src/components/servico-row.tsx`) + um formulário de adicionar no topo (`src/app/admin/servicos/page.tsx`).

Como nas fases anteriores do admin, **não há protótipo do Claude Design** pra essa página — o design estende direto os componentes/tokens já estabelecidos (`Card`, `Input`, `Select`, `Button`, `Table`).

## Decisões de escopo (validadas com o usuário)

- **A tabela vira um `Card`** — hoje fica solta na página, sem container. Isso segue a diretriz já validada em fases anteriores de que toda seção deve ser um `Card` com espaçamento generoso (não só no Dashboard).
- **O formulário "Adicionar serviço" vira um `Card`**, mesmo padrão de card-de-formulário estabelecido na Fase 2 (Agenda): `border-border shadow-sm rounded-2xl p-6`, título `font-heading text-base font-bold`.
- **Os `<select>` nativos** (em `admin/servicos/page.tsx` e em `servico-row.tsx`, modo edição) trocam pelo componente `Select` compartilhado (`src/components/ui/select.tsx`, criado na Fase 2, ainda não usado nesta página).
- **Ações "Editar" / "Desativar"/"Reativar"** continuam como links de texto sublinhados — mesmo padrão que a Fase 2 usou pra ações pequenas dentro de linhas, sem inventar botão novo.
- **Nenhuma lógica muda** — `criarServico` (server action), `salvar`, `cancelar`, `alternarAtivo` (em `servico-row.tsx`) continuam exatamente como estão. Só apresentação.

## Página `/admin/servicos` (`src/app/admin/servicos/page.tsx`)

| Elemento atual | Mudança |
|---|---|
| `<h1>` "Serviços" | Mantido como texto simples (`font-heading text-2xl font-bold mb-4`) — mesmo tratamento da Fase 3 na Visão geral. |
| `<form>` "Adicionar serviço" (`flex gap-2 mb-6 flex-wrap`) | Vira `Card` com `CardContent`, título "Adicionar serviço" acima dos campos. Campos mantidos (`nome`, `duracao_minutos`, `preco` via `Input`; `tipo`, `categoria_servico` via `Select` no lugar do `<select>` nativo). `Button` "Adicionar" mantido. |
| `<Table>` de serviços | Vira `Card` com `CardContent`, título "Serviços cadastrados" acima da tabela (distinto do `<h1>` "Serviços" da página, pra não duplicar o mesmo texto). `TableHeader`/`TableBody`/colunas mantidos exatamente como estão. |

## `ServicoRow` (`src/components/servico-row.tsx`)

Modo edição: os dois `<select>` (`tipo`, `categoria_servico`) trocam de `<select className="border rounded px-2 py-1 bg-input">` pra `Select` (mesmas `options`, mesmo `value`/`onChange`, sem mudança de comportamento). Modo leitura (linha normal) e os botões "Editar"/"Desativar"/"Reativar": sem mudança de estilo.

## Componentização

Nenhum componente novo — reaproveita `Card`/`CardContent` e `Select`, ambos já existentes desde fases anteriores.

## Fora de escopo (explicitamente adiado)

- Redesenho de `/admin/produtos`, `/admin/planos-carreira`, `/admin/barbeiros`, `/admin/ranking`, `/admin/prospeccao`, `/admin/clientes(+[id])`, `/admin/sonhos` — próximas fases.
- Qualquer mudança de comportamento/regra de negócio em Serviços — só apresentação.
- Novos campos, validações ou KPIs na página — a página continua mostrando exatamente os mesmos dados de hoje.

## Testes

- **Build**: `npm run build` sem erros de tipo.
- **Manual (navegador)**: login como admin, abrir `/admin/servicos`. Confirmar visualmente os dois `Card` (formulário e tabela), testar o fluxo completo de ponta a ponta (adicionar um serviço novo, editar um existente — incluindo os dois `Select` — salvar, cancelar uma edição, desativar e reativar um serviço) e confirmar que tudo continua funcionando exatamente como antes, só com o visual novo.
- Sem testes de unidade novos — nenhuma lógica muda nesta fase, só apresentação.
