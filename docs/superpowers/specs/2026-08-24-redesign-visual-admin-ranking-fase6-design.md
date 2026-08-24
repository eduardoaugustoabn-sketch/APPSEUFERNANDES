# Redesign Visual — Admin: Ranking (Fase 6) — Design Spec

## Contexto e objetivo

Continuação do redesign visual do admin: Fase 3 (sidebar + Visão geral), Fase 4 (Serviços), Fase 5 (Produtos). Esta é a **Fase 6**: a página `/admin/ranking` (`src/app/admin/ranking/page.tsx`).

Diferente das fases anteriores, essa página não tem tabela nem formulário antigo — já usa `Card` numa grade (um card por serviço/produto, cada um com uma lista ordenada de colocação dos barbeiros). O gap em relação à identidade visual é bem menor aqui: só espaçamento (`CardContent` usa `p-4`, menos generoso que o `p-6` já padrão nas seções redesenhadas) e a ausência de qualquer destaque visual pro 1º colocado de cada lista.

Sem protótipo do Claude Design, como nas fases anteriores do admin.

## Decisões de escopo (validadas com o usuário)

- **Só polish**, não uma reestruturação: mais espaçamento interno dos cards + destaque sutil pro 1º lugar de cada ranking. Nenhuma mudança estrutural (continua grade de `Card`, um por serviço/produto, com lista ordenada dentro).
- **Espaçamento**: `CardContent className="p-4"` vira `"p-6"` (mesma diretriz de espaçamento generoso já aplicada nas seções redesenhadas), e o nome do item (`<p className="font-semibold mb-2">`) ganha `mb-3` no lugar de `mb-2`.
- **Destaque do 1º colocado**: a linha do índice `0` de cada lista ganha `text-primary font-bold` (mesmo tom já usado em outros números de destaque no app, ex. "Realizados" na Visão geral do admin). As demais posições mantêm o texto padrão (`text-sm`, sem classe de cor extra).
- **Nenhuma lógica muda** — `rankingServico`, `rankingProduto`, as queries de `barbeiros`/`servicos`/`produtos`/`atendimentos`/`vendas`, e a ordenação por quantidade continuam exatamente como estão.

## Página `/admin/ranking` (`src/app/admin/ranking/page.tsx`)

Mudança isolada dentro do componente local `Secao` (função declarada dentro de `RankingPage`, usada pelas 3 seções — Cortes, Serviços extras, Produtos):

| Elemento atual | Mudança |
|---|---|
| `<CardContent className="p-4">` | `p-6` |
| `<p className="font-semibold mb-2">{item.nome}</p>` | `mb-3` no lugar de `mb-2` |
| `<li key={r.nome} className="flex justify-between gap-2">` (dentro do `.map((r, i) => ...)`) | Quando `i === 0`, a `<li>` ganha `text-primary font-bold` além das classes já existentes; demais índices mantêm a `<li>` como está hoje. |

Tudo o resto do arquivo (`<h1>`, `<h2>` de cada seção, a mensagem "Nada cadastrado nessa categoria.", a grade `grid-cols-[repeat(auto-fill,minmax(220px,1fr))]`) permanece sem mudança.

## Componentização

Nenhum componente novo — o `Secao` continua sendo a mesma função local dentro de `RankingPage`, só com os ajustes de classe acima.

## Fora de escopo (explicitamente adiado)

- Redesenho de `/admin/planos-carreira`, `/admin/barbeiros`, `/admin/prospeccao`, `/admin/clientes(+[id])`, `/admin/sonhos` — próximas fases.
- Qualquer mudança de comportamento/regra de negócio — só apresentação.
- Ícones de medalha, badges ou qualquer indicador visual além do texto em destaque para o 1º lugar — mantém simples, sem inventar elementos novos.

## Testes

- **Build**: `npm run build` sem erros de tipo.
- **Manual (navegador)**: login como admin, abrir `/admin/ranking`. Confirmar visualmente o padding maior nos cards e o 1º colocado de pelo menos uma lista (Cortes, Serviços extras ou Produtos) aparecendo em destaque (cor primária + negrito), com as demais posições no estilo padrão. Confirmar que a mensagem "Nada cadastrado nessa categoria." (para uma categoria vazia) continua aparecendo normalmente, sem interferência do destaque.
- Sem testes de unidade novos — nenhuma lógica muda nesta fase, só apresentação.
