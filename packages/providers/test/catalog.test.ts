import { describe, it, expect } from 'vitest'
import { loadCatalog, recommendedFor } from '../src/catalog.js'

describe('catalog', () => {
  it('loads all models from catalog.json', async () => {
    const cat = await loadCatalog()
    expect(cat.length).toBeGreaterThanOrEqual(5)
    expect(cat.find(m => m.id === 'qwen2.5-coder:7b')).toBeTruthy()
  })

  it('recommends the 7B model for a 16GB machine', async () => {
    const cat = await loadCatalog()
    expect(recommendedFor(cat, 16)?.id).toBe('qwen2.5-coder:7b')
  })

  it('recommends a 14B/20B class model for a 24GB machine', async () => {
    const cat = await loadCatalog()
    expect(recommendedFor(cat, 24)?.recommendedForGB).toContain(24)
  })

  it('falls back to the largest eligible model when no exact tier matches', async () => {
    const cat = await loadCatalog()
    // 48GB has no exact recommendedForGB entry -> largest model with minTierGB <= 48
    const rec = recommendedFor(cat, 48)
    expect(rec?.id).toBe('qwen3-coder:30b')
  })

  it('returns undefined when nothing fits the tier', async () => {
    const cat = await loadCatalog()
    expect(recommendedFor(cat, 4)).toBeUndefined()
  })
})
