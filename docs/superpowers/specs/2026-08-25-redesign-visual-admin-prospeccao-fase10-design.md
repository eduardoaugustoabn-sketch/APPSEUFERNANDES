# Redesign Visual — Admin: Prospecção (Fase 10) — Design Spec

## Contexto e objetivo

Continuação do redesign visual do admin: Fase 3 (sidebar + Visão geral), Fase 4 (Serviços), Fase 5 (Produtos), Fase 6 (Ranking), Fase 7 (Barbeiros), Fase 8 (Clientes, compartilhado com painel), Fase 9 (Planos de carreira). Esta é a **Fase 10**: a página `/admin/prospeccao` (`src/app/admin/prospeccao/page.tsx`).

Diferente de todas as fases anteriores, essa página é só uma tabela de leitura (relatório de conversão de prospecção) — sem formulário, sem edição inline, sem `Card` nenhum hoje.

**`/painel/prospeccao` não é tocada nesta fase** — diferente de Clientes (Fase 8), as páginas admin e painel de Prospecção **não compartilham nenhum componente** (são duas páginas completamente separadas: o admin mostra um relatório read-only de conversões, o painel é o fluxo de trabalho do barbeiro com metas, formulário de novo contato e lista de pendentes). `/painel/prospeccao` continua na lista de pendências, como já estava.

Sem protótipo do Claude Design, como nas fases anteriores do admin.

## Decisões de escopo (validadas com o usuário)

- **A tabela vira um único `Card`**, sem título extra dentro do Card — o `<h1>` "Conversão de prospecção" da página já descreve o conteúdo, e não há mais nenhuma outra seção na página que exigisse distinguir com um segundo título.
- **Nenhuma lógica muda** — as queries e o cálculo de `linhas` (mapeamento de prospecções convertidas com seus atendimentos/vendas associados) continuam exatamente como estão. Só apresentação.

## Página `/admin/prospeccao` (`src/app/admin/prospeccao/page.tsx`)

| Elemento atual | Mudança |
|---|---|
| `<h1>` "Conversão de prospecção" | Mantido como texto simples, mesmo tratamento das fases anteriores. |
| `<Table>` de conversões | Vira `Card` com `CardContent`, sem título adicional. `TableHeader`/`TableBody`/colunas mantidos exatamente como estão. |

## Componentização

Nenhum componente novo — reaproveita `Card`/`CardContent`, já existentes desde a Fase 1.

## Fora de escopo (explicitamente adiado)

- Redesenho de `/admin/sonhos` — próxima fase.
- Redesenho de `/painel/prospeccao`, `/painel/sonhos` — mesma lista de pendências, não afetadas por esta fase.
- Qualquer mudança de comportamento/regra de negócio — só apresentação.

## Testes

- **Build**: `npm run build` sem erros de tipo.
- **Manual (navegador)**: login como admin, abrir `/admin/prospeccao`. Confirmar o `Card` ao redor da tabela e que as linhas de conversão continuam mostrando os mesmos dados de antes.
- Sem testes de unidade novos — nenhuma lógica muda nesta fase, só apresentação.
