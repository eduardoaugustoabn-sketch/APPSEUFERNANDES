# Área de onboarding — fluxogramas e provas por processo — Design Spec

## Contexto

Pedido do usuário: "Área onboarding colocando provas e os fluxogramas, para que sabemos o nível do barbeiro e se sabe todos processos". Não existe hoje nenhuma área de treinamento/onboarding no sistema — é um subsistema inteiramente novo.

## Decisões já validadas com o usuário

- Prova = quiz de múltipla escolha com nota (% de acerto), correção automática.
- Fluxograma = upload de imagem (feita em outra ferramenta), o app só armazena e exibe.
- Fluxograma e prova são agrupados por **processo** (ex: "Atendimento ao cliente", "Fechamento de caixa") — cada processo tem no máximo um fluxograma e uma prova.
- Barbeiro pode refazer a prova quantas vezes quiser; toda tentativa fica registrada (não só a última), mesmo a UI inicial só exibindo a mais recente.
- Nota mínima de aprovação: **70%, fixa para todas as provas do sistema** (constante no código, não configurável por processo).
- Admin vê um resumo por barbeiro × processo (status: não iniciado / reprovado / aprovado, nota da última tentativa).

## Problema de segurança central

O barbeiro nunca pode saber qual alternativa é a correta antes de responder. RLS por si só não esconde uma coluna dentro de uma linha visível — só bloqueia linhas inteiras. Por isso, ao contrário do resto do app (onde a maioria das leituras é direta via `select`), a listagem de perguntas para responder e a correção da prova **precisam** passar por funções `security definer`, no mesmo padrão já usado em `clientes_com_status`/`criar_ou_obter_cliente`. O barbeiro não tem select direto em `perguntas_onboarding` nem `alternativas_onboarding` — só admin tem.

## Arquitetura

### 1. Schema (migration `0041_onboarding_processos.sql`)

```sql
create table processos_onboarding (
  id uuid primary key default gen_random_uuid(),
  barbearia_id uuid not null references barbearias(id) on delete cascade,
  nome text not null,
  descricao text,
  fluxograma_path text, -- caminho no Storage; null até o admin subir a imagem
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table perguntas_onboarding (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid not null references processos_onboarding(id) on delete cascade,
  enunciado text not null,
  ordem int not null default 0
);

create table alternativas_onboarding (
  id uuid primary key default gen_random_uuid(),
  pergunta_id uuid not null references perguntas_onboarding(id) on delete cascade,
  texto text not null,
  correta boolean not null default false,
  ordem int not null default 0
);

create table tentativas_onboarding (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid not null references processos_onboarding(id) on delete cascade,
  membro_id uuid not null references membros(id) on delete cascade,
  nota_percentual int not null,
  aprovado boolean not null,
  respondido_em timestamptz not null default now()
);

create table respostas_tentativa_onboarding (
  id uuid primary key default gen_random_uuid(),
  tentativa_id uuid not null references tentativas_onboarding(id) on delete cascade,
  pergunta_id uuid not null references perguntas_onboarding(id),
  alternativa_id uuid not null references alternativas_onboarding(id)
);
```

`respostas_tentativa_onboarding` guarda qual alternativa foi escolhida em cada pergunta de cada tentativa — não é usada pela UI inicial (que só mostra nota/aprovado), mas é o rastro que a função de correção já precisa gravar de qualquer forma pra calcular a nota; guardar por linha em vez de descartar habilita uma futura tela "ver gabarito da tentativa" sem migração nova.

### 2. RLS

- `processos_onboarding`: `select` para todo membro da própria barbearia (nome/descrição/fluxograma não são segredo); `insert`/`update`/`delete` só admin.
- `perguntas_onboarding` e `alternativas_onboarding`: **só admin tem select/insert/update/delete**, mesmo padrão de `barbearia_id = auth_barbearia_id() and auth_papel() = 'admin'` já usado em `categorias_origem`/`canais_prospeccao`. Barbeiro nunca lê essas tabelas diretamente — só via a função abaixo.
- `tentativas_onboarding`: barbeiro só vê e insere as próprias (`membro_id = auth_membro_id()`); admin vê todas as da barbearia (leitura, sem insert/update — tentativas são geradas só pela função de correção).
- `respostas_tentativa_onboarding`: sem policy de acesso direto nenhuma (nem admin, nem barbeiro) — só a função `security definer` de correção escreve nela; não há necessidade de leitura direta enquanto não existir a tela de "ver gabarito".

### 3. Funções `security definer`

**`processo_onboarding_perguntas(p_processo_id uuid)`** — retorna as perguntas do processo com suas alternativas, **sem a coluna `correta`**. Valida que o processo pertence à barbearia do chamador. Usada pela tela do barbeiro pra montar o formulário da prova.

