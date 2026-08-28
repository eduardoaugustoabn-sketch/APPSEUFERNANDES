-- "nome" é a chave de negócio de fato (é o que fica gravado em
-- clientes.categoria_origem e o que criar_ou_obter_cliente busca) — sem
-- isso, dava pra cadastrar "Indicação" duas vezes (duas opções
-- indistinguíveis no seletor) ou com espaço sobrando (nunca bateria com o
-- valor certo depois).
alter table categorias_origem add constraint categorias_origem_barbearia_id_nome_key unique (barbearia_id, nome);
