import type { Provider, ChatMessage, ToolCall } from '@podium/providers'
import type { Tool, TodoStore, ToolContextSkills } from '@podium/tools'
import { ContextManager } from './context.js'
import { shouldCompact, compact } from './compaction.js'
import { extractToolCalls, cleanModelText, stripSpecialTokens } from './tool-parse.js'
import { decide, type PermissionMode } from './permission.js'

export interface RunTurnOpts {
  provider: Provider
  model: string
  cm: ContextManager
  tools: Tool[]
  systemPrompt: string
  numCtx?: number
  cwd?: string
  compactBuffer?: number
  onText?: (delta: string) => void
  onToolStart?: (call: ToolCall) => void
  /** Fired with the model's narration on a step that then calls tools, so the UI can persist it. */
  onStepText?: (text: string) => void
  /** Fired with each tool's result so the UI can surface it (e.g. command output). */
  onToolResult?: (call: ToolCall, result: string) => void
  /** Fired when the model emits its first event of the turn (i.e. it's done loading). */
  onModelStart?: () => void
  maxSteps?: number
  mode?: PermissionMode
  /** Called when a tool needs interactive approval; return false to deny. */
  onPermissionAsk?: (call: ToolCall) => Promise<boolean>
  /** Max times to nudge the model to re-emit a valid tool call. Default 1. */
  maxRepairs?: number
  /** Shared todo store passed to tools (e.g. TodoWrite). */
  todos?: TodoStore
  /** Skill registry passed to the Skill tool. */
  skills?: ToolContextSkills
  /** Subagent spawner passed to the Task tool. */
  spawnAgent?: (prompt: string) => Promise<string>
  /** Plan-mode exit handler passed to the ExitPlanMode tool. */
  exitPlan?: (plan: string) => Promise<void>
  /** When true, force plan (read-only) permission mode. */
  planMode?: boolean
  /** PreToolUse hook gate; return false to block the tool. */
  preToolUse?: (call: ToolCall) => Promise<boolean>
  /** Keep the model loaded between turns (e.g. "30m"). */
  keepAlive?: string
  /** Abort the whole turn (user pressed Esc). */
  signal?: AbortSignal
  /** Max times to push the model to act after it only states an intention. Default 2. */
  maxPromiseNudges?: number
  /** Sampling temperature for the agent turn. Default 0 (greedy) for reliable tool use. */
  temperature?: number
  /** Snapshot a file before a tool modifies it (enables /rewind). */
  snapshot?: (absPath: string) => Promise<void>
  /** Fired when the loop auto-compacts mid-turn, so the UI can show it happening. */
  onAutoCompact?: () => void
}

/** Heuristic: the model's text looks like a botched tool call (mentions a tool name inside JSON-ish braces). */
function looksLikeToolAttempt(text: string, schemas: { name: string }[]): boolean {
  const hasBrace = text.includes('{') && text.includes('}')
  return hasBrace && schemas.some(s => text.includes(s.name))
}

