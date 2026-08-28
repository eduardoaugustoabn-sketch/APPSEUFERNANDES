# Status de Clientes, Dono do Cadastro e Ranking de Ativos — Design Spec

## Contexto e objetivo

Hoje qualquer barbeiro vê a lista completa de clientes da barbearia (`/painel/clientes` não filtra por quem atendeu quem), e não existe nenhum sinal de "esse cliente está sumindo, precisa reagendar". O admin quer: (1) cada barbeiro ver só a lista dos clientes que ele mesmo cadastrou (sem travar o atendimento de um cliente de outro barbeiro, só a listagem), (2) um status visual (verde/amarelo/vermelho) baseado em há quantos dias o cliente não vem, com prazo configurável por cliente, (3) um aviso de "já tem agendamento futuro" pra não recontatar quem já remarcou, e (4) um ranking no admin mostrando quantos clientes de cada barbeiro estão em cada status.

## Decisões de escopo (validadas com o usuário)

- **"Dono" é quem cadastrou primeiro, não quem atende por último.** Novo campo opcional `clientes.cadastrado_por_membro_id`, gravado só na criação (nunca sobrescrito num "encontra ou cria" de telefone repetido).
- **Clientes já existentes ficam sem dono** — sem inferência retroativa a partir do histórico de atendimentos. Só aparecem na lista "meus clientes" de alguém depois que alguém os cadastrar de novo (o que não vai acontecer, já existem) ou o admin atribuir manualmente.
- **A restrição é só na listagem, nunca no atendimento.** Um barbeiro continua podendo buscar, agendar e atender qualquer cliente da barbearia — a busca por telefone, o agendamento público e a prospecção continuam barbearia-inteira. Quando o barbeiro reconhece/seleciona um cliente que já tem outro dono, aparece um aviso não-bloqueante: "Este cliente já é atendido por {nome}". Admin pode reatribuir o dono manualmente na ficha do cliente (a policy de update já permite qualquer membro editar qualquer cliente da barbearia — só a UI de reatribuição fica visível só pro admin).
- **Status calculado a partir do último atendimento *realizado*** (`max(atendimentos.data)`), não da data de cadastro nem do próximo agendamento. Cliente sem nenhum atendimento ainda não tem status (não apareceu pra ser atendido, não faz sentido cobrar prazo de retorno).
- **Prazo padrão: 12 dias.** Verde até o prazo, amarelo nos 3 dias seguintes, vermelho depois disso. Cada cliente pode ter um prazo próprio: 7, 10, 15 ou 30 dias, com a mesma janela de 3 dias de amarelo em qualquer um desses.
- **"Já remarcou"**: indicador quando o cliente tem um agendamento futuro (`data >= hoje`, status ≠ `cancelado`) — não precisa de campo novo, é derivado da tabela `agendamentos` já existente.
- **Campo de observação já existe** (`clientes.observacao`, editável desde `0021_cliente_observacao_update.sql`) — só precisa aparecer também na listagem, não só na ficha.
- **Ranking (admin)**: por barbeiro, contagem de clientes em cada status (verde/amarelo/vermelho), ordenado por verde (clientes em dia) — mas mostrando as três contagens, não só verde. Entra como uma seção nova na página `/admin/ranking` já existente (mesmo tema: rankings do mês/atuais).

## Modelo de dados (nova migration)

