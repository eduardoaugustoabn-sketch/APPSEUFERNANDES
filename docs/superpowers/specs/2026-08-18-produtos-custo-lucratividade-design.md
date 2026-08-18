# Produtos: custo e lucratividade — Design Spec

## Contexto e objetivo

Este é o Fase 1 de um pedido maior — "Sistema de Gestão — Produtos, Estoque, Custo e Lucratividade" — que na íntegra cobre cálculo de lucro/margem, dois dashboards (painel individual e visão geral), integração estoque+lucratividade, histórico de alterações de preço, relatório financeiro completo e ranking de produtos por lucro. Dado o tamanho, o trabalho foi fatiado em fases; este spec cobre só a Fase 1: garantir que todo produto tenha um custo de aquisição rastreável, calcular lucro e margem automaticamente, e mostrar Faturamento de Produtos separado do Lucro de Produtos onde o faturamento já aparece hoje (painel do barbeiro). As fases seguintes (estoque+lucratividade, histórico de preço exibido, relatório financeiro completo, ranking por lucro, painel comparativo de admin) ficam para specs futuros.

Levantamento do código atual mostrou dois pontos importantes:

1. `produtos.preco_custo` **já existe** no banco desde a migração original (`0002_catalogo.sql`), mas nunca foi usado em lugar nenhum — não está no formulário de criar/editar produto, não é lido, não é exibido. Está sempre em `0` (default da coluna) para todo produto já cadastrado.
2. `vendas_produtos` **não guarda o custo no momento da venda** — só o preço de venda é "congelado" na linha (via o trigger `processar_venda_produto()`), o mesmo padrão que já congela a comissão aplicada. Sem congelar o custo também, o lucro de uma venda já realizada mudaria retroativamente se o preço de compra do produto for editado depois — exatamente a distorção que o pedido original quer evitar (seção 12 do pedido).

## Modelo de dados

Nenhuma coluna nova em `produtos` — `preco_custo` já existe e passa a ser preenchida de verdade pela UI (Fase 1, seção seguinte).

```sql
alter table vendas_produtos add column custo_unitario numeric(10,2);
```

Nullable — vendas já registradas antes desta migração ficam com `custo_unitario` nulo (não há como recuperar retroativamente o custo real da época). Vendas novas sempre recebem o valor via trigger.

`processar_venda_produto()` (em `supabase/migrations/0007_lancamentos.sql`) é reescrita para também ler e congelar o custo, no mesmo padrão que já usa para `preco_unitario`:

```sql
create or replace function public.processar_venda_produto()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_percentual numeric;
  v_estoque int;
  v_preco numeric;
  v_custo numeric;
begin
  select quantidade_estoque, preco_venda, preco_custo into v_estoque, v_preco, v_custo
  from produtos where id = new.produto_id and barbearia_id = new.barbearia_id for update;
  if v_estoque is null then
    raise exception 'Produto inválido para esta barbearia';
  end if;
  if v_estoque < new.quantidade then
    raise exception 'Estoque insuficiente para este produto';
  end if;

  update produtos set quantidade_estoque = quantidade_estoque - new.quantidade where id = new.produto_id;

  new.preco_unitario := v_preco;
  new.custo_unitario := v_custo;

  select pc.percentual_produto into v_percentual
  from membros m join planos_carreira pc on pc.id = m.plano_carreira_id
  where m.id = new.membro_id;

  new.comissao_percentual_aplicado := coalesce(v_percentual, 0);
  new.comissao_valor := round(new.preco_unitario * new.quantidade * coalesce(v_percentual, 0) / 100, 2);
  return new;
end;
$$;
```

Nenhuma mudança de RLS — `vendas_produtos` e `produtos` já têm policies de SELECT/UPDATE que cobrem a tabela inteira, não colunas específicas.

## Captura na UI (admin)

`src/app/admin/produtos/page.tsx` (criação) e `src/components/produto-row.tsx` (edição inline) ganham um campo "Preço de compra" ao lado do "Preço de venda" que já existe — mesmo `<Input type="number" step="0.01">`, mesmo posicionamento relativo. Produtos já cadastrados continuam com custo `R$ 0,00` até serem editados manualmente — mesmo padrão adotado nesta sessão para outros campos novos (o admin revisa no próprio ritmo, nada trava o uso do sistema enquanto isso).

O campo não é obrigatório no formulário (evita travar o cadastro de um produto cujo custo ainda não se sabe), mas fica lado a lado com "Preço de venda" para deixar claro que é esperado preenchê-lo.

## Cálculo

