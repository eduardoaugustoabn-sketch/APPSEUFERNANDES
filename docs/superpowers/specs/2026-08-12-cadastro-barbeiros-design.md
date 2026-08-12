# Cadastro de barbeiros — criar, editar, desativar — Design

## Contexto

Hoje `/admin/barbeiros` só permite vincular um barbeiro já existente a um plano de carreira e definir sua meta diária de prospecção — não existe nenhuma forma de criar um barbeiro novo ou editar nome/telefone pela interface. Todo membro (inclusive as contas de teste `admin@teste.com`/`barbeiro@teste.com`) foi criado manualmente direto no Supabase, fora do app. Isso bloqueia o uso real do sistema por um dono de barbearia, que precisa conseguir cadastrar sua equipe sozinho.

`membros` já tem as colunas necessárias (`nome`, `telefone`, `ativo`) e a mesma convenção de "desativar nunca é DELETE" já usada em serviços/produtos/planos (spec `2026-08-11-catalogo-editar-desativar-design.md`) — esta feature estende esse padrão para barbeiros, e soma a capacidade de criar a conta de autenticação que falta hoje.

## Decisões de escopo (confirmadas com o usuário)

- **Criação de conta**: o admin define e-mail e senha diretamente no formulário de criação — sem fluxo de convite por e-mail (evita depender de SMTP configurado no projeto).
- **Edição**: só nome e telefone. E-mail e senha ficam fixos após a criação — sem tela de redefinir senha nesta rodada (fora de escopo, deferido).
- **Desativar**: incluído, seguindo exatamente o padrão já usado em serviços/produtos/planos — `ativo = false`, nunca DELETE real, com botão "Desativar"/"Reativar" na própria linha.

## Arquitetura

Três peças novas, todas em cima de tabelas e políticas de RLS que já existem (`membros` já tem `ativo`, e as policies "admin insere/atualiza membros" de `0001_tenant_membros.sql` já cobrem os casos de uso — nenhuma migration nova é necessária):

1. **Client Supabase com service-role** (`src/lib/supabase/admin.ts`, novo arquivo) — só é necessário porque criar um usuário de autenticação (`auth.admin.createUser`) exige a service-role key, que ignora RLS. Este client nunca é importado em código de cliente (browser); só a Server Action de criação o usa.
2. **Server Action `criarBarbeiro`** (em `src/app/admin/barbeiros/page.tsx`, ao lado da `vincularPlano` já existente) — recebe nome/telefone/email/senha do formulário, confirma que quem chama é admin da barbearia (consulta a própria linha em `membros` com o client normal, autenticado por cookie — a mesma checagem que toda Server Action de admin já faz implicitamente via RLS, só que aqui precisa ser explícita porque o passo seguinte usa a service-role key e RLS não protege nada ali), cria o usuário via `auth.admin.createUser({ email, password, email_confirm: true })`, e insere a linha em `membros` (`papel: 'barbeiro'`, `barbearia_id` do admin, `nome`, `telefone`, `ativo` default `true`).
3. **Componente `BarbeiroRow`** (`src/components/barbeiro-row.tsx`, novo arquivo, client component) — mesmo padrão de `ServicoRow`/`ProdutoRow`/`PlanoCarreiraRow`: clique em "Editar" troca nome/telefone por `Input`s com "Salvar"/"Cancelar"; botão "Desativar"/"Reativar" alterna `ativo` direto via client Supabase do browser (protegido pela policy "admin atualiza membros" já existente — nenhuma mudança de RLS necessária aqui). O vínculo de plano de carreira e a meta diária continuam exatamente como hoje (select + input com "Salvar" próprio, always-editable, sem entrar no modo "Editar"), na mesma linha da tabela.

## Página `/admin/barbeiros` — estrutura final

```
[Formulário "Adicionar barbeiro": Nome | Telefone | E-mail | Senha | botão "Adicionar"]

Table:
Nome | Telefone | Plano de carreira | Meta diária | Ações
```

- Coluna "Nome"/"Telefone": texto normal, ou `Input` quando a linha está em modo edição.
- Coluna "Plano de carreira"/"Meta diária": mesmo `<select>`/`<input>` + botão "Salvar" que já existe hoje, sem alteração de comportamento.
- Coluna "Ações": `Editar` (entra no modo edição de nome/telefone) e `Desativar`/`Reativar` (alterna `ativo`), mesmo texto/estilo (`text-primary`/`text-destructive`, sublinhado) usado em `ServicoRow`.
- Barbeiro desativado: linha com `opacity-50` (mesmo padrão visual de serviço/produto desativado), some da lista de "novo agendamento"/"atender agora" (já filtram por `ativo`, comportamento herdado automaticamente, nenhuma mudança necessária ali) mas mantém todo o histórico de atendimentos já lançado.

## Validação e erros

Sem biblioteca de validação nova (`zod` etc. não é usado em nenhum formulário existente do projeto) — segue o padrão mínimo já usado em `criarServico`: campos `required` no HTML, `type="email"` no campo de e-mail (validação nativa do browser), `type="password"` com `minLength={6}` no campo de senha (mesmo mínimo que o Supabase Auth já exige no servidor — dá feedback imediato no browser em vez de só falhar depois no submit). Erros do `auth.admin.createUser` que passam da validação de tamanho (e-mail duplicado, por exemplo) não têm tratamento visual dedicado nesta rodada: se a Server Action falhar, a submissão simplesmente não cria o barbeiro e a página não muda — mesmo nível (ausência) de tratamento de erro que `criarServico` já tem hoje. Não é uma regressão em relação ao padrão existente do projeto.

## Segurança

O único ponto novo de risco é a Server Action `criarBarbeiro` usar a service-role key, que ignora toda RLS. Ela precisa validar explicitamente, antes de qualquer chamada com o client admin:
1. o usuário está autenticado (`supabase.auth.getUser()` com o client normal);
2. a linha de `membros` desse usuário tem `papel = 'admin'` e `ativo = true`;
3. o `barbearia_id` do novo barbeiro é sempre o do admin que está chamando (nunca lido do formulário) — impede um admin de uma barbearia criar membro em outra.

Sem essas três checagens, qualquer usuário autenticado (mesmo um barbeiro comum) poderia chamar a action e criar contas arbitrárias, já que o client admin não tem esse limite embutido.

## Fora de escopo (explicitamente adiado)

- Redefinir senha de um barbeiro existente (o admin não tem como resetar hoje; se um barbeiro esquecer a senha, fica sem acesso — problema pré-existente, não piora com esta feature, mas continua sem solução).
- Fluxo de convite por e-mail / "esqueci minha senha" — dependeria de SMTP configurado no projeto, decisão explicitamente adiada pelo usuário.
- Editar e-mail de um barbeiro existente.
- Upload de foto (`foto_url` já existe na tabela mas não é exposto em nenhuma tela hoje — continua assim).

## Testes

Sem lógica de cálculo nova (diferente do ciclo `visual-saas-clean`) — é CRUD simples sobre uma tabela e políticas de RLS que já existem e já têm cobertura em `supabase/tests/database/0001_tenant_isolation.test.sql`. Verificação via `npm run build` + passada manual (criar barbeiro novo, confirmar login com a senha definida, editar nome/telefone, desativar e confirmar que some da lista de agendamento mas mantém histórico, reativar) — navegador se disponível na hora da implementação, senão documentar a limitação como já aconteceu nos ciclos anteriores.