```sql
alter table clientes add column cadastrado_por_membro_id uuid references membros(id);
alter table clientes add column prazo_retorno_dias int check (prazo_retorno_dias is null or prazo_retorno_dias in (7, 10, 15, 30));

-- p_membro_id é opcional (default null) pra não quebrar nenhuma chamada
-- existente que ainda não foi atualizada — mas todo call site relevante
-- (Task 3) passa a mandar o membro atual. cadastrado_por_membro_id só é
-- gravado no INSERT (o "encontra ou cria" nunca reatribui dono numa
-- atualização de conflito — "dono" é sempre quem cadastrou primeiro).
drop function if exists public.criar_ou_obter_cliente(uuid, text, text, date, text, text, text);

create or replace function public.criar_ou_obter_cliente(
  p_barbearia_id uuid, p_nome text, p_telefone text, p_data_nascimento date default null,
  p_bairro text default null, p_cidade text default null, p_categoria_origem text default null,
  p_membro_id uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_cliente_id uuid;
  v_telefone text;
  v_foi_criado boolean;
begin
  if not exists (select 1 from barbearias where id = p_barbearia_id) then
    raise exception 'Barbearia inválida';
  end if;

  v_telefone := regexp_replace(p_telefone, '\D', '', 'g');

  insert into clientes (barbearia_id, nome, telefone, data_nascimento, bairro, cidade, categoria_origem, cadastrado_por_membro_id)
  values (p_barbearia_id, p_nome, v_telefone, p_data_nascimento, p_bairro, p_cidade, p_categoria_origem, p_membro_id)
  on conflict (barbearia_id, telefone)
  do update set
    nome = excluded.nome,
    data_nascimento = coalesce(clientes.data_nascimento, excluded.data_nascimento),
    bairro = coalesce(clientes.bairro, excluded.bairro),
    cidade = coalesce(clientes.cidade, excluded.cidade),
    categoria_origem = coalesce(clientes.categoria_origem, excluded.categoria_origem)
  returning id, (xmax = 0) into v_cliente_id, v_foi_criado;

  if v_foi_criado and p_categoria_origem is null then
    raise exception 'Categoria de origem é obrigatória para clientes novos.';
  end if;

  return v_cliente_id;
end;
$$;

grant execute on function public.criar_ou_obter_cliente(uuid, text, text, date, text, text, text, uuid) to anon, authenticated;

-- Encaminha o barbeiro escolhido no agendamento público como dono do
-- cadastro, se o cliente for novo.
drop function if exists public.criar_agendamento_publico(uuid, uuid, uuid, date, time, text, text, text, text, text);

create or replace function public.criar_agendamento_publico(
  p_barbearia_id uuid, p_membro_id uuid, p_servico_id uuid,
  p_data date, p_hora_inicio time, p_nome_cliente text, p_telefone_cliente text,
  p_bairro text default null, p_cidade text default null, p_categoria_origem text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_duracao int;
  v_cliente_id uuid;
  v_agendamento_id uuid;
  v_hora_fim time;
begin
  if not exists (
    select 1 from membros m
    where m.id = p_membro_id and m.barbearia_id = p_barbearia_id and m.papel = 'barbeiro' and m.ativo
  ) then
    raise exception 'Barbeiro inválido para esta barbearia';
  end if;

  select duracao_minutos into v_duracao from servicos where id = p_servico_id and barbearia_id = p_barbearia_id;
  if v_duracao is null then
    raise exception 'Serviço inválido para esta barbearia';
  end if;

  if p_data < current_date then
    raise exception 'Não é possível agendar em uma data passada';
  end if;

  v_hora_fim := p_hora_inicio + (v_duracao || ' minutes')::interval;

  if exists (
    select 1 from agendamentos a
    where a.membro_id = p_membro_id and a.data = p_data and a.status <> 'cancelado'
      and p_hora_inicio < a.hora_fim and v_hora_fim > a.hora_inicio
  ) then
    raise exception 'Esse horário acabou de ser reservado por outra pessoa. Escolha outro horário.';
  end if;

  v_cliente_id := criar_ou_obter_cliente(p_barbearia_id, p_nome_cliente, p_telefone_cliente, null, p_bairro, p_cidade, p_categoria_origem, p_membro_id);

  insert into agendamentos (barbearia_id, membro_id, cliente_id, servico_id, data, hora_inicio, hora_fim, status, origem)
  values (
    p_barbearia_id, p_membro_id, v_cliente_id, p_servico_id, p_data, p_hora_inicio, v_hora_fim, 'agendado', 'publico'
  )
  returning id into v_agendamento_id;

  return v_agendamento_id;
end;
$$;

grant execute on function public.criar_agendamento_publico(uuid, uuid, uuid, date, time, text, text, text, text, text) to anon, authenticated;

-- Busca por telefone (usada por ClienteAutocomplete e TelefoneClienteBusca)
-- passa a informar quem já é o dono do cliente encontrado, pro chamador
-- decidir se mostra o aviso "já atendido por X".
drop function if exists public.buscar_clientes_por_telefone(text);

create or replace function public.buscar_clientes_por_telefone(p_busca text)
returns table(
  id uuid, nome text, telefone text, total_cortes int,
  data_nascimento date, bairro text, cidade text,
  cadastrado_por_membro_id uuid, cadastrado_por_nome text
)
language sql security definer set search_path = public as $$
  select
    c.id, c.nome, c.telefone,
    (select count(*)::int from atendimentos a where a.cliente_id = c.id) as total_cortes,
    c.data_nascimento, c.bairro, c.cidade,
    c.cadastrado_por_membro_id, m.nome as cadastrado_por_nome
  from clientes c
  left join membros m on m.id = c.cadastrado_por_membro_id
  where c.barbearia_id = auth_barbearia_id()
    and length(regexp_replace(p_busca, '\D', '', 'g')) >= 4
    and c.telefone like '%' || regexp_replace(p_busca, '\D', '', 'g') || '%'
  order by c.nome
  limit 10;
$$;

revoke all on function public.buscar_clientes_por_telefone(text) from public, anon;
grant execute on function public.buscar_clientes_por_telefone(text) to authenticated;

-- Cliente + status de retorno, reaproveitada pela listagem (filtrada por
-- dono quando p_membro_id é passado) e pelo ranking do admin (sem filtro,
-- agrupando por cadastrado_por_membro_id no lado do app).
--
-- PRECISA ser security definer: a policy de leitura de atendimentos
-- restringe um barbeiro a "membro_id = auth_membro_id()" (só os próprios
-- atendimentos, ver 0007_lancamentos.sql) — mas "dias sem vir" tem que
-- refletir a última vez que o cliente veio com QUALQUER barbeiro (ex.: o
-- dono está de férias e outro barbeiro cobriu o atendimento), não só com
-- o dono. Sem security definer, o cálculo de dias_sem_vir feito pelo
-- dono ignoraria silenciosamente atendimentos de outros barbeiros nesse
-- mesmo cliente. Por isso valida o tenant manualmente (auth_barbearia_id())
-- em vez de depender da RLS de atendimentos pra isso.
create or replace function public.clientes_com_status(p_barbearia_id uuid, p_membro_id uuid default null)
returns table(
  id uuid, nome text, telefone text, cidade text, observacao text,
  cadastrado_por_membro_id uuid, cadastrado_por_nome text,
  prazo_retorno_dias int, dias_sem_vir int, status text,
  tem_agendamento_futuro boolean
)
language sql security definer set search_path = public as $$
  select
    c.id, c.nome, c.telefone, c.cidade, c.observacao,
    c.cadastrado_por_membro_id, m.nome as cadastrado_por_nome,
    coalesce(c.prazo_retorno_dias, 12) as prazo_retorno_dias,
    (current_date - u.ultima_vinda) as dias_sem_vir,
    case
      when u.ultima_vinda is null then null
      when (current_date - u.ultima_vinda) <= coalesce(c.prazo_retorno_dias, 12) then 'verde'
      when (current_date - u.ultima_vinda) <= coalesce(c.prazo_retorno_dias, 12) + 3 then 'amarelo'
      else 'vermelho'
    end as status,
    exists (
      select 1 from agendamentos a
      where a.cliente_id = c.id and a.data >= current_date and a.status <> 'cancelado'
    ) as tem_agendamento_futuro
  from clientes c
  left join membros m on m.id = c.cadastrado_por_membro_id
  left join lateral (
    select max(a.data) as ultima_vinda from atendimentos a where a.cliente_id = c.id
  ) u on true
  where c.barbearia_id = p_barbearia_id
    and p_barbearia_id = auth_barbearia_id()
    and (p_membro_id is null or c.cadastrado_por_membro_id = p_membro_id)
  order by c.nome;
$$;

grant execute on function public.clientes_com_status(uuid, uuid) to authenticated;
```

