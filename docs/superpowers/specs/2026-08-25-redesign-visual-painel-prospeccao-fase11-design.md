# Redesign Visual — Painel: Prospecção (Fase 11) — Design Spec

## Contexto e objetivo

Continuação do redesign visual: as 9 páginas de `/admin/*` já foram concluídas (Fases 3-10). Esta é a **Fase 11**, primeira do painel do barbeiro desde a Agenda (Fase 2) — a página `/painel/prospeccao` (`src/app/painel/prospeccao/page.tsx`), junto com dois componentes que ela usa: `src/components/telefone-cliente-busca.tsx` e `src/components/prospeccao-status-form.tsx`.

É a página mais complexa do painel reestilizada até agora — 4 seções soltas (sem nenhum `Card`), um formulário de busca de cliente com autocomplete, dois `<select>` nativos e um formulário embutido numa lista de pendências.

Sem protótipo do Claude Design pra essa página (o protótipo original da Fase 1 cobria só Dashboard/Agenda/Prospecção/Clientes/Sonhos do painel *como conceito*, mas o dado de exemplo do protótipo não detalhava o fluxo de Prospecção além do que já foi usado na Fase 1) — o design estende os componentes/tokens já estabelecidos.

## Decisões de escopo (validadas com o usuário)

- **"Metas de prospecção"**: as duas barras de progresso (diária e semanal), hoje dois blocos de texto soltos sem `Card`, viram **um único `Card`** contendo as duas barras — são o mesmo conceito (metas de contato), não precisam de Cards separados. As barras trocam `rounded` por `rounded-full`, alinhando com o estilo já usado em Sonhos (`/admin/sonhos` e o resumo de Sonhos no Dashboard do painel) e no widget "Meta do mês" da sidebar.
- **"Novo contato prospectado"** (formulário) vira um `Card` com título — mesmo padrão de card-de-formulário estabelecido na Fase 2/4. Os campos de `TelefoneClienteBusca` (`nome`, `telefone`, `bairro`, `cidade`, todos já `Input`) ganham largura explícita. Os dois `<select>` nativos (`canal`, em `painel/prospeccao/page.tsx`; `categoria_origem`, em `telefone-cliente-busca.tsx`) viram `Select` compartilhado, cada um com `aria-label` (mesmo padrão da Fase 4). O checkbox ("Ofereci corte grátis") continua nativo — não existe componente `Checkbox` compartilhado.
- **"Pendentes de conversão"** (lista) vira um `Card` com título. Dentro dela, `ProspeccaoStatusForm` troca seu `<select>` nativo por `Select` — como o container desse formulário (`flex gap-2 items-center`) **não** tem `flex-wrap`, o `Select` precisa de largura explícita (lição já aplicada nas Fases 4/5/7: sem isso, um componente `w-full` briga por espaço via `flex-shrink` em vez de manter a largura compacta).
- **"Conversão"** (resumo de 2 linhas de texto) vira um `Card` com título — mesmo texto de hoje, sem virar um layout de KPIs novo (não inventa estrutura além do que já existe).
- **Nenhuma lógica muda** — a busca de cliente por telefone (debounce, RPC `buscar_clientes_por_telefone`), a seleção de resultado, a server action `novoContato`, e `salvar` de `ProspeccaoStatusForm` continuam exatamente como estão. Só apresentação.

## Página `/painel/prospeccao` (`src/app/painel/prospeccao/page.tsx`)

| Elemento atual | Mudança |
|---|---|
| `<h1>` "Prospecção" | Mantido como texto simples. |
| Bloco "Meta diária de contatos" + bloco "Meta semanal de contatos" (dois `<div className="mb-4">` soltos) | Viram um único `Card` "Metas de prospecção", com as duas barras dentro (cada uma mantendo seu próprio título pequeno, texto de progresso e condicional `metaDia > 0`/`metaSemana > 0` — se nenhuma meta estiver configurada, o Card inteiro não aparece). Barras: `rounded` → `rounded-full`. |
| `<form action={novoContato}>` (`flex gap-2 items-center mt-4 flex-wrap`) | Vira `Card` com título "Novo contato prospectado". `<select name="canal">` vira `Select` com `aria-label="Canal"` e largura `w-40`. Checkbox mantido nativo. `Button` mantido. |
| "Pendentes de conversão (N)" + lista de `<div>` com `ProspeccaoStatusForm` | Vira `Card` com título "Pendentes de conversão (N)" (o contador continua no título). Linhas mantidas (`flex justify-between items-center border-b py-2`, com `last:border-b-0`). Ganha uma mensagem de estado vazio ("Nenhuma prospecção pendente.") quando a lista está vazia — aplicando de saída a lição da Fase 8 (Cards vazios sem mensagem parecem quebrados), em vez de esperar a revisão final apontar. |
| "Conversão" (2 `<p>`) | Vira `Card` com título "Conversão", mesmo texto (`Convertidos hoje: N`, `Taxa de conversão deste mês: N%...`). |

## `TelefoneClienteBusca` (`src/components/telefone-cliente-busca.tsx`)

| Elemento atual | Mudança |
|---|---|
| `<Input name="nome" ...>` | Ganha `className="w-40"`. |
| `<Input name="telefone" ...>` (dentro do `<div className="relative">`) | Ganha `className="w-40"`. |
| `<Input name="bairro" ...>` | Ganha `className="w-32"`. |
| `<Input name="cidade" ...>` | Ganha `className="w-32"`. |
| Dropdown de sugestões (`absolute z-10 w-full mt-1 bg-card border rounded shadow-md ...`) | `rounded` → `rounded-lg`, batendo com o raio dos outros componentes (`Input`/`Select`/`Card`). Resto mantido. |
| `<select name="categoria_origem" ...>` | Vira `Select` com `aria-label="Como conheceu a barbearia?"` e `className="w-56"`. |

## `ProspeccaoStatusForm` (`src/components/prospeccao-status-form.tsx`)

| Elemento atual | Mudança |
|---|---|
| `<select value={status} onChange={...} className="border rounded px-2 py-1">` | Vira `Select` com `aria-label="Status"` e `className="w-36"` (largura explícita necessária — o container não tem `flex-wrap`). |

## Componentização

Nenhum componente novo — reaproveita `Card`/`CardContent` (Fase 1) e `Select` (Fase 2), ambos já existentes.

## Fora de escopo (explicitamente adiado)

- Redesenho de `/painel/sonhos` — próxima fase.
- Qualquer mudança de comportamento/regra de negócio — só apresentação.
- Criar um componente `Checkbox` compartilhado — o checkbox continua nativo.
- Reestruturar o resumo "Conversão" num layout de KPIs — mantém como texto simples dentro do Card.

## Testes

- **Build**: `npm run build` sem erros de tipo.
- **Manual (navegador)**: login como barbeiro (com metas de prospecção diária/semanal configuradas, e sem elas, pra confirmar a condicional), abrir `/painel/prospeccao`. Confirmar os 4 Cards. Testar de ponta a ponta: buscar um cliente por telefone (confirmar que a lista de sugestões aparece e que selecionar uma preenche os campos), registrar um novo contato (com e sem canal/oferta selecionados), mudar o status de uma prospecção pendente pelo `Select` novo e salvar, confirmar que os números de conversão continuam corretos.
- Sem testes de unidade novos — nenhuma lógica muda nesta fase, só apresentação.
