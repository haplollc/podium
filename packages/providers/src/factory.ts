import type { Provider } from './types.js'
import { OllamaProvider } from './ollama.js'
import { LMStudioProvider } from './lmstudio.js'
import { MLXProvider } from './mlx.js'

export type BackendId = 'ollama' | 'lmstudio' | 'mlx'

export function getProvider(backend: BackendId): Provider {
  if (backend === 'lmstudio') return new LMStudioProvider()
  if (backend === 'mlx') return new MLXProvider()
  return new OllamaProvider()
}

/** Probe all known backends and return the ids that are currently running. */
export async function detectBackends(): Promise<BackendId[]> {
  const all: BackendId[] = ['ollama', 'lmstudio', 'mlx']
  const results = await Promise.all(
    all.map(async id => ({ id, ok: (await getProvider(id).health()).running })),
  )
  return results.filter(r => r.ok).map(r => r.id)
}
