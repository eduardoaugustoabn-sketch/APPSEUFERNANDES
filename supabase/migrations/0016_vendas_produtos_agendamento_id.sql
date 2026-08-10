-- vendas_produtos never got the agendamento_id column that its sibling
-- table atendimentos has had since 0007_lancamentos.sql. Two pages
-- (admin/prospeccao, painel, admin) already query vendas_produtos.agendamento_id
-- assuming it exists, which fails at runtime with "column does not exist"
-- (42703). This adds the missing column, mirroring atendimentos.agendamento_id
-- exactly (nullable, same FK target).
alter table vendas_produtos add column agendamento_id uuid references agendamentos(id);
