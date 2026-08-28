# Status de Clientes, Dono do Cadastro e Ranking de Ativos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada barbeiro vê só a lista dos clientes que ele cadastrou (sem travar atendimento de cliente de outro barbeiro), um status verde/amarelo/vermelho baseado em dias sem vir (prazo configurável por cliente), um aviso de "já tem agendamento futuro", e um ranking no admin com a contagem de clientes em cada status por barbeiro.

**Architecture:** Duas colunas novas em `clientes` (`cadastrado_por_membro_id`, `prazo_retorno_dias`), uma nova RPC `clientes_com_status` (security definer, pra ver status calculado a partir de atendimentos de QUALQUER barbeiro, não só os próprios) que alimenta tanto a listagem quanto o ranking, e duas RPCs existentes (`criar_ou_obter_cliente`, `buscar_clientes_por_telefone`) ganham parâmetros/colunas novas. No frontend, `ClienteAutocomplete`/`TelefoneClienteBusca` ganham um aviso de "já atendido por outro barbeiro", os 5 call sites que criam cliente passam a informar quem está criando, e as telas de clientes/ficha/ranking passam a exibir o status.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS v4, shadcn/ui, Supabase (Postgres + RLS + pgTAP).

**Spec:** `docs/superpowers/specs/2026-08-27-status-clientes-e-dono-design.md`

## Global Constraints

- **A restrição de "só meus clientes" é só na listagem** (`/painel/clientes`) — busca, agendamento e atendimento continuam barbearia-inteira pra qualquer barbeiro. Nunca adicionar um filtro de dono em `ClienteAutocomplete`, `TelefoneClienteBusca`, `AgendarSlotForm`, `LancamentoForm`, `AtenderAgoraForm`, `VendaLojaForm` ou no agendamento público.
- **"Dono" é gravado só na criação, nunca sobrescrito** — um "encontra ou cria" repetido pro mesmo telefone nunca muda `cadastrado_por_membro_id` de um cliente que já tem dono.
- **Clientes antigos ficam sem dono** — nenhuma migration de backfill nesta feature.
- **Status vem sempre de `atendimentos.data` (visita realizada), nunca de `agendamentos` ou da data de cadastro.** Cliente sem nenhum atendimento não tem status (mostra "sem status", não um vermelho por padrão).
- **Prazo: padrão 12 dias; por cliente pode ser 7, 10, 15 ou 30 — sempre com 3 dias de janela amarela** (verde até o prazo, amarelo prazo+1 até prazo+3, vermelho depois).
- **`clientes_com_status` é `security definer`** com verificação explícita `p_barbearia_id = auth_barbearia_id()` — nunca remover essa checagem (ver comentário na spec: sem isso, sem security definer, um barbeiro só enxergaria atendimentos próprios pra calcular dias_sem_vir, dando um resultado errado pra clientes atendidos por outro barbeiro em algum momento).

---

### Task 1: Migration (dono, prazo, `clientes_com_status`, RPCs atualizadas) + pgTAP

**Files:**
- Create: `supabase/migrations/0036_clientes_dono_status.sql`
- Create: `supabase/tests/database/0021_clientes_dono_status.test.sql`

**Interfaces:**
- Produces: `clientes.cadastrado_por_membro_id`, `clientes.prazo_retorno_dias`; `criar_ou_obter_cliente(..., p_membro_id uuid default null)` (novo parâmetro, mesma posição = último); `criar_agendamento_publico` (mesma assinatura, só encaminha o membro internamente); `buscar_clientes_por_telefone` retorna `cadastrado_por_membro_id, cadastrado_por_nome` a mais; `clientes_com_status(p_barbearia_id uuid, p_membro_id uuid default null)`. Usadas por todas as tasks seguintes.

- [ ] **Step 1: Criar `supabase/migrations/0036_clientes_dono_status.sql`**

```sql
alter table clientes add column cadastrado_por_membro_id uuid references membros(id);
alter table clientes add column prazo_retorno_dias int check (prazo_retorno_dias is null or prazo_retorno_dias in (7, 10, 15, 30));

-- p_membro_id é opcional (default null) — cadastrado_por_membro_id só é
-- gravado no INSERT; o "encontra ou cria" nunca reatribui dono numa
-- atualização de conflito (dono é sempre quem cadastrou primeiro).
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

  if p_categoria_origem is not null and p_categoria_origem not in ('indicacao', 'redes_sociais', 'google_internet', 'passou_na_rua', 'outro') then
    raise exception 'Categoria de origem inválida.';
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

-- Busca por telefone (ClienteAutocomplete/TelefoneClienteBusca) passa a
-- informar quem já é o dono do cliente encontrado.
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

- [ ] **Step 2: Criar `supabase/tests/database/0021_clientes_dono_status.test.sql`**

```sql
begin;
select plan(9);

insert into barbearias (id, nome, slug) values
  ('11111111-1111-1111-1111-111111111111', 'Barbearia A', 'barbearia-a'),
  ('22222222-2222-2222-2222-222222222222', 'Barbearia B', 'barbearia-b');

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'joao@example.com'),
  ('cccccccc-0000-0000-0000-000000000003', 'marcos@example.com'),
  ('dddddddd-0000-0000-0000-000000000004', 'outra@example.com');

