# Ranking de serviços e produtos por barbeiro — Design

## Contexto

Feature pedida durante o brainstorm do redesign visual (2026-08-11) e explicitamente adiada até o visual ficar pronto — ver spec `2026-08-11-visual-saas-clean-design.md`. Hoje "Ganhos por categoria" no painel do barbeiro só separa Serviços (tudo junto) de Produtos, sem detalhar quais serviços/produtos específicos foram vendidos nem quanto de cada. O admin não tem nenhuma visão comparando o que cada barbeiro da equipe está vendendo mais ou menos.

## Decisões de escopo (confirmadas com o usuário)

- **`servicos` ganha um campo `tipo`** (`'corte'` ou `'servico_extra'`), definido pelo admin no cadastro/edição do serviço — é a única forma confiável de separar "corte" de "serviço extra", já que hoje não existe essa distinção em lugar nenhum do schema.
- **Serviços já cadastrados entram como `'corte'` por padrão** na migration — o admin precisa recategorizar manualmente os que na verdade são serviço extra (ex: Barba, Sobrancelha), usando a edição de serviço já existente em `/admin/servicos`.
- **Painel do barbeiro (`/painel`)**: "Ganhos por categoria" passa de 2 para 3 categorias (Cortes, Serviços extras, Produtos), cada uma com o detalhamento por item individual (nome, quantidade, valor) — não só o agregado.
- **Nova página `/admin/ranking`**: para cada serviço e produto ativo, lista todos os barbeiros da barbearia ordenados por quantidade vendida no mês — incluindo quem fez zero, para que fique visível quem não está vendendo aquele item (era o pedido original: "saber qual serviço cada barbeiro não está fazendo").
- **Período**: mês corrente, mesmo padrão usado em todo o resto do sistema (nenhuma tela hoje tem seletor de período).

## Banco de dados

Nova migration (próximo número disponível em `supabase/migrations/`):

```sql
alter table servicos
  add column tipo text not null default 'corte' check (tipo in ('corte', 'servico_extra'));
```

Sem RLS nova — `servicos` já tem suas policies de leitura/escrita, `tipo` é só mais uma coluna.

## `/admin/servicos` — categorização

O formulário de criação (`criarServico`) e o `ServicoRow` (edição inline) ganham um `<select>` de `tipo` — `Corte` / `Serviço extra` — ao lado dos campos já existentes (nome, duração, preço). Segue o mesmo padrão de `<select>` já usado em outros formulários do projeto (ex: categoria de produto).

## `/painel` — "Ganhos por categoria" detalhado

Estrutura atual (spec `2026-08-11-visual-saas-clean-design.md`): duas barras proporcionais (Serviços vs Produtos) com pill de comissão. Passa a ser três barras — **Cortes**, **Serviços extras**, **Produtos** — mesma convenção visual (barra fina proporcional, pill de comissão ao lado do valor total).

Abaixo de cada barra, uma lista com o detalhamento por item daquela categoria no mês, ordenada por valor decrescente:

```
Cortes — R$ 840,00 [comissão R$ 168,00]
▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░ 62%
  Corte Masculino — 18x — R$ 720,00
  Corte Infantil — 4x — R$ 120,00

Serviços extras — R$ 180,00 [comissão R$ 36,00]
▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░ 13%
  Barba — 9x — R$ 135,00
  Sobrancelha — 3x — R$ 45,00

Produtos — R$ 340,00 [comissão R$ 68,00]
▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░░░░░░░░ 25%
  Pomada — 6x — R$ 210,00
  Óleo de barba — 4x — R$ 130,00
```

Consulta nova: `atendimentos` do mês do membro logado, com join em `servicos(nome, tipo)` (hoje a query só traz `preco, comissao_valor`, precisa trazer `servico_id` e o nome/tipo do serviço) — agrupado em memória (JS) por `servico_id`, contando quantidade e somando `preco`. Mesma ideia para `vendas_produtos`, agrupando por `produto_id` com join em `produtos(nome)`.

## `/admin/ranking` — nova página

Nova entrada de menu "Ranking" em `src/app/admin/layout.tsx` (`NAV_ITEMS`), entre "Barbeiros" e "Prospecção".

Estrutura: uma seção por item do catálogo (serviços ativos primeiro, agrupados por `tipo` — Cortes, depois Serviços extras —, depois produtos ativos), cada uma um `Card` com título = nome do item, e dentro uma lista de barbeiros ordenada por quantidade decrescente no mês:

```
Corte Masculino
  1. João — 22x
  2. Pedro — 15x
  3. Carlos — 0x
```

Todo barbeiro ativo da barbearia aparece em toda lista, mesmo com 0 — é o que torna visível quem não está vendendo aquele item. Consulta: para serviços, `atendimentos` do mês da barbearia toda, join `servicos(nome, tipo)` e `membros(nome)`, agrupado por `(servico_id, membro_id)`; barbeiros sem nenhuma linha para aquele serviço entram como 0 (produto cartesiano serviços ativos × barbeiros ativos, preenchido com a contagem real ou 0). Mesma lógica para produtos com `vendas_produtos`.

## Fora de escopo

- Redefinir "corte" vs "extra" automaticamente por IA/heurística — é sempre escolha manual do admin.
- Ranking com período customizável (semana, trimestre, etc.) — fica fixo no mês corrente, como o resto do sistema.
- Ranking de faturamento (R$) por serviço — o pedido foi especificamente por quantidade ("o que está vendendo mais"), não valor. Quantidade já implica o que é mais popular; valor pode ser adicionado depois se pedido.

## Testes

Sem lógica de cálculo isolada nova (agregação simples por `reduce`, sem função pura equivalente a `calcularOciosidade`) — verificação via `npm run build` + passada manual (categorizar um serviço como extra, lançar alguns atendimentos/vendas variados entre 2+ barbeiros, conferir que o painel de cada barbeiro mostra o detalhamento certo e que `/admin/ranking` reflete a distribuição real, inclusive um barbeiro com 0 num item que o outro vendeu).
