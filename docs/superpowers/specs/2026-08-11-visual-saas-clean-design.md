# Identidade Visual "Seu Fernandes" v2 — SaaS Clean — Design

## Contexto

O app acabou de ganhar uma primeira identidade visual ("Clássica": fundo preto quente, dourado envelhecido, título serifado — spec `2026-08-11-identidade-visual-design.md`, plano `2026-08-11-identidade-visual.md`, já mergeado). Ao usar de verdade, o usuário achou o resultado com cara de "barbearia antiga" e pediu algo mais moderno. Validamos uma nova direção via mockups no navegador (companion de brainstorming) e, ao revisar o dashboard completo, veio uma segunda observação importante: não bastava trocar cor — as seções abaixo dos cartões de topo (Ganhos por categoria, Tempo de cadeira, Indicadores, Prospecção) sempre foram texto solto empilhado (`<p>` sem estrutura), o que parecia "sistema não finalizado". Esta spec **substitui** a `2026-08-11-identidade-visual-design.md` — a direção "Clássica" (fundo escuro, dourado, serifada) deixa de valer.

## Decisões de escopo (confirmadas com o usuário via mockups)

- **Nova paleta: "SaaS Clean"** — fundo claro, verde-esmeralda como única cor de destaque, tipografia sans-serif o tempo todo (sem fonte serifada de marca — remove o `font-heading`/Playfair Display introduzido na v1).
- **Toda seção de estatísticas vira um `Card` com título**, não texto solto — vale pro app inteiro (dashboards de admin e barbeiro, e qualquer tela equivalente), não só a home.
- **Espaçamento generoso**: primeira versão do mockup ficou "apertada demais" e foi rejeitada — cartões com padding grande (24px), números grandes, respiro entre linhas. Densidade baixa é intencional, não desperdício de espaço.
- **"Ganhos por categoria" vira barra proporcional** por categoria (mesmo padrão visual que a ficha do cliente já usa em "mais usados por ele" — reaproveita uma convenção existente em vez de inventar uma nova), com a comissão em um selo (pill) verde-claro bem visível ao lado do valor total — é o número mais relevante pro dia a dia do barbeiro.
- **"Tempo de cadeira" ganha 3 dados de contexto**: clientes atendidos no mês (número já calculado hoje, só exposto de novo aqui), ganho médio por hora ocupada (já existia), e a estimativa de valor perdido agora vem acompanhada de uma estimativa de **quantos atendimentos** caberiam no tempo ocioso — decisão confirmada: usa a **duração média real dos atendimentos do barbeiro no período** (minutos ocupados ÷ quantidade de atendimentos), não a duração de um serviço específico fixo.
- **Fora de escopo, explicitamente adiado**: detalhamento de "Ganhos por categoria" por serviço individual (não só Serviços vs Produtos agregado) e um ranking comparando quais serviços cada barbeiro mais/menos realiza. Isso é uma funcionalidade nova (consultas agregadas novas, decisões de produto próprias — visão por barbeiro vs cross-barbeiro, período, etc.) e vai virar seu próprio ciclo spec→plano quando for a vez.

## Paleta

Substitui os tokens de `globals.css` introduzidos na v1 (remove o tema escuro por completo — o app não tem alternância de tema).

```
--background:          #f8f9fb
--foreground:          #111827
--card:                #ffffff
--card-foreground:     #111827
--popover:              #ffffff
--popover-foreground:  #111827
--primary:             #0ea472   /* verde-esmeralda — única cor de destaque */
--primary-foreground:  #ffffff
--secondary:           #f1f2f4
--secondary-foreground:#111827
--muted:               #f1f2f4
--muted-foreground:    #6b7280
--accent:              #f1f2f4
--accent-foreground:   #111827
--destructive:         #dc2626   /* vermelho — ações destrutivas, valores negativos */
--border:              #e5e7eb
--input:               #e5e7eb
--ring:                #0ea472
--radius:              0.625rem  /* mantém — já dava cantos moderados, não precisa mudar */
```

Cor extra para o segundo segmento de "Ganhos por categoria" (Produtos), usada só ali, não vira token global: `#6366f1` (indigo), evitando que as duas barras (Serviços/Produtos) fiquem com a mesma cor e percam contraste entre si.

`src/app/icon.svg` (favicon, criado na v1 com fundo preto/dourado) é atualizado pra combinar com a paleta nova: fundo `#0ea472` (verde primário), texto "SF" em branco — mesmo formato/tamanho de antes, só troca as duas cores.

## Tipografia

Remove inteiramente o mecanismo de fonte de marca da v1 (`Playfair_Display`, `--font-heading` apontando pra ela, a classe `font-heading` usada em títulos por todo o app). Volta a usar só `Geist Sans` (já carregado) em tudo — títulos ficam `font-bold`/`font-semibold` no tamanho maior, sem trocar de família tipográfica. `next/font/google` perde o import de `Playfair_Display`.

## Cartões e cor por seção — convenções

