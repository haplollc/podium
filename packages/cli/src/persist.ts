import { readFile, writeFile, appendFile, mkdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { ChatMessage } from '@podium/providers'
import type { TranscriptEntry } from '@podium/tui'

const MAX_HISTORY = 100
const MAX_TRANSCRIPT = 200

function podiumDir(override?: string): string {
  return override ?? path.join(os.homedir(), '.podium')
}

function historyFile(dir?: string): string {
  return path.join(podiumDir(dir), 'history.jsonl')
}

/** One saved-session file per project (cwd), so /resume restores the right work. */
function sessionFile(cwd: string, dir?: string): string {
  const slug = cwd.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(-80) || 'root'
  return path.join(podiumDir(dir), 'sessions', `${slug}.json`)
}

/** Load the last prompts (oldest→newest) for ↑/↓ recall across restarts. */
export async function loadHistory(dir?: string): Promise<string[]> {
  try {
    const raw = await readFile(historyFile(dir), 'utf8')
    const items = raw.split('\n').filter(Boolean).flatMap(line => {
      try { const v = JSON.parse(line); return typeof v === 'string' ? [v] : [] } catch { return [] }
    })
    return items.slice(-MAX_HISTORY)
  } catch {
    return []
  }
}

/** Append one prompt to the on-disk history (fire-and-forget safe). */
export async function appendHistory(text: string, dir?: string): Promise<void> {
  try {
    await mkdir(podiumDir(dir), { recursive: true })
    await appendFile(historyFile(dir), JSON.stringify(text) + '\n')
  } catch { /* history is best-effort */ }
}

export interface SavedSession {
  model: string
  contextSize: number
  cwd: string
  savedAt: number
  messages: ChatMessage[]
  transcript: TranscriptEntry[]
}

/** Persist the conversation after a turn so /resume can pick it up next launch. */
export async function saveSession(s: SavedSession, dir?: string): Promise<void> {
  try {
    const file = sessionFile(s.cwd, dir)
    await mkdir(path.dirname(file), { recursive: true })
    const slim: SavedSession = {
      ...s,
      // Images are big base64 blobs; a resumed session doesn't need them.
      messages: s.messages.map(m => (m.images ? { ...m, images: undefined } : m)),
      transcript: s.transcript.slice(-MAX_TRANSCRIPT),
    }
    await writeFile(file, JSON.stringify(slim))
  } catch { /* best-effort */ }
}

/** Load this project's last saved session, if any. */
export async function loadSession(cwd: string, dir?: string): Promise<SavedSession | null> {
  try {
    const raw = await readFile(sessionFile(cwd, dir), 'utf8')
    const s = JSON.parse(raw) as SavedSession
    if (!Array.isArray(s.messages) || !s.messages.length) return null
    return s
  } catch {
    return null
  }
}

/** Forget the saved session (used by /clear so a stale one can't resurface). */
export async function clearSession(cwd: string, dir?: string): Promise<void> {
  try { await rm(sessionFile(cwd, dir), { force: true }) } catch { /* best-effort */ }
}
