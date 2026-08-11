-- servicos.ativo already exists (0002_catalogo.sql) but was never exposed
-- in the admin UI. produtos and planos_carreira get the same column here,
-- so all three catalog tables support soft-delete (deactivate, never a
-- real DELETE — all three have FK-referencing history with no cascade).
alter table produtos add column ativo boolean not null default true;
alter table planos_carreira add column ativo boolean not null default true;
