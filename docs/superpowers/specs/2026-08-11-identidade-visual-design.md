# Identidade Visual "Seu Fernandes" — Design

## Contexto

O app inteiro está no tema padrão do scaffold shadcn/Next.js — paleta cinza pura (`oklch(... 0 0)` em todo `globals.css`), sem cor de marca, título de aba ainda "Create Next App", favicon padrão. Toda tela usa `<table>`/`<div>` cru com classes Tailwind mínimas; os componentes shadcn já instalados (`Card`, `Table`, `Badge`, além de `Button`/`Input` que já são usados) estão parados sem uso. Este spec cobre dar uma identidade visual real ao app — a barbearia se chama **Seu Fernandes** e não tinha cores definidas, então a paleta foi criada do zero e validada com o usuário via mockups.

## Decisões de escopo (confirmadas com o usuário)

- **Alcance:** o app inteiro — login, menu (admin e barbeiro), dashboards, todas as telas de tabela (serviços/produtos/planos de carreira/barbeiros/prospecção — painel e admin), agenda, ficha do cliente, e a página pública de agendamento (`/[barbeariaSlug]`), já que essa é a tela que o cliente final vê e também merece a marca.
- **Direção visual:** clássico/tradicional de barbearia — fundo escuro, dourado envelhecido como destaque, título em fonte serifada. Validado com mockups reais de duas telas (dashboard e tabela de serviços) antes de aprovar.
- **Marca:** "SEU FERNANDES", sem logo/cores pré-existentes — a paleta abaixo é original, criada para este projeto.

## Paleta

Substitui os tokens neutros de `globals.css` (`:root`, tema claro é removido — o app não tem toggle de tema, roda só no escuro daqui pra frente). Valores em hex por simplicidade; o restante do arquivo (`@theme inline`, mapeamento de `--color-*` para `--*`) não muda de forma.

```
--background:          #171310   /* preto quente */
--foreground:          #ede4d8   /* creme */
--card:                #221c17   /* levemente mais claro que o fundo */
--card-foreground:     #ede4d8
--popover:              #221c17
--popover-foreground:  #ede4d8
--primary:             #d4a574   /* dourado envelhecido — cor de destaque */
--primary-foreground:  #1a1613   /* texto escuro sobre dourado */
--secondary:           #2a231c   /* superfície secundária, um degrau acima do fundo */
--secondary-foreground:#ede4d8
--muted:               #241e18
--muted-foreground:    #a3927e   /* texto apagado, tom quente */
--accent:              #2a231c   /* hover/estado ativo — igual a secondary */
--accent-foreground:   #ede4d8
--destructive:         #b0524a   /* vermelho terroso — ações destrutivas (cancelar, excluir) */
--border:               rgba(212, 165, 116, 0.16)  /* dourado bem transparente */
--input:               rgba(212, 165, 116, 0.22)
--ring:                #d4a574
```

`--radius` continua `0.625rem` (não faz parte do problema visual, mantém consistência de cantos arredondados já usada pelos componentes shadcn).

Os tokens `--chart-*` e `--sidebar-*` não são usados em nenhuma tela hoje (grep confirma) — removidos do `:root` junto com o bloco `.dark` inteiro (o app não alterna tema).

## Tipografia

- **Título/marca** ("SEU FERNANDES" no menu, `<h1>` de cada página): `Playfair Display` (Google Font, serifada, clássica — carregada via `next/font/google` como `--font-heading`, mesma técnica já usada para `Geist`/`Geist Mono`).
- **Corpo de texto**: continua `Geist Sans` (já carregado em `layout.tsx`), sem mudança.
- O token `--font-heading` já existe em `@theme inline` (linha 12 de `globals.css`, hoje apontando pro mesmo `--font-sans`) — passa a apontar pra variável da nova fonte.

## Convenções de componente

- **Cartões de indicador** (dashboards, hoje `<div>` cru): viram `Card`/`CardHeader`/`CardContent` do shadcn, com o valor numérico em `text-primary` e destaque tipográfico maior.
- **Tabelas de cadastro** (serviços, produtos, planos, barbeiros, relatório de prospecção): viram o componente `Table` do shadcn em vez de `<table>` cru. Continuam com os componentes de linha client-side já implementados (`ServicoRow`, `ProdutoRow`, `PlanoCarreiraRow` — só a casca visual muda, a lógica de editar/desativar já existe e não é tocada por este spec).
- **Badge de status** (item inativo, badge "agendado"/"confirmado" na agenda, se aplicável): usa `Badge` do shadcn em vez de opacidade + texto solto.
- **Ações de linha** ("Editar", "Desativar", "cancelar", "remarcar" etc.): continuam como botões de texto sublinhado (padrão já estabelecido no app, mantém a densidade das telas de agenda), mas usando `text-primary` para ações normais e `text-destructive` para ações destrutivas, em vez das cores cruas atuais (`text-red-600`, `text-amber-700` etc. espalhadas pelo código).
- **Navegação** (`admin/layout.tsx`, `painel/layout.tsx`): a marca "SEU FERNANDES" em `Playfair Display` à esquerda, os links de seção à direita como estão hoje (texto + sublinhado no hover), mas com o link da rota ativa destacado em `text-primary` — hoje nenhum link mostra qual página está ativa.
- **Formulários inline** (linha de tabela que vira formulário ao editar, painéis da agenda): sem mudança estrutural — só herdam os novos tokens de cor via `Input`/`Button`, que já usam as variáveis do tema.

## Arquivos afetados (não exaustivo — o plano detalha)

- `src/app/globals.css` — tokens de cor, remove bloco `.dark`
- `src/app/layout.tsx` — `Playfair Display` via `next/font/google`, `metadata.title` = "Seu Fernandes", favicon
- `src/app/admin/layout.tsx`, `src/app/painel/layout.tsx` — nav redesenhada
- `src/app/login/page.tsx`
- `src/app/painel/page.tsx`, `src/app/admin/page.tsx` — dashboards com `Card`
- `src/app/admin/servicos/page.tsx`, `produtos/page.tsx`, `planos-carreira/page.tsx`, `barbeiros/page.tsx`, `prospeccao/page.tsx` (admin) e `src/app/painel/prospeccao/page.tsx` — `Table`
- `src/components/servico-row.tsx`, `produto-row.tsx`, `plano-carreira-row.tsx` — cores/classes, sem mudança de lógica
- `src/app/painel/agenda/page.tsx` + `src/components/agenda-dia.tsx` e os formulários que ela abre (`agendar-slot-form.tsx`, `lancamento-form.tsx`, `remarcar-form.tsx`, `atender-agora-form.tsx`) — cores/classes
- `src/app/admin/clientes/[id]/page.tsx`, `src/app/painel/clientes/[id]/page.tsx` (ficha do cliente) e `src/components/ficha-cliente.tsx`
- `src/app/[barbeariaSlug]/page.tsx` — página pública de agendamento

## Testes

Sem lógica nova — é um restyle. Verificação via `npm run build` (type-check) e passada visual manual por cada área listada acima, no navegador, como admin e como barbeiro, conferindo contraste/legibilidade em cada tela (dashboards, tabelas, agenda, ficha do cliente, página pública).
