import { readFile, writeFile, mkdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export interface MaestroConfig {
  backend: 'ollama' | 'lmstudio' | 'mlx'
  model: string
  contextSize: number
}

function configDir(override?: string): string {
  return override ?? path.join(os.homedir(), '.maestro')
}

export async function loadConfig(dir?: string): Promise<MaestroConfig | null> {
  try {
    const raw = await readFile(path.join(configDir(dir), 'config.json'), 'utf8')
    return JSON.parse(raw) as MaestroConfig
  } catch {
    return null
  }
}

export async function saveConfig(cfg: MaestroConfig, dir?: string): Promise<void> {
  const d = configDir(dir)
  await mkdir(d, { recursive: true })
  await writeFile(path.join(d, 'config.json'), JSON.stringify(cfg, null, 2))
}
