# Sonhos dos barbeiros — Design Spec

## Contexto e objetivo

Cada barbeiro pode cadastrar um ou mais "sonhos" pessoais (ex: "moto nova — R$ 15.000") e reservar um percentual da própria comissão mensal para alcançá-los. O admin quer visibilidade: acompanhar o progresso de todos os barbeiros em direção aos seus sonhos, sem precisar gerenciá-los.

Esse conceito não existe hoje no app — é um módulo novo, independente de `meta_prospeccao_dia` (que já existe e é sobre atividade diária de prospecção, não sobre reserva financeira) e de `planos_carreira`.

## Modelo de dados

Nova tabela `sonhos`, seguindo o padrão multi-tenant já usado em `prospeccoes`:

```sql
create table sonhos (
  id uuid primary key default gen_random_uuid(),
  barbearia_id uuid not null references barbearias(id) on delete cascade,
  membro_id uuid not null references membros(id),
  nome text not null,
  valor_alvo numeric not null check (valor_alvo > 0),
  percentual_comissao numeric not null check (percentual_comissao > 0 and percentual_comissao <= 100),
  concluido boolean not null default false,
  criado_em timestamptz not null default now()
);
```

**RLS** (mesmo padrão de `prospeccoes`):
- `admin le sonhos da barbearia` — select, `barbearia_id = auth_barbearia_id() and auth_papel() = 'admin'`. Admin **só lê** — sem policy de insert/update/delete para admin.
- `barbeiro le proprios sonhos` — select, `membro_id = auth_membro_id()`.
- `barbeiro insere proprios sonhos` — insert, `with check (membro_id = auth_membro_id() and barbearia_id = auth_barbearia_id())`.
- `barbeiro atualiza proprios sonhos` — update, `using (membro_id = auth_membro_id())`.
- `barbeiro remove proprios sonhos` — delete, `using (membro_id = auth_membro_id())`.

**Trigger de limite de 100%:** a soma de `percentual_comissao` de todos os sonhos **não concluídos** (`concluido = false`) de um mesmo `membro_id` nunca pode ultrapassar 100. Implementado como `before insert or update` trigger em `sonhos`: soma `percentual_comissao` dos demais sonhos não concluídos do mesmo `membro_id` — **excluindo a própria linha sendo inserida/atualizada** (`id != new.id` no caso de update, irrelevante no insert pois a linha ainda não existe) — soma `new.percentual_comissao`, e levanta exceção (`raise exception`) se o total ultrapassar 100. Um sonho marcado `concluido = true` libera seu percentual — não entra mais nessa soma, permitindo o barbeiro cadastrar um novo sonho. Uma atualização que só muda `concluido` (sem tocar `percentual_comissao`) deve poder marcar um sonho como concluído mesmo que a soma dos outros já esteja em 100% — o trigger só valida quando `new.concluido = false`.

## Cálculo de progresso

Não existe uma tabela de "lançamentos de reserva" — o valor acumulado é sempre **calculado**, nunca armazenado incrementalmente:

```
valor_acumulado(sonho) = min(
  valor_alvo,
  comissao_total_do_membro_desde(sonho.criado_em) × sonho.percentual_comissao / 100
)
```

Onde `comissao_total_do_membro_desde(data)` é a soma de `atendimentos.comissao_valor` + `vendas_produtos.comissao_valor` do barbeiro, com `data >= sonho.criado_em`, até hoje.

Se o barbeiro editar `percentual_comissao` depois de já ter meses acumulados, o `valor_acumulado` recalcula automaticamente com o percentual novo aplicado a todo o histórico desde `criado_em` — não há necessidade de guardar histórico de percentuais.

**Função SQL nova**, seguindo o padrão de `ociosidade()` (`language sql stable`, sem `security definer` — a RLS de quem chama já escopa o resultado):

```sql
create or replace function public.comissao_acumulada(
  p_membro_id uuid, p_data_inicio timestamptz
) returns numeric
language sql stable as $$
  select
    coalesce((select sum(comissao_valor) from atendimentos where membro_id = p_membro_id and data >= p_data_inicio::date), 0)
    + coalesce((select sum(comissao_valor) from vendas_produtos where membro_id = p_membro_id and data >= p_data_inicio::date), 0);
$$;

grant execute on function public.comissao_acumulada(uuid, timestamptz) to authenticated;
```

Barbeiro só consegue chamar com o próprio `membro_id` (RLS de `atendimentos`/`vendas_produtos` zera o resultado para qualquer outro id). Admin, que já lê `atendimentos`/`vendas_produtos` de toda a barbearia, consegue calcular de qualquer barbeiro.

