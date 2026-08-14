import { getServerSupabaseClient } from '@/lib/supabase/server'
import { getAdminSupabaseClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { BarbeiroRow } from '@/components/barbeiro-row'
import { Table, TableHeader, TableBody, TableRow, TableHead } from '@/components/ui/table'

async function vincularPlano(formData: FormData) {
  'use server'
  const supabase = await getServerSupabaseClient()
  const metaProspeccaoDiaRaw = formData.get('meta_prospeccao_dia') as string
  const metaProspeccaoSemanaRaw = formData.get('meta_prospeccao_semana') as string
  const metaFaturamentoMesRaw = formData.get('meta_faturamento_mes') as string

  await supabase
    .from('membros')
    .update({
      plano_carreira_id: (formData.get('plano_carreira_id') as string) || null,
      meta_prospeccao_dia: metaProspeccaoDiaRaw === '' ? null : Number(metaProspeccaoDiaRaw),
      meta_prospeccao_semana: metaProspeccaoSemanaRaw === '' ? null : Number(metaProspeccaoSemanaRaw),
      meta_faturamento_mes: metaFaturamentoMesRaw === '' ? null : Number(metaFaturamentoMesRaw),
    })
    .eq('id', formData.get('membro_id') as string)
  revalidatePath('/admin/barbeiros')
}

async function criarBarbeiro(formData: FormData) {
  'use server'
  const supabase = await getServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    throw new Error('Não autenticado.')
  }

  // O client com service-role usado abaixo ignora RLS por completo — esta
  // checagem é o único ponto que impede um usuário autenticado qualquer
  // (inclusive um barbeiro comum) de criar contas em qualquer barbearia.
  const { data: chamador } = await supabase
    .from('membros')
    .select('barbearia_id, papel, ativo')
    .eq('user_id', user.id)
    .single()
  if (!chamador || chamador.papel !== 'admin' || !chamador.ativo) {
    throw new Error('Apenas administradores podem cadastrar barbeiros.')
  }

  const nome = formData.get('nome') as string
  const telefone = (formData.get('telefone') as string) || null
  const email = formData.get('email') as string
  const senha = formData.get('senha') as string

  const admin = getAdminSupabaseClient()
  const { data: novoUsuario, error: erroCriacao } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
  })
  if (erroCriacao || !novoUsuario.user) {
    throw new Error(erroCriacao?.message ?? 'Não foi possível criar o usuário.')
  }

  const { error: erroMembro } = await admin.from('membros').insert({
    barbearia_id: chamador.barbearia_id,
    user_id: novoUsuario.user.id,
    papel: 'barbeiro',
    nome,
    telefone,
  })
  if (erroMembro) {
    // Sem isso, um usuário de autenticação órfão fica pra trás — consegue
    // logar, mas sem linha em `membros` fica preso num loop de redirect
    // entre / e /painel, e o e-mail passa a estar "usado" para sempre.
    await admin.auth.admin.deleteUser(novoUsuario.user.id)
    throw new Error(erroMembro.message)
  }

  revalidatePath('/admin/barbeiros')
}

export default async function BarbeirosPage() {
  const supabase = await getServerSupabaseClient()
  const { data: barbeiros } = await supabase.from('membros').select('*').eq('papel', 'barbeiro').order('nome')
  const { data: planos } = await supabase.from('planos_carreira').select('*')

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold mb-4">Barbeiros</h1>

      <form action={criarBarbeiro} className="flex gap-2 mb-6 flex-wrap">
        <Input name="nome" placeholder="Nome" required />
        <Input name="telefone" placeholder="Telefone" />
        <Input name="email" type="email" placeholder="E-mail" required />
        <Input name="senha" type="password" placeholder="Senha" required minLength={6} />
        <Button type="submit">Adicionar</Button>
      </form>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Telefone</TableHead>
            <TableHead>
              <div className="flex gap-2 flex-wrap">
                <span>Plano de carreira</span>
                <span className="w-36">Meta prospecção/dia</span>
                <span className="w-40">Meta prospecção/semana</span>
                <span className="w-44">Meta faturamento/mês (R$)</span>
              </div>
            </TableHead>
            <TableHead>Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {barbeiros?.map((b) => (
            <BarbeiroRow key={b.id} barbeiro={b} planos={planos ?? []} vincularPlanoAction={vincularPlano} />
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
