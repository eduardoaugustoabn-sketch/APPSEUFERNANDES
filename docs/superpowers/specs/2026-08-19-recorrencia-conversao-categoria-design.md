# Recorrência e Conversão por Categoria — Design Spec

## Contexto e objetivo

Este é a Fase 2 de "Sistema de Gestão — Categorias de Atendimento e Indicadores de Performance". A Fase 1 (já em produção) entregou a captura da categoria de cada serviço (`servicos.categoria_servico`), a classificação automática de cada visita (Só Cabelo / Só Barba / Cabelo+Barba) e, no `/painel` do barbeiro, um card de distribuição e o Índice de Público-Alvo — tudo escopado ao **mês corrente**.

Esta fase entrega três indicadores que exigem olhar o **histórico completo** do cliente, não só o mês:

1. **Recorrência por categoria** — dentre os clientes que já fizeram uma visita de cada categoria, quantos voltaram a fazer o mesmo tipo de serviço.
2. **Conversão para categoria-alvo** — dentre os clientes que começaram como Só Cabelo ou Só Barba, quantos evoluíram pra Cabelo+Barba em algum momento.
3. **Oportunidade de conversão** — quantos clientes hoje ainda não são Cabelo+Barba (baseado na visita mais recente), com o potencial de conversão que representam.

As fases seguintes (alertas inteligentes, diagnóstico automático em texto, painel comparativo entre barbeiros para o admin) dependem destes números existirem primeiro — ficam para a Fase 3.

## Decisões de escopo (validadas com o usuário)

- **Por barbeiro, não por barbearia**: os três indicadores olham só as visitas do cliente com aquele barbeiro específico — não todas as visitas do cliente na barbearia. Um cliente que troca de barbeiro não conta como "recorrente" ou "convertido" para o barbeiro anterior.
- **Sem janela de tempo**: "recorrência" e "conversão" olham o histórico completo do cliente com aquele barbeiro, desde sempre — não há um prazo tipo "voltou em 60 dias". O pedido original não especifica um prazo, e uma janela adicionaria complexidade não pedida.

## Modelo de dados e arquitetura

Nenhuma tabela ou coluna nova. Uma função SQL nova, `indicadores_recorrencia_conversao(p_membro_id uuid)`, no mesmo padrão de `ranking_cliente` (`supabase/migrations/0010_ficha_cliente.sql`) — `language sql stable`, sem `security definer`, contando com as policies de RLS já existentes em `atendimentos` (`barbeiro le proprios atendimentos` / `admin le atendimentos da barbearia`) para escopar os dados: se alguém passar um `p_membro_id` que não é o seu, a policy de RLS simplesmente não retorna nenhuma linha — não é uma superfície de segurança nova.

Calcular isso em JavaScript (buscando todo o histórico de atendimentos do barbeiro pro navegador, como a Fase 1 faz para o mês) foi descartado: ao contrário da Fase 1, aqui não há limite de mês — depois de meses/anos de operação a consulta cresceria sem necessidade. A função SQL filtra e soma no banco, devolvendo só os números finais.

