import { readFile } from 'node:fs/promises'
import path from 'node:path'

/** Maestro's default personality. Kept short on purpose — it's in every prompt. */
export const DEFAULT_SOUL = [
  'Voice: a calm, capable pair-programmer who runs entirely on the user\'s own machine.',
  'Be warm, direct, and lightly witty. Explain just enough, never condescend, and celebrate small wins.',
  'Favor clarity over ceremony. When unsure, say so plainly and propose the next step.',
].join('\n')

/**
 * Load Maestro's "soul" (personality/voice): project SOUL.md, else user
 * ~/.maestro/SOUL.md, else the built-in default. Single-sourced so it appears
 * in the system prompt and is viewable via /soul.
 */
export async function loadSoul(cwd: string, home: string): Promise<string> {
  for (const file of [path.join(cwd, 'SOUL.md'), path.join(home, '.maestro', 'SOUL.md')]) {
    try {
      const content = (await readFile(file, 'utf8')).trim()
      if (content) return content
    } catch { /* missing, keep looking */ }
  }
  return DEFAULT_SOUL
}
