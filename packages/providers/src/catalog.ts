import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

export interface CatalogModel {
  id: string
  label: string
  params: string
  quant: string
  weightsGB: number
  kvPerKTokenGB: number
  defaultContext: number
  tools: boolean
  minTierGB: number
  recommendedForGB: number[]
}

// models/catalog.json lives at the repo root, two levels up from dist/.
function catalogPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url))
  return path.resolve(here, '../../../models/catalog.json')
}

export async function loadCatalog(p = catalogPath()): Promise<CatalogModel[]> {
  const raw = await readFile(p, 'utf8')
  return JSON.parse(raw).models as CatalogModel[]
}

/** Best recommended model whose recommendedForGB includes this tier, else the
 *  largest model whose minTierGB <= memoryGB. */
export function recommendedFor(cat: CatalogModel[], memoryGB: number): CatalogModel | undefined {
  const exact = cat.find(m => m.recommendedForGB.includes(memoryGB))
  if (exact) return exact
  const eligible = cat.filter(m => m.minTierGB <= memoryGB).sort((a, b) => b.weightsGB - a.weightsGB)
  return eligible[0]
}
