create table canais_prospeccao (
  id uuid primary key default gen_random_uuid(),
  barbearia_id uuid not null references barbearias(id) on delete cascade,
  nome text not null,
  ativo boolean not null default true,
  constraint canais_prospeccao_barbearia_id_nome_key unique (barbearia_id, nome)
);

alter table canais_prospeccao enable row level security;

create policy "membros leem canais_prospeccao" on canais_prospeccao for select
  using (barbearia_id = auth_barbearia_id());
create policy "admin gerencia canais_prospeccao" on canais_prospeccao for all
  using (barbearia_id = auth_barbearia_id() and auth_papel() = 'admin')
  with check (barbearia_id = auth_barbearia_id() and auth_papel() = 'admin');

-- Semeia os 5 canais atuais pra cada barbearia já existente, como texto por
-- extenso (o que passa a ser gravado em prospeccoes.canal dali pra frente,
-- não mais o slug).
insert into canais_prospeccao (barbearia_id, nome)
select id, canal from barbearias, unnest(array['WhatsApp', 'Indicação', 'Na rua', 'Redes sociais', 'Outro']) as canal;

-- A constraint precisa sair ANTES de reescrever os valores abaixo — ela só
-- aceita os 5 slugs antigos, e "WhatsApp"/"Indicação"/etc. violariam ela se
-- a ordem fosse invertida.
alter table prospeccoes drop constraint prospeccoes_canal_check;

update prospeccoes set canal = 'WhatsApp' where canal = 'whatsapp';
update prospeccoes set canal = 'Indicação' where canal = 'indicacao';
update prospeccoes set canal = 'Na rua' where canal = 'rua';
update prospeccoes set canal = 'Redes sociais' where canal = 'redes_sociais';
update prospeccoes set canal = 'Outro' where canal = 'outro';
