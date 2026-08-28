# Categorias de Origem Customizáveis — Design Spec

## Contexto e objetivo

Hoje "como o cliente conheceu a barbearia" é uma lista fixa de 5 valores (indicação, redes sociais, google/internet, passou na rua, outro), hardcoded em `src/lib/categorias-origem.ts` e espelhada por um `CHECK` constraint em `clientes.categoria_origem`. O admin quer poder cadastrar suas próprias categorias em vez de ficar preso a essas 5.

## Decisões de escopo (validadas com o usuário)

- **Nova tabela `categorias_origem`, por barbearia** — cada barbearia gerencia sua própria lista, mesmo padrão de `produtos`/`servicos` (membros leem, admin gerencia).
- **`clientes.categoria_origem` continua `text`**, guardando o nome exato cadastrado (não um `id` — evita join em todo lugar que só precisa mostrar o texto). O `CHECK` constraint que hoje trava em 5 valores fixos sai do banco; a validação passa a consultar a tabela nova dinamicamente.
- **Migração cria as 5 categorias atuais para cada barbearia já existente** (como texto por extenso: "Indicação", "Redes sociais", etc.) — ninguém começa com a lista vazia.
- **Dados antigos são convertidos**: `clientes.categoria_origem` hoje guarda o slug (`indicacao`) — a mesma migration atualiza esses valores pro texto por extenso ("Indicação"), pra ficar consistente com o que passa a ser gravado dali pra frente.
- **Tela nova `/admin/categorias-origem`** — CRUD simples (adicionar, desativar/reativar), mesmo padrão visual de `/admin/produtos`.
- **`CATEGORIAS_ORIGEM` (a lista fixa) é removida** de `src/lib/categorias-origem.ts` — o arquivo fica só com o alias de tipo `CategoriaOrigem = string`, pra não precisar trocar toda referência ao tipo espalhada pelo código. Todo componente que hoje importa a lista fixa passa a receber as categorias como prop, vindas do banco.

## Modelo de dados (nova migration)

```sql
create table categorias_origem (
  id uuid primary key default gen_random_uuid(),
  barbearia_id uuid not null references barbearias(id) on delete cascade,
  nome text not null,
  ativo boolean not null default true
);

alter table categorias_origem enable row level security;

create policy "membros leem categorias_origem" on categorias_origem for select
  using (barbearia_id = auth_barbearia_id());
create policy "admin gerencia categorias_origem" on categorias_origem for all
  using (barbearia_id = auth_barbearia_id() and auth_papel() = 'admin')
  with check (barbearia_id = auth_barbearia_id() and auth_papel() = 'admin');
-- Mesmo motivo de "publico le servicos ativos" (0002_catalogo.sql): o
-- agendamento público precisa listar as categorias sem um membro
-- autenticado.
create policy "publico le categorias_origem ativas" on categorias_origem for select
  to anon using (ativo = true);

-- Semeia as 5 categorias atuais pra cada barbearia já existente, como
-- texto por extenso (o que passa a ser gravado em clientes.categoria_origem
-- dali pra frente, não mais o slug).
insert into categorias_origem (barbearia_id, nome)
select id, categoria from barbearias, unnest(array['Indicação', 'Redes sociais', 'Google/Internet', 'Passou na rua', 'Outro']) as categoria;

-- A constraint precisa sair ANTES de reescrever os valores abaixo — ela só
-- aceita os 5 slugs antigos, e "Indicação"/"Redes sociais"/etc. violariam
-- ela se a ordem fosse invertida.
alter table clientes drop constraint clientes_categoria_origem_check;

-- Converte os valores antigos (gravados como slug) pro texto por extenso,
-- pra ficar consistente com o que as categorias novas usam.
update clientes set categoria_origem = 'Indicação' where categoria_origem = 'indicacao';
update clientes set categoria_origem = 'Redes sociais' where categoria_origem = 'redes_sociais';
update clientes set categoria_origem = 'Google/Internet' where categoria_origem = 'google_internet';
update clientes set categoria_origem = 'Passou na rua' where categoria_origem = 'passou_na_rua';
update clientes set categoria_origem = 'Outro' where categoria_origem = 'outro';

-- Validação passa a ser dinâmica (contra a tabela categorias_origem) em
-- vez de uma lista fixa no corpo da função. Corpo base: versão atual de
-- criar_ou_obter_cliente em 0036_clientes_dono_status.sql (já inclui a
-- validação de p_membro_id contra p_barbearia_id) — só a checagem de
-- categoria muda, assinatura idêntica, sem precisar de drop.
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

  if p_categoria_origem is not null and not exists (
    select 1 from categorias_origem where barbearia_id = p_barbearia_id and nome = p_categoria_origem and ativo
  ) then
    raise exception 'Categoria de origem inválida.';
  end if;

  if p_membro_id is not null and not exists (
    select 1 from membros where id = p_membro_id and barbearia_id = p_barbearia_id
  ) then
    raise exception 'Membro inválido para esta barbearia';
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
```

