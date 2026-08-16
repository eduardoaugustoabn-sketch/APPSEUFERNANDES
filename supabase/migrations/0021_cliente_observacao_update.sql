alter table clientes add column observacao text;

-- Primeira policy de escrita que clientes já teve além da criação (que
-- passa por criar_ou_obter_cliente). Mesmo escopo da policy de leitura
-- "membros leem clientes da barbearia" — sem distinção de papel, admin
-- e barbeiro editam igual. Não há restrição column-level: a proteção
-- contra editar nome/telefone por acidente vem do payload que a UI
-- envia (só bairro/cidade/observacao), não de uma regra de banco —
-- mesmo padrão já usado em BarbeiroRow.salvar().
create policy "membros atualizam clientes da barbearia" on clientes for update
  using (barbearia_id = auth_barbearia_id())
  with check (barbearia_id = auth_barbearia_id());
