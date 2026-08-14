alter table membros
  add column meta_faturamento_mes numeric(10,2) check (meta_faturamento_mes >= 0);
alter table membros
  add column meta_prospeccao_semana int check (meta_prospeccao_semana >= 0);
