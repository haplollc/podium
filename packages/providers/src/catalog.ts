// Static import so the catalog is inlined into the bundle — no runtime file
// path resolution (which breaks once the package is published via npm/brew).
import catalogData from '../../../models/catalog.json'

export interface CatalogModel {
  id: string
  label: string
  params: string
  quant: string
  weightsGB: number
  kvPerKTokenGB: number
  defaultContext: number
  tools: boolean
  vision?: boolean
  minTierGB: number
  recommendedForGB: number[]
}

export async function loadCatalog(): Promise<CatalogModel[]> {
  return (catalogData as { models: CatalogModel[] }).models
}

/** Best recommended model whose recommendedForGB includes this tier, else the
 *  largest model whose minTierGB <= memoryGB. */
export function recommendedFor(cat: CatalogModel[], memoryGB: number): CatalogModel | undefined {
  const exact = cat.find(m => m.recommendedForGB.includes(memoryGB))
  if (exact) return exact
  const eligible = cat.filter(m => m.minTierGB <= memoryGB).sort((a, b) => b.weightsGB - a.weightsGB)
  return eligible[0]
}