Lucro unitário e margem são derivados, não armazenados:

```
lucro_unitario = preco_venda - custo_unitario
margem = preco_venda > 0 ? round(lucro_unitario / preco_venda * 100) : 0
```

Para o agregado do mês (painel do barbeiro), cada venda contribui:

```
custo_da_venda = (venda.custo_unitario ?? venda.produto.preco_custo ?? 0) * venda.quantidade
```

O fallback para `venda.produto.preco_custo` (custo atual do produto) só se aplica a vendas registradas antes desta migração, que não têm `custo_unitario` próprio — é uma estimativa, não o custo real da época, e é a melhor informação disponível sem introduzir uma tabela de histórico de preço completa (fora de escopo desta fase).

## Exibição no painel do barbeiro

`src/app/painel/page.tsx`, dentro do Card "Ganhos por categoria" já existente, no bloco "Produtos" (que hoje mostra faturamento + badge de comissão), acrescenta dois badges no mesmo estilo visual do badge de comissão já existente:

- **Custo** — `R$ {custoProdutos.toFixed(2)}`, estilo neutro (`bg-muted text-muted-foreground`).
- **Lucro** — `R$ {lucroProdutos.toFixed(2)}`, estilo destacado em verde (`bg-emerald-500/10 text-emerald-600 border-emerald-500/30`) para diferenciar visualmente de faturamento (que já usa a cor primária) e comissão.

`lucroProdutos = faturamentoProdutos - custoProdutos` (nunca armazenado, sempre derivado dos dois valores já calculados).

A separação visual entre Faturamento (cor primária, já existe) e Lucro (verde, novo) é intencional — ecoa a regra do pedido original: "o sistema NÃO deve tratar o valor total da venda do produto como lucro."

## Casos de borda

- Produto com `preco_custo` ainda em `0` (nunca editado) → lucro calculado = faturamento inteiro (margem 100%). É um número enganoso, mas é o comportamento esperado até o admin preencher o custo real — não há como o sistema distinguir "produto genuinamente de custo zero" de "custo nunca informado".
- Venda com `preco_venda` do produto em `0` → margem retorna `0` (guarda de divisão por zero), nunca `NaN`.
- Venda antiga sem `custo_unitario` (pré-migração) → usa o `preco_custo` atual do produto como estimativa (ver seção Cálculo). Se o produto foi excluído... não é possível: `vendas_produtos.produto_id` referencia `produtos(id)` sem `on delete cascade`, então um produto com histórico de vendas nunca pode ser removido (só desativado via `ativo`) — o join nunca falha por produto ausente.

## Testes

- **pgTAP:** nenhuma policy de RLS nova é necessária. Cobertura nova em `processar_venda_produto()`: uma venda inserida congela `custo_unitario` igual ao `preco_custo` do produto no momento da inserção; alterar `preco_custo` do produto depois não muda o `custo_unitario` já gravado em vendas passadas (mesmo padrão de asserção já usado para `comissao_percentual_aplicado` não mudar retroativamente).
- **Build:** `npm run build` sem erros de tipo.
- **Manual (se navegador disponível):** cadastrar um produto com custo R$ 20 e venda R$ 25, registrar uma venda de 10 unidades, confirmar no `/painel` que o bloco Produtos mostra Faturamento R$ 250, Custo R$ 200, Lucro R$ 50. Editar o custo do produto pra R$ 22 e confirmar que a venda já registrada continua mostrando R$ 200 de custo no cálculo do mês (não R$ 220) — a prova de que o congelamento funciona.

## Fora de escopo (explicitamente adiado para fases futuras)

- Dashboard geral (visão da gestão, não do barbeiro individual) com Faturamento/Custo/Lucro/Margem Média agregados da barbearia inteira (seções 7-8 do pedido original).
- Tabela de desempenho por produto e drill-down individual (seções 9-10).
- Integração estoque + lucratividade — valor investido em estoque, lucro potencial do estoque (seção 11).
- Exibição de histórico de alterações de preço (seção 12) — esta fase já resolve o problema de fundo (congelar custo na venda), mas não cria nenhuma tela ou registro de "quando o preço mudou de X para Y".
- Relatório financeiro de produtos e ranking por lucro (seções 13-14) — `/admin/ranking` continua mostrando só quantidade/faturamento por enquanto.
- Nomenclatura "lucro líquido" — todo indicador desta fase é "lucro bruto/comercial", nunca líquido, seguindo a observação explícita do pedido original (seção 16); nenhuma despesa (impostos, taxas, frete) é descontada.