Nota: a assinatura de `criar_ou_obter_cliente` não muda (mesmos 8 parâmetros) — `create or replace` basta, sem precisar dropar a função nem reemitir grants.

## `src/lib/categorias-origem.ts` (simplificado)

```ts
export type CategoriaOrigem = string
```

Remove `CATEGORIAS_ORIGEM` — quem precisar da lista agora recebe via prop.

## `/admin/categorias-origem` (nova página)

Mesmo padrão de `/admin/produtos`: form de criar (server action) + tabela com `CategoriaOrigemRow` (componente novo, mesmo padrão de `ProdutoRow`/`PlanoCarreiraRow`: editar nome inline, desativar/reativar).

## Prop-threading: quem hoje importa a lista fixa passa a receber via prop

`ClienteAutocomplete` e `TelefoneClienteBusca` ganham uma prop nova `categorias: { id: string; nome: string }[]`, usada no lugar do `CATEGORIAS_ORIGEM.map(...)` de hoje.

Cadeia de quem busca a lista no banco e repassa:

- **`AgendaDia`** (`src/components/agenda-dia.tsx`) já recebe `servicos`/`produtos` como prop e repassa pra `AgendarSlotForm`, `AtenderAgoraForm` e `LancamentoForm` — os três já embutem `ClienteAutocomplete`. Ganha uma prop `categorias` a mais, repassada aos três. Isso cobre 3 dos 4 usos de `ClienteAutocomplete` com uma única mudança de cadeia:
  - `src/app/painel/agenda/page.tsx` e `src/app/admin/agenda/page.tsx` (via `AdminAgenda`) passam a buscar `categorias_origem` e repassar pra `AgendaDia`.
- **`VendaLojaForm`** é o 4º uso de `ClienteAutocomplete` — usado por `/admin/loja` (via `AdminVendaLoja`) e `/painel/loja` diretamente. Ambas as páginas passam a buscar `categorias_origem` e repassar.
- **`TelefoneClienteBusca`** é usado só em `/painel/prospeccao/page.tsx`, que já é Server Component — busca `categorias_origem` e repassa.
- **`public-booking-flow.tsx`** é renderizado por `/[barbeariaSlug]/page.tsx` — essa página busca `categorias_origem` (via a policy pública `ativo = true`) e repassa como prop nova.
- **`EditarClienteForm`** (usado só por `ficha-cliente.tsx`, Server Component) — `ficha-cliente.tsx` busca `categorias_origem` e repassa.

## Testes

- **pgTAP**: `criar_ou_obter_cliente` aceita uma categoria cadastrada pelo admin (fora das 5 originais) e rejeita uma categoria inexistente/desativada com a mensagem amigável; a policy pública permite `anon` ler só categorias ativas.
- **Build**: `npm run build` sem erros de tipo.
- **Manual (navegador)**: `/admin/categorias-origem` — cadastrar uma categoria nova, desativar uma das 5 originais. Confirmar que ela aparece/some nos seletores de: agendamento público, "Atender agora", prospecção, ficha do cliente. Confirmar que um cliente antigo (categoria migrada de slug pra texto) mostra o nome por extenso corretamente na ficha.

## Fora de escopo (explicitamente adiado)

- Reordenar/priorizar categorias (a ordem é só a de cadastro/nome).
- Qualquer relatório novo agrupando clientes por categoria de origem — já existe implicitamente via `categoria_origem` na tabela `clientes`, mas nenhuma tela nova de análise foi pedida.