- **Cartão de indicador (KPI)** (`Faturamento do mês`, `Comissão do mês`, etc.): label pequeno maiúsculo cinza (`text-muted-foreground`, `text-xs uppercase`) + valor grande em negrito na cor primária (`text-primary`, `text-2xl font-bold` ou maior). Um `Card`/`CardContent` por indicador, em grid de 3 colunas.
- **Cartão de seção** (`Ganhos por categoria`, `Tempo de cadeira`, `Indicadores de agendamento`, `Prospecção`, e equivalentes): um único `Card` com um título (`CardHeader`/`CardTitle` ou um `<p>` de título estilizado, `text-base font-bold`) e o conteúdo estruturado dentro — nunca `<p>` soltos fora de um `Card`.
- **"Ganhos por categoria"**: por categoria, uma linha com nome à esquerda e, à direita, o valor total (`font-bold`) seguido do selo de comissão (pill: `bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-3 py-1 text-sm font-bold`, com um rótulo pequeno "comissão" em maiúsculas dentro do próprio selo). Abaixo, uma barra fina (`h-2 rounded-full bg-muted`) preenchida na cor da categoria, com largura proporcional ao valor da categoria sobre o total das categorias mostradas (ex.: serviços 74%, produtos 26% do total combinado).
- **"Tempo de cadeira"**: percentual grande (`text-3xl font-bold text-primary`) e rótulo "ocupado no mês" no topo; abaixo, uma barra alta (`h-7`, não a `h-6`/`h-2` fina de outras barras — precisa de altura pra caber o texto do percentual dentro, alinhado à direita da parte preenchida, em branco); abaixo da barra, uma grade de 3 colunas: Clientes atendidos, Ganho médio por hora ocupada, Estimativa perdida no mês (esta com uma sub-linha vermelha menor `≈ N atendimentos` abaixo do valor em R$).
- **Grades de indicadores** (`Indicadores de agendamento`, `Prospecção`): dentro do `Card` da seção, uma grade de N colunas (uma por indicador: Total/Realizados/Não compareceram/Cancelados/Remarcados = 5; Prospectados/Convertidos/Não convertidos/Faturamento gerado = 4), cada célula com o número grande centralizado (`text-2xl font-bold`) e o rótulo pequeno embaixo (`text-xs text-muted-foreground`), com espaçamento generoso entre células (`gap-5`, padding vertical na célula).
- **Tabelas de cadastro** (serviços/produtos/planos/barbeiros/relatório de prospecção — já usam o componente `Table` desde a v1): sem mudança estrutural, só herdam a nova paleta clara automaticamente via tokens. Ações de linha ("Editar"→`text-primary`, "Desativar"→`text-destructive`) continuam com o mesmo padrão semântico, agora em verde/vermelho sobre fundo claro.
- **Agenda**: sem mudança estrutural (mantém o grid de horários já existente da v1), só herda a paleta clara. O aviso de conflito de horário (`border-primary/40 bg-primary/10` na v1) passa a ler como um aviso verde-claro sobre fundo branco — mantém a mesma lógica de cor (token `primary`), só muda o valor de fundo por trás do token.

## Lógica nova — "clientes atendidos" e "atendimentos perdidos estimados"

Ambos os números só aparecem no dashboard do **barbeiro** (`/painel`) — o dashboard do admin não tem um cartão de "Tempo de cadeira" por barbeiro individual hoje (só a coluna "Ocupação" na tabela geral), e isso não muda nesta spec.

- **Clientes atendidos**: já é o valor `realizados` que o dashboard do barbeiro já calcula (`agendamentosMes?.filter(a => a.status === 'realizado').length`) — só precisa ser exibido de novo dentro do cartão "Tempo de cadeira", não é uma consulta nova.
- **Atendimentos perdidos estimados**: `src/lib/ociosidade.ts`'s `calcularOciosidade()` ganha um parâmetro novo, `quantidadeAtendimentos: number` (contagem de linhas de `atendimentos` no período — já disponível em `painel/page.tsx` como `atendimentos?.length`), e retorna um campo novo, `atendimentosPerdidosEstimado: number`, calculado como:
  ```
  duracaoMediaMinutos = quantidadeAtendimentos > 0 ? minutosOcupados / quantidadeAtendimentos : 0
  atendimentosPerdidosEstimado = duracaoMediaMinutos > 0 ? Math.round(minutosOciosos / duracaoMediaMinutos) : 0
  ```
  (mesma variável `minutosOciosos` que a função já calcula internamente pra `valorPerdidoEstimado` — só precisa ser reaproveitada, não recalculada.)

## Testes

`calcularOciosidade()` ganha um caso de teste novo em `tests/unit/ociosidade.test.ts` (arquivo já existe, 2 testes hoje) cobrindo `atendimentosPerdidosEstimado` — inclusive o caso `quantidadeAtendimentos === 0` (sem divisão por zero). Fora isso, sem lógica de banco nova — o resto é restyle puro. Verificação via `npm run build` + `npm test` + passada visual manual (dashboards de admin e barbeiro, tabelas de cadastro, agenda, ficha do cliente, página pública) — se houver acesso a navegador na hora da implementação, usar; senão, documentar a limitação como já aconteceu na v1.
