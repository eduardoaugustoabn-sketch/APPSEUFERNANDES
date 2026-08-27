'use client'

import { PublicRouteError } from '@/components/public-route-error'

export default function BarbeariaError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <PublicRouteError error={error} retry={retry} />
}
