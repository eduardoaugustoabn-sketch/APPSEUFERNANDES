# Editar/desativar em Serviços, Produtos e Planos de carreira — Design

## Contexto

`/admin/servicos`, `/admin/produtos` e `/admin/planos-carreira` só permitem criar registros hoje — não há como corrigir um valor errado nem remover um item que não deve mais ser oferecido. As três tabelas já têm histórico vinculado assim que entram em uso: `agendamentos`/`atendimentos` referenciam `servicos.id`, `vendas_produtos` referencia `produtos.id`, `membros` referencia `planos_carreira.id`. Nenhuma dessas foreign keys tem `on delete cascade` — apagar a linha de um item já usado falha (violação de FK) ou, se forçado, corrompe relatórios que dependem desse histórico.

Este spec cobre adicionar edição e "exclusão" (via desativação) às três telas, sem tocar em nenhuma outra parte do MVP/rework já entregues.

## Decisões de escopo (confirmadas com o usuário)

- **"Excluir" = desativar, não apagar.** Um item desativado some das opções para uso *novo* (agendar, vender, vincular a um barbeiro), mas a linha continua no banco — histórico e relatórios existentes não mudam. Pode reativar a qualquer momento.
- **Itens inativos continuam visíveis na listagem**, com estilo visualmente apagado, junto de um botão "Reativar" no lugar de "Desativar". Sem filtro/toggle de exibição — a lista mostra tudo sempre.
- **Editar troca a linha por um formulário in-line** (Salvar/Cancelar), sem modal e sem navegar para outra rota — mesmo padrão já usado no formulário de status da prospecção (`ProspeccaoStatusForm`).
- **Desativar também vale nos pontos do sistema que oferecem esses itens para escolha nova** (agenda interna, atendimento, vínculo de plano de carreira com barbeiro) — não só nas 3 telas de cadastro. Do contrário desativar não impediria ninguém de continuar usando o item no dia a dia.

## Modelo de dados — mudanças

`servicos.ativo` já existe (`boolean not null default true`, desde o MVP) mas nunca foi exposto em nenhuma tela — só é lido hoje pelo link público de agendamento (`/[barbeariaSlug]`), que já filtra `.eq('ativo', true)`.

`produtos` e `planos_carreira` não têm essa coluna. Nova migration:

```sql
alter table produtos add column ativo boolean not null default true;
alter table planos_carreira add column ativo boolean not null default true;
```

Nenhuma mudança de RLS: as três tabelas já têm uma policy `admin gerencia X` (`FOR ALL`) cobrindo UPDATE para admin, então editar e alternar `ativo` já são permitidos sem nenhuma policy nova.

## UI — as 3 telas de cadastro

Cada página (`/admin/servicos`, `/admin/produtos`, `/admin/planos-carreira`) ganha:

- Duas novas server actions ao lado da `criarX` que já existe: `atualizarX` (recebe `id` + os mesmos campos do formulário de criação) e `alternarAtivoX` (recebe `id` + o novo valor de `ativo`).
- Um componente client por entidade — `ServicoRow`, `ProdutoRow`, `PlanoCarreiraRow` (um por tabela, sem abstração genérica compartilhada entre elas; mesma filosofia do resto do projeto, que não compartilha formulários entre entidades diferentes) — substituindo a `<tr>` estática atual:
  - Estado local `editando` (default `false`).
  - `editando = false`: célula mostra os valores como hoje, mais uma coluna de ações com botão **Editar** (`setEditando(true)`) e botão **Desativar**/**Reativar** (chama `alternarAtivoX` direto, sem precisar entrar em modo de edição). Linha com `ativo = false` recebe uma classe de texto apagado (`text-muted-foreground` ou equivalente já usado no projeto).
  - `editando = true`: célula vira `<form action={atualizarX}>` com os mesmos campos do formulário de criação, pré-preenchidos (`defaultValue`), mais **Salvar** (submit) e **Cancelar** (`setEditando(false)`, sem submeter).

Campos editáveis por entidade (mesmos da criação — nenhum campo novo):
- **Serviço:** nome, duração (min), preço.
- **Produto:** nome, categoria, preço de venda, estoque atual, estoque mínimo.
- **Plano de carreira:** nome, % produto, % serviço.

## Refletir "desativado" nos pontos de escolha para uso novo

Ponto de atenção: os componentes que hoje recebem a lista de serviços/produtos também usam essa mesma lista para *reconhecer* um item já vinculado a um registro existente (ex.: abrir o atendimento de um agendamento antigo cujo serviço foi desativado depois). Filtrar a query de busca por `ativo = true` quebraria essa pré-seleção — o item some da lista e o `.find()` que resolve o nome/preço original passa a retornar `undefined`.

Por isso o filtro entra só no ponto de renderização das opções de cada `<select>` que serve para escolher algo **novo**, não na busca em si (que continua trazendo tudo, como hoje):

- `AgendarSlotForm` — select de serviço ao marcar um novo horário.
- `AtenderAgoraForm` — select de serviço do walk-in.
- `LancamentoForm` — select de "adicionar serviço extra", select de "adicionar produto" e o select de serviço do bloco "agendar próxima visita".
- `/admin/barbeiros` — select de plano de carreira ao vincular um barbeiro. Aqui a opção correspondente ao plano *já vinculado* ao barbeiro continua aparecendo mesmo que esteja inativa (senão o select perde a seleção atual ao renderizar); só as opções para trocar para outro plano ficam restritas às ativas.

Para isso, as queries que alimentam esses componentes (`/painel/agenda/page.tsx` para servicos/produtos, `/admin/barbeiros/page.tsx` para planos) passam a incluir a coluna `ativo` no `select(...)` — sem adicionar `.eq('ativo', true)` na query.

`RemarcarForm` não tem select de serviço (remarcar mantém o mesmo serviço do agendamento original) — nenhuma mudança nele.

## Testes

Sem necessidade de pgTAP novo — não há regra de RLS nova (as policies de UPDATE já existem e já são testadas indiretamente pelos testes existentes das 3 tabelas) nem lógica de trigger. Verificação via:
- `npm run build` (type-check).
- Passada manual: editar um item de cada tela e confirmar que persiste; desativar um serviço em uso (com agendamento futuro) e confirmar que (a) o agendamento existente continua exibindo o serviço normalmente e (b) o serviço não aparece mais para escolher num agendamento novo; reativar e confirmar que volta a aparecer; mesmo roteiro para produto e para plano de carreira (vinculado a um barbeiro).
