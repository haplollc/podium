/**
 * Lightweight detector for durable preferences about how Podium should behave.
 * Deliberately conservative: it only fires on clear, second-person directives so
 * that a confirm-prompt rarely interrupts. The user always approves before
 * anything is written, so a missed phrasing is cheaper than a noisy false hit.
 */

// Signals that the user is stating a lasting preference (not a one-off task step).
const SIGNALS = [
  /\bfrom now on\b/i,
  /\bgoing forward\b/i,
  /\bin the future\b/i,
  /\bevery time\b/i,
  /\b(please )?always\b/i,
  /\b(please )?never\b/i,
  /\bremember to\b/i,
  /\bremember that you\b/i,
  /\bupdate your soul\b/i,
  /\bchange your (soul|personality|voice|tone)\b/i,
  /\bi (prefer|like it when|don'?t like it when|want you to|need you to)\b/i,
  /\bstop (saying|doing|using|being|adding|apologi)/i,
  /\b(please )?don'?t (say|do|use|add|be|keep|apologi|ever)/i,
  /\bbe (more|less) \w+/i,
  /\bkeep (your )?(answers?|responses?|replies)\b/i,
]

// Phrases that mean "this is about a task/code", not about Podium's behavior.
const NEGATORS = [
  /\b(test|tests|code|file|function|script|build|error|bug|it)\s+(always|never)\b/i,
  /\balways (fails?|crashes?|errors?|returns?|throws?)\b/i,
]

const MAX_LEN = 100

/** Tidy a captured clause into a short, soul-ready line. */
function clean(s: string): string {
  let t = s.replace(/\s+/g, ' ').trim().replace(/^[,.;:\s-]+/, '').replace(/[.]+$/, '')
  // Normalise common lead-ins so the stored line reads as an instruction.
  t = t.replace(/^(from now on|going forward|in the future|please|remember to|remember that|i want you to|i need you to|i'?d like you to)[,:]?\s*/i, '')
  t = t.replace(/^(i prefer( that)?|i like it when|i don'?t like it when)\s*/i, '')
  if (!t) return t
  if (t.length > MAX_LEN) t = t.slice(0, MAX_LEN - 1).trimEnd() + '…'
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/**
 * Returns a distilled one-line preference if `text` looks like a durable behavior
 * request, else null. Operates on the sentence that carried the signal.
 */
export function detectPreference(text: string): string | null {
  const raw = text.trim()
  if (!raw || raw.startsWith('/')) return null          // slash commands aren't preferences
  if (raw.length > 400) return null                      // long task prompts: skip
  // Examine sentence by sentence so we keep the relevant clause, not the whole message.
  const sentences = raw.split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(Boolean)
  for (const sentence of sentences) {
    if (NEGATORS.some(n => n.test(sentence))) continue
    if (SIGNALS.some(sig => sig.test(sentence))) {
      const line = clean(sentence)
      if (line.length >= 4) return line
    }
  }
  return null
}
