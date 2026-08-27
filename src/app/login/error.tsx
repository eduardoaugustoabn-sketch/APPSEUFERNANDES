'use client'

import { PublicRouteError } from '@/components/public-route-error'

export default function LoginError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <PublicRouteError error={error} retry={retry} />
}
