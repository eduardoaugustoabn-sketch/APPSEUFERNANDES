# Bairro e cidade do cliente — Design Spec

## Contexto e objetivo

Não existe uma tela única de "cadastrar cliente" — o registro em `clientes` é criado implicitamente em 4 pontos diferentes do app: agendar horário (`agendar-slot-form.tsx`), atender agora (`atender-agora-form.tsx`), lançamento avulso (`lancamento-form.tsx`) — os três via o componente compartilhado `ClienteAutocomplete` — mais o agendamento público (`public-booking-flow.tsx`) e a prospecção (`painel/prospeccao/page.tsx`), cada um com seu próprio formulário inline. Este spec adiciona `bairro` e `cidade`, opcionais, capturados em todos os seis pontos.

Este é o primeiro de três pedidos relacionados a clientes nesta rodada — os outros dois (busca por telefone parcial com lista suspensa; categoria de origem no agendamento + tela de lista de clientes + campo de observação) são specs separadas, feitas depois desta.

## Modelo de dados

```sql
alter table clientes add column bairro text;
alter table clientes add column cidade text;
```

`criar_ou_obter_cliente` ganha dois parâmetros novos, seguindo exatamente o padrão já usado por `data_nascimento` (`supabase/migrations/0013_cliente_aniversario.sql`): em cliente novo, grava o valor recebido; em cliente já existente (conflito por `(barbearia_id, telefone)`), só preenche se o campo ainda estiver vazio — nunca sobrescreve um valor já capturado por um atendimento anterior.

```sql
drop function if exists public.criar_ou_obter_cliente(uuid, text, text, date);

create or replace function public.criar_ou_obter_cliente(
  p_barbearia_id uuid, p_nome text, p_telefone text, p_data_nascimento date default null,
  p_bairro text default null, p_cidade text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_cliente_id uuid;
  v_telefone text;
begin
  if not exists (select 1 from barbearias where id = p_barbearia_id) then
    raise exception 'Barbearia inválida';
  end if;

  v_telefone := regexp_replace(p_telefone, '\D', '', 'g');

  insert into clientes (barbearia_id, nome, telefone, data_nascimento, bairro, cidade)
  values (p_barbearia_id, p_nome, v_telefone, p_data_nascimento, p_bairro, p_cidade)
  on conflict (barbearia_id, telefone)
  do update set
    nome = excluded.nome,
    data_nascimento = coalesce(clientes.data_nascimento, excluded.data_nascimento),
    bairro = coalesce(clientes.bairro, excluded.bairro),
    cidade = coalesce(clientes.cidade, excluded.cidade)
  returning id into v_cliente_id;

  return v_cliente_id;
end;
$$;

grant execute on function public.criar_ou_obter_cliente(uuid, text, text, date, text, text) to anon, authenticated;
```

`criar_agendamento_publico` (usada só pelo agendamento público) também precisa dos dois parâmetros novos, repassados para a chamada interna de `criar_ou_obter_cliente` que já faz — mesmo padrão de `drop function` + `create or replace` por mudança de assinatura.

## Captura nos 6 pontos

**`ClienteAutocomplete`** (compartilhado por agendar horário, atender agora, lançamento avulso): ganha dois `Input` novos — "Bairro" e "Cidade", opcionais, sem validação — e o shape de `onResolved` ganha `bairro?: string` / `cidade?: string`. Os três componentes que consomem esse componente já guardam o resultado num estado local tipado (`useState<{ nome: string; telefone: string; dataNascimento?: string } | null>`) e já passam `cliente!.dataNascimento` direto pra chamada de `criar_ou_obter_cliente` — o mesmo padrão se estende para `bairro`/`cidade`.

**`PublicBookingFlow`**: ganha dois `Input` no mesmo passo "4. Seus dados" onde hoje só há nome/telefone, repassados como `p_bairro`/`p_cidade` na chamada de `criar_agendamento_publico`.

**`painel/prospeccao/page.tsx`**: seu formulário inline (`novoContato`, Server Action) ganha dois `Input` opcionais, lidos do `FormData` e repassados na chamada de `criar_ou_obter_cliente`.

## Exibição

`FichaCliente` (`src/components/ficha-cliente.tsx`) passa a selecionar `bairro, cidade` na query de `clientes` e mostrar, na linha de cabeçalho já existente (nome · telefone · nascimento), bairro e cidade quando preenchidos — sem seção nova, só um acréscimo à linha que já resume os dados do cliente.

## Testes

Sem lógica de cálculo nova. Cobertura via `npm run build` + `npx supabase test db` (o teste de isolamento de tenant em `0001_tenant_isolation.test.sql`/`0002_catalogo_isolation.test.sql` já cobre `clientes` — não precisa de teste pgTAP novo, já que não há RLS nova, só colunas e parâmetros a mais numa função `security definer` já testada indiretamente) + passada manual (criar cliente novo com bairro/cidade preenchidos em cada um dos 6 pontos, confirmar que aparece na ficha; criar de novo o mesmo telefone com bairro diferente e confirmar que o valor antigo não é sobrescrito).

## Fora de escopo (explicitamente adiado)

- Editar bairro/cidade de um cliente já existente — não há tela de edição de cliente hoje; isso é parte do pedido 3 (lista de clientes cadastrados), spec separada.
- Validação/autocomplete de endereço (CEP, IBGE, etc.) — campos de texto livre por enquanto.
