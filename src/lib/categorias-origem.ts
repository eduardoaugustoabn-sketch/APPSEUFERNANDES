// Fonte da verdade do lado TS para as categorias de origem do cliente. O
// lado do banco é o CHECK constraint em `clientes.categoria_origem`,
// definido em supabase/migrations/0022_cliente_categoria_origem.sql — ao
// adicionar uma 6ª categoria, atualize os dois lugares.
export const CATEGORIAS_ORIGEM = [
  { value: 'indicacao', label: 'Indicação' },
  { value: 'redes_sociais', label: 'Redes sociais' },
  { value: 'google_internet', label: 'Google/Internet' },
  { value: 'passou_na_rua', label: 'Passou na rua' },
  { value: 'outro', label: 'Outro' },
] as const

export type CategoriaOrigem = typeof CATEGORIAS_ORIGEM[number]['value']
