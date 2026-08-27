'use client'

import { useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export function RouteError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <Card>
      <CardContent className="p-6 flex flex-col items-center text-center gap-3">
        <h1 className="font-heading text-lg font-bold">Algo deu errado nesta página</h1>
        <p className="text-sm text-muted-foreground">Tente novamente em alguns instantes.</p>
        <Button onClick={() => retry()}>Tentar de novo</Button>
      </CardContent>
    </Card>
  )
}
