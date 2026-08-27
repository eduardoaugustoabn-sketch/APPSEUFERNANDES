'use client'

import { Plus_Jakarta_Sans, IBM_Plex_Mono } from 'next/font/google'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import './globals.css'

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: '--font-geist-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
})

const ibmPlexMono = IBM_Plex_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  weight: ['400', '500'],
})

export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="pt-BR" className={`${plusJakartaSans.variable} ${ibmPlexMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col items-center justify-center gap-8 px-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-[46px] h-[46px] rounded-[14px] bg-primary flex items-center justify-center font-extrabold text-lg text-primary-foreground">SF</div>
          <div className="flex flex-col items-center leading-tight">
            <span className="text-lg font-bold tracking-tight">Seu Fernandes</span>
            <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-muted-foreground">Barbearia</span>
          </div>
        </div>
        <title>Seu Fernandes</title>
        <Card className="w-full max-w-sm">
          <CardContent className="p-6 flex flex-col items-center text-center gap-3">
            <h1 className="font-heading text-lg font-bold">Algo deu errado</h1>
            <p className="text-sm text-muted-foreground">Tente novamente em alguns instantes.</p>
            <Button onClick={() => retry()}>Tentar de novo</Button>
          </CardContent>
        </Card>
      </body>
    </html>
  )
}
