create or replace function public.trg_prospeccao_agendou()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_prospeccao_id uuid;
begin
  select id into v_prospeccao_id
  from prospeccoes
  where cliente_id = new.cliente_id
    and status in ('novo_lead', 'em_contato', 'interessado')
    and agendamento_id is null
  order by criado_em desc
  limit 1;

  if v_prospeccao_id is not null then
    update prospeccoes set status = 'agendou', agendamento_id = new.id where id = v_prospeccao_id;
  end if;

  return new;
end;
$$;

create trigger trg_agendamento_liga_prospeccao
  after insert on agendamentos
  for each row execute function public.trg_prospeccao_agendou();

create or replace function public.trg_prospeccao_resultado_agendamento()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'realizado' then
      update prospeccoes
      set status = 'convertido', convertido_em = now()
      where agendamento_id = new.id and status not in ('convertido', 'nao_convertido');
    elsif new.status in ('nao_compareceu', 'cancelado') then
      update prospeccoes
      set status = 'nao_convertido'
      where agendamento_id = new.id and status not in ('convertido', 'nao_convertido');
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_agendamento_atualiza_prospeccao
  after update of status on agendamentos
  for each row execute function public.trg_prospeccao_resultado_agendamento();
