-- Opcional, editável só na ficha completa do cliente (não nos fluxos rápidos
-- de captura de lead) — mesma UPDATE policy de bairro/cidade/observacao já
-- cobre esta coluna nova (0021_cliente_observacao_update.sql), sem RLS extra.
alter table clientes add column cpf text;