insert into membros (id, barbearia_id, user_id, papel, nome) values
  ('a1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'barbeiro', 'João'),
  ('a1000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'cccccccc-0000-0000-0000-000000000003', 'barbeiro', 'Marcos'),
  ('a1000000-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222222', 'dddddddd-0000-0000-0000-000000000004', 'barbeiro', 'DeOutraBarbearia');

insert into servicos (id, barbearia_id, nome, duracao_minutos, preco) values
  ('b1000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Corte', 40, 60);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);

-- João cadastra o cliente Um.
select criar_ou_obter_cliente('11111111-1111-1111-1111-111111111111', 'Cliente Um', '11900000001', null, null, null, 'indicacao', 'a1000000-0000-0000-0000-000000000001');

select is(
  (select cadastrado_por_membro_id from clientes where telefone = '11900000001'),
  'a1000000-0000-0000-0000-000000000001'::uuid,
  'cadastrado_por_membro_id is stamped with the creating membro'
);

-- Marcos "encontra" o mesmo telefone depois — dono não muda.
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', true);
select criar_ou_obter_cliente('11111111-1111-1111-1111-111111111111', 'Cliente Um', '11900000001', null, null, null, 'indicacao', 'a1000000-0000-0000-0000-000000000003');

select is(
  (select cadastrado_por_membro_id from clientes where telefone = '11900000001'),
  'a1000000-0000-0000-0000-000000000001'::uuid,
  'cadastrado_por_membro_id is never reassigned on a repeat find-or-create for the same phone'
);

-- Cliente Verde: atendimento há 10 dias (prazo padrão 12).
select criar_ou_obter_cliente('11111111-1111-1111-1111-111111111111', 'Cliente Verde', '11900000002', null, null, null, 'indicacao', 'a1000000-0000-0000-0000-000000000001');
insert into atendimentos (barbearia_id, membro_id, cliente_id, servico_id, preco, data) values
  ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', (select id from clientes where telefone = '11900000002'), 'b1000000-0000-0000-0000-000000000001', 60, current_date - 10);

-- Cliente Amarelo: atendimento há 14 dias (prazo padrão 12 -> janela 13-15).
select criar_ou_obter_cliente('11111111-1111-1111-1111-111111111111', 'Cliente Amarelo', '11900000003', null, null, null, 'indicacao', 'a1000000-0000-0000-0000-000000000001');
insert into atendimentos (barbearia_id, membro_id, cliente_id, servico_id, preco, data) values
  ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', (select id from clientes where telefone = '11900000003'), 'b1000000-0000-0000-0000-000000000001', 60, current_date - 14);

-- Cliente Vermelho: atendimento há 20 dias.
select criar_ou_obter_cliente('11111111-1111-1111-1111-111111111111', 'Cliente Vermelho', '11900000004', null, null, null, 'indicacao', 'a1000000-0000-0000-0000-000000000001');
insert into atendimentos (barbearia_id, membro_id, cliente_id, servico_id, preco, data) values
  ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', (select id from clientes where telefone = '11900000004'), 'b1000000-0000-0000-0000-000000000001', 60, current_date - 20);

-- Cliente com prazo customizado de 7 dias: atendimento há 8 dias -> amarelo (prazo 7, janela 8-10), não verde.
select criar_ou_obter_cliente('11111111-1111-1111-1111-111111111111', 'Cliente PrazoCurto', '11900000005', null, null, null, 'indicacao', 'a1000000-0000-0000-0000-000000000001');
update clientes set prazo_retorno_dias = 7 where telefone = '11900000005';
insert into atendimentos (barbearia_id, membro_id, cliente_id, servico_id, preco, data) values
  ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', (select id from clientes where telefone = '11900000005'), 'b1000000-0000-0000-0000-000000000001', 60, current_date - 8);

-- Cliente sem nenhum atendimento -> sem status.
select criar_ou_obter_cliente('11111111-1111-1111-1111-111111111111', 'Cliente SemVisita', '11900000006', null, null, null, 'indicacao', 'a1000000-0000-0000-0000-000000000001');

select is(
  (select status from clientes_com_status('11111111-1111-1111-1111-111111111111') where telefone = '11900000002'),
  'verde',
  'client seen 10 days ago is verde under the default 12-day prazo'
);

select is(
  (select status from clientes_com_status('11111111-1111-1111-1111-111111111111') where telefone = '11900000003'),
  'amarelo',
  'client seen 14 days ago is amarelo under the default 12-day prazo (13-15 window)'
);

select is(
  (select status from clientes_com_status('11111111-1111-1111-1111-111111111111') where telefone = '11900000004'),
  'vermelho',
  'client seen 20 days ago is vermelho under the default 12-day prazo'
);

select is(
  (select status from clientes_com_status('11111111-1111-1111-1111-111111111111') where telefone = '11900000005'),
  'amarelo',
  'client with a custom 7-day prazo seen 8 days ago is amarelo (7-day window: verde<=7, amarelo 8-10)'
);

select is(
  (select status from clientes_com_status('11111111-1111-1111-1111-111111111111') where telefone = '11900000006'),
  null,
  'client with zero atendimentos has no status'
);

-- Agendamento futuro confirmado -> tem_agendamento_futuro true.
insert into agendamentos (barbearia_id, membro_id, cliente_id, servico_id, data, hora_inicio, hora_fim, status, origem) values
  ('11111111-1111-1111-1111-111111111111', 'a1000000-0000-0000-0000-000000000001', (select id from clientes where telefone = '11900000004'), 'b1000000-0000-0000-0000-000000000001', current_date + 3, '10:00', '10:40', 'confirmado', 'interno');

select is(
  (select tem_agendamento_futuro from clientes_com_status('11111111-1111-1111-1111-111111111111') where telefone = '11900000004'),
  true,
  'tem_agendamento_futuro is true when the client has a future non-cancelled agendamento'
);

-- Tenant isolation: membro de outra barbearia não consegue ler os clientes da Barbearia A passando o barbearia_id dela.
select set_config('request.jwt.claim.sub', 'dddddddd-0000-0000-0000-000000000004', true);

select is(
  (select count(*)::int from clientes_com_status('11111111-1111-1111-1111-111111111111')),
  0,
  'clientes_com_status returns nothing when called with a barbearia_id that is not the caller''s own tenant'
);

select * from finish();
rollback;
```

- [ ] **Step 3: Verificação**

Run: `npx supabase db reset` (aplica as migrations do zero, incluindo esta) e depois `npx supabase test db`.
Expected: `Result: PASS`, todos os arquivos incluindo `0021_clientes_dono_status.test.sql` com as 9 asserções passando. (O CLI funciona via `npx supabase`, não como comando direto no PATH — ver memória `feedback_supabase_cli_via_npx` — e há uma stack local do Docker já rodando.)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0036_clientes_dono_status.sql supabase/tests/database/0021_clientes_dono_status.test.sql
git commit -m "feat: add client ownership, return-status RPC, and dono-aware RPCs"
```

---

### Task 2: Aviso de "já atendido por outro barbeiro" em `ClienteAutocomplete`/`TelefoneClienteBusca`

**Files:**
- Modify: `src/components/cliente-autocomplete.tsx`
- Modify: `src/components/telefone-cliente-busca.tsx`

**Interfaces:**
- Consumes: `buscar_clientes_por_telefone` (Task 1), agora retornando `cadastrado_por_membro_id`/`cadastrado_por_nome`.
- Produces: `ClienteAutocomplete` ganha uma prop opcional `meuMembroId?: string`; `TelefoneClienteBusca` ganha a mesma prop. Nenhuma outra prop/interface muda. Usado por Task 3.

- [ ] **Step 1: Reescrever `src/components/cliente-autocomplete.tsx`**

Substituir o arquivo inteiro por (idêntico ao original, com: `ResultadoBusca` ganha `cadastrado_por_membro_id`/`cadastrado_por_nome`; a função recebe a prop nova `meuMembroId?: string`; estado novo `donoAtual` guarda o aviso pra mostrar; `selecionar()` seta esse estado; um aviso aparece logo abaixo do campo de telefone quando há dono diferente do `meuMembroId`; editar manualmente o telefone limpa o aviso, igual já acontece com `reconhecidoRef`):

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { CATEGORIAS_ORIGEM, type CategoriaOrigem } from '@/lib/categorias-origem'
import { Select } from '@/components/ui/select'

type ResultadoBusca = {
  id: string
  nome: string
  telefone: string
  total_cortes: number
  data_nascimento: string | null
  bairro: string | null
  cidade: string | null
  cadastrado_por_membro_id: string | null
  cadastrado_por_nome: string | null
}

export function ClienteAutocomplete({
  onResolved, valorInicial, meuMembroId,
}: {
  onResolved: (info: {
    nome: string; telefone: string; totalCortes: number; reconhecido: boolean
    dataNascimento?: string; bairro?: string; cidade?: string; categoriaOrigem?: CategoriaOrigem
  }) => void
  valorInicial?: { nome: string; telefone: string }
  meuMembroId?: string
}) {
  const [nome, setNome] = useState(valorInicial?.nome ?? '')
  const [telefone, setTelefone] = useState(valorInicial?.telefone ?? '')
  const [dataNascimento, setDataNascimento] = useState('')
  const [bairro, setBairro] = useState('')
  const [cidade, setCidade] = useState('')
  const [categoriaOrigem, setCategoriaOrigem] = useState<CategoriaOrigem | ''>('')
  const [resultados, setResultados] = useState<ResultadoBusca[]>([])
  const [mostrarLista, setMostrarLista] = useState(false)
  const [donoAtual, setDonoAtual] = useState<string | null>(null)
  // Refs (not just state) so onResolved always reads the latest value
  // regardless of render timing.
  const nomeRef = useRef(valorInicial?.nome ?? '')
  const telefoneRef = useRef(valorInicial?.telefone ?? '')
  const dataNascimentoRef = useRef('')
  const bairroRef = useRef('')
  const cidadeRef = useRef('')
  const categoriaOrigemRef = useRef<CategoriaOrigem | ''>('')
  // Pré-preenchido via valorInicial (aberto a partir de um agendamento já
  // existente) e selecionado da lista de sugestões são as duas únicas
  // formas de saber que é um cliente já cadastrado — nos dois casos a
  // categoria de origem não é obrigatória. Qualquer edição manual do
  // telefone depois disso volta a marcar como não reconhecido, porque não
  // há mais garantia de que o telefone digitado é o mesmo cliente.
  const reconhecidoRef = useRef(!!valorInicial)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const buscaSeqRef = useRef(0)

  // Report the pre-filled value once on mount, so the parent (e.g.
  // LancamentoForm opened from an existing agendamento) has it immediately
  // instead of only after the user types something.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (valorInicial) onResolved({ nome: valorInicial.nome, telefone: valorInicial.telefone, totalCortes: 0, reconhecido: true })
  }, [])

  function handleNomeChange(value: string) {
    nomeRef.current = value
    setNome(value)
    onResolved({
      nome: value, telefone: telefoneRef.current, totalCortes: 0, reconhecido: reconhecidoRef.current,
      dataNascimento: dataNascimentoRef.current || undefined,
      bairro: bairroRef.current || undefined, cidade: cidadeRef.current || undefined,
      categoriaOrigem: categoriaOrigemRef.current || undefined,
    })
  }

  function handleDataNascimentoChange(value: string) {
    dataNascimentoRef.current = value
    setDataNascimento(value)
    onResolved({
      nome: nomeRef.current, telefone: telefoneRef.current, totalCortes: 0, reconhecido: reconhecidoRef.current,
      dataNascimento: value || undefined,
      bairro: bairroRef.current || undefined, cidade: cidadeRef.current || undefined,
      categoriaOrigem: categoriaOrigemRef.current || undefined,
    })
  }

  function handleBairroChange(value: string) {
    bairroRef.current = value
    setBairro(value)
    onResolved({
      nome: nomeRef.current, telefone: telefoneRef.current, totalCortes: 0, reconhecido: reconhecidoRef.current,
      dataNascimento: dataNascimentoRef.current || undefined,
      bairro: value || undefined, cidade: cidadeRef.current || undefined,
      categoriaOrigem: categoriaOrigemRef.current || undefined,
    })
  }

  function handleCidadeChange(value: string) {
    cidadeRef.current = value
    setCidade(value)
    onResolved({
      nome: nomeRef.current, telefone: telefoneRef.current, totalCortes: 0, reconhecido: reconhecidoRef.current,
      dataNascimento: dataNascimentoRef.current || undefined,
      bairro: bairroRef.current || undefined, cidade: value || undefined,
      categoriaOrigem: categoriaOrigemRef.current || undefined,
    })
  }

  function handleCategoriaOrigemChange(value: string) {
    const categoria = value as CategoriaOrigem | ''
    categoriaOrigemRef.current = categoria
    setCategoriaOrigem(categoria)
    onResolved({
      nome: nomeRef.current, telefone: telefoneRef.current, totalCortes: 0, reconhecido: reconhecidoRef.current,
      dataNascimento: dataNascimentoRef.current || undefined,
      bairro: bairroRef.current || undefined, cidade: cidadeRef.current || undefined,
      categoriaOrigem: categoria || undefined,
    })
  }

  function verificar(tel: string) {
    telefoneRef.current = tel
    setTelefone(tel)
    reconhecidoRef.current = false
    setDonoAtual(null)
    const seq = ++buscaSeqRef.current
    // Resolve synchronously with the raw typed value first — the caller
    // (LancamentoForm's salvar()) reads whatever onResolved last reported,
    // and buscar_clientes_por_telefone below is an async, debounced
    // network round-trip. Without this synchronous resolve, a click on
    // "Salvar" landing before the debounce/round-trip completes would
    // submit with an empty/stale telefone.
    onResolved({
      nome: nomeRef.current, telefone: tel, totalCortes: 0, reconhecido: false,
      dataNascimento: dataNascimentoRef.current || undefined,
      bairro: bairroRef.current || undefined, cidade: cidadeRef.current || undefined,
      categoriaOrigem: categoriaOrigemRef.current || undefined,
    })

    if (debounceRef.current) clearTimeout(debounceRef.current)

    const digitos = tel.replace(/\D/g, '')
    if (digitos.length < 4) {
      setResultados([])
      setMostrarLista(false)
      return
    }

    debounceRef.current = setTimeout(async () => {
      const supabase = getBrowserSupabaseClient()
      const { data: rows } = await supabase.rpc('buscar_clientes_por_telefone', { p_busca: tel })
      if (seq !== buscaSeqRef.current) return
      setResultados(rows ?? [])
      setMostrarLista((rows ?? []).length > 0)
    }, 300)
  }

  function selecionar(cliente: ResultadoBusca) {
    nomeRef.current = cliente.nome
    telefoneRef.current = cliente.telefone
    dataNascimentoRef.current = cliente.data_nascimento ?? ''
    bairroRef.current = cliente.bairro ?? ''
    cidadeRef.current = cliente.cidade ?? ''
    reconhecidoRef.current = true
    setNome(cliente.nome)
    setTelefone(cliente.telefone)
    setDataNascimento(cliente.data_nascimento ?? '')
    setBairro(cliente.bairro ?? '')
    setCidade(cliente.cidade ?? '')
    setMostrarLista(false)
    setResultados([])
    setDonoAtual(
      cliente.cadastrado_por_membro_id && cliente.cadastrado_por_membro_id !== meuMembroId
        ? cliente.cadastrado_por_nome
        : null
    )
    onResolved({
      nome: cliente.nome, telefone: cliente.telefone, totalCortes: cliente.total_cortes, reconhecido: true,
      dataNascimento: cliente.data_nascimento ?? undefined,
      bairro: cliente.bairro ?? undefined, cidade: cliente.cidade ?? undefined,
      categoriaOrigem: categoriaOrigemRef.current || undefined,
    })
  }

  return (
    <div className="flex flex-col gap-2.5">
      <Input placeholder="Nome do cliente" value={nome} onChange={(e) => handleNomeChange(e.target.value)} />
      <div className="relative">
        <Input
          placeholder="Telefone"
          value={telefone}
          onChange={(e) => verificar(e.target.value)}
          onBlur={() => setMostrarLista(false)}
        />
        {mostrarLista && resultados.length > 0 && (
          <div className="absolute z-10 w-full mt-1.5 bg-card border border-border rounded-2xl shadow-[0_1px_2px_rgba(20,32,27,0.04)] max-h-48 overflow-y-auto">
            {resultados.map((r) => (
              <button
                key={r.id}
                type="button"
                onMouseDown={() => selecionar(r)}
                className="w-full text-left px-3.5 py-2.5 text-[13.5px] hover:bg-muted border-b border-muted last:border-b-0"
              >
                {r.nome} · {r.telefone} · {r.total_cortes}º corte aqui
              </button>
            ))}
          </div>
        )}
      </div>
      {donoAtual && (
        <p className="text-[12.5px] text-amber-text bg-amber-tint rounded-xl px-3 py-2">
          Este cliente já é atendido por {donoAtual}.
        </p>
      )}
      <Input type="date" placeholder="Data de nascimento (opcional)" value={dataNascimento} onChange={(e) => handleDataNascimentoChange(e.target.value)} />
      <Input placeholder="Bairro (opcional)" value={bairro} onChange={(e) => handleBairroChange(e.target.value)} />
      <Input placeholder="Cidade (opcional)" value={cidade} onChange={(e) => handleCidadeChange(e.target.value)} />
      <Select
        value={categoriaOrigem}
        onChange={(e) => handleCategoriaOrigemChange(e.target.value)}
      >
        <option value="">Como conheceu a barbearia?</option>
        {CATEGORIAS_ORIGEM.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
      </Select>
    </div>
  )
}
```

- [ ] **Step 2: Reescrever `src/components/telefone-cliente-busca.tsx`**

Substituir o arquivo inteiro por (mesmo tratamento: `ResultadoBusca` ganha os 2 campos, prop `meuMembroId?: string`, aviso ao selecionar):

```tsx
'use client'

