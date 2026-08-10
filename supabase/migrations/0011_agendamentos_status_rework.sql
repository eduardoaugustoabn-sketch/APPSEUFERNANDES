-- Existing 'concluido' rows must be renamed before the check constraint is
-- swapped, or they'd violate the new constraint immediately.
update agendamentos set status = 'realizado' where status = 'concluido';

alter table agendamentos drop constraint agendamentos_status_check;
alter table agendamentos add constraint agendamentos_status_check
  check (status in ('agendado', 'confirmado', 'realizado', 'nao_compareceu', 'cancelado'));

alter table agendamentos add column vezes_remarcado int not null default 0;

create or replace function public.trg_conta_remarcacao()
returns trigger language plpgsql as $$
begin
  if (new.data, new.hora_inicio, new.hora_fim) is distinct from (old.data, old.hora_inicio, old.hora_fim) then
    new.vezes_remarcado := old.vezes_remarcado + 1;
  end if;
  return new;
end;
$$;

create trigger trg_agendamento_conta_remarcacao
  before update on agendamentos
  for each row execute function public.trg_conta_remarcacao();

-- Overbooking becomes an Agenda-UI decision (warn, don't block) for
-- internally-created agendamentos. A GiST exclusion constraint applies its
-- WHERE predicate symmetrically to both sides of the comparison, so it
-- can't express "check against every row, but only enforce for public
-- inserts" — the public-only no-overbooking guarantee moves into
-- criar_agendamento_publico() itself (Task 2).
alter table agendamentos drop constraint agendamento_sem_sobreposicao;
