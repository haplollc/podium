import { readFile, writeFile, mkdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { PermissionMode } from '@podium/core'

export interface PodiumConfig {
  backend: 'ollama' | 'lmstudio' | 'mlx'
  model: string
  contextSize: number
  mode?: PermissionMode   // permission mode; defaults to 'default' when absent
}

function configDir(override?: string): string {
  return override ?? path.join(os.homedir(), '.podium')
}

export async function loadConfig(dir?: string): Promise<PodiumConfig | null> {
  try {
    const raw = await readFile(path.join(configDir(dir), 'config.json'), 'utf8')
    return JSON.parse(raw) as PodiumConfig
  } catch {
    return null
  }
}

export async function saveConfig(cfg: PodiumConfig, dir?: string): Promise<void> {
  const d = configDir(dir)
  await mkdir(d, { recursive: true })
  await writeFile(path.join(d, 'config.json'), JSON.stringify(cfg, null, 2))
}
