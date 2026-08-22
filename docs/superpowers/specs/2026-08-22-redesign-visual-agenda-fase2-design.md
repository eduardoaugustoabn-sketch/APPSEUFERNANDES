# Redesign Visual — Agenda (Fase 2) — Design Spec

## Contexto e objetivo

Continuação do redesign visual iniciado na Fase 1 (`docs/superpowers/specs/2026-08-22-redesign-visual-dashboard-fase1-design.md`), que entregou o sistema de tokens/fontes, a sidebar do `/painel`, e o Dashboard redesenhado. Esta é a **Fase 2**: a tela **Agenda** (`/painel/agenda`), a segunda mais usada do app.

O protótipo (`Layout barbeiro/handoff/Seu Fernandes.dc.html`, seção `isAgenda`) mostra: header, 4 KPIs do dia, a grade "Horários do dia" (lista de linhas: hora + ponto de status + rótulo + meta + botão), e o card "Bloquear horário". Mas o protótipo é uma demo estática com **um agendamento por horário e sem estados de interação real** — a tela de verdade (`src/components/agenda-dia.tsx` + 5 componentes de formulário) tem bem mais complexidade: múltiplos agendamentos podem ocupar o mesmo horário (empilhados), cada agendamento tem 4 status possíveis com botões de ação diferentes por status (confirmar/cancelar, atendimento/remarcar/não compareceu), e existem 4 painéis de formulário (Atender agora, Concluir atendimento, Agendar horário, Remarcar) que **não aparecem no protótipo em nenhum estado**.

## Decisões de escopo (validadas com o usuário)

- **Os 4 formulários sem mockup** (`AtenderAgoraForm`, `LancamentoForm`, `AgendarSlotForm`, `RemarcarForm`) **são reestilizados também**, por extrapolação — usando os mesmos tokens/padrões de input, botão e card já estabelecidos na Fase 1, não deixados no visual antigo. Cada um ganha o tratamento de card (`border-border`, `shadow`, `rounded-2xl`, padding generoso) e os inputs/selects passam a usar os componentes compartilhados abaixo.
- **Toda a lógica de negócio existente é preservada exatamente como está** — múltiplos agendamentos por slot, os 5 status de agendamento (`agendado`/`confirmado`/`realizado`/`nao_compareceu`/`cancelado` — cancelado já vem filtrado fora da query), as regras de quais botões aparecem em qual status, a checagem de conflito de horário no `AgendarSlotForm`, o fluxo de retorno automático no `LancamentoForm`, a busca de cliente por telefone no `ClienteAutocomplete`. Nenhuma query, nenhuma condição de negócio muda — só a apresentação.
- **Novo componente compartilhado `Select`** (`src/components/ui/select.tsx`), no mesmo padrão do `Input` já existente — hoje cada formulário tem seu próprio `<select className="border rounded px-2 py-1">` repetido (7 ocorrências em 5 arquivos); centralizar numa Fase que já mexe em todos esses arquivos é o momento certo, evita 7 pontos de manutenção divergentes.
- **`Input` ganha um ajuste pontual de fundo** — hoje é `bg-transparent`; o protótipo usa um branco levemente OFF (`#FCFCFB`) nos inputs sobre fundo de card branco, pra dar contraste sutil. Novo token `--input-bg: #FCFCFB` + `bg-input-bg` no lugar de `bg-transparent`. Efeito colateral aceito: todo `Input` em todo o app (não só Agenda) ganha esse fundo — consistente com a filosofia "tokens são globais" da Fase 1.

## KPIs do dia (dados)

Os 4 KPIs do protótipo mapeiam para dados já buscados por `AgendaDia` (`expedientes`, `bloqueios`, `agendamentos`) mais um campo novo (preço do serviço, hoje não selecionado):

