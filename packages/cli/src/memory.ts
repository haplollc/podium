import { readFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * Load hierarchical project memory: user-level then project-level, MAESTRO.md
 * preferred but CLAUDE.md honored for Claude Code compatibility. Missing files
 * are skipped. Returns the concatenation (project last, so it can refine user).
 */
export async function loadMemory(cwd: string, home: string): Promise<string> {
  const candidates = [
    path.join(home, '.maestro', 'MAESTRO.md'),
    path.join(home, 'CLAUDE.md'),
    path.join(cwd, 'MAESTRO.md'),
    path.join(cwd, 'CLAUDE.md'),
  ]
  const chunks: string[] = []
  for (const file of candidates) {
    try {
      const content = (await readFile(file, 'utf8')).trim()
      if (content) chunks.push(content)
    } catch { /* missing file, skip */ }
  }
  return chunks.join('\n\n')
}