### Marcar como concluído

Quando `valor_acumulado >= valor_alvo`, o sonho deveria virar `concluido = true` (parando de contar e liberando o percentual). Como esse valor é sempre recalculado na leitura, e o admin não tem permissão de escrita em `sonhos`, **só a própria tela do barbeiro** (`/painel/sonhos`), que tem UPDATE via RLS, persiste essa transição: ao carregar a página, para cada sonho ainda `concluido = false` cujo `valor_acumulado` calculado ≥ `valor_alvo`, o server component dispara um `UPDATE sonhos SET concluido = true` antes de renderizar.

A tela do admin (`/admin/sonhos`), sendo somente leitura, **não** escreve esse flag — ela exibe "concluído" com base no valor calculado (`valor_acumulado >= valor_alvo`), mesmo que o campo `concluido` no banco ainda esteja `false` porque o barbeiro não abriu a própria tela desde que bateu a meta. Isso é uma limitação aceita: nesse cenário raro, o percentual desse sonho continua contando para o limite de 100% até o barbeiro abrir `/painel/sonhos`.

## Telas

### Barbeiro — `/painel/sonhos`

Novo item "Sonhos" no menu do painel (`NAV_ITEMS` em `src/app/painel/layout.tsx`), ao lado de Dashboard/Agenda/Prospecção.

Nova página `src/app/painel/sonhos/page.tsx`, seguindo o padrão de `src/app/painel/prospeccao/page.tsx`:
- Formulário no topo (`<form action={criarSonho}>`, Server Action com `'use server'`) para cadastrar um novo sonho: nome, valor-alvo, percentual. Se o trigger de 100% rejeitar, o erro do Postgres sobe como exceção — mesmo padrão de falha (crash da rota, sem UI dedicada) já aceito no ciclo anterior (`criarBarbeiro`); não é escopo desta feature construir tratamento de erro melhor que o resto do app já tem.
- Lista de sonhos (ativos primeiro, concluídos depois, com badge visual "Concluído"), cada um em um `Card` com: nome, barra de progresso (`valor_acumulado` / `valor_alvo`), percentual reservado, e ações Editar/Excluir.
- Novo componente `src/components/sonho-row.tsx`, no mesmo modelo de `BarbeiroRow`/`ServicoRow`: edição inline de nome/valor_alvo/percentual via `getBrowserSupabaseClient()` (update direto, RLS protege), botão Excluir (`.delete()`, RLS protege).

### Admin — `/admin/sonhos`

Novo item "Sonhos" no menu do admin (`NAV_ITEMS` em `src/app/admin/layout.tsx`).

Nova página `src/app/admin/sonhos/page.tsx`, somente leitura: para cada barbeiro ativo (`membros.ativo = true`, `papel = 'barbeiro'`) com pelo menos um sonho, lista os sonhos com nome do barbeiro, nome do sonho, valor-alvo, percentual, valor acumulado calculado e barra de progresso — mesmo estilo visual (`Card`, barra de progresso) do dashboard atual (`src/app/painel/page.tsx`), sem nenhum controle de edição.

## Testes

Sem lógica de cálculo complexa nova além da fórmula acima (que é aritmética simples sobre um valor já somado pelo Postgres) — não há unidade isolada equivalente a `calcularOciosidade` que justifique TDD dedicado. Cobertura via:
- `supabase/tests/database/0001_tenant_isolation.test.sql` (ou arquivo de teste de RLS equivalente) ganha casos para `sonhos`: barbeiro não lê/edita/exclui sonho de outro membro; admin lê mas não escreve; trigger de 100% rejeita insert/update que estoura o limite somando sonhos não concluídos, mas aceita quando um dos sonhos somados está `concluido = true`.
- `npm run build` + passada manual (criar sonho, editar percentual, ver progresso recalcular, exceder 100% e confirmar rejeição, marcar conclusão manualmente fazendo comissão suficiente ou ajustando valor_alvo baixo o bastante em ambiente de teste, ver sonho concluído sumir do limite de 100% liberando espaço para outro) — navegador se disponível na hora da implementação, senão documentar a limitação como já aconteceu nos ciclos anteriores.

## Fora de escopo (explicitamente adiado)

- Prazo/data-limite para o sonho.
- Admin gerenciar (criar/editar/excluir) sonhos de barbeiros.
- Resumo agregado no admin (total da equipe, contagem de concluídos) — só a lista por barbeiro.
- Histórico de percentuais (mudar o % sempre recalcula o passado inteiro com o valor novo).
- Notificações/alertas ao atingir a meta.