| KPI protótipo | Definição |
|---|---|
| Horários livres | `slotsUnicos.filter(slot => statusDoSlot(slot).tipo === 'livre').length` |
| Agendados | `slotsUnicos.filter(slot => statusDoSlot(slot).tipo === 'ocupado').length` (conta slots, não agendamentos individuais — um slot com 2 agendamentos empilhados conta 1) |
| Bloqueados | `slotsUnicos.filter(slot => statusDoSlot(slot).tipo === 'bloqueado').length` |
| Previsto no dia | soma de `servicos.preco` de todos os agendamentos do dia com status `agendado`/`confirmado`/`realizado` (não cancelado, que já vem filtrado) — exige adicionar `preco` ao `select` de `servicos(id, nome)` que `AgendaDia` já faz (`servicos(id, nome, preco)`), zero query nova |

## Grade "Horários do dia"

Estrutura preservada (mapeia `slotsUnicos`, chama `statusDoSlot`), só o container de cada linha muda de visual:

- **Livre**: linha inteira clicável (mantém `onClick={() => clicarSlot(slot)}`), rótulo "Livre" em cinza, ponto cinza.
- **Bloqueado**: linha com opacidade reduzida, ponto âmbar, rótulo do motivo, botão "desbloquear" à direita (mantém `desbloquear(bloqueio.id)`).
- **Ocupado**: linha vira um bloco (não uma linha simples) porque pode conter **N agendamentos empilhados** — preserva o comportamento atual exatamente (mapeia `info.agendamentos`, cada um com seu próprio botão de ação conforme status, mais "+ agendar outro aqui"). Visualmente: bloco com fundo `bg-muted`, cada agendamento dentro como uma linha com ponto colorido por status (`realizado` = verde, `nao_compareceu` = cinza apagado, outros = âmbar) e os botões de ação existentes (confirmar/cancelar/atendimento/remarcar/não compareceu) reestilizados como links/botões pequenos no padrão do protótipo (texto colorido sublinhado ou botão outline pequeno), não inventando nenhum botão novo nem removendo nenhum existente.

## Painéis de formulário (BloqueioForm + os 4 sem mockup)

Cada um vira um card (`border-border shadow-sm rounded-2xl p-6`) com título (`font-heading text-base font-bold`), os campos usando `Input`/`Select` (já token-aware após o ajuste acima), e os botões usando o `Button` já existente (que já herda os tokens da Fase 1 — sem mudança necessária nele). `ClienteAutocomplete` (usado por 3 dos 4 formulários) ganha o mesmo tratamento de `Input`/`Select`/dropdown-de-sugestões (fundo card, borda, sombra, item hover) sem mudar nenhuma lógica de busca/debounce/seleção.

Mensagens de erro/sucesso (`mensagem`) mantêm o texto atual, só o estilo (cor vermelha para erro reconhecível, sem card dedicado — texto simples abaixo do formulário, como já é hoje).

## Fora de escopo (explicitamente adiado)

- Redesenho de `/painel/prospeccao`, `/painel/clientes(+[id])`, `/painel/sonhos` — próximas fases.
- Redesenho de `/admin/*`.
- Qualquer mudança de comportamento/regra de negócio na Agenda — só apresentação.
- Um componente de calendário/date-picker customizado — os inputs `type="date"`/`type="time"` nativos continuam sendo usados (o protótipo também usa inputs nativos pra isso).

## Testes

- **Build**: `npm run build` sem erros de tipo.
- **Manual (navegador)**: como barbeiro, confirmar visualmente a grade de horários com um dia sem nenhum agendamento (todos "livre"), um dia com 1 agendamento simples, um dia com 2+ agendamentos no mesmo horário (empilhados), um bloqueio, e testar os 4 fluxos de formulário (Atender agora → Concluir atendimento; Agendar horário; Remarcar; Bloquear horário) de ponta a ponta pra confirmar que continuam funcionando exatamente como antes, só com o visual novo. Confirmar que o ajuste de `bg-input-bg` não quebra a legibilidade de inputs em nenhuma outra tela do app (Prospecção, Clientes, admin, login).
- Sem testes de unidade novos — nenhuma lógica muda nesta fase.
