'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { TableRow, TableCell } from '@/components/ui/table'

type Barbeiro = {
  id: string
  nome: string
  telefone: string | null
  ativo: boolean
  plano_carreira_id: string | null
  meta_prospeccao_dia: number | null
}
type Plano = { id: string; nome: string; ativo: boolean }
type Expediente = { dia_semana: number; hora_inicio: string; hora_fim: string }

const NOMES_DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

function construirDiasIniciais(expediente: Expediente[]) {
  return NOMES_DIAS.map((nome, dia_semana) => {
    const existente = expediente.find((e) => e.dia_semana === dia_semana)
    return {
      dia_semana,
      nome,
      trabalha: !!existente,
      hora_inicio: existente?.hora_inicio.slice(0, 5) ?? '09:00',
      hora_fim: existente?.hora_fim.slice(0, 5) ?? '18:00',
    }
  })
}

export function BarbeiroRow({
  barbeiro,
  planos,
  expediente,
  vincularPlanoAction,
}: {
  barbeiro: Barbeiro
  planos: Plano[]
  expediente: Expediente[]
  vincularPlanoAction: (formData: FormData) => void
}) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [nome, setNome] = useState(barbeiro.nome)
  const [telefone, setTelefone] = useState(barbeiro.telefone ?? '')
  const [salvando, setSalvando] = useState(false)
  const [mostrarExpediente, setMostrarExpediente] = useState(false)
  const [dias, setDias] = useState(() => construirDiasIniciais(expediente))
  const [salvandoExpediente, setSalvandoExpediente] = useState(false)

  async function salvar() {
    setSalvando(true)
    const supabase = getBrowserSupabaseClient()
    await supabase.from('membros').update({ nome, telefone: telefone || null }).eq('id', barbeiro.id)
    setSalvando(false)
    setEditando(false)
    router.refresh()
  }

  function cancelar() {
    setNome(barbeiro.nome)
    setTelefone(barbeiro.telefone ?? '')
    setEditando(false)
  }

  async function alternarAtivo() {
    const supabase = getBrowserSupabaseClient()
    await supabase.from('membros').update({ ativo: !barbeiro.ativo }).eq('id', barbeiro.id)
    router.refresh()
  }

  function atualizarDia(index: number, patch: Partial<{ trabalha: boolean; hora_inicio: string; hora_fim: string }>) {
    setDias((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)))
  }

  function diasValidos() {
    return dias.every((d) => !d.trabalha || (d.hora_inicio && d.hora_fim && d.hora_fim > d.hora_inicio))
  }

  async function salvarExpediente() {
    if (!diasValidos()) {
      alert('Confira os horários — a hora de término precisa ser depois da hora de início em todo dia marcado.')
      return
    }
    setSalvandoExpediente(true)
    const supabase = getBrowserSupabaseClient()

    const { error: erroExcluir } = await supabase.from('horarios_trabalho').delete().eq('membro_id', barbeiro.id)
    if (erroExcluir) {
      setSalvandoExpediente(false)
      alert(erroExcluir.message)
      return
    }

    const diasParaSalvar = dias
      .filter((d) => d.trabalha)
      .map((d) => ({
        membro_id: barbeiro.id,
        dia_semana: d.dia_semana,
        hora_inicio: d.hora_inicio,
        hora_fim: d.hora_fim,
      }))

    if (diasParaSalvar.length > 0) {
      const { error: erroInserir } = await supabase.from('horarios_trabalho').insert(diasParaSalvar)
      if (erroInserir) {
        setSalvandoExpediente(false)
        alert(`O expediente anterior já foi apagado e o novo não pôde ser gravado — o barbeiro está sem expediente. Tente salvar de novo.\n\n${erroInserir.message}`)
        return
      }
    }

    setSalvandoExpediente(false)
    setMostrarExpediente(false)
    router.refresh()
  }

  const celulaPlano = (
    <TableCell>
      <form
        key={`${barbeiro.id}-${barbeiro.plano_carreira_id ?? 'none'}-${barbeiro.meta_prospeccao_dia ?? 'none'}`}
        action={vincularPlanoAction}
        className="flex gap-2 items-center flex-wrap"
      >
        <input type="hidden" name="membro_id" value={barbeiro.id} />
        <select name="plano_carreira_id" defaultValue={barbeiro.plano_carreira_id ?? ''} className="border rounded px-2 py-1 bg-input">
          <option value="">Sem plano</option>
          {planos.filter((p) => p.ativo || p.id === barbeiro.plano_carreira_id).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
        <input
          name="meta_prospeccao_dia"
          type="number"
          defaultValue={barbeiro.meta_prospeccao_dia ?? ''}
          placeholder="Meta diária"
          className="border rounded px-2 py-1 w-32 bg-input"
        />
        <Button type="submit" variant="outline">Salvar</Button>
      </form>
    </TableCell>
  )

  const linhaExpediente = mostrarExpediente && (
    <TableRow>
      <TableCell colSpan={4} className="whitespace-normal bg-muted/30">
        <div className="p-2">
          <p className="font-heading text-sm font-bold mb-3">Expediente</p>
          {dias.map((d, i) => (
            <div key={d.dia_semana} className="flex items-center gap-3 mb-2">
              <label className="flex items-center gap-2 w-32">
                <input
                  type="checkbox"
                  checked={d.trabalha}
                  onChange={(e) => atualizarDia(i, { trabalha: e.target.checked })}
                />
                <span className="text-sm">{d.nome}</span>
              </label>
              <input
                type="time"
                value={d.hora_inicio}
                onChange={(e) => atualizarDia(i, { hora_inicio: e.target.value })}
                disabled={!d.trabalha}
                className="border rounded px-2 py-1 bg-input disabled:opacity-50"
              />
              <span className="text-sm text-muted-foreground">até</span>
              <input
                type="time"
                value={d.hora_fim}
                onChange={(e) => atualizarDia(i, { hora_fim: e.target.value })}
                disabled={!d.trabalha}
                className="border rounded px-2 py-1 bg-input disabled:opacity-50"
              />
            </div>
          ))}
          <div className="flex gap-2 mt-3">
            <Button type="button" onClick={salvarExpediente} disabled={salvandoExpediente}>Salvar expediente</Button>
            <Button type="button" variant="outline" onClick={() => setMostrarExpediente(false)}>Fechar</Button>
          </div>
        </div>
      </TableCell>
    </TableRow>
  )

  if (editando) {
    return (
      <>
        <TableRow>
          <TableCell><Input value={nome} onChange={(e) => setNome(e.target.value)} className="w-32" /></TableCell>
          <TableCell><Input value={telefone} onChange={(e) => setTelefone(e.target.value)} className="w-32" /></TableCell>
          {celulaPlano}
          <TableCell className="flex gap-2">
            <Button type="button" onClick={salvar} disabled={salvando}>Salvar</Button>
            <Button type="button" variant="outline" onClick={cancelar}>Cancelar</Button>
          </TableCell>
        </TableRow>
        {linhaExpediente}
      </>
    )
  }

  return (
    <>
      <TableRow className={barbeiro.ativo ? '' : 'opacity-50'}>
        <TableCell>{barbeiro.nome}</TableCell>
        <TableCell>{barbeiro.telefone}</TableCell>
        {celulaPlano}
        <TableCell className="flex gap-2">
          <button type="button" onClick={() => setEditando(true)} className="text-xs text-primary underline">Editar</button>
          <button type="button" onClick={alternarAtivo} className="text-xs text-destructive underline">{barbeiro.ativo ? 'Desativar' : 'Reativar'}</button>
          <button
            type="button"
            onClick={() => {
              if (!mostrarExpediente) setDias(construirDiasIniciais(expediente))
              setMostrarExpediente((v) => !v)
            }}
            className="text-xs text-primary underline"
          >
            Expediente
          </button>
        </TableCell>
      </TableRow>
      {linhaExpediente}
    </>
  )
}
