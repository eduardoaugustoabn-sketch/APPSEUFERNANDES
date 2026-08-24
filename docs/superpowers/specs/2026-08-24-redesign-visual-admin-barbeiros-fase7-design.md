# Redesign Visual — Admin: Barbeiros (Fase 7) — Design Spec

## Contexto e objetivo

Continuação do redesign visual do admin: Fase 3 (sidebar + Visão geral), Fase 4 (Serviços), Fase 5 (Produtos), Fase 6 (Ranking). Esta é a **Fase 7**: a página `/admin/barbeiros` (`src/app/admin/barbeiros/page.tsx` + `src/components/barbeiro-row.tsx`).

É a página mais complexa das reestilizadas até agora — além do padrão já visto (formulário de adicionar + tabela com edição inline), tem duas partes extras: uma célula de tabela ("Plano de carreira") que embute seu próprio formulário (`select` de plano + 3 campos de meta), e uma linha expansível de "Expediente" (checkboxes de dia da semana + inputs de hora). Nenhuma delas usa os componentes compartilhados hoje — todo o HTML é nativo (`<select>`, `<input>` cru).

Sem protótipo do Claude Design, como nas fases anteriores do admin.

## Decisões de escopo (validadas com o usuário)

- **Formulário "Adicionar barbeiro" vira um `Card`**, mesmo padrão das fases anteriores, com largura explícita em cada campo (lição da Fase 4/5): `nome` `w-40`, `telefone` `w-32`, `email` `w-48`, `senha` `w-32`.
- **Tabela "Barbeiros" vira um `Card`** com título "Barbeiros cadastrados".
- **Célula "Plano de carreira" (`celulaPlano`)**: o `<select>` nativo vira `Select` compartilhado; os 3 `<input>` nativos (meta diária/semanal/faturamento) viram `Input` compartilhado — mantendo as larguras já existentes (`w-32`/`w-36`/`w-44`) e os mesmos `name`/`defaultValue`/`placeholder`.
- **Linha "Expediente" (`linhaExpediente`)**: os 2 `<input type="time">` nativos viram `Input` compartilhado. **Os checkboxes de dia da semana continuam nativos** — o projeto não tem um componente `Checkbox` compartilhado, e criar um agora seria escopo novo não pedido.
- **Nenhuma lógica muda** — `vincularPlano`, `criarBarbeiro` (server actions), e em `barbeiro-row.tsx`: `salvar`, `cancelar`, `alternarAtivo`, `atualizarDia`, `diasValidos`, `salvarExpediente`, `construirDiasIniciais` continuam exatamente como estão. Só apresentação.

## Página `/admin/barbeiros` (`src/app/admin/barbeiros/page.tsx`)

| Elemento atual | Mudança |
|---|---|
| `<h1>` "Barbeiros" | Mantido como texto simples, mesmo tratamento das fases anteriores. |
| `<form>` "Adicionar barbeiro" (`flex gap-2 mb-6 flex-wrap`) | Vira `Card` com `CardContent`, título "Adicionar barbeiro" acima dos campos. Os 4 `Input` mantidos, cada um com a largura explícita listada acima. `Button` "Adicionar" mantido. |
| `<Table>` de barbeiros, incluindo o cabeçalho composto da coluna "Plano de carreira" (rótulo + 3 sub-rótulos com largura) | Vira `Card` com `CardContent`, título "Barbeiros cadastrados" acima da tabela. `TableHeader`/`TableBody`/colunas mantidos exatamente como estão, incluindo a estrutura do cabeçalho composto. |

## `BarbeiroRow` (`src/components/barbeiro-row.tsx`)

| Elemento atual | Mudança |
|---|---|
| `celulaPlano`: `<select name="plano_carreira_id" ... className="border rounded px-2 py-1 bg-input">` | Vira `<Select name="plano_carreira_id" defaultValue={...}>` (mesmas `<option>`, mesmo `name`/`defaultValue`). |
| `celulaPlano`: `<input name="meta_prospeccao_dia" ... className="border rounded px-2 py-1 w-32 bg-input">` | Vira `<Input name="meta_prospeccao_dia" ... className="w-32">` (mesmos atributos, sem o `border`/`bg-input` manuais — o componente já cuida disso). |
| `celulaPlano`: `<input name="meta_prospeccao_semana" ...>` (mesmo padrão, `w-36`) | Mesma troca, `Input` com `className="w-36"`. |
| `celulaPlano`: `<input name="meta_faturamento_mes" ...>` (mesmo padrão, `w-44`) | Mesma troca, `Input` com `className="w-44"`. |
| `linhaExpediente`: os 2 `<input type="time">` nativos (`className="border rounded px-2 py-1 bg-input disabled:opacity-50"`) | Viram `<Input type="time">`, mantendo `value`/`onChange`/`disabled`. O componente `Input` já trata `disabled` no seu próprio estilo (`disabled:opacity-50` já faz parte da classe base do `Input`), então a classe extra não precisa ser repetida. |
| `linhaExpediente`: `<input type="checkbox" ...>` | Sem mudança — continua nativo. |
| Modo edição (`editando`): `Input` de `nome`/`telefone` | Sem mudança — já usa `Input`. |
| Botões "Editar"/"Desativar"/"Reativar"/"Expediente" | Sem mudança — continuam links de texto sublinhados. |

## Componentização

Nenhum componente novo — reaproveita `Card`/`CardContent` (Fase 1) e `Select` (Fase 2), ambos já existentes.

## Fora de escopo (explicitamente adiado)

- Redesenho de `/admin/planos-carreira`, `/admin/prospeccao`, `/admin/clientes(+[id])`, `/admin/sonhos` — próximas fases.
- Qualquer mudança de comportamento/regra de negócio — só apresentação.
- Criar um componente `Checkbox` compartilhado — os checkboxes de dia da semana continuam nativos.
- Reestruturar o cabeçalho composto da coluna "Plano de carreira" em colunas separadas — mantém a estrutura atual (um único `<TableHead>` com 4 rótulos internos), só herdando os tokens/fontes já globais.

## Testes

- **Build**: `npm run build` sem erros de tipo.
- **Manual (navegador)**: login como admin, abrir `/admin/barbeiros`. Confirmar os dois `Card` (formulário e tabela). Testar de ponta a ponta: adicionar um barbeiro novo (fluxo completo de criação de conta), editar nome/telefone de um existente, vincular um plano de carreira e definir as 3 metas pelo formulário da célula, abrir "Expediente" e marcar/desmarcar dias e horários (incluindo o caso de horário inválido, que deve continuar mostrando o alerta existente), salvar o expediente, desativar e reativar um barbeiro.
- Sem testes de unidade novos — nenhuma lógica muda nesta fase, só apresentação.
