-- Correções de revisão final do onboarding de barbeiros: cascade nas FKs de
-- respostas_tentativa_onboarding, hardening do bucket de fluxogramas e
-- checagem de completude no servidor pra submeter_tentativa_onboarding.

-- Sem "on delete cascade" aqui, apagar uma pergunta ou alternativa referenciada
-- por uma resposta já registrada falha com violação de FK -- o admin nunca
-- consegue remover uma pergunta depois que algum barbeiro já respondeu a prova.
alter table respostas_tentativa_onboarding drop constraint respostas_tentativa_onboarding_pergunta_id_fkey;
alter table respostas_tentativa_onboarding add constraint respostas_tentativa_onboarding_pergunta_id_fkey
  foreign key (pergunta_id) references perguntas_onboarding(id) on delete cascade;

alter table respostas_tentativa_onboarding drop constraint respostas_tentativa_onboarding_alternativa_id_fkey;
alter table respostas_tentativa_onboarding add constraint respostas_tentativa_onboarding_alternativa_id_fkey
  foreign key (alternativa_id) references alternativas_onboarding(id) on delete cascade;

-- O bucket foi criado só com (id, name, public) na 0041 -- sem isso qualquer
-- admin autenticado podia subir um arquivo de qualquer tipo/tamanho como
-- "fluxograma".
update storage.buckets
set allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'],
    file_size_limit = 5242880 -- 5 MiB
where id = 'fluxogramas';

-- Sem essa checagem, submeter_tentativa_onboarding aceita um array de
-- respostas menor que o total de perguntas do processo -- a validação de
-- "todas respondidas" hoje só existe no botão do formulário (client-side),
-- então chamar a RPC direto (sem passar pela UI) permite tirar 100% respondendo
-- só as perguntas que o barbeiro sabe.
create or replace function public.submeter_tentativa_onboarding(p_processo_id uuid, p_respostas jsonb)
returns table(nota_percentual int, aprovado boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_membro_id uuid := auth_membro_id();
  v_total int;
  v_acertos int;
  v_nota int;
  v_aprovado boolean;
  v_tentativa_id uuid;
begin
  if v_membro_id is null then
    raise exception 'Membro não encontrado.';
  end if;

  if not exists (select 1 from processos_onboarding where id = p_processo_id and barbearia_id = auth_barbearia_id()) then
    raise exception 'Processo inválido para esta barbearia.';
  end if;

  select count(*) into v_total from perguntas_onboarding where processo_id = p_processo_id;
  if v_total = 0 then
    raise exception 'Este processo não tem perguntas cadastradas.';
  end if;

  if (
    select count(distinct (r->>'pergunta_id')::uuid)
    from jsonb_array_elements(p_respostas) as r
  ) <> v_total then
    raise exception 'Responda todas as perguntas antes de enviar.';
  end if;

  -- count(distinct pergunta_id), não count(*): sem isso, enviar a mesma
  -- pergunta duas vezes no array de respostas contaria dobrado e infla a
  -- nota além do número real de perguntas.
  select count(distinct p.id) into v_acertos
  from jsonb_to_recordset(p_respostas) as r(pergunta_id uuid, alternativa_id uuid)
  join perguntas_onboarding p on p.id = r.pergunta_id and p.processo_id = p_processo_id
  join alternativas_onboarding a on a.id = r.alternativa_id and a.pergunta_id = r.pergunta_id and a.correta = true;

  v_nota := round((v_acertos::numeric / v_total) * 100);
  v_aprovado := v_nota >= 70;

  insert into tentativas_onboarding (processo_id, membro_id, nota_percentual, aprovado)
  values (p_processo_id, v_membro_id, v_nota, v_aprovado)
  returning id into v_tentativa_id;

  insert into respostas_tentativa_onboarding (tentativa_id, pergunta_id, alternativa_id)
  select v_tentativa_id, (r->>'pergunta_id')::uuid, (r->>'alternativa_id')::uuid
  from jsonb_array_elements(p_respostas) as r;

  return query select v_nota, v_aprovado;
end;
$$;

revoke all on function public.submeter_tentativa_onboarding(uuid, jsonb) from public, anon;
grant execute on function public.submeter_tentativa_onboarding(uuid, jsonb) to authenticated;