import { useRef, useState } from 'react'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { CATEGORIAS_ORIGEM } from '@/lib/categorias-origem'

type ResultadoBusca = {
  id: string
  nome: string
  telefone: string
  total_cortes: number
  data_nascimento: string | null
  bairro: string | null
  cidade: string | null
  cadastrado_por_membro_id: string | null
  cadastrado_por_nome: string | null
}

// Não reaproveita ClienteAutocomplete de propósito — esta tela tem seu
// próprio formulário inline via Server Action (novoContato), sem o
// callback onResolved que ClienteAutocomplete usa pra reportar mudanças
// pro componente pai. Os campos aqui postam direto pelo <form> nativo,
// via os atributos name.
export function TelefoneClienteBusca({ meuMembroId }: { meuMembroId?: string }) {
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [bairro, setBairro] = useState('')
  const [cidade, setCidade] = useState('')
  const [resultados, setResultados] = useState<ResultadoBusca[]>([])
  const [mostrarLista, setMostrarLista] = useState(false)
  const [donoAtual, setDonoAtual] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const buscaSeqRef = useRef(0)

  function verificar(tel: string) {
    setTelefone(tel)
    setDonoAtual(null)
    const seq = ++buscaSeqRef.current

    if (debounceRef.current) clearTimeout(debounceRef.current)

    const digitos = tel.replace(/\D/g, '')
    if (digitos.length < 4) {
      setResultados([])
      setMostrarLista(false)
      return
    }

    debounceRef.current = setTimeout(async () => {
      const supabase = getBrowserSupabaseClient()
      const { data: rows } = await supabase.rpc('buscar_clientes_por_telefone', { p_busca: tel })
      if (seq !== buscaSeqRef.current) return
      setResultados(rows ?? [])
      setMostrarLista((rows ?? []).length > 0)
    }, 300)
  }

  function selecionar(cliente: ResultadoBusca) {
    setNome(cliente.nome)
    setTelefone(cliente.telefone)
    setBairro(cliente.bairro ?? '')
    setCidade(cliente.cidade ?? '')
    setMostrarLista(false)
    setResultados([])
    setDonoAtual(
      cliente.cadastrado_por_membro_id && cliente.cadastrado_por_membro_id !== meuMembroId
        ? cliente.cadastrado_por_nome
        : null
    )
  }

  return (
    <>
      <Input name="nome" placeholder="Nome" required value={nome} onChange={(e) => setNome(e.target.value)} className="w-40" />
      <div className="relative">
        <Input
          name="telefone"
          placeholder="Telefone"
          required
          value={telefone}
          onChange={(e) => verificar(e.target.value)}
          onBlur={() => setMostrarLista(false)}
          className="w-40"
        />
        {mostrarLista && resultados.length > 0 && (
          <div className="absolute z-10 w-full mt-1 bg-card border rounded-lg shadow-md max-h-48 overflow-y-auto">
            {resultados.map((r) => (
              <button
                key={r.id}
                type="button"
                onMouseDown={() => selecionar(r)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-muted border-b last:border-b-0"
              >
                {r.nome} · {r.telefone} · {r.total_cortes}º corte aqui
              </button>
            ))}
          </div>
        )}
      </div>
      {donoAtual && (
        <p className="text-[12.5px] text-amber-text bg-amber-tint rounded-xl px-3 py-2 w-full">
          Este cliente já é atendido por {donoAtual}.
        </p>
      )}
      <Input name="bairro" placeholder="Bairro (opcional)" value={bairro} onChange={(e) => setBairro(e.target.value)} className="w-32" />
      <Input name="cidade" placeholder="Cidade (opcional)" value={cidade} onChange={(e) => setCidade(e.target.value)} className="w-32" />
      <Select name="categoria_origem" aria-label="Como conheceu a barbearia?" className="w-56" defaultValue="">
        <option value="">Como conheceu a barbearia?</option>
        {CATEGORIAS_ORIGEM.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
      </Select>
    </>
  )
}
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: sucesso, sem erros de tipo (nenhum consumidor ainda passa `meuMembroId` — é opcional, então tudo continua compilando; a Task 3 conecta a prop nova).

- [ ] **Step 4: Commit**

```bash
git add src/components/cliente-autocomplete.tsx src/components/telefone-cliente-busca.tsx
git commit -m "feat: warn when selecting a client already owned by another barbeiro"
```

---

### Task 3: Propagar `p_membro_id`/`meuMembroId` nos 5 call sites de criação de cliente

**Files:**
- Modify: `src/components/agendar-slot-form.tsx`
- Modify: `src/components/atender-agora-form.tsx`
- Modify: `src/components/lancamento-form.tsx`
- Modify: `src/components/venda-loja-form.tsx`
- Modify: `src/app/painel/prospeccao/page.tsx`

**Interfaces:**
- Consumes: `criar_ou_obter_cliente(..., p_membro_id)` (Task 1), `ClienteAutocomplete`/`TelefoneClienteBusca` com prop `meuMembroId` (Task 2).

- [ ] **Step 1: `src/components/agendar-slot-form.tsx`**

Encontrar:
```tsx
    const clienteId = await supabase.rpc('criar_ou_obter_cliente', {
      p_barbearia_id: barbeariaId, p_nome: cliente!.nome, p_telefone: cliente!.telefone,
      p_data_nascimento: cliente!.dataNascimento ?? null,
      p_bairro: cliente!.bairro ?? null, p_cidade: cliente!.cidade ?? null,
      p_categoria_origem: cliente!.categoriaOrigem ?? null,
    })
```
Substituir por:
```tsx
    const clienteId = await supabase.rpc('criar_ou_obter_cliente', {
      p_barbearia_id: barbeariaId, p_nome: cliente!.nome, p_telefone: cliente!.telefone,
      p_data_nascimento: cliente!.dataNascimento ?? null,
      p_bairro: cliente!.bairro ?? null, p_cidade: cliente!.cidade ?? null,
      p_categoria_origem: cliente!.categoriaOrigem ?? null,
      p_membro_id: membroId,
    })
```

Encontrar:
```tsx
          <ClienteAutocomplete onResolved={setCliente} />
```
Substituir por:
```tsx
          <ClienteAutocomplete onResolved={setCliente} meuMembroId={membroId} />
```

- [ ] **Step 2: `src/components/atender-agora-form.tsx`**

Encontrar:
```tsx
    const clienteId = await supabase.rpc('criar_ou_obter_cliente', {
      p_barbearia_id: barbeariaId, p_nome: cliente.nome, p_telefone: cliente.telefone,
      p_data_nascimento: cliente.dataNascimento ?? null,
      p_bairro: cliente.bairro ?? null, p_cidade: cliente.cidade ?? null,
      p_categoria_origem: cliente.categoriaOrigem ?? null,
    })
```
Substituir por:
```tsx
    const clienteId = await supabase.rpc('criar_ou_obter_cliente', {
      p_barbearia_id: barbeariaId, p_nome: cliente.nome, p_telefone: cliente.telefone,
      p_data_nascimento: cliente.dataNascimento ?? null,
      p_bairro: cliente.bairro ?? null, p_cidade: cliente.cidade ?? null,
      p_categoria_origem: cliente.categoriaOrigem ?? null,
      p_membro_id: membroId,
    })
```

Encontrar:
```tsx
          <ClienteAutocomplete onResolved={setCliente} />
```
Substituir por:
```tsx
          <ClienteAutocomplete onResolved={setCliente} meuMembroId={membroId} />
```

- [ ] **Step 3: `src/components/lancamento-form.tsx`**

Encontrar:
```tsx
    const clienteId = await supabase.rpc('criar_ou_obter_cliente', {
      p_barbearia_id: barbeariaId, p_nome: cliente.nome, p_telefone: cliente.telefone,
      p_data_nascimento: cliente.dataNascimento ?? null,
      p_bairro: cliente.bairro ?? null, p_cidade: cliente.cidade ?? null,
      p_categoria_origem: cliente.categoriaOrigem ?? null,
    })
```
Substituir por:
```tsx
    const clienteId = await supabase.rpc('criar_ou_obter_cliente', {
      p_barbearia_id: barbeariaId, p_nome: cliente.nome, p_telefone: cliente.telefone,
      p_data_nascimento: cliente.dataNascimento ?? null,
      p_bairro: cliente.bairro ?? null, p_cidade: cliente.cidade ?? null,
      p_categoria_origem: cliente.categoriaOrigem ?? null,
      p_membro_id: membroId,
    })
```

Encontrar:
```tsx
        <ClienteAutocomplete
          key={clienteAutocompleteKey}
          onResolved={setCliente}
          valorInicial={{ nome: modoAgenda.clienteNome, telefone: modoAgenda.clienteTelefone }}
        />
```
Substituir por:
```tsx
        <ClienteAutocomplete
          key={clienteAutocompleteKey}
          onResolved={setCliente}
          valorInicial={{ nome: modoAgenda.clienteNome, telefone: modoAgenda.clienteTelefone }}
          meuMembroId={membroId}
        />
```

- [ ] **Step 4: `src/components/venda-loja-form.tsx`**

Encontrar:
```tsx
    const clienteId = await supabase.rpc('criar_ou_obter_cliente', {
      p_barbearia_id: barbeariaId, p_nome: cliente.nome, p_telefone: cliente.telefone,
      p_data_nascimento: cliente.dataNascimento ?? null,
      p_bairro: cliente.bairro ?? null, p_cidade: cliente.cidade ?? null,
      p_categoria_origem: cliente.categoriaOrigem ?? null,
    })
```
Substituir por:
```tsx
    const clienteId = await supabase.rpc('criar_ou_obter_cliente', {
      p_barbearia_id: barbeariaId, p_nome: cliente.nome, p_telefone: cliente.telefone,
      p_data_nascimento: cliente.dataNascimento ?? null,
      p_bairro: cliente.bairro ?? null, p_cidade: cliente.cidade ?? null,
      p_categoria_origem: cliente.categoriaOrigem ?? null,
      p_membro_id: membroId,
    })
```

Encontrar:
```tsx
        <ClienteAutocomplete key={clienteAutocompleteKey} onResolved={setCliente} />
```
Substituir por:
```tsx
        <ClienteAutocomplete key={clienteAutocompleteKey} onResolved={setCliente} meuMembroId={membroId} />
```

- [ ] **Step 5: `src/app/painel/prospeccao/page.tsx`**

Encontrar:
```tsx
  const clienteId = await supabase.rpc('criar_ou_obter_cliente', {
    p_barbearia_id: membro!.barbearia_id, p_nome: nome, p_telefone: telefone,
    p_bairro: bairro, p_cidade: cidade, p_categoria_origem: categoriaOrigem,
  })
```
Substituir por:
```tsx
  const clienteId = await supabase.rpc('criar_ou_obter_cliente', {
    p_barbearia_id: membro!.barbearia_id, p_nome: nome, p_telefone: telefone,
    p_bairro: bairro, p_cidade: cidade, p_categoria_origem: categoriaOrigem,
    p_membro_id: membro!.id,
  })
```

Encontrar:
```tsx
            <TelefoneClienteBusca />
```
Substituir por:
```tsx
            <TelefoneClienteBusca meuMembroId={membro!.id} />
```

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: sucesso, sem erros de tipo.

- [ ] **Step 7: Verificação visual manual**

Como barbeiro A, criar um cliente novo em qualquer um desses 5 fluxos (ex.: "Atender agora"). Como barbeiro B, buscar o telefone desse cliente em qualquer um dos fluxos e confirmar que aparece o aviso "Este cliente já é atendido por [A]" ao selecioná-lo — e que o fluxo continua funcionando normalmente (o atendimento/agendamento/venda é registrado sem bloqueio).

- [ ] **Step 8: Commit**

```bash
git add src/components/agendar-slot-form.tsx src/components/atender-agora-form.tsx src/components/lancamento-form.tsx src/components/venda-loja-form.tsx src/app/painel/prospeccao/page.tsx
git commit -m "feat: stamp cadastrado_por_membro_id when creating a client from any flow"
```

---

### Task 4: Listagem de clientes com status (`/painel/clientes`, `/admin/clientes`)

**Files:**
- Modify: `src/components/lista-clientes.tsx`
- Modify: `src/app/painel/clientes/page.tsx`
- Modify: `src/app/admin/clientes/page.tsx`

**Interfaces:**
- Consumes: `clientes_com_status` (Task 1).

- [ ] **Step 1: Reescrever `src/components/lista-clientes.tsx`**

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'

type Cliente = {
  id: string
  nome: string
  telefone: string
  cidade: string | null
  observacao: string | null
  cadastrado_por_nome: string | null
  dias_sem_vir: number | null
  status: string | null
  tem_agendamento_futuro: boolean
}

const COR_STATUS: Record<string, string> = {
  verde: 'bg-primary',
  amarelo: 'bg-amber',
  vermelho: 'bg-destructive',
}

export function ListaClientes({ clientes, baseHref, mostrarDono }: { clientes: Cliente[]; baseHref: string; mostrarDono?: boolean }) {
  const [busca, setBusca] = useState('')

  const termo = busca.trim()
  const termoLower = termo.toLowerCase()
  const termoDigitos = termo.replace(/\D/g, '')
  const filtrados = clientes.filter((c) => {
    if (termo === '') return true
    const nomeBate = c.nome.toLowerCase().includes(termoLower)
    const telefoneBate = termoDigitos.length > 0 && c.telefone.includes(termoDigitos)
    return nomeBate || telefoneBate
  })

  return (
    <Card>
      <CardContent className="p-6">
        <Input placeholder="Buscar por nome ou telefone" value={busca} onChange={(e) => setBusca(e.target.value)} className="mb-4" />
        {filtrados.map((c) => (
          <Link key={c.id} href={`${baseHref}/${c.id}`} className="flex flex-col gap-1 border-b py-2.5 hover:bg-muted/50">
            <div className="flex justify-between items-center gap-2">
              <span className="flex items-center gap-2">
                {c.status && <span className={`w-2 h-2 rounded-sm shrink-0 ${COR_STATUS[c.status]}`} title={c.status} />}
                {c.nome}
                {c.tem_agendamento_futuro && <span className="text-[11px] font-bold text-primary bg-primary/10 rounded-full px-2 py-0.5">já remarcou</span>}
              </span>
              <span className="text-muted-foreground text-sm text-right">
                {c.telefone}{c.cidade ? ` · ${c.cidade}` : ''}
                {c.dias_sem_vir != null ? ` · ${c.dias_sem_vir}d sem vir` : ''}
              </span>
            </div>
            {mostrarDono && c.cadastrado_por_nome && (
              <span className="text-[11.5px] text-muted-foreground">Cadastrado por {c.cadastrado_por_nome}</span>
            )}
            {c.observacao && <span className="text-[12.5px] text-muted-foreground italic truncate">{c.observacao}</span>}
          </Link>
        ))}
        {filtrados.length === 0 && <p className="text-sm text-muted-foreground">Nenhum cliente encontrado.</p>}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Reescrever `src/app/painel/clientes/page.tsx`**

```tsx
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { ListaClientes } from '@/components/lista-clientes'

export default async function ClientesPainelPage() {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('id, barbearia_id').eq('user_id', user!.id).single()

  const { data: clientes } = await supabase.rpc('clientes_com_status', {
    p_barbearia_id: membro!.barbearia_id, p_membro_id: membro!.id,
  })

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-4">Meus clientes</h1>
      <ListaClientes clientes={clientes ?? []} baseHref="/painel/clientes" />
    </div>
  )
}
```

- [ ] **Step 3: Reescrever `src/app/admin/clientes/page.tsx`**

```tsx
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { ListaClientes } from '@/components/lista-clientes'

export default async function ClientesAdminPage() {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: membro } = await supabase.from('membros').select('barbearia_id').eq('user_id', user!.id).single()

  const { data: clientes } = await supabase.rpc('clientes_com_status', {
    p_barbearia_id: membro!.barbearia_id,
  })

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-4">Clientes</h1>
      <ListaClientes clientes={clientes ?? []} baseHref="/admin/clientes" mostrarDono />
    </div>
  )
}
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: sucesso, sem erros de tipo.

- [ ] **Step 5: Verificação visual manual**

`/painel/clientes` como barbeiro A: só aparecem os clientes cadastrados por A, com o ponto colorido, "Xd sem vir", selo "já remarcou" quando aplicável, e a observação se houver. `/admin/clientes`: aparecem todos os clientes de todos os barbeiros, com "Cadastrado por {nome}" abaixo de cada um.

- [ ] **Step 6: Commit**

```bash
git add src/components/lista-clientes.tsx src/app/painel/clientes/page.tsx src/app/admin/clientes/page.tsx
git commit -m "feat: show return-status, já-remarcou and dono in the clientes list"
```

---

### Task 5: Ficha do cliente — status, aviso de dono, reatribuição (admin) e prazo de retorno

**Files:**
- Modify: `src/components/ficha-cliente.tsx`
- Modify: `src/components/editar-cliente-form.tsx`
- Create: `src/components/reatribuir-dono-form.tsx`

**Interfaces:**
- Consumes: `clientes_com_status` (Task 1), `clientes.prazo_retorno_dias`/`cadastrado_por_membro_id` (Task 1).
- Produces: `ReatribuirDonoForm({ clienteId, barbeiros, donoAtualId })` — usado só por `ficha-cliente.tsx`.

- [ ] **Step 1: Criar `src/components/reatribuir-dono-form.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'

type Barbeiro = { id: string; nome: string }

export function ReatribuirDonoForm({
  clienteId, barbeiros, donoAtualId,
}: { clienteId: string; barbeiros: Barbeiro[]; donoAtualId: string | null }) {
  const router = useRouter()
  const [donoId, setDonoId] = useState(donoAtualId ?? '')
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    setSalvando(true)
    const supabase = getBrowserSupabaseClient()
    await supabase.from('clientes').update({ cadastrado_por_membro_id: donoId || null }).eq('id', clienteId)
    setSalvando(false)
    router.refresh()
  }

  return (
    <div className="flex gap-2 items-center">
      <Select value={donoId} onChange={(e) => setDonoId(e.target.value)} aria-label="Dono do cadastro" className="w-48">
        <option value="">Sem dono</option>
        {barbeiros.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
      </Select>
      <Button type="button" onClick={salvar} disabled={salvando || donoId === (donoAtualId ?? '')}>Salvar dono</Button>
    </div>
  )
}
```

- [ ] **Step 2: Reescrever `src/components/ficha-cliente.tsx`**

Substituir o arquivo inteiro por (idêntico ao original, com: busca do usuário logado e seu papel/membro_id; busca de `clientes_com_status` filtrado por este único cliente pra pegar status/dono; se o usuário é barbeiro e não é o dono, mostra o aviso; se é admin, busca a lista de barbeiros e mostra `ReatribuirDonoForm`; um bloco de status no topo):

```tsx
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { EditarClienteForm } from '@/components/editar-cliente-form'
import { ReatribuirDonoForm } from '@/components/reatribuir-dono-form'
import { Card, CardContent } from '@/components/ui/card'

type Ranking = { item: string; tipo: string; quantidade: number; valor_total: number }
type AtendimentoHistorico = { data: string; preco: number; servicos: { nome: string } | null }
type VendaHistorico = { data: string; preco_unitario: number; quantidade: number; produtos: { nome: string } | null }
type ClienteComStatus = {
  id: string
  cadastrado_por_membro_id: string | null; cadastrado_por_nome: string | null
  prazo_retorno_dias: number; dias_sem_vir: number | null; status: string | null
  tem_agendamento_futuro: boolean
}

const LABEL_STATUS: Record<string, string> = { verde: 'Corte em dia', amarelo: 'Precisa reagendar', vermelho: 'Sumiu' }
const COR_STATUS: Record<string, string> = { verde: 'bg-primary', amarelo: 'bg-amber', vermelho: 'bg-destructive' }

export async function FichaCliente({ clienteId }: { clienteId: string }) {
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: euMembro } = await supabase.from('membros').select('id, barbearia_id, papel').eq('user_id', user!.id).single()

  const { data: cliente } = await supabase.from('clientes').select('nome, telefone, criado_em, cpf, data_nascimento, bairro, cidade, observacao, categoria_origem, prazo_retorno_dias').eq('id', clienteId).single()
  // clientes_com_status não tem parâmetro de filtro por cliente_id (só por
  // barbearia_id/membro_id) — busca todos os clientes da barbearia e filtra
  // pelo id certo. Aceitável aqui: a ficha é uma página de baixo tráfego,
  // carregada uma de cada vez; não vale criar uma segunda RPC só por isso.
  const { data: statusRows } = await supabase.rpc('clientes_com_status', { p_barbearia_id: euMembro!.barbearia_id }) as { data: ClienteComStatus[] | null }
  const status = statusRows?.find((s) => s.id === clienteId) ?? null
  const { data: ranking } = await supabase.rpc('ranking_cliente', { p_cliente_id: clienteId }) as { data: Ranking[] | null }
  const { data: atendimentos } = await supabase.from('atendimentos').select('data, preco, servicos(nome)').eq('cliente_id', clienteId).order('data', { ascending: false }) as { data: AtendimentoHistorico[] | null }
  const { data: vendas } = await supabase.from('vendas_produtos').select('data, preco_unitario, quantidade, produtos(nome)').eq('cliente_id', clienteId).order('data', { ascending: false }) as { data: VendaHistorico[] | null }

  const { data: agendamentosHistorico } = await supabase
    .from('agendamentos')
    .select('data, hora_inicio, status, servicos(nome)')
    .eq('cliente_id', clienteId)
    .order('data', { ascending: false }) as { data: { data: string; hora_inicio: string; status: string; servicos: { nome: string } | null }[] | null }

  const { data: prospeccaoHistorico } = await supabase
    .from('prospeccoes')
    .select('data, canal, status, convertido_em')
    .eq('cliente_id', clienteId)
    .order('criado_em', { ascending: false }) as { data: { data: string; canal: string | null; status: string; convertido_em: string | null }[] | null }

  const souAdmin = euMembro!.papel === 'admin'
  const { data: barbeiros } = souAdmin
    ? await supabase.from('membros').select('id, nome').eq('barbearia_id', euMembro!.barbearia_id).eq('papel', 'barbeiro').eq('ativo', true).order('nome')
    : { data: null }

  const maiorQuantidade = Math.max(1, ...(ranking ?? []).map((r) => r.quantidade))

  const historico = [
    ...(atendimentos ?? []).map((a) => ({ data: a.data, texto: a.servicos?.nome ?? '—', valor: a.preco })),
    ...(vendas ?? []).map((v) => ({ data: v.data, texto: `${v.produtos?.nome ?? '—'} (produto)`, valor: v.preco_unitario * v.quantidade })),
  ].sort((a, b) => (a.data < b.data ? 1 : -1))

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-1">Dados do cliente</h2>
          <p className="font-heading text-lg font-semibold mt-3">
            {cliente?.nome} · {cliente?.telefone}
            {cliente?.data_nascimento ? ` · nasc. ${new Date(cliente.data_nascimento).toLocaleDateString()}` : ''}
            {cliente?.cpf ? ` · CPF ${cliente.cpf}` : ''}
            {cliente?.bairro ? ` · ${cliente.bairro}` : ''}
            {cliente?.cidade ? ` · ${cliente.cidade}` : ''}
          </p>
          <p className="text-xs text-muted-foreground mb-4">Cliente desde {cliente?.criado_em ? new Date(cliente.criado_em).toLocaleDateString() : ''}</p>

          {status?.status && (
            <div className="flex items-center gap-2 mb-3">
              <span className={`w-2.5 h-2.5 rounded-sm shrink-0 ${COR_STATUS[status.status]}`} />
              <span className="text-sm font-semibold">{LABEL_STATUS[status.status]} — {status.dias_sem_vir} dias sem vir (prazo: {status.prazo_retorno_dias}d)</span>
            </div>
          )}
          {status?.tem_agendamento_futuro && (
            <p className="text-sm font-semibold text-primary mb-3">Já tem um agendamento futuro — não precisa recontatar.</p>
          )}
          {!souAdmin && status?.cadastrado_por_membro_id && status.cadastrado_por_membro_id !== euMembro!.id && (
            <p className="text-sm bg-amber-tint text-amber-text rounded-xl px-3 py-2 mb-3">
              Este cliente já é atendido por {status.cadastrado_por_nome}.
            </p>
          )}
          {souAdmin && (
            <div className="mb-4">
              <p className="text-xs text-muted-foreground mb-1.5">Dono do cadastro</p>
              <ReatribuirDonoForm clienteId={clienteId} barbeiros={barbeiros ?? []} donoAtualId={status?.cadastrado_por_membro_id ?? null} />
            </div>
          )}

          <EditarClienteForm
            clienteId={clienteId}
            cpfAtual={cliente?.cpf ?? null}
            bairroAtual={cliente?.bairro ?? null}
            cidadeAtual={cliente?.cidade ?? null}
            observacaoAtual={cliente?.observacao ?? null}
            categoriaOrigemAtual={cliente?.categoria_origem ?? null}
            prazoRetornoAtual={cliente?.prazo_retorno_dias ?? null}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-5">Mais usados por ele</h2>
          {ranking?.map((r) => (
            <div key={`${r.tipo}-${r.item}`} className="mb-2">
              <div className="flex justify-between text-sm">
                <span>{r.item}</span>
                <span>{r.quantidade}x · <strong>R$ {Number(r.valor_total).toFixed(2)}</strong></span>
              </div>
              <div className="w-full bg-muted rounded h-2 overflow-hidden">
                <div className="bg-primary h-full" style={{ width: `${(r.quantidade / maiorQuantidade) * 100}%` }} />
              </div>
            </div>
          ))}
          {(ranking ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nenhum item registrado ainda.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-5">Histórico completo</h2>
          {historico.map((h, i) => (
            <div key={i} className="flex justify-between text-sm border-b py-1 last:border-b-0">
              <span>{new Date(h.data).toLocaleDateString()} — {h.texto}</span>
              <span>R$ {Number(h.valor).toFixed(2)}</span>
            </div>
          ))}
          {historico.length === 0 && <p className="text-sm text-muted-foreground">Nenhum atendimento ou venda ainda.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h2 className="font-heading text-base font-bold mb-5">Agendamentos</h2>
          {(agendamentosHistorico ?? []).map((a, i) => (
            <div key={i} className="flex justify-between text-sm border-b py-1 last:border-b-0">
              <span>{new Date(a.data).toLocaleDateString()} {a.hora_inicio.slice(0, 5)} — {a.servicos?.nome ?? '—'}</span>
              <span className="text-muted-foreground">{a.status}</span>
            </div>
          ))}
          {(agendamentosHistorico ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nenhum agendamento ainda.</p>}
        </CardContent>
      </Card>

      {(prospeccaoHistorico ?? []).length > 0 && (
        <Card>
          <CardContent className="p-6">
            <h2 className="font-heading text-base font-bold mb-5">Prospecção</h2>
            {prospeccaoHistorico!.map((p, i) => (
              <div key={i} className="flex justify-between text-sm border-b py-1 last:border-b-0">
                <span>{new Date(p.data).toLocaleDateString()} — {p.canal ?? 'sem canal'}</span>
                <span className="text-muted-foreground">{p.status}{p.convertido_em ? ` (${new Date(p.convertido_em).toLocaleDateString()})` : ''}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Reescrever `src/components/editar-cliente-form.tsx`**

Substituir o arquivo inteiro por (idêntico ao já existente — que já tem CPF — com um `<Select>` de prazo de retorno a mais):

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { CATEGORIAS_ORIGEM, type CategoriaOrigem } from '@/lib/categorias-origem'

export function EditarClienteForm({
  clienteId, cpfAtual, bairroAtual, cidadeAtual, observacaoAtual, categoriaOrigemAtual, prazoRetornoAtual,
}: {
  clienteId: string
  cpfAtual: string | null
  bairroAtual: string | null
  cidadeAtual: string | null
  observacaoAtual: string | null
  categoriaOrigemAtual: CategoriaOrigem | null
  prazoRetornoAtual: number | null
}) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [cpf, setCpf] = useState(cpfAtual ?? '')
  const [bairro, setBairro] = useState(bairroAtual ?? '')
  const [cidade, setCidade] = useState(cidadeAtual ?? '')
  const [observacao, setObservacao] = useState(observacaoAtual ?? '')
  const [categoriaOrigem, setCategoriaOrigem] = useState<CategoriaOrigem | ''>(categoriaOrigemAtual ?? '')
  const [prazoRetorno, setPrazoRetorno] = useState(prazoRetornoAtual != null ? String(prazoRetornoAtual) : '')
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    setSalvando(true)
    const supabase = getBrowserSupabaseClient()
    const { data, error } = await supabase
      .from('clientes')
      .update({
        cpf: cpf.trim() || null,
        bairro: bairro.trim() || null, cidade: cidade.trim() || null, observacao: observacao.trim() || null,
        categoria_origem: categoriaOrigem || null,
        prazo_retorno_dias: prazoRetorno === '' ? null : Number(prazoRetorno),
      })
      .eq('id', clienteId)
      .select('id')
    setSalvando(false)
    if (error) {
      alert(error.message)
      return
    }
    if (!data || data.length === 0) {
      alert('Não foi possível salvar — você não tem permissão para editar este cliente.')
      return
    }
    setEditando(false)
    router.refresh()
  }

  function cancelar() {
    setCpf(cpfAtual ?? '')
    setBairro(bairroAtual ?? '')
    setCidade(cidadeAtual ?? '')
    setObservacao(observacaoAtual ?? '')
    setCategoriaOrigem(categoriaOrigemAtual ?? '')
    setPrazoRetorno(prazoRetornoAtual != null ? String(prazoRetornoAtual) : '')
    setEditando(false)
  }

  const categoriaLabel = CATEGORIAS_ORIGEM.find((c) => c.value === categoriaOrigemAtual)?.label

  if (!editando) {
    return (
      <div>
        {observacaoAtual && <p className="text-sm text-muted-foreground mb-2">Observação: {observacaoAtual}</p>}
        {categoriaLabel && <p className="text-sm text-muted-foreground mb-2">Como conheceu: {categoriaLabel}</p>}
        <button type="button" onClick={() => setEditando(true)} className="text-xs text-primary underline">
          Editar CPF/bairro/cidade/observação/origem/prazo de retorno
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 border rounded-lg p-3">
      <Input placeholder="CPF" value={cpf} onChange={(e) => setCpf(e.target.value)} />
      <Input placeholder="Bairro" value={bairro} onChange={(e) => setBairro(e.target.value)} />
      <Input placeholder="Cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} />
      <textarea
        placeholder="Observação"
        value={observacao}
        onChange={(e) => setObservacao(e.target.value)}
        className="w-full rounded-lg border border-input bg-input-bg px-2.5 py-1.5 text-base md:text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 min-h-20"
      />
      <Select value={categoriaOrigem} onChange={(e) => setCategoriaOrigem(e.target.value as CategoriaOrigem | '')}>
        <option value="">Como conheceu a barbearia?</option>
        {CATEGORIAS_ORIGEM.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
      </Select>
      <Select value={prazoRetorno} onChange={(e) => setPrazoRetorno(e.target.value)}>
        <option value="">Prazo médio de retorno: padrão (12 dias)</option>
        <option value="7">7 dias</option>
        <option value="10">10 dias</option>
        <option value="15">15 dias</option>
        <option value="30">30 dias</option>
      </Select>
      <div className="flex gap-2">
        <Button type="button" onClick={salvar} disabled={salvando}>Salvar</Button>
        <Button type="button" variant="outline" onClick={cancelar}>Cancelar</Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: sucesso, sem erros de tipo.

- [ ] **Step 5: Verificação visual manual**

Abrir a ficha de um cliente com atendimento antigo (>15 dias) e confirmar o status vermelho no topo. Trocar o prazo de retorno pra 7 dias e confirmar que o status recalcula. Como barbeiro que não é dono, confirmar o aviso "já é atendido por". Como admin, confirmar o seletor de dono e que reatribuir move o cliente pra lista do novo dono em `/painel/clientes`.

- [ ] **Step 6: Commit**

```bash
git add src/components/ficha-cliente.tsx src/components/editar-cliente-form.tsx src/components/reatribuir-dono-form.tsx
git commit -m "feat: show return status and dono controls on ficha do cliente"
```

---

### Task 6: Ranking de clientes ativos por barbeiro (`/admin/ranking`)

**Files:**
- Modify: `src/app/admin/ranking/page.tsx`

**Interfaces:**
- Consumes: `clientes_com_status` (Task 1).

- [ ] **Step 1: Editar `src/app/admin/ranking/page.tsx`**

Encontrar:
```tsx
  const { data: vendas } = await supabase
    .from('vendas_produtos').select('membro_id, produto_id, quantidade, preco_unitario')
    .eq('barbearia_id', membro!.barbearia_id).gte('data', inicioMes)
```
Substituir por:
```tsx
  const { data: vendas } = await supabase
    .from('vendas_produtos').select('membro_id, produto_id, quantidade, preco_unitario')
    .eq('barbearia_id', membro!.barbearia_id).gte('data', inicioMes)

  const { data: clientesStatus } = await supabase.rpc('clientes_com_status', { p_barbearia_id: membro!.barbearia_id }) as {
    data: { cadastrado_por_membro_id: string | null; status: string | null }[] | null
  }

  const rankingClientesAtivos = (barbeiros ?? [])
    .map((b) => {
      const doBarbeiro = (clientesStatus ?? []).filter((c) => c.cadastrado_por_membro_id === b.id)
      return {
        nome: b.nome,
        verde: doBarbeiro.filter((c) => c.status === 'verde').length,
        amarelo: doBarbeiro.filter((c) => c.status === 'amarelo').length,
        vermelho: doBarbeiro.filter((c) => c.status === 'vermelho').length,
      }
    })
    .sort((a, b) => b.verde - a.verde)
```

Encontrar:
```tsx
      <h1 className="font-heading text-2xl font-bold mb-4">Ranking (mês)</h1>
      <Secao titulo="Cortes" itens={cortes} ranking={rankingServico} />
      <Secao titulo="Serviços extras" itens={extras} ranking={rankingServico} />
      <Secao titulo="Produtos" itens={produtos ?? []} ranking={rankingProduto} />
```
Substituir por:
```tsx
      <h1 className="font-heading text-2xl font-bold mb-4">Ranking (mês)</h1>

      <h2 className="font-heading text-lg font-semibold mb-3">Clientes ativos</h2>
      <Card className="mb-8">
        <CardContent className="p-6">
          <Table>
            <TableHeader><TableRow><TableHead>Barbeiro</TableHead><TableHead>Verde</TableHead><TableHead>Amarelo</TableHead><TableHead>Vermelho</TableHead></TableRow></TableHeader>
            <TableBody>
              {rankingClientesAtivos.map((r) => (
                <TableRow key={r.nome}>
                  <TableCell>{r.nome}</TableCell>
                  <TableCell className="font-bold text-primary">{r.verde}</TableCell>
                  <TableCell className="text-amber-text">{r.amarelo}</TableCell>
                  <TableCell className="text-destructive">{r.vermelho}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {rankingClientesAtivos.length === 0 && <p className="text-sm text-muted-foreground">Nenhum barbeiro ativo cadastrado.</p>}
        </CardContent>
      </Card>

      <Secao titulo="Cortes" itens={cortes} ranking={rankingServico} />
      <Secao titulo="Serviços extras" itens={extras} ranking={rankingServico} />
      <Secao titulo="Produtos" itens={produtos ?? []} ranking={rankingProduto} />
```

Encontrar (imports no topo):
```tsx
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
```
Substituir por:
```tsx
import { getServerSupabaseClient } from '@/lib/supabase/server'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: sucesso, sem erros de tipo.

- [ ] **Step 3: Verificação visual manual**

Abrir `/admin/ranking` e confirmar a nova seção "Clientes ativos" no topo, antes de "Cortes", com uma linha por barbeiro e as três contagens (verde/amarelo/vermelho) batendo com o que aparece em `/admin/clientes`.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/ranking/page.tsx
git commit -m "feat: add active-clients ranking by status to admin ranking page"
```