## Frontend: propagar `p_membro_id` na criação de cliente

Todo call site de `criar_ou_obter_cliente` que já tem um `membroId`/`membro.id` em escopo passa a mandar `p_membro_id`:
- `src/components/agendar-slot-form.tsx`
- `src/components/atender-agora-form.tsx`
- `src/components/lancamento-form.tsx`
- `src/components/venda-loja-form.tsx`
- `src/app/painel/prospeccao/page.tsx` (server action `novoContato`, já tem `membro.id`)

`src/components/public-booking-flow.tsx` não muda — chama `criar_agendamento_publico`, que já encaminha `p_membro_id` internamente (o barbeiro escolhido no agendamento público vira o dono do cliente novo).

## Aviso "já atendido por outro barbeiro"

`ClienteAutocomplete` (`src/components/cliente-autocomplete.tsx`) ganha uma prop opcional `meuMembroId?: string`. Ao selecionar um resultado da busca (`selecionar()`), se `cliente.cadastrado_por_membro_id` existir e for diferente de `meuMembroId`, mostra um aviso inline (texto pequeno, cor âmbar) abaixo do campo de telefone: `Este cliente já é atendido por {cadastrado_por_nome}.` Isso é só informativo — não bloqueia nada do fluxo.

Os 4 consumidores de `ClienteAutocomplete` (`agendar-slot-form.tsx`, `atender-agora-form.tsx`, `lancamento-form.tsx`, `venda-loja-form.tsx`) passam `meuMembroId={membroId}` (já têm esse valor em escopo).

