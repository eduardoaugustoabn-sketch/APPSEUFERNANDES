# Sonho pessoal do barbeiro — Design

## Contexto

Todas as metas que já existem no sistema (plano de carreira, prospecção dia/semana, faturamento do mês) são definidas pelo **admin** — são metas de negócio da barbearia. O usuário agora pede algo diferente: um "sonho pessoal" (ex: carro, moto) que o próprio **barbeiro** define pra si mesmo, reservando uma porcentagem da própria comissão pra acompanhar quanto já "guardou" rumo àquele objetivo.

Não existe hoje nenhum conceito de poupança/reserva no sistema — isso é uma feature nova, não uma extensão das metas existentes.

## Decisões de escopo (confirmadas com o usuário)

- **Quem cadastra**: o próprio barbeiro, no `/painel` — não depende do admin.
- **Base da porcentagem**: sobre a **comissão total** (serviços + produtos), mesmo valor que já aparece como "Comissão do mês" no painel — não sobre o faturamento bruto.
- **Acumulação**: não é mensal como as outras metas — o valor guardado é a % aplicada sobre **toda comissão ganha desde a data em que o sonho foi criado** até hoje (soma contínua, atravessa meses).
- **Um sonho ativo por vez, com histórico**: o barbeiro pode ter só um sonho em andamento; ao concluí-lo (conquistado ou cancelado) ele vira histórico, e só então pode cadastrar um novo — sequência tipo "guardei pra moto, depois guardo pro carro", não paralelo.
- **Sem edição de % ou valor depois de criado** (v1) — se quiser mudar, cancela e cria um novo. Editar um sonho em andamento fica de fora por agora.
- **É uma ferramenta de acompanhamento, não uma movimentação financeira real** — o app não mexe em dinheiro de verdade, só calcula "se você reservasse X% da sua comissão, teria guardado R$ Y até agora". Isso já é como o resto do sistema funciona (nenhuma feature aqui lida com pagamento real).

## Banco de dados

Nova tabela `sonhos_pessoais` (próxima migration disponível):

```sql
create table sonhos_pessoais (
  id uuid primary key default gen_random_uuid(),
  membro_id uuid not null references membros(id) on delete cascade,
  barbearia_id uuid not null references barbearias(id) on delete cascade,
  nome text not null,
  valor_alvo numeric(10,2) not null check (valor_alvo > 0),
  percentual numeric(5,2) not null check (percentual > 0 and percentual <= 100),
  status text not null default 'ativo' check (status in ('ativo', 'conquistado', 'cancelado')),
  criado_em timestamptz not null default now(),
  concluido_em timestamptz
);

alter table sonhos_pessoais enable row level security;

create policy "barbeiro gerencia proprios sonhos" on sonhos_pessoais for all
  using (membro_id = auth_membro_id())
  with check (membro_id = auth_membro_id());

create policy "admin le sonhos da barbearia" on sonhos_pessoais for select
  using (barbearia_id = auth_barbearia_id() and auth_papel() = 'admin');
```

Mesmo padrão de RLS já usado em `bloqueios_agenda`/`prospeccoes`: o barbeiro tem controle total sobre os próprios registros (`for all`, via `auth_membro_id()`), e o admin só lê (curiosidade, sem gerenciar). `barbearia_id` guardado direto na tabela (não só via join de `membro_id`) segue a mesma convenção redundante-mas-simples usada em `prospeccoes`/`vendas_produtos`, útil se um dia quiser consulta agregada por barbearia sem join.

## `/painel` — seção "Sonho pessoal"

Nova `Card` na página do barbeiro, com dois estados:

**Sem sonho ativo** (nenhuma linha com `status = 'ativo'`): formulário simples — nome (texto), valor alvo (R$), percentual da comissão (%) — com botão "Começar a guardar".

**Com sonho ativo**: mostra nome, barra de progresso e o texto "R$ {guardado} de R$ {valor_alvo} — faltam R$ {restante}" (ou "Sonho conquistado! 🎉" quando `guardado >= valor_alvo`, sem valor negativo de "faltam") — mesma convenção de texto já usada nas metas de faturamento/prospecção. Dois botões: "Conquistei!" (marca `status = 'conquistado'`, `concluido_em = now()`) e "Cancelar" (marca `status = 'cancelado'`, `concluido_em = now()`) — qualquer um dos dois libera o formulário de criar um novo sonho na próxima visita à página.

`guardado` é calculado como: `percentual / 100 * (soma de comissao_valor de atendimentos + vendas_produtos do membro, com data >= data do sonho.criado_em)` — mesma composição de "comissão" (serviços + produtos) já usada no resto do painel, só que com o início da janela sendo a data de criação do sonho em vez do início do mês.

**Histórico**: abaixo, uma lista compacta dos sonhos com `status != 'ativo'`, ordenados do mais recente pro mais antigo — nome, valor alvo, e se foi "conquistado" ou "cancelado" (com a data).

## Fora de escopo

- Editar percentual/valor alvo de um sonho já criado — cancelar e criar de novo.
- Múltiplos sonhos simultâneos.
- Qualquer movimentação financeira real (isso é só acompanhamento/motivação, não uma carteira).
- Visão do admin sobre os sonhos de todos os barbeiros (a policy de leitura já existe no banco pra permitir isso no futuro, mas nenhuma tela nova é construída pro admin nesta rodada).

## Testes

Sem lógica de cálculo isolada nova equivalente a `calcularOciosidade` — é uma soma simples (comissão desde uma data) multiplicada pela %. Verificação via `npm run build` + passada manual (criar um sonho, lançar um atendimento/venda, confirmar que a barra reflete a % certa da comissão; marcar como conquistado ou cancelado e confirmar que aparece no histórico e libera cadastrar um novo).
