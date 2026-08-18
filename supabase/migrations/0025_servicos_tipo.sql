alter table servicos
  add column tipo text not null default 'corte' check (tipo in ('corte', 'servico_extra'));
