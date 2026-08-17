'use client'

import { useState } from 'react'
import { getBrowserSupabaseClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CATEGORIAS_ORIGEM } from '@/lib/categorias-origem'

type Servico = { id: string; nome: string; duracao_minutos: number; preco: number }
type Barbeiro = { id: string; nome: string }

export function PublicBookingFlow({
  barbearia, servicos, barbeiros,
}: { barbearia: { id: string; nome: string }; servicos: Servico[]; barbeiros: Barbeiro[] }) {
  const [servico, setServico] = useState<Servico | null>(null)
  const [barbeiro, setBarbeiro] = useState<Barbeiro | null>(null)
  const [data] = useState(() => new Date().toISOString().slice(0, 10))
  const [horarios, setHorarios] = useState<{ hora_inicio: string; hora_fim: string }[]>([])
  const [horario, setHorario] = useState<string | null>(null)
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [bairro, setBairro] = useState('')
  const [cidade, setCidade] = useState('')
  const [categoriaOrigem, setCategoriaOrigem] = useState('')
  const [reconhecimento, setReconhecimento] = useState<string | null>(null)
  const [confirmado, setConfirmado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function buscarHorarios(s: Servico, b: Barbeiro) {
    const supabase = getBrowserSupabaseClient()
    const { data: slots } = await supabase.rpc('horarios_disponiveis', {
      p_barbearia_id: barbearia.id, p_membro_id: b.id, p_servico_id: s.id, p_data: data,
    })
    setHorarios(slots ?? [])
    setHorario(null)
  }

  // Each button sets only its own piece of state — loading horários only
  // requires BOTH servico and barbeiro, so whichever click completes the
  // pair (in either order) is the one that triggers the RPC.
  function selecionarServico(s: Servico) {
    setServico(s)
    if (barbeiro) buscarHorarios(s, barbeiro)
  }

  function selecionarBarbeiro(b: Barbeiro) {
    setBarbeiro(b)
    if (servico) buscarHorarios(servico, b)
  }

  async function verificarCliente(tel: string) {
    setTelefone(tel)
    if (tel.length < 10) { setReconhecimento(null); return }
    const supabase = getBrowserSupabaseClient()
    const { data: rows } = await supabase.rpc('reconhecer_cliente', { p_barbearia_id: barbearia.id, p_telefone: tel })
    const encontrado = rows?.[0]
    if (encontrado) {
      setNome(encontrado.nome)
      setReconhecimento(`Bem-vindo de volta, ${encontrado.nome}! Este será seu ${encontrado.total_cortes + 1}º corte aqui.`)
    } else {
      setReconhecimento(null)
    }
  }

  async function confirmar() {
    if (!servico || !barbeiro || !horario) return
    if (!reconhecimento && !categoriaOrigem) { setErro('Escolha como você conheceu a barbearia.'); return }
    const supabase = getBrowserSupabaseClient()
    const { error } = await supabase.rpc('criar_agendamento_publico', {
      p_barbearia_id: barbearia.id, p_membro_id: barbeiro.id, p_servico_id: servico.id,
      p_data: data, p_hora_inicio: horario, p_nome_cliente: nome, p_telefone_cliente: telefone,
      p_bairro: bairro || null, p_cidade: cidade || null, p_categoria_origem: categoriaOrigem || null,
    })
    if (error) { setErro(error.message); return }
    setConfirmado(true)
  }

  if (confirmado) {
    return <p className="p-6">✓ Agendamento confirmado! {servico?.nome} com {barbeiro?.nome} às {horario}.</p>
  }

  return (
    <div className="max-w-md mx-auto p-6">
      <h1 className="font-heading text-2xl font-bold mb-4">{barbearia.nome}</h1>

      <p className="font-heading text-base font-semibold mt-4">1. Escolha o serviço</p>
      <div className="flex gap-2 flex-wrap">
        {servicos.map((s) => (
          <button
            key={s.id}
            onClick={() => selecionarServico(s)}
            className={`border rounded px-3 py-1 ${servico?.id === s.id ? 'bg-primary text-primary-foreground' : ''}`}
          >
            {s.nome} ({s.duracao_minutos}min · R${s.preco})
          </button>
        ))}
      </div>

      <p className="font-heading text-base font-semibold mt-4">2. Escolha o barbeiro</p>
      <div className="flex gap-2 flex-wrap">
        {barbeiros.map((b) => (
          <button
            key={b.id}
            onClick={() => selecionarBarbeiro(b)}
            className={`border rounded px-3 py-1 ${barbeiro?.id === b.id ? 'bg-primary text-primary-foreground' : ''}`}
          >
            {b.nome}
          </button>
        ))}
      </div>

      {horarios.length > 0 && (
        <>
          <p className="font-heading text-base font-semibold mt-4">3. Escolha o horário</p>
          <div className="flex gap-2 flex-wrap">
            {horarios.map((h) => (
              <button key={h.hora_inicio} onClick={() => setHorario(h.hora_inicio)} className="border rounded px-3 py-1">
                {h.hora_inicio}
              </button>
            ))}
          </div>
        </>
      )}

      {horario && (
        <>
          <p className="font-heading text-base font-semibold mt-4">4. Seus dados</p>
          <Input placeholder="Nome" value={nome} onChange={(e) => setNome(e.target.value)} className="mb-2" />
          <Input placeholder="Telefone" value={telefone} onBlur={(e) => verificarCliente(e.target.value)} onChange={(e) => setTelefone(e.target.value)} className="mb-2" />
          <Input placeholder="Bairro (opcional)" value={bairro} onChange={(e) => setBairro(e.target.value)} className="mb-2" />
          <Input placeholder="Cidade (opcional)" value={cidade} onChange={(e) => setCidade(e.target.value)} className="mb-2" />
          <select
            value={categoriaOrigem}
            onChange={(e) => setCategoriaOrigem(e.target.value)}
            className="border rounded px-2 py-1 w-full"
          >
            <option value="">Como conheceu a barbearia?</option>
            {CATEGORIAS_ORIGEM.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          {reconhecimento && <p className="text-sm text-primary mt-2">{reconhecimento}</p>}
          {erro && <p className="text-sm text-destructive mt-2">{erro}</p>}
          <Button onClick={confirmar} className="w-full mt-4">Confirmar agendamento</Button>
        </>
      )}
    </div>
  )
}
