-- Ordem dos módulos de onboarding: o barbeiro percorre os processos em
-- sequência (módulo 1, módulo 2...), só liberando o próximo depois de
-- aprovado no anterior. A ordem é definida pelo admin (setas subir/descer).

alter table processos_onboarding add column ordem int not null default 0;

with numerado as (
  select id, row_number() over (partition by barbearia_id order by nome) as rn
  from processos_onboarding
)
update processos_onboarding p
set ordem = numerado.rn
from numerado
where numerado.id = p.id;
