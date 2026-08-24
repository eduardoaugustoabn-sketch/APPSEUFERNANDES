# Redesign Visual — Admin: Produtos (Fase 5) — Design Spec

## Contexto e objetivo

Continuação do redesign visual do admin: Fase 3 (sidebar + Visão geral) e Fase 4 (Serviços). Esta é a **Fase 5**: a página `/admin/produtos`, estruturalmente quase idêntica à Serviços da Fase 4 — tabela com edição inline por linha (`src/components/produto-row.tsx`) + formulário de adicionar no topo (`src/app/admin/produtos/page.tsx`). Diferença: todos os campos do formulário são `Input` (nenhum `<select>`), e a tabela já tem uma pista visual existente — a linha inteira fica `text-destructive` quando `quantidade_estoque <= estoque_minimo`.

Sem protótipo do Claude Design, como nas fases anteriores do admin — o design estende os componentes/tokens já estabelecidos.

## Decisões de escopo (validadas com o usuário)

- **A tabela vira um `Card`**, mesmo padrão da Fase 4.
- **O formulário "Adicionar produto" vira um `Card`**, mesmo padrão de card-de-formulário da Fase 2/4.
- **Largura explícita em cada campo do formulário**, aplicando a lição da revisão final da Fase 4: o componente `Input` é `w-full` por padrão, então dentro de uma linha `flex`, cada campo sem largura própria estica pra 100% e quebra pra sua própria linha — o formulário viraria uma pilha vertical de 7 linhas em vez do balcão horizontal compacto original. Larguras: `nome` `w-40`, `categoria` `w-32`, `preco_custo`/`preco_venda`/`quantidade_estoque`/`estoque_minimo` `w-28` cada.
- **Destaque de estoque baixo mantido exatamente como está** — a classe `text-destructive` na `TableRow` quando `produto.quantidade_estoque <= produto.estoque_minimo` não muda.
- **Ações "Editar" / "Desativar"/"Reativar"** continuam como links de texto sublinhados.
- **Nenhuma lógica muda** — `criarProduto` (server action), `salvar`, `cancelar`, `alternarAtivo` (em `produto-row.tsx`) continuam exatamente como estão. Só apresentação.

## Página `/admin/produtos` (`src/app/admin/produtos/page.tsx`)

| Elemento atual | Mudança |
|---|---|
| `<h1>` "Produtos" | Mantido como texto simples, mesmo tratamento das fases anteriores. |
| `<form>` "Adicionar produto" (`flex gap-2 mb-6 flex-wrap`) | Vira `Card` com `CardContent`, título "Adicionar produto" acima dos campos. Os 6 `Input` mantidos, cada um com a largura explícita listada acima. `Button` "Adicionar" mantido. |
| `<Table>` de produtos | Vira `Card` com `CardContent`, título "Produtos cadastrados" acima da tabela. `TableHeader`/`TableBody`/colunas mantidos exatamente como estão. |

## `ProdutoRow` (`src/components/produto-row.tsx`)

Modo edição: os `Input` já têm largura própria (`w-32`/`w-28`/`w-24`/`w-20`) — nenhuma mudança necessária aqui, só o container ao redor (Card, feito na página). Modo leitura (linha normal, incluindo o destaque `text-destructive` de estoque baixo) e os botões "Editar"/"Desativar"/"Reativar": sem mudança de estilo.

## Componentização

Nenhum componente novo — reaproveita `Card`/`CardContent`, já existentes desde a Fase 1.

## Fora de escopo (explicitamente adiado)

- Redesenho de `/admin/planos-carreira`, `/admin/barbeiros`, `/admin/ranking`, `/admin/prospeccao`, `/admin/clientes(+[id])`, `/admin/sonhos` — próximas fases.
- Qualquer mudança de comportamento/regra de negócio em Produtos — só apresentação.
- Novos campos, validações ou indicadores na página — a página continua mostrando exatamente os mesmos dados de hoje, incluindo o destaque de estoque baixo já existente.

## Testes

- **Build**: `npm run build` sem erros de tipo.
- **Manual (navegador)**: login como admin, abrir `/admin/produtos`. Confirmar os dois `Card` (formulário e tabela) e que o formulário mantém a linha horizontal compacta (não vira pilha vertical). Testar de ponta a ponta: adicionar um produto novo, editar um existente, salvar, cancelar uma edição, desativar e reativar. Confirmar que uma linha com `quantidade_estoque <= estoque_minimo` continua aparecendo em vermelho (`text-destructive`).
- Sem testes de unidade novos — nenhuma lógica muda nesta fase, só apresentação.
