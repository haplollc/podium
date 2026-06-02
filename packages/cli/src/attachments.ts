import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'])
const TEXT_EXT = new Set([
  '.txt', '.md', '.markdown', '.json', '.jsonl', '.yaml', '.yml', '.toml', '.csv', '.tsv',
  '.js', '.jsx', '.ts', '.tsx', '.py', '.rb', '.go', '.rs', '.java', '.c', '.h', '.cpp', '.cc',
  '.cs', '.php', '.swift', '.kt', '.sh', '.bash', '.zsh', '.html', '.css', '.scss', '.sql',
  '.xml', '.env', '.cfg', '.ini', '.conf', '.log', '.tex', '.gitignore', '.dockerfile',
])
const MAX_TEXT_BYTES = 64 * 1024

export interface Attachment {
  path: string
  name: string
  kind: 'image' | 'text' | 'unsupported'
  text?: string
  base64?: string
  note: string
}

/**
 * Pull candidate file paths out of typed/dragged input. Terminals paste a
 * dragged file as its path — quoted, backslash-escaped, ~-prefixed, or bare —
 * so we accept all those shapes.
 */
export function candidatePaths(input: string): string[] {
  const out: string[] = []
  for (const m of input.matchAll(/'([^']+)'|"([^"]+)"/g)) out.push(m[1] ?? m[2])
  // bare/escaped paths: a run of slash-separated segments ending in an extension
  for (const m of input.matchAll(/(?:~|\.{0,2})?(?:\/(?:\\ |[^\s'"/])+)+\.\w{1,6}/g)) out.push(m[0])
  return [...new Set(out.map(p => p.replace(/\\ /g, ' ').replace(/^~(?=\/)/, os.homedir()).trim()))]
}

function classify(ext: string): 'image' | 'text' | 'unsupported' {
  if (IMAGE_EXT.has(ext)) return 'image'
  if (TEXT_EXT.has(ext) || ext === '') return 'text'
  return 'unsupported'
}

/** Resolve attachments referenced in the input; returns them plus the text with paths removed. */
export async function resolveAttachments(
  input: string,
  cwd: string,
): Promise<{ attachments: Attachment[]; cleanedText: string }> {
  const attachments: Attachment[] = []
  const seen = new Set<string>()
  let cleaned = input
  for (const cand of candidatePaths(input)) {
    const abs = path.isAbsolute(cand) ? cand : path.resolve(cwd, cand)
    if (seen.has(abs)) continue
    let st
    try { st = await stat(abs) } catch { continue }
    if (!st.isFile()) continue
    seen.add(abs)
    cleaned = cleaned.replace(cand, '').replace(/''|""/g, '')
    const name = path.basename(abs)
    const ext = path.extname(abs).toLowerCase()
    const kind = classify(ext)
    if (kind === 'image') {
      const b64 = (await readFile(abs)).toString('base64')
      attachments.push({ path: abs, name, kind, base64: b64, note: `🖼  ${name} (${Math.round(st.size / 1024)} KB)` })
    } else if (kind === 'text') {
      const buf = await readFile(abs)
      const truncated = buf.length > MAX_TEXT_BYTES
      const text = buf.subarray(0, MAX_TEXT_BYTES).toString('utf8')
      attachments.push({ path: abs, name, kind, text, note: `📄 ${name} (${st.size} bytes${truncated ? ', truncated' : ''})` })
    } else {
      attachments.push({ path: abs, name, kind, note: `⚠ ${name} — unsupported file type, not attached` })
    }
  }
  return { attachments, cleanedText: cleaned.replace(/\s{2,}/g, ' ').trim() }
}

/** Build the user message content + images from resolved attachments. */
export function buildAttachedMessage(
  userText: string,
  attachments: Attachment[],
): { content: string; images: string[] } {
  const texts = attachments.filter(a => a.kind === 'text' && a.text)
  const images = attachments.filter(a => a.kind === 'image' && a.base64).map(a => a.base64!)
  let content = userText
  if (texts.length) {
    const blocks = texts.map(a => `<attached file="${a.name}">\n${a.text}\n</attached>`).join('\n\n')
    content = `${blocks}\n\n${userText}`.trim()
  }
  if (!content && images.length) content = 'Please look at the attached image(s).'
  return { content, images }
}
