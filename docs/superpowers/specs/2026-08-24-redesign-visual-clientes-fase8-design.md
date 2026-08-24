# Redesign Visual — Clientes (Fase 8) — Design Spec

## Contexto e objetivo

Continuação do redesign visual: Fase 3 (admin sidebar + Visão geral), Fase 4 (Serviços), Fase 5 (Produtos), Fase 6 (Ranking), Fase 7 (Barbeiros). Esta é a **Fase 8**: as telas de Clientes.

Diferente das fases anteriores (todas `/admin/*`), aqui a tela real é servida por **componentes compartilhados** entre admin e painel do barbeiro:

- `src/components/lista-clientes.tsx` (lista + busca) — usado por `src/app/admin/clientes/page.tsx` **e** `src/app/painel/clientes/page.tsx`.
- `src/components/ficha-cliente.tsx` (ficha detalhada) — usado por `src/app/admin/clientes/[id]/page.tsx` **e** `src/app/painel/clientes/[id]/page.tsx`.
- `src/components/editar-cliente-form.tsx` (formulário de edição, usado dentro de `FichaCliente`).

**Decisão validada com o usuário**: reestilizar os componentes compartilhados atualiza as 4 rotas de uma vez (`/admin/clientes`, `/admin/clientes/[id]`, `/painel/clientes`, `/painel/clientes/[id]`) — nenhuma delas tinha sido redesenhada ainda (a Fase 2 explicitamente adiou `/painel/clientes`). Nenhum arquivo `page.tsx` precisa mudar nesta fase — os 4 já delegam 100% do conteúdo pros componentes acima.

Sem protótipo do Claude Design, como nas fases anteriores do admin.

## Decisões de escopo (validadas com o usuário)

- **`ListaClientes`**: busca + lista viram um único `Card` — a busca (`Input`) e a lista de links continuam exatamente a mesma estrutura, só ganham o container. Cada linha de cliente **não** vira um card individual (seria excessivo pra uma lista simples).
- **`FichaCliente`**: os 5 blocos existentes (dados do cliente + formulário de edição; "Mais usados por ele"; "Histórico completo"; "Agendamentos"; "Prospecção", condicional) viram **5 `Card` separados, cada um com título** — mesma diretriz de "toda seção é um Card com espaçamento generoso" já aplicada nas fases anteriores.
- **`EditarClienteForm`**: o `<select>` nativo (categoria de origem) vira `Select` compartilhado. O `<textarea>` (observação) **continua nativo** — não existe um componente `Textarea` compartilhado no projeto, e criar um agora seria escopo novo não pedido — mas ganha classes visuais equivalentes às do `Input` (borda, fundo, foco), pra não destoar dentro do Card.
- **Nenhuma lógica muda** — a busca por nome/telefone em `ListaClientes`, todas as queries de `FichaCliente` (ranking, histórico, agendamentos, prospecção), e `salvar`/`cancelar` de `EditarClienteForm` continuam exatamente como estão. Só apresentação.

## `ListaClientes` (`src/components/lista-clientes.tsx`)

| Elemento atual | Mudança |
|---|---|
| `<div>` externo com `Input` de busca (`mb-4`) + lista de `<Link>` | Vira um `Card` com `CardContent`; a `Input` de busca mantém seu `mb-4` (já é o espaçamento certo dentro do Card, sem precisar de wrapper extra). |
| Linhas de cliente (`<Link className="flex justify-between border-b py-2 hover:bg-muted/50">`) | Mantidas exatamente como estão — mesmo texto, mesma estrutura, dentro do Card agora. |
| Mensagem "Nenhum cliente encontrado." | Mantida sem mudança. |

## `FichaCliente` (`src/components/ficha-cliente.tsx`)

Nenhuma query ou cálculo muda — só a árvore JSX final, dividida em 5 `Card`:

| Bloco atual | Título do Card | Conteúdo |
|---|---|---|
| Nome/telefone/nascimento/bairro/cidade + "Cliente desde" + `EditarClienteForm` | "Dados do cliente" | Mesmo texto, mesmo `EditarClienteForm` embutido. |
| "Mais usados por ele" (barras de progresso por item) | "Mais usados por ele" | Mesma lista, mesmas barras (`bg-primary` sobre `bg-muted`). |
| "Histórico completo" (atendimentos + vendas intercalados por data) | "Histórico completo" | Mesma lista. |
| "Agendamentos" | "Agendamentos" | Mesma lista. |
| "Prospecção" (só quando há histórico) | "Prospecção" | Mesma lista, mesma condição de exibição (`prospeccaoHistorico.length > 0`). |

Cada `Card` segue o padrão já estabelecido: `CardContent className="p-6"`, título `font-heading text-base font-bold mb-5` (ou `mb-3`/`mb-4` conforme o conteúdo interno já usa espaçamento próprio entre itens — ver plano). Os 5 Cards ficam empilhados verticalmente (`flex flex-col gap-4` ou `gap-6` no container externo), sem grade — o conteúdo de cada bloco é uma lista de linhas, não cabe bem em colunas lado a lado.

## `EditarClienteForm` (`src/components/editar-cliente-form.tsx`)

| Elemento atual | Mudança |
|---|---|
| `<select value={categoriaOrigem} ...>` | Vira `<Select value={categoriaOrigem} ...>`, mesmas `<option>`, mesmo `value`/`onChange`. |
| `<textarea placeholder="Observação" ... className="border rounded px-2 py-1 bg-input text-sm min-h-20">` | Continua `<textarea>` nativo, classes atualizadas pra bater visualmente com `Input`: `className="w-full rounded-lg border border-input bg-input-bg px-2.5 py-1.5 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 min-h-20"`. |
| O `<div className="flex flex-col gap-2 mb-4 border rounded p-3">` que envolve o formulário em modo edição | Mantido como está (já é um "mini-card" informal dentro do Card maior "Dados do cliente") — não vira um `Card` aninhado, pra não duplicar borda/sombra dentro de outro Card. |
| Modo leitura (observação/categoria + botão "Editar") | Sem mudança de estilo. |

## Componentização

Nenhum componente novo — reaproveita `Card`/`CardContent` (Fase 1) e `Select` (Fase 2), ambos já existentes.

## Fora de escopo (explicitamente adiado)

- Redesenho de `/admin/planos-carreira`, `/admin/prospeccao`, `/admin/sonhos` — próximas fases.
- Redesenho de `/painel/prospeccao`, `/painel/sonhos` — mesma lista de pendências, não afetadas por esta fase.
- Criar um componente `Textarea` compartilhado — o campo de observação continua um `<textarea>` nativo, só com classes atualizadas.
- Qualquer mudança de comportamento/regra de negócio — só apresentação.

## Testes

- **Build**: `npm run build` sem erros de tipo.
- **Manual (navegador)**: testar como admin **e** como barbeiro (as duas rotas usam os mesmos componentes). Em `/admin/clientes` e `/painel/clientes`: confirmar o Card da lista, testar a busca por nome e por telefone. Abrir a ficha de um cliente (`/admin/clientes/[id]` e `/painel/clientes/[id]`): confirmar os 5 Cards, testar editar bairro/cidade/observação/categoria de origem (incluindo o `Select` novo e o `textarea` restilizado), salvar e cancelar. Confirmar que o bloco "Prospecção" só aparece quando há histórico de prospecção pro cliente.
- Sem testes de unidade novos — nenhuma lógica muda nesta fase, só apresentação.
