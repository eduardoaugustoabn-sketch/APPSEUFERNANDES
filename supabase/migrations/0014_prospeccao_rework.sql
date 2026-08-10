alter table prospeccoes add column nome text;
alter table prospeccoes add column telefone text;
alter table prospeccoes add column agendamento_id uuid references agendamentos(id);

-- No production data exists yet for this project (see progress notes on the
-- MVP plan), so there are no legacy rows to backfill — nome/telefone/
-- cliente_id go straight to NOT NULL.
alter table prospeccoes alter column nome set not null;
alter table prospeccoes alter column telefone set not null;
alter table prospeccoes alter column cliente_id set not null;

alter table prospeccoes drop constraint prospeccoes_status_check;
alter table prospeccoes add constraint prospeccoes_status_check
  check (status in ('novo_lead', 'em_contato', 'interessado', 'agendou', 'compareceu', 'convertido', 'nao_convertido'));
alter table prospeccoes alter column status set default 'em_contato';

drop policy "barbeiro insere proprias prospeccoes" on prospeccoes;
create policy "barbeiro insere proprias prospeccoes" on prospeccoes for insert
  with check (
    membro_id = auth_membro_id()
    and barbearia_id = auth_barbearia_id()
    and status = 'em_contato'
    and exists (select 1 from clientes c where c.id = cliente_id and c.barbearia_id = auth_barbearia_id())
  );

-- Manual edits (via the UI) may only move a prospeccao between the three
-- pre-visit statuses — agendou/compareceu/convertido/nao_convertido are only
-- ever written by the security-definer triggers added in Task 5, which
-- bypass this policy (same mechanism as processar_venda_produto() bypassing
-- produtos' RLS), so a barbeiro can never forge a conversion by hand.
drop policy "barbeiro atualiza proprias prospeccoes" on prospeccoes;
create policy "barbeiro atualiza proprias prospeccoes" on prospeccoes for update
  using (membro_id = auth_membro_id())
  with check (
    membro_id = auth_membro_id()
    and exists (select 1 from clientes c where c.id = cliente_id and c.barbearia_id = auth_barbearia_id())
    and status in ('novo_lead', 'em_contato', 'interessado')
  );
