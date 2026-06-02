import { execa } from 'execa'
import { spawn } from 'node:child_process'
import type { Provider } from '@podium/providers'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function commandExists(cmd: string): Promise<boolean> {
  const r = await execa('which', [cmd], { reject: false })
  return r.exitCode === 0 && r.stdout.trim().length > 0
}

export interface EnsureResult {
  running: boolean
  /** Why it isn't running, for the backend-error screen. */
  reason?: 'ollama-missing' | 'install-failed' | 'start-failed'
}

/**
 * Make the backend usable with zero manual steps:
 *  1. already serving?  → done
 *  2. ollama installed but not serving?  → start `ollama serve` (detached)
 *  3. ollama missing but brew present?   → `brew install ollama`, then serve
 *  4. otherwise → report so the UI can show manual instructions
 */
export async function ensureOllama(provider: Provider, onStatus: (s: string) => void): Promise<EnsureResult> {
  if ((await provider.health()).running) return { running: true }

  if (!(await commandExists('ollama'))) {
    if (!(await commandExists('brew'))) return { running: false, reason: 'ollama-missing' }
    onStatus('Installing Ollama (one-time)…')
    try {
      await execa('brew', ['install', 'ollama'], { reject: true })
    } catch {
      return { running: false, reason: 'install-failed' }
    }
  }

  onStatus('Starting Ollama…')
  try {
    // Flash attention + quantized KV cache cut memory/compute (and heat) noticeably
    // on Apple Silicon. Only applies when WE start the server.
    spawn('ollama', ['serve'], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, OLLAMA_FLASH_ATTENTION: '1', OLLAMA_KV_CACHE_TYPE: 'q8_0' },
    }).unref()
  } catch {
    return { running: false, reason: 'start-failed' }
  }

  for (let i = 0; i < 24; i++) {
    if ((await provider.health()).running) return { running: true }
    await sleep(500)
  }
  return { running: false, reason: 'start-failed' }
}
