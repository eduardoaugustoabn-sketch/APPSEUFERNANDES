import { FichaCliente } from '@/components/ficha-cliente'

export default async function ClienteAdminPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <FichaCliente clienteId={id} />
}