**`submeter_tentativa_onboarding(p_processo_id uuid, p_respostas jsonb)`** — recebe um array de `{pergunta_id, alternativa_id}` (as respostas escolhidas), valida que o processo pertence à barbearia do chamador, calcula a nota comparando contra `alternativas_onboarding.correta` no servidor (nunca confia em nota calculada no cliente), grava a tentativa e as respostas, retorna `{nota_percentual, aprovado}`. A contagem de acertos usa `count(distinct pergunta_id)` no join contra alternativa correta — não `count(*)` — porque um `count(*)` ingênuo permite inflar a nota enviando a mesma pergunta duas vezes no array de respostas.

### 4. Armazenamento do fluxograma (Supabase Storage)

O Storage está **desativado** neste projeto (`[storage] enabled = false` em `supabase/config.toml`) — precisa ser ligado. Bucket novo `fluxogramas`, **privado** (não público): imagens de processo interno não devem ficar acessíveis por URL direta sem autenticação, ao contrário do padrão de leitura pública que este app já usa pra agendamento (aquele é intencionalmente público; isso aqui não é). Path de cada objeto: `${barbearia_id}/${processo_id}`, sempre sobrescrito (upsert) — um processo tem no máximo um fluxograma ativo por vez, sem precisar reter versões antigas.

Políticas em `storage.objects` (reaproveitando `auth_barbearia_id()`/`auth_papel()` já existentes):
- Admin da barbearia: insert/update/delete restrito ao prefixo `${barbearia_id}/` do próprio tenant.
- Qualquer membro autenticado da barbearia: select restrito ao mesmo prefixo.

A tela exibe a imagem via **signed URL** gerada no Server Component (não há política de leitura anônima) — não precisa de RPC, é uma chamada direta ao Storage API (`supabase.storage.from('fluxogramas').createSignedUrl(...)`).

### 5. Telas

**`/admin/onboarding`** — lista de processos da barbearia (criar/editar nome, descrição, ativo/inativo — mesmo padrão de card+form+tabela já usado em Categorias de origem/Canais de prospecção). Cada processo tem uma página de detalhe (`/admin/onboarding/[id]`) com três blocos: upload/troca do fluxograma, CRUD de perguntas+alternativas (marcar qual é a correta), e uma tabela de resultados (barbeiro × nota da última tentativa × aprovado/reprovado × não iniciado pros que nunca tentaram).

**`/painel/onboarding`** — lista de processos ativos com o status pessoal do barbeiro logado (não iniciado / reprovado / aprovado + nota). Cada processo abre uma página (`/painel/onboarding/[id]`) mostrando o fluxograma e um botão "Fazer prova" (ou "Refazer prova" se já tentou) que leva ao formulário de múltipla escolha; ao enviar, mostra o resultado (nota + aprovado/reprovado) na hora.

## Testes

pgTAP cobrindo, seguindo o padrão já estabelecido nesta sessão (`categorias_origem`/`canais_prospeccao`):
- Tenant isolation nas 5 tabelas novas.
- Admin pode gerenciar processos/perguntas/alternativas; barbeiro não pode inserir/alterar nenhuma das duas últimas (RLS bloqueia).
- `processo_onboarding_perguntas` nunca retorna a coluna/valor de `correta` (verificação estrutural: a função não expõe essa informação de jeito nenhum, nem indiretamente).
- `submeter_tentativa_onboarding`: nota calculada corretamente pra respostas todas certas/todas erradas/parcial; `aprovado` bate com o corte de 70%; tentativa duplicada da mesma pergunta no array de respostas não infla a nota (cobre o `count(distinct ...)` do design); tentativa contra processo de outra barbearia é rejeitada.
- Barbeiro só vê as próprias tentativas em `tentativas_onboarding`; admin vê todas as da barbearia.

Verificação manual em navegador: fluxo completo admin (criar processo → subir fluxograma → cadastrar perguntas) e fluxo completo barbeiro (ver fluxograma → fazer prova → ver nota → refazer).

## Fora de escopo (documentado para não ser retrabalhado)

- Editor de fluxograma dentro do app (decisão do usuário: só upload de imagem).
- Nota mínima configurável por prova (decisão do usuário: fixa em 70% pra todas).
- Tela de "ver gabarito" de uma tentativa antiga (a tabela `respostas_tentativa_onboarding` já existe pra isso, mas não faz parte desta entrega).
- Onboarding obrigatório/bloqueante (ex: impedir o barbeiro de acessar outras áreas até completar) — o usuário não pediu isso; é só uma área de consulta e autoavaliação.
