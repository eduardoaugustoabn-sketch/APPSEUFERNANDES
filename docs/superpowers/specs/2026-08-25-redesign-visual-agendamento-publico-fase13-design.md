# Redesign Visual — Agendamento Público (Fase 13) — Design Spec

## Contexto e objetivo

O redesign visual do app cobriu `/admin/*` (Fases 3-10) e `/painel/*` (Fases 1-2, 11-12), mas nunca tocou a única tela pública e não-autenticada do sistema: `/[barbeariaSlug]` (`src/app/[barbeariaSlug]/page.tsx`, que só delega tudo pra `src/components/public-booking-flow.tsx`). É o fluxo de agendamento que um cliente final usa pra marcar horário sozinho, sem login — provavelmente a tela mais vista do produto, e a única que ainda está 100% no visual antigo (sem `Card`, botões e `<select>` nativos crus).

Esta é a **Fase 13**: reestilizar `PublicBookingFlow`. Sem protótipo do Claude Design — estende os componentes/tokens já estabelecidos, usando `/login` (a única outra tela pública já redesenhada) como referência de layout.

## Decisões de escopo (validadas com o usuário)

- **Cabeçalho**: mesmo tratamento do `/login` — círculo "SF" (`bg-primary`, texto branco) + nome da barbearia (dinâmico, `barbearia.nome`, no lugar do "Seu Fernandes" fixo do login) + "Barbearia" em mono uppercase — acima de um único `Card` que envolve todo o fluxo de agendamento (as 4 etapas).
- **Botões de seleção** (serviço, barbeiro, horário): evoluem de `border rounded px-3 py-1` pra um estilo "chip" alinhado ao resto do app — `border-input bg-input-bg rounded-lg`, mesma altura/tipografia do `Input`/`Select` — com o estado selecionado usando `bg-primary text-primary-foreground border-primary` (evolução do que já existe, que já usa `bg-primary text-primary-foreground` pro estado selecionado — só a base não-selecionada muda de estilo).
- **`<select>` de categoria de origem** vira `Select` compartilhado.
- **Tela de confirmação** (`confirmado === true`) vira um `Card` (com o mesmo cabeçalho SF acima) contendo um ícone de check verde — mesmo padrão visual já usado no banner de Diagnóstico do Dashboard do painel (círculo `bg-primary` de 34px com um check branco desenhado em SVG) — mais o texto de confirmação atual.
- **Nenhuma lógica muda** — `buscarHorarios`, `selecionarServico`/`selecionarBarbeiro` (e a regra de disparar a busca só quando os dois estão escolhidos), `verificarCliente` (reconhecimento por telefone), `confirmar` (incluindo a validação "escolha como conheceu a barbearia" quando não há reconhecimento), e a RPC `criar_agendamento_publico`, continuam exatamente como estão. Só apresentação.

## `PublicBookingFlow` (`src/components/public-booking-flow.tsx`)

| Elemento atual | Mudança |
|---|---|
| `<div className="max-w-md mx-auto p-6"><h1 className="font-heading text-2xl font-bold mb-4">{barbearia.nome}</h1>` | Vira o cabeçalho SF (logo + nome + "Barbearia") acima de um `Card className="w-full max-w-md"` com `CardContent className="p-6"`. Todo o fluxo (etapas 1-4) passa a viver dentro desse `CardContent`. |
| Etapas "1. Escolha o serviço" / "2. Escolha o barbeiro" / "3. Escolha o horário" (`<p className="font-heading text-base font-semibold mt-4">`) | Título de cada etapa mantido (`font-heading text-base font-bold`), espaçamento entre etapas via `flex flex-col gap-6` no container das etapas, no lugar de `mt-4` individual. |
| Botões de serviço/barbeiro (`border rounded px-3 py-1`, `bg-primary text-primary-foreground` quando selecionado) e de horário (`border rounded px-3 py-1`, **sem nenhum destaque quando selecionado** — o código atual não tem essa condicional pro horário, só pra serviço/barbeiro) | Os três viram chips: não selecionado = `border border-input bg-input-bg rounded-lg px-3 py-1.5 text-sm transition-colors hover:border-ring`; selecionado = `border border-primary bg-primary text-primary-foreground rounded-lg px-3 py-1.5 text-sm font-semibold`. O botão de horário **ganha** a condicional de destaque que faltava (`horario === h.hora_inicio`), pelo mesmo padrão já usado em serviço/barbeiro — pequena correção de consistência, não é funcionalidade nova (o clique já selecionava o horário, só não havia indicação visual disso). |
| "4. Seus dados": os 4 `Input` (nome/telefone/bairro/cidade) | Sem mudança de comportamento — já usam `Input`. Espaçamento entre eles ajustado pro `flex flex-col gap-3` do container da etapa, no lugar de `mb-2` individual. |
| `<select value={categoriaOrigem} ...>` | Vira `Select` com `aria-label="Como conheceu a barbearia?"`, mesmas `<option>`, mesmo `value`/`onChange`. |
| Mensagens de reconhecimento (`text-primary`) e erro (`text-destructive`) | Sem mudança de estilo. |
| `<Button onClick={confirmar} className="w-full mt-4">` | Sem mudança de comportamento — o espaçamento superior passa a vir do `gap` do container em vez de `mt-4` próprio. |
| Tela de confirmação (`<p className="p-6">✓ Agendamento confirmado!...</p>`) | Vira cabeçalho SF + `Card` com um círculo de check (`w-[34px] h-[34px] rounded-[11px] bg-primary`, SVG de check branco — mesmo desenho usado no Diagnóstico do painel) e o texto de confirmação abaixo, mesma informação de hoje (`{servico?.nome} com {barbeiro?.nome} às {horario}`). |

## Componentização

Nenhum componente novo — reaproveita `Card`/`CardContent` (Fase 1) e `Select` (Fase 2), ambos já existentes. O ícone de check é inline (SVG), copiado do padrão já usado em `src/app/painel/page.tsx` (Diagnóstico) — não vira um componente `Checkmark` compartilhado, já que só é usado nesses dois lugares.

## Fora de escopo (explicitamente adiado)

- Qualquer mudança de comportamento/regra de negócio — busca de horários, reconhecimento de cliente, validação, criação do agendamento — tudo idêntico.
- Novos campos, etapas ou validações no fluxo.
- Suporte a mais de uma data (o fluxo já só oferece o dia atual, `useState(() => new Date().toISOString().slice(0, 10))` sem seletor de data — isso não muda nesta fase).

## Testes

- **Build**: `npm run build` sem erros de tipo.
- **Manual (navegador)**: abrir `/<slug-de-uma-barbearia>` sem estar logado. Confirmar o cabeçalho SF + Card. Testar o fluxo completo: escolher serviço, escolher barbeiro (em qualquer ordem), confirmar que os horários aparecem só depois dos dois escolhidos, escolher um horário, preencher os dados (testar telefone de um cliente já cadastrado pra ver a mensagem de reconhecimento), escolher categoria de origem pelo `Select` novo, confirmar o agendamento e ver a tela de sucesso com o ícone de check. Testar também o caso de erro (ex.: tentar confirmar sem escolher categoria quando não há reconhecimento — deve mostrar a mensagem de erro existente).
- Sem testes de unidade novos — nenhuma lógica muda nesta fase, só apresentação.
