import { readFile, writeFile, mkdir, rm, stat } from 'node:fs/promises'
import path from 'node:path'

/** Podium's default personality. Kept short on purpose — it's in every prompt. */
export const DEFAULT_SOUL = [
  'Voice: a calm, capable pair-programmer who runs entirely on the user\'s own machine.',
  'Be warm, direct, and lightly witty. Explain just enough, never condescend, and celebrate small wins.',
  'Favor clarity over ceremony. When unsure, say so plainly and propose the next step.',
].join('\n')

/** Heading under which learned/explicit preferences are appended so the base voice stays intact. */
export const LEARNED_HEADER = '## Learned preferences'

const userSoulPath = (home: string) => path.join(home, '.podium', 'SOUL.md')
const projectSoulPath = (cwd: string) => path.join(cwd, 'SOUL.md')

async function exists(p: string): Promise<boolean> {
  try { await stat(p); return true } catch { return false }
}

/**
 * The file /soul edits and auto-evolution writes to: the project SOUL.md if one
 * exists (so it stays the source of truth), else the user-level ~/.podium/SOUL.md.
 */
export async function activeSoulPath(cwd: string, home: string): Promise<string> {
  return (await exists(projectSoulPath(cwd))) ? projectSoulPath(cwd) : userSoulPath(home)
}

/**
 * Load Podium's "soul" (personality/voice): project SOUL.md, else user
 * ~/.podium/SOUL.md, else the built-in default. Single-sourced so it appears
 * in the system prompt and is viewable via /soul.
 */
export async function loadSoul(cwd: string, home: string): Promise<string> {
  for (const file of [projectSoulPath(cwd), userSoulPath(home)]) {
    try {
      const content = (await readFile(file, 'utf8')).trim()
      if (content) return content
    } catch { /* missing, keep looking */ }
  }
  return DEFAULT_SOUL
}

/** Split a soul file into its base voice and the list of learned-preference bullets. */
function splitSoul(text: string): { base: string; prefs: string[] } {
  const idx = text.indexOf(LEARNED_HEADER)
  if (idx === -1) return { base: text.trim(), prefs: [] }
  const base = text.slice(0, idx).trim()
  const prefs = text.slice(idx + LEARNED_HEADER.length)
    .split('\n')
    .map(l => l.replace(/^\s*[-*]\s*/, '').trim())
    .filter(Boolean)
  return { base, prefs }
}

function composeSoul(base: string, prefs: string[]): string {
  const b = base.trim() || DEFAULT_SOUL
  if (!prefs.length) return b
  return `${b}\n\n${LEARNED_HEADER}\n${prefs.map(p => `- ${p}`).join('\n')}\n`
}

/**
 * Append a one-line preference to the active soul file under "## Learned
 * preferences", seeding from the default voice if no file exists yet. No-ops if
 * the preference is already present. Returns the new full soul text.
 */
export async function addLearnedPreference(cwd: string, home: string, line: string): Promise<string> {
  const pref = line.trim().replace(/\s+/g, ' ')
  if (!pref) return await loadSoul(cwd, home)
  const target = await activeSoulPath(cwd, home)
  const current = await readFile(target, 'utf8').catch(() => DEFAULT_SOUL)
  const { base, prefs } = splitSoul(current)
  if (prefs.some(p => p.toLowerCase() === pref.toLowerCase())) return composeSoul(base, prefs)
  const next = composeSoul(base, [...prefs, pref])
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, next)
  return next
}

/**
 * Drop all learned preferences, keeping the base voice. If that leaves the
 * built-in default with nothing custom, remove the file so it falls back cleanly.
 * Returns the resulting soul text.
 */
export async function clearLearnedPreferences(cwd: string, home: string): Promise<string> {
  const target = await activeSoulPath(cwd, home)
  const current = await readFile(target, 'utf8').catch(() => '')
  if (!current) return DEFAULT_SOUL
  const { base } = splitSoul(current)
  if (!base || base === DEFAULT_SOUL) {
    await rm(target, { force: true })
    return DEFAULT_SOUL
  }
  await writeFile(target, base)
  return base
}
