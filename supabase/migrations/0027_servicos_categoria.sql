alter table servicos add column categoria_servico text not null default 'outro'
  check (categoria_servico in ('cabelo', 'barba', 'outro'));