```sql
create or replace function public.indicadores_recorrencia_conversao(p_membro_id uuid)
returns table(
  recorrencia_so_cabelo numeric,
  recorrencia_so_barba numeric,
  recorrencia_cabelo_barba numeric,
  recorrencia_total numeric,
  conversao_categoria_alvo numeric,
  clientes_fora_alvo int,
  clientes_so_cabelo int,
  clientes_so_barba int,
  potencial_conversao numeric
)
language sql stable as $$
  with visitas as (
    select
      a.cliente_id,
      a.agendamento_id,
      min(a.data) as data_visita,
      bool_or(s.categoria_servico = 'cabelo') as tem_cabelo,
      bool_or(s.categoria_servico = 'barba') as tem_barba
    from atendimentos a
    join servicos s on s.id = a.servico_id
    where a.membro_id = p_membro_id and a.agendamento_id is not null
    group by a.cliente_id, a.agendamento_id
  ),
  visitas_classificadas as (
    select
      cliente_id, data_visita,
      case
        when tem_cabelo and tem_barba then 'cabelo_barba'
        when tem_cabelo then 'so_cabelo'
        when tem_barba then 'so_barba'
        else null
      end as categoria
    from visitas
  ),
  visitas_validas as (
    select * from visitas_classificadas where categoria is not null
  ),
  por_cliente as (
    select
      cliente_id,
      count(*) filter (where categoria = 'so_cabelo') as n_so_cabelo,
      count(*) filter (where categoria = 'so_barba') as n_so_barba,
      count(*) filter (where categoria = 'cabelo_barba') as n_cabelo_barba,
      count(*) as n_total,
      (array_agg(categoria order by data_visita asc))[1] as primeira_categoria,
      bool_or(categoria = 'cabelo_barba') as teve_cabelo_barba,
      (array_agg(categoria order by data_visita desc))[1] as categoria_mais_recente
    from visitas_validas
    group by cliente_id
  )
  select
    round(100.0 * count(*) filter (where n_so_cabelo >= 2) / nullif(count(*) filter (where n_so_cabelo >= 1), 0), 0) as recorrencia_so_cabelo,
    round(100.0 * count(*) filter (where n_so_barba >= 2) / nullif(count(*) filter (where n_so_barba >= 1), 0), 0) as recorrencia_so_barba,
    round(100.0 * count(*) filter (where n_cabelo_barba >= 2) / nullif(count(*) filter (where n_cabelo_barba >= 1), 0), 0) as recorrencia_cabelo_barba,
    round(100.0 * count(*) filter (where n_total >= 2) / nullif(count(*), 0), 0) as recorrencia_total,
    round(100.0 * count(*) filter (where primeira_categoria in ('so_cabelo', 'so_barba') and teve_cabelo_barba)
      / nullif(count(*) filter (where primeira_categoria in ('so_cabelo', 'so_barba')), 0), 0) as conversao_categoria_alvo,
    count(*) filter (where categoria_mais_recente in ('so_cabelo', 'so_barba'))::int as clientes_fora_alvo,
    count(*) filter (where categoria_mais_recente = 'so_cabelo')::int as clientes_so_cabelo,
    count(*) filter (where categoria_mais_recente = 'so_barba')::int as clientes_so_barba,
    round(100.0 * count(*) filter (where categoria_mais_recente in ('so_cabelo', 'so_barba')) / nullif(count(*), 0), 0) as potencial_conversao
  from por_cliente;
$$;

grant execute on function public.indicadores_recorrencia_conversao(uuid) to authenticated;
```

**Definições, em português:**

- **Visita** = mesma unidade da Fase 1: um `agendamento_id`, com a categoria decidida pelos serviços presentes nele (ignorando `outro`). Uma visita sem `cabelo` nem `barba` classificáveis não entra em `visitas_validas`.
- **Recorrência (por categoria X)** = % de clientes que tiveram 2+ visitas da categoria X, dentre os clientes que tiveram pelo menos 1 visita da categoria X. Um cliente com só 1 visita `so_cabelo` conta no denominador mas não no numerador.
- **Recorrência Total** = % de clientes com 2+ visitas classificáveis (de qualquer categoria, contadas juntas), dentre todos os clientes com pelo menos 1 visita classificável.
- **Conversão para categoria-alvo** = % de clientes cuja primeira visita (cronologicamente) foi `so_cabelo` ou `so_barba` que, em algum momento depois (ou na mesma primeira visita — ver Casos de borda), tiveram uma visita `cabelo_barba`.
- **Oportunidade de conversão** = clientes cuja visita **mais recente** é `so_cabelo` ou `so_barba` (ainda não convertidos). `potencial_conversao` é isso como % do total de clientes classificáveis daquele barbeiro.

## Captura na UI (painel do barbeiro)

