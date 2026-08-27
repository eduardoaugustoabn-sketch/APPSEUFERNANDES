import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 px-4">
      <div className="flex flex-col items-center gap-3">
        <div className="w-[46px] h-[46px] rounded-[14px] bg-primary flex items-center justify-center font-extrabold text-lg text-primary-foreground">SF</div>
        <div className="flex flex-col items-center leading-tight">
          <span className="text-lg font-bold tracking-tight">Seu Fernandes</span>
          <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-muted-foreground">Barbearia</span>
        </div>
      </div>
      <Card className="w-full max-w-sm">
        <CardContent className="p-6 flex flex-col items-center text-center gap-3">
          <h1 className="font-heading text-lg font-bold">Página não encontrada</h1>
          <p className="text-sm text-muted-foreground">O link que você acessou não existe ou pode ter mudado.</p>
          <Link href="/" className="text-sm text-primary underline">Voltar para o início</Link>
        </CardContent>
      </Card>
    </div>
  )
}
