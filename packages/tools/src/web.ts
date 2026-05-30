import type { Tool } from './types.js'
import { truncateLines } from './truncate.js'

export const OFFLINE_MSG =
  'You appear to be offline — web search/fetch is unavailable. Continue with local information only.'

/** True when an error looks like a no-network failure (vs. a real HTTP error). */
export function isOffline(e: unknown): boolean {
  const err = e as { code?: string; message?: string; cause?: { code?: string } }
  const blob = `${err?.code ?? ''} ${err?.cause?.code ?? ''} ${err?.message ?? ''}`
  return /ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ENETUNREACH|ENETDOWN|EHOSTUNREACH|fetch failed/i.test(blob)
}

async function fetchWithTimeout(url: string, ms: number, browser = false, extern?: AbortSignal): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  const signal = extern ? AbortSignal.any([ctrl.signal, extern]) : ctrl.signal
  try {
    return await fetch(url, {
      signal,
      headers: browser
        ? { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36', accept: 'text/html' }
        : { 'user-agent': 'podium-cli', accept: 'text/html,*/*' },
    })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * SSRF guard for WebFetch: refuse non-http(s) and private/loopback/link-local
 * hosts so a (possibly prompt-injected) model can't read cloud metadata
 * (169.254.169.254) or the local model backends (localhost:11434/8080/1234).
 * Returns a refusal string when blocked, else null.
 */
export function ssrfBlocked(url: string): string | null {
  let u: URL
  try { u = new URL(url) } catch { return `Refused: invalid URL.` }
  if (!/^https?:$/.test(u.protocol)) return `Refused: only http/https URLs are allowed.`
  const h = u.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (
    h === 'localhost' || h === '0.0.0.0' || h === '::1' ||
    /^127\./.test(h) || /^169\.254\./.test(h) || /^10\./.test(h) ||
    /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    /\.local$/.test(h) || /^fe80:/i.test(h) || /^f[cd][0-9a-f]{2}:/i.test(h)
  ) {
    return `Refused: fetching internal/loopback/link-local addresses is not allowed.`
  }
  return null
}

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|header|footer)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').trim()
}

function decodeDdgHref(href: string): string {
  const m = /[?&]uddg=([^&]+)/.exec(href)
  if (m) { try { return decodeURIComponent(m[1]) } catch { return href } }
  return href.startsWith('//') ? `https:${href}` : href
}

export interface SearchResult { title: string; url: string; snippet: string }

export function parseDuckDuckGo(html: string): SearchResult[] {
  const snippets: string[] = []
  const sre = /<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g
  let sm: RegExpExecArray | null
  while ((sm = sre.exec(html))) snippets.push(stripTags(sm[1]))

  const out: SearchResult[] = []
  const re = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(html))) {
    out.push({ url: decodeDdgHref(m[1]), title: stripTags(m[2]), snippet: snippets[i] ?? '' })
    i++
  }
  return out
}

export const webSearchTool: Tool = {
  schema: {
    name: 'WebSearch',
    description: 'Search the web and return the top results (title, URL, snippet). You DO have internet access through this tool — call it to look anything up; never claim you cannot access the web. Use WebFetch to read a result in full. It reports if the machine is actually offline.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
  },
  async run(args, ctx) {
    const query = String(args.query)
    try {
      const res = await fetchWithTimeout(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, 15000, true, ctx.signal)
      if (!res.ok) return `Error: search returned HTTP ${res.status}`
      const results = parseDuckDuckGo(await res.text()).slice(0, 5)
      if (!results.length) return `No results for "${query}".`
      return results.map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`).join('\n\n')
    } catch (e) {
      if (isOffline(e)) return OFFLINE_MSG
      if ((e as Error).name === 'AbortError') return 'Web search timed out.'
      return `Error searching the web: ${(e as Error).message}`
    }
  },
}

export const webFetchTool: Tool = {
  schema: {
    name: 'WebFetch',
    description: 'Fetch a web page / scan a website and return its readable text (markup stripped). Use for docs, articles, or to read a search result. Says so if the machine is offline.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to fetch (http/https)' },
        query: { type: 'string', description: 'Optional: what you are looking for' },
      },
      required: ['url'],
    },
  },
  async run(args, ctx) {
    let url = String(args.url)
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`
    const blocked = ssrfBlocked(url)
    if (blocked) return blocked
    try {
      const res = await fetchWithTimeout(url, 15000, false, ctx.signal)
      if (!res.ok) return `Error: ${url} returned HTTP ${res.status}`
      const ctype = res.headers.get('content-type') ?? ''
      const body = await res.text()
      const text = ctype.includes('html') ? htmlToText(body) : body
      return truncateLines(`# ${url}\n\n${text}`, 250)
    } catch (e) {
      if (isOffline(e)) return OFFLINE_MSG
      if ((e as Error).name === 'AbortError') return `Fetching ${url} timed out.`
      return `Error fetching ${url}: ${(e as Error).message}`
    }
  },
}