`src/app/painel/page.tsx` ganha uma chamada nova a `supabase.rpc('indicadores_recorrencia_conversao', { p_membro_id: membro!.id })`, e um Card novo, logo abaixo do Card "Perfil dos clientes atendidos (mês)" já existente da Fase 1. Título do Card: **"Recorrência e Conversão (histórico completo)"** — o "(histórico completo)" é deliberado, para deixar claro que esse card não é mensal como todo o resto da página acima dele.

Conteúdo do Card, em duas seções:

- **Recorrência**: quatro números lado a lado (grid, mesmo padrão de "Indicadores de agendamento (mês)") — Só Cabelo, Só Barba, Cabelo+Barba, Total — cada um como `{valor}%`.
- **Conversão e oportunidade**: Conversão para categoria-alvo em destaque (`{valor}%`), e um bloco "Fora do público-alvo hoje" com Só Cabelo (contagem), Só Barba (contagem), e Potencial de conversão (`{valor}%`).

## Casos de borda

- Barbeiro sem nenhum cliente com visita classificável ainda (novo, ou só atendeu clientes com serviços `outro`) → todos os campos `numeric` voltam `null` da função (divisão por zero via `nullif`). O front-end trata `null` como `0` na exibição (mesmo padrão de robustez das fases anteriores), nunca `NaN`/quebra de render.
- Cliente cuja única visita já é `cabelo_barba` → `primeira_categoria = 'cabelo_barba'`, não entra no denominador de conversão (ele nunca esteve "fora do alvo" pra converter) — nem no numerador. Correto: ele já nasceu público-alvo, não é uma conversão.
- Cliente cuja primeira visita já é `cabelo_barba` mas nunca mais voltou → não conta pra recorrência de nenhuma categoria específica além de `cabelo_barba` (com `n_cabelo_barba = 1`, fica no denominador de recorrência daquela categoria mas não no numerador, já que precisa de 2+).
- Cliente com exatamente uma visita `so_cabelo` seguida de uma visita `cabelo_barba` (2 visitas, mesma pessoa) → conta como convertido (`teve_cabelo_barba = true`) e também conta no denominador de recorrência de `so_cabelo` (mas não no numerador, só 1 visita `so_cabelo`) — os dois indicadores são independentes por design, um cliente pode aparecer em ambos.

## Testes

- **pgTAP**: novo arquivo `supabase/tests/database/00XX_indicadores_recorrencia_conversao.test.sql` (número seguinte disponível a checar no momento do plano). Casos: (a) cliente com 2 visitas `so_cabelo` conta como recorrente em Só Cabelo; (b) cliente com 1 visita `so_cabelo` não conta como recorrente, mas entra no denominador; (c) cliente que começou `so_barba` e depois teve `cabelo_barba` conta como convertido; (d) cliente cuja primeira visita já foi `cabelo_barba` não entra no denominador de conversão; (e) cliente cuja visita mais recente é `so_cabelo` aparece em `clientes_fora_alvo`/`clientes_so_cabelo`; (f) visitas de um barbeiro diferente (mesmo cliente) não vazam pro cálculo do primeiro barbeiro — prova o escopo "por carteira"; (g) barbeiro sem nenhuma visita classificável retorna todos os campos `null`, sem erro.
- **Build**: `npm run build` sem erros de tipo.
- **Manual (se navegador disponível)**: um cliente com 3 visitas ao mesmo barbeiro — 1ª Só Cabelo, 2ª Só Cabelo (recorrência), 3ª Cabelo+Barba (conversão) — confirmar que o card mostra Recorrência Só Cabelo refletindo esse cliente, Conversão para categoria-alvo refletindo a conversão, e que ele NÃO aparece mais em "fora do público-alvo" (sua visita mais recente já é Cabelo+Barba).

## Fora de escopo (explicitamente adiado para a Fase 3)

- Alertas inteligentes (os 4 tipos do pedido original) — dependem destes números.
- Diagnóstico automático em texto no painel do barbeiro.
- Painel comparativo entre todos os barbeiros para o admin (visão geral da gestão).
- Qualquer relação com ocupação/faturamento/ticket médio (seção 8 do pedido original) — cruzar esses indicadores com os de recorrência/conversão fica para quando os alertas forem desenhados.
