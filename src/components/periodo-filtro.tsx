'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { PeriodoPreset } from '@/lib/periodo'

export function PeriodoFiltro({ preset, inicio, fim }: { preset: PeriodoPreset; inicio: string; fim: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const [presetSelecionado, setPresetSelecionado] = useState<PeriodoPreset>(preset)
  const [inicioCustom, setInicioCustom] = useState(inicio)
  const [fimCustom, setFimCustom] = useState(fim)

  // Mantém o filtro em sincronia se a URL mudar por fora (voltar/avançar
  // no navegador, link direto com query params diferentes).
  useEffect(() => {
    setPresetSelecionado(preset)
    setInicioCustom(inicio)
    setFimCustom(fim)
  }, [preset, inicio, fim])

  function navegar(novoPreset: PeriodoPreset, novoInicio?: string, novoFim?: string) {
    const params = new URLSearchParams({ periodo: novoPreset })
    if (novoPreset === 'personalizado' && novoInicio && novoFim) {
      params.set('inicio', novoInicio)
      params.set('fim', novoFim)
    }
    router.push(`${pathname}?${params.toString()}`)
  }

  function aoMudarPreset(e: React.ChangeEvent<HTMLSelectElement>) {
    const novoPreset = e.target.value as PeriodoPreset
    setPresetSelecionado(novoPreset)
    if (novoPreset !== 'personalizado') navegar(novoPreset)
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Select value={presetSelecionado} onChange={aoMudarPreset} aria-label="Período" className="w-40">
        <option value="este_mes">Este mês</option>
        <option value="mes_passado">Mês passado</option>
        <option value="personalizado">Personalizado</option>
      </Select>
      {presetSelecionado === 'personalizado' && (
        <>
          <Input type="date" value={inicioCustom} onChange={(e) => setInicioCustom(e.target.value)} className="w-40" aria-label="Data de início" />
          <span className="text-sm text-muted-foreground">até</span>
          <Input type="date" value={fimCustom} onChange={(e) => setFimCustom(e.target.value)} className="w-40" aria-label="Data de fim" />
          <Button type="button" onClick={() => navegar('personalizado', inicioCustom, fimCustom)} disabled={!inicioCustom || !fimCustom}>
            Aplicar
          </Button>
        </>
      )}
    </div>
  )
}
