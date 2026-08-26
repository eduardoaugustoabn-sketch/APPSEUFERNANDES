# Redesign Visual — Painel: Sonhos (Fase 12) — Design Spec

## Contexto e objetivo

Última fase do redesign visual do app. Todas as 9 páginas `/admin/*` (Fases 3-10) e `/painel/prospeccao` (Fase 11) já foram concluídas. Esta é a **Fase 12**: `/painel/sonhos` (`src/app/painel/sonhos/page.tsx`).

Diferente de todas as fases anteriores, quase toda a tela já está no padrão visual atual — `src/components/sonho-row.tsx` já usa `Card`, `CardContent p-6`, barra de progresso `rounded-full`, badge "Concluído" e larguras explícitas no modo de edição. O único elemento que ainda não foi reestilizado é o formulário "Novo sonho" no topo da página, que está solto (sem `Card`), embora já use `Input`/`Button` com larguras próprias.

Sem protótipo do Claude Design — extensão direta do padrão já estabelecido (e já usado pelo próprio `SonhoRow` nesta mesma página).

## Decisões de escopo (validadas com o usuário)

- **Formulário "Novo sonho" vira um `Card`** com título "Novo sonho", mesmo padrão de card-de-formulário das fases anteriores. Os 3 campos (`nome` `w-40`, `valor_alvo` `w-32`, `percentual_comissao` `w-32`) já têm largura própria — nenhuma mudança nelas.
- **`src/components/sonho-row.tsx` não é modificado** — já está no padrão visual atual.
- **Nenhuma lógica muda** — a server action `criarSonho`, o cálculo de `sonhosComProgresso` (incluindo a auto-conclusão de sonho quando `valorAcumulado >= valor_alvo`), e toda a lógica de `SonhoRow` continuam exatamente como estão. Só apresentação.

## Página `/painel/sonhos` (`src/app/painel/sonhos/page.tsx`)

| Elemento atual | Mudança |
|---|---|
| `<h1>` "Sonhos" | Mantido como texto simples. |
| `<form action={criarSonho} className="flex gap-2 mb-6 flex-wrap items-center">` | Vira `Card` com `CardContent`, título "Novo sonho" acima dos campos. Os 3 `Input` e o `Button` mantidos exatamente como estão (já têm largura própria). |
| Lista de `<SonhoRow>` | Sem mudança — cada `SonhoRow` já é seu próprio `Card`. |

## Componentização

Nenhum componente novo — reaproveita `Card`/`CardContent`, já existentes desde a Fase 1.

## Fora de escopo (explicitamente adiado)

- Qualquer mudança de comportamento/regra de negócio — só apresentação.
- Modificar `src/components/sonho-row.tsx` — já está correto.

## Testes

- **Build**: `npm run build` sem erros de tipo.
- **Manual (navegador)**: login como barbeiro, abrir `/painel/sonhos`. Confirmar o `Card` ao redor do formulário "Novo sonho" e que ele mantém a linha horizontal compacta. Testar de ponta a ponta: criar um sonho novo, editar um existente, excluir um, e confirmar que a barra de progresso e o badge "Concluído" de `SonhoRow` continuam funcionando normalmente (sem mudança nessa parte).
- Sem testes de unidade novos — nenhuma lógica muda nesta fase, só apresentação.
