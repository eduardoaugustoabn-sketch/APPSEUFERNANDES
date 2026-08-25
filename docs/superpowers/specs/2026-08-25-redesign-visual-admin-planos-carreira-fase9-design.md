# Redesign Visual — Admin: Planos de Carreira (Fase 9) — Design Spec

## Contexto e objetivo

Continuação do redesign visual do admin: Fase 3 (sidebar + Visão geral), Fase 4 (Serviços), Fase 5 (Produtos), Fase 6 (Ranking), Fase 7 (Barbeiros), Fase 8 (Clientes, compartilhado com painel). Esta é a **Fase 9**: a página `/admin/planos-carreira` (`src/app/admin/planos-carreira/page.tsx` + `src/components/plano-carreira-row.tsx`).

É a página mais simples do CRUD-padrão até agora — praticamente idêntica à Produtos da Fase 5: formulário de adicionar (3 `Input`, sem `<select>`) + tabela com edição inline. Não é compartilhada com `/painel/*`.

Sem protótipo do Claude Design, como nas fases anteriores do admin.

## Decisões de escopo (validadas com o usuário)

- **Formulário "Adicionar plano" vira um `Card`**, mesmo padrão das fases anteriores, com largura explícita em cada campo (lição das Fases 4/5): `nome` `w-40`, `percentual_produto` `w-28`, `percentual_servico` `w-28`.
- **Tabela "Planos de carreira" vira um `Card`** com título "Planos cadastrados".
- **`PlanoCarreiraRow` não muda** — os `Input` da edição inline já têm largura própria (`w-32`/`w-24`/`w-24`), e não há `<select>` nesta página.
- **Nenhuma lógica muda** — `criarPlano` (server action), e em `plano-carreira-row.tsx`: `salvar`, `cancelar`, `alternarAtivo` continuam exatamente como estão. Só apresentação.

## Página `/admin/planos-carreira` (`src/app/admin/planos-carreira/page.tsx`)

| Elemento atual | Mudança |
|---|---|
| `<h1>` "Planos de carreira" | Mantido como texto simples, mesmo tratamento das fases anteriores. |
| `<form>` "Adicionar plano" (`flex gap-2 mb-6`) | Vira `Card` com `CardContent`, título "Adicionar plano" acima dos campos. Os 3 `Input` mantidos, cada um com a largura explícita listada acima. `Button` "Adicionar" mantido. |
| `<Table>` de planos | Vira `Card` com `CardContent`, título "Planos cadastrados" acima da tabela. `TableHeader`/`TableBody`/colunas mantidos exatamente como estão. |

## Componentização

Nenhum componente novo — reaproveita `Card`/`CardContent`, já existentes desde a Fase 1.

## Fora de escopo (explicitamente adiado)

- Redesenho de `/admin/prospeccao`, `/admin/sonhos`, `/painel/prospeccao`, `/painel/sonhos` — próximas fases.
- Qualquer mudança de comportamento/regra de negócio — só apresentação.
- Novos campos, validações ou indicadores na página.

## Testes

- **Build**: `npm run build` sem erros de tipo.
- **Manual (navegador)**: login como admin, abrir `/admin/planos-carreira`. Confirmar os dois `Card` (formulário e tabela) e que o formulário mantém a linha horizontal compacta (não vira pilha vertical). Testar de ponta a ponta: adicionar um plano novo, editar um existente, salvar, cancelar uma edição, desativar e reativar.
- Sem testes de unidade novos — nenhuma lógica muda nesta fase, só apresentação.