`TelefoneClienteBusca` (`src/components/telefone-cliente-busca.tsx`, usado só na prospecção) ganha o mesmo tratamento — prop `meuMembroId`, aviso ao selecionar — e `src/app/painel/prospeccao/page.tsx` passa `meuMembroId={membro.id}`.

## `/painel/clientes` e `/admin/clientes`: listagem com status

Ambas as páginas trocam a query direta em `clientes` pela RPC `clientes_com_status`:
- `/painel/clientes`: `clientes_com_status(barbearia_id, membro.id)` — só os próprios clientes.
- `/admin/clientes`: `clientes_com_status(barbearia_id, null)` — todos.

`ListaClientes` (`src/components/lista-clientes.tsx`) ganha os campos novos no tipo `Cliente` e exibe, por linha: um ponto colorido (verde/amarelo/vermelho/cinza-sem-status) com o número de dias sem vir, um selo "já remarcou" quando `tem_agendamento_futuro`, e a `observacao` (truncada) se houver. Na visão do admin (que já mostra clientes de vários donos), mostra também `cadastrado_por_nome` quando presente.

## `FichaCliente` / `EditarClienteForm`: prazo de retorno e reatribuição de dono

`ficha-cliente.tsx` passa a buscar também `cadastrado_por_membro_id`, `prazo_retorno_dias`, `status`/`dias_sem_vir` (via `clientes_com_status` filtrado por um único cliente, ou uma query direta equivalente) e o próprio papel/membro do usuário logado (`getServerSupabaseClient()` + `auth.getUser()` + lookup em `membros`, o mesmo padrão já usado em toda página desse app). Mostra o status no topo da ficha. Se o usuário logado é barbeiro e não é o dono do cliente, mostra o mesmo aviso "já atendido por X". Se é admin, mostra um `<Select>` pra reatribuir `cadastrado_por_membro_id` (lista de barbeiros ativos da barbearia) — a policy de update já permite (`membros atualizam clientes da barbearia`, sem distinção de papel), só a visibilidade do controle é admin-only.

`EditarClienteForm` ganha um `<Select>` "Prazo médio de retorno" com as opções: `Padrão (12 dias)` (value vazio → grava `null`), `7 dias`, `10 dias`, `15 dias`, `30 dias`.

## `/admin/ranking`: seção "Clientes ativos"

Nova seção na página `/admin/ranking` já existente (mesmo tema — rankings), usando `clientes_com_status(barbearia_id, null)` e agrupando no client/server component por `cadastrado_por_membro_id`, contando quantos clientes de cada barbeiro caem em cada status. Tabela: `Barbeiro | Verde | Amarelo | Vermelho`, ordenada por Verde decrescente. Clientes sem dono (`cadastrado_por_membro_id is null`) não entram em nenhuma linha — não pertencem a nenhum barbeiro ainda.

## Fora de escopo (explicitamente adiado)

- Nenhuma notificação push/e-mail/WhatsApp automática pro cliente vermelho — só o indicador visual na lista e na ficha.
- Reatribuição em massa de clientes antigos sem dono — fica manual, um de cada vez, na ficha do cliente.
- Filtro por status (mostrar só os vermelhos, por exemplo) na listagem — a spec só pede exibir o status, não filtrar por ele. Pode ser um ajuste rápido depois se fizer falta.

## Testes

- **pgTAP**: `criar_ou_obter_cliente` grava `cadastrado_por_membro_id` só na criação, nunca sobrescreve num "encontra" repetido; `clientes_com_status` calcula `dias_sem_vir`/`status` corretamente pros três prazos (padrão 12 e um customizado, ex. 7); `tem_agendamento_futuro` reflete um agendamento não cancelado com `data >= hoje`; RLS de leitura da RPC continua barbearia-scoped (um membro de outra barbearia não vê nada).
- **Build**: `npm run build` sem erros de tipo.
- **Manual (navegador)**: cadastrar um cliente novo como barbeiro A, confirmar que só aparece na lista de A (não na de outro barbeiro B), mas B consegue buscar e atender esse cliente normalmente (com o aviso aparecendo). Simular um atendimento antigo (editar a data de um atendimento existente pra mais de 15 dias atrás) e confirmar que o cliente fica vermelho na lista e na ficha. Trocar o prazo de retorno de um cliente pra 7 dias e confirmar que o corte de cores muda de acordo. Agendar uma visita futura pro cliente e confirmar que aparece o selo "já remarcou". Como admin, abrir `/admin/clientes`, ver todos os clientes com o nome de quem cadastrou, reatribuir o dono de um cliente e confirmar que ele passa a aparecer na lista do novo dono. Abrir `/admin/ranking` e conferir a seção "Clientes ativos" com as três contagens por barbeiro.