/** Heuristic: the model promised to act ("Sure, I'll…", "Let me search…") but called no tool. */
function looksLikePromise(text: string): boolean {
  return /\b(i'?ll|i am going to|i'?m going to|i will|let me|let'?s|now i'?ll|first,?\s*i'?ll|i'?m (searching|creating|writing|fetching|looking|going|running))\b/i.test(text)
    || /\b(let'?s (do|search|create|write|run)|going to (create|write|run|search|fetch|do)|searching the web|create the (script|file)|fetch (the|search))\b/i.test(text)
}

/**
 * Heuristic: the model *showed* a shell command (a ```bash fence or a `$ cmd`
 * line) but called no tool — so the command never ran. Common small-model
 * failure behind "it wouldn't run my command". We only trip on an explicit
 * shell language tag and short surrounding prose, so genuine "here's how"
 * explanations with a long write-up don't get nudged.
 */
function looksLikeUnrunCommand(text: string): boolean {
  const hasShellFence = /```(?:bash|sh|shell|zsh|console|shell-session)\b/i.test(text)
  const hasPromptLine = /(^|\n)\s*\$ {1,}\S/.test(text)
  if (!hasShellFence && !hasPromptLine) return false
  const prose = text.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '').replace(/\s+/g, ' ').trim()
  return prose.length < 280
}

/** Heuristic: the model refused with its trained "no internet/access" reflex instead of using a tool. */
function looksLikeRefusal(text: string): boolean {
  return /\b(can'?t|cannot|unable to|don'?t have|do not have|not able to|i'?m not able)\b[^.\n]*\b(access|browse|search|internet|web|real[- ]?time|online|live)\b/i.test(text)
    || /\b(no (internet|web|online) access|don'?t have (the )?ability to (browse|search|access))\b/i.test(text)
}

/** Runs one user turn to completion: loops model<->tools until the model stops
 *  calling tools, returns the final assistant text. Auto-compacts before each step. */
export async function runTurn(opts: RunTurnOpts): Promise<string> {
  const { provider, model, cm, tools, systemPrompt } = opts
  const maxSteps = opts.maxSteps ?? 20
  const buffer = opts.compactBuffer ?? 1500
  const temperature = opts.temperature ?? 0   // greedy by default → reliable tool use
  const toolSchemas = tools.map(t => t.schema)

  const mode = opts.planMode ? 'plan' : (opts.mode ?? 'default')
  let repairs = 0
  let nudges = 0
  const maxNudges = opts.maxPromiseNudges ?? 2
  let finalText = ''
  let modelStarted = false
  const callCounts = new Map<string, number>()   // detect repeated identical tool calls
  for (let step = 0; step < maxSteps; step++) {
    if (opts.signal?.aborted) break
    if (shouldCompact(cm.stats(), buffer)) {
      opts.onAutoCompact?.()
      await compact(cm, {
        prefixCount: 1,
        summarize: async (prompt) => collectText(provider.chat({
          model, numCtx: opts.numCtx, keepAlive: opts.keepAlive, signal: opts.signal,
          messages: [{ role: 'user', content: prompt }],
        })),
      })
    }

    const messages: ChatMessage[] = [{ role: 'system', content: systemPrompt }, ...cm.messages()]
    let text = ''
    const toolCalls: ToolCall[] = []
    try {
      for await (const ev of provider.chat({ model, messages, tools: toolSchemas, numCtx: opts.numCtx, keepAlive: opts.keepAlive, signal: opts.signal, temperature })) {
        if (!modelStarted) { modelStarted = true; opts.onModelStart?.() }
        if (ev.type === 'text') { text += ev.delta; opts.onText?.(ev.delta) }
        else if (ev.type === 'tool_call') toolCalls.push(ev.call)
      }
    } catch (e) {
      if (opts.signal?.aborted || (e as Error).name === 'AbortError') break
      throw e
    }

    // Strip leaked chat-template tokens (<|im_start|> etc.) before they enter history.
    text = stripSpecialTokens(text)

    // Dual-path: prefer native tool_calls; otherwise fall back to parsing a
    // tool call the model emitted as plain-text JSON (common with small models).
    let effectiveCalls = toolCalls
    let assistantText = text
    if (toolCalls.length === 0) {
      const parsed = extractToolCalls(text, toolSchemas.map(s => s.name))
      if (parsed.calls.length > 0) {
        effectiveCalls = parsed.calls
        assistantText = parsed.cleanedText
      }
    }

    cm.add({ role: 'assistant', content: assistantText, tool_calls: effectiveCalls.length ? effectiveCalls : undefined })

    if (effectiveCalls.length === 0) {
      // Auto-repair: if the text looks like a failed tool call, nudge once for valid JSON.
      if (repairs < (opts.maxRepairs ?? 1) && looksLikeToolAttempt(assistantText, toolSchemas)) {
        repairs++
        cm.add({
          role: 'user',
          content: 'Your previous message looked like a tool call but could not be parsed. Reply with ONLY a JSON object of the form {"name": <tool>, "arguments": {...}} and no other text.',
        })
        continue
      }
      // The model showed a shell command (in a code fence) but never called the
      // Bash tool, so it didn't actually run. Push it to call the tool for real.
      if (nudges < maxNudges && looksLikeUnrunCommand(assistantText)) {
        nudges++
        cm.add({
          role: 'user',
          content: 'You wrote a shell command but did not run it — printing it in a code block does NOT execute it. To actually run it you MUST call the Bash tool: reply with ONLY {"name": "Bash", "arguments": {"command": "<the exact command>"}} and nothing else.',
        })
        continue
      }
      // The model either promised to act or refused ("I can't access the internet") without
      // calling a tool. Push it to actually use the tool it has.
      if (nudges < maxNudges && (looksLikePromise(assistantText) || looksLikeRefusal(assistantText))) {
        nudges++
        cm.add({
          role: 'user',
          content: 'Nothing happened — you did not call any tool. You DO have these tools available: WebSearch (you CAN search the web with it), WebFetch, Write, Edit, Bash. Do not claim you lack internet/web/file access and do not just state intentions — call the appropriate tool NOW.',
        })
        continue
      }
      finalText = cleanModelText(assistantText)
      break
    }

    // Persist the model's narration for this step (it precedes the tool calls).
    const stepText = cleanModelText(assistantText)
    if (stepText) opts.onStepText?.(stepText)

    for (const call of effectiveCalls) {
      // Break repeat-loops: if the model fires the exact same call 3+ times, stop
      // executing it and tell it to change approach (e.g. create the file first).
      const sig = `${call.name}|${JSON.stringify(call.arguments)}`
      const prior = callCounts.get(sig) ?? 0
      callCounts.set(sig, prior + 1)
      if (prior >= 2) {
        const hint = `You have already run this exact ${call.name} call ${prior + 1} times and it keeps failing — stop repeating it. If a file does not exist, CREATE it with the Write tool before running it. Otherwise change your approach.`
        cm.add({ role: 'tool', content: hint, tool_call_id: call.id })
        opts.onToolResult?.(call, '(repeated call blocked — change approach)')
        continue
      }
      const d = decide(call.name, mode)
      if (d === 'deny') {
        cm.add({ role: 'tool', content: `Permission denied: ${call.name} is not allowed in ${mode} mode.`, tool_call_id: call.id })
        continue
      }
      if (d === 'ask') {
        const ok = opts.onPermissionAsk ? await opts.onPermissionAsk(call) : true
        if (!ok) {
          cm.add({ role: 'tool', content: `Permission denied by user: ${call.name}.`, tool_call_id: call.id })
          continue
        }
      }
      if (opts.preToolUse && !(await opts.preToolUse(call))) {
        cm.add({ role: 'tool', content: `Blocked by PreToolUse hook: ${call.name}.`, tool_call_id: call.id })
        continue
      }
      opts.onToolStart?.(call)
      const tool = tools.find(t => t.schema.name === call.name)
      let result: string
      try {
        result = tool
          ? await tool.run(call.arguments, {
              cwd: opts.cwd ?? process.cwd(),
              signal: opts.signal,
              snapshot: opts.snapshot,
              todos: opts.todos,
              skills: opts.skills,
              spawnAgent: opts.spawnAgent,
              exitPlan: opts.exitPlan,
            })
          : `Error: unknown tool ${call.name}`
      } catch (e) {
        result = `Error: ${(e as Error).message}`
      }
      cm.add({ role: 'tool', content: result, tool_call_id: call.id, name: call.name })
      opts.onToolResult?.(call, result)
    }
  }
  // Guard: a turn that did work but produced no final text shouldn't look like nothing happened.
  if (!finalText && cm.messages().some(m => m.role === 'tool')) {
    finalText = 'Done.'
  }
  return finalText
}

async function collectText(stream: AsyncIterable<{ type: string } & Record<string, unknown>>): Promise<string> {
  let out = ''
  for await (const ev of stream) if (ev.type === 'text') out += String(ev.delta)
  return out
}
