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
    const rec = recommendedFor(cat, 16)
    expect(rec?.id).toBe('qwen2.5-coder:7b')
  })
})
