import React, { useState, useEffect, useRef } from 'react'
import os from 'node:os'
import { readFile, writeFile, rm } from 'node:fs/promises'
import { Box, Text } from 'ink'
import { computeSystemInfo, type SystemInfo } from '@podium/hardware'
import { OllamaProvider, loadCatalog } from '@podium/providers'
import type { HealthStatus, CatalogModel, ToolCall } from '@podium/providers'
import {
  ContextManager, buildSystemPrompt, runTurn, compact, parseSlash,
  type ContextStats, type PermissionMode,
} from '@podium/core'
import { allTools, baseTools, createBgTaskStore, type TodoItem, type TodoStore, type BgTask } from '@podium/tools'
import { discoverSkills, defaultSkillRoots, SkillRegistry, buildSkillListing, mergeSkills, builtinSkills } from '@podium/skills'
import { SetupWizard, Repl, PermissionPrompt, RewindPicker, SoulPrompt, type TranscriptEntry, type MetricsData, type RewindEntry } from '@podium/tui'
import { loadConfig, saveConfig, type PodiumConfig } from './config.js'
import { loadMemory } from './memory.js'
import { loadSoul, DEFAULT_SOUL, addLearnedPreference, clearLearnedPreferences } from './soul.js'
import { detectPreference } from './soul-learn.js'
import { runSlash, type SlashCtx } from './slash-handlers.js'
import { loadHooks, runHooks, type HookConfig } from './hooks.js'
import { toolLabel, toolActivity, toolStartNote, toolResultNote } from './tool-label.js'
import { ensureOllama, type EnsureResult } from './backend.js'
import { groupQueuedInputs } from './queue.js'
import { session, shutdown } from './session.js'
import { loadHistory, appendHistory, saveSession, loadSession, clearSession } from './persist.js'
import { resolveAttachments, buildAttachedMessage } from './attachments.js'
import { readTemperature, tempZone } from './sysinfo.js'

const fmtTokens = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))

/** A point we can rewind to: conversation length + lazily-captured pre-edit file contents. */
interface Checkpoint {
  id: string
  label: string                       // the user message at this point
  msgIndex: number                    // cm length before that message
  files: Map<string, string | null>   // first-touch pre-edit content (null = didn't exist)
}

export type StartScreen = 'setup' | 'backend-error' | 'repl'

export function decideStartScreen(cfg: PodiumConfig | null, health: HealthStatus): StartScreen {
  if (!health.running) return 'backend-error'
  if (!cfg) return 'setup'
  return 'repl'
}

interface PendingPermission { call: ToolCall; resolve: (ok: boolean) => void }

export function App(): React.ReactElement {
  const provider = new OllamaProvider()
  const [screen, setScreen] = useState<StartScreen | 'loading'>('loading')
  const [bootStatus, setBootStatus] = useState('Starting Podium…')
  const [backendReason, setBackendReason] = useState<EnsureResult['reason']>(undefined)
  const [sys, setSys] = useState<SystemInfo | null>(null)
  const [catalog, setCatalog] = useState<CatalogModel[]>([])
  const [installed, setInstalled] = useState<Set<string>>(new Set())
  const [cfg, setCfg] = useState<PodiumConfig | null>(null)
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [stats, setStats] = useState<ContextStats>({ used: 0, effective: 0, window: 0, percentUsed: 0 })
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<PendingPermission | null>(null)
  const [todos, setTodos] = useState<TodoItem[]>([])
  const [planMode, setPlanMode] = useState(false)
  const [status, setStatus] = useState('')       // spinner label while busy
  const [streaming, setStreaming] = useState('')  // live assistant text
  const [history, setHistory] = useState<string[]>([])   // past prompts (↑/↓ recall)
  const [queued, setQueued] = useState<string[]>([])      // messages queued while busy
  const queuedRef = useRef<string[]>([])
  const [metricsOn, setMetricsOn] = useState(false)
  const [metricsData, setMetricsData] = useState<MetricsData | null>(null)
  const [yoloOn, setYoloOn] = useState(false)

  const KEEP_ALIVE = '30m'

  const cmRef = useRef<ContextManager | null>(null)
  const cfgRef = useRef<PodiumConfig | null>(null)
  const todosRef = useRef<TodoItem[]>([])
  const planRef = useRef(false)
  const registryRef = useRef<SkillRegistry>(new SkillRegistry(builtinSkills))
  const memoryRef = useRef('')
  const soulRef = useRef(DEFAULT_SOUL)
  const hooksRef = useRef<HookConfig>({})
  const genStartRef = useRef<number | null>(null)  // turn start (ms) for the tok/s fallback
  const genCharsRef = useRef(0)                     // streamed chars this turn
  const genStatsRef = useRef({ evalTokens: 0, evalMs: 0 })  // real backend token stats
  const yoloRef = useRef(false)                     // skip permission prompts
  const alwaysAllowRef = useRef<Set<string>>(new Set())  // tools approved with "always" this session
  const transcriptRef = useRef<TranscriptEntry[]>([])    // mirror of `transcript` for callbacks
  const streamBufRef = useRef('')                        // streamed text pending display
  const streamTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastPromptRef = useRef('')                       // dedupe consecutive history appends
  const abortRef = useRef<AbortController | null>(null) // cancels the active turn
  const busyRef = useRef(false)                     // stale-closure-safe mirror of `busy`
  const visionCacheRef = useRef<Map<string, boolean>>(new Map())  // model → supports images
  const checkpointsRef = useRef<Checkpoint[]>([])   // rewind points since last compaction
  const ckptIdRef = useRef(0)
  const [rewinding, setRewinding] = useState(false)
  const [soulProposal, setSoulProposal] = useState<string | null>(null)  // learned-pref awaiting confirm
  const soulSeenRef = useRef<Set<string>>(new Set())  // lines already proposed/declined this session
  const soulQueueRef = useRef<string[]>([])           // detected prefs waiting to be shown once idle

  function setBusyBoth(v: boolean) { busyRef.current = v; setBusy(v) }
  function setCfgBoth(v: PodiumConfig | null) { cfgRef.current = v; setCfg(v) }

  const todoStore: TodoStore = {
    set: (items) => { todosRef.current = items; setTodos(items) },
    get: () => todosRef.current,
  }

  const bgStoreRef = useRef(createBgTaskStore())
  const [bgTasks, setBgTasks] = useState<BgTask[]>([])
  const bgNotifiedRef = useRef<Set<number>>(new Set())   // task ids we've already announced exiting

  // Poll the background-task registry so the footer reflects live status and we
  // announce starts/exits in the transcript.
  useEffect(() => {
    const tick = () => {
      const tasks = bgStoreRef.current.list()
      // Keep the same array reference when there's nothing to show, so we don't
      // force a redraw every second on an idle session.
      setBgTasks(prev => (prev.length === 0 && tasks.length === 0) ? prev : tasks)
      for (const t of tasks) {
        if (!bgNotifiedRef.current.has(t.id) && t.status === 'running') {
          bgNotifiedRef.current.add(t.id)
          push({ role: 'note', text: `▶ Background task #${t.id} started: ${t.command}${t.url ? ` — ${t.url}` : ''}` })
        }
        if (t.status === 'exited' && !bgNotifiedRef.current.has(-t.id)) {
          bgNotifiedRef.current.add(-t.id)
          push({ role: 'note', text: `⏹ Background task #${t.id} exited${t.exitCode != null ? ` (code ${t.exitCode})` : ''}: ${t.command}` })
        }
      }
    }
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    void (async () => {
      const [s, c, existing, skillMetas, mem, soul, hooks, pastPrompts] = await Promise.all([
        computeSystemInfo(), loadCatalog(), loadConfig(),
        discoverSkills(defaultSkillRoots(os.homedir(), process.cwd())),
        loadMemory(process.cwd(), os.homedir()),
        loadSoul(process.cwd(), os.homedir()),
        loadHooks(),
        loadHistory(),
      ])
      setSys(s); setCatalog(c); setCfgBoth(existing)
      setHistory(pastPrompts)
      registryRef.current = new SkillRegistry(mergeSkills(skillMetas, builtinSkills))
      memoryRef.current = mem
      soulRef.current = soul
      hooksRef.current = hooks
      void runHooks(hooks, 'SessionStart', { cwd: process.cwd() })
      // On exit (Ctrl+C / quit / terminal-close) evict the model so the GPU is freed.
      session.unload = async () => {
        bgStoreRef.current.killAll()   // stop dev servers etc. so nothing lingers after exit
        const m = cfgRef.current?.model
        if (m && provider.unload) await provider.unload(m)
      }

      // One-command onboarding: make sure the backend is up (install/start Ollama if needed).
      const ensured = await ensureOllama(provider, setBootStatus)
      setBackendReason(ensured.reason)
      if (ensured.running) setInstalled(new Set((await provider.listLocal()).map(m => m.name)))

      const decided = decideStartScreen(existing, { running: ensured.running })
      if (decided === 'repl' && existing) { initRepl(existing); void warmModel(existing.model) }
      setScreen(decided)
    })()
  }, [])

  function initRepl(config: PodiumConfig) {
    const mgr = new ContextManager({ window: config.contextSize, outputReserve: 2000 })
    cmRef.current = mgr
    setStats(mgr.stats())
  }

  /** Preload the model so the first real turn is fast; shows a loading spinner. */
  async function warmModel(model: string) {
    if (!provider.warm) return
    setStatus(`Loading ${model}…`)
    setBusyBoth(true)
    try { await provider.warm(model, KEEP_ALIVE) } catch { /* best-effort */ }
    setStatus('')
    setBusyBoth(false)
    // Anything typed while the model was loading is queued — run it now.
    void drainQueue()
  }

  function push(entry: TranscriptEntry) {
    transcriptRef.current = [...transcriptRef.current, entry]
    setTranscript(transcriptRef.current)
  }

  /**
   * Streamed deltas are buffered and flushed at most every 80ms — Ink re-renders
   * the whole tree per state update, so per-token updates burn CPU (and battery)
   * for no visible benefit at generation speed.
   */
  function pushStreamDelta(delta: string) {
    streamBufRef.current += delta
    if (!streamTimerRef.current) {
      streamTimerRef.current = setTimeout(() => {
        streamTimerRef.current = null
        setStreaming(streamBufRef.current)
      }, 80)
    }
  }

  function clearStreaming() {
    streamBufRef.current = ''
    if (streamTimerRef.current) { clearTimeout(streamTimerRef.current); streamTimerRef.current = null }
    setStreaming('')
  }

  /** Record a rewind point just before a user turn. */
  function newCheckpoint(label: string) {
    checkpointsRef.current.push({
      id: String(++ckptIdRef.current),
      label,
      msgIndex: cmRef.current?.length() ?? 0,
      files: new Map(),
    })
  }

  /** First-touch snapshot of a file's current content into the newest checkpoint. */
  async function snapshotFile(abs: string) {
    const cps = checkpointsRef.current
    const cur = cps[cps.length - 1]
    if (!cur || cur.files.has(abs)) return
    let content: string | null
    try { content = await readFile(abs, 'utf8') } catch { content = null }
    cur.files.set(abs, content)
  }

  /** Build picker entries (newest first); fileCount = files undone by rewinding here. */
  function rewindEntries(): RewindEntry[] {
    const cps = checkpointsRef.current
    return cps.map((cp, i) => {
      const paths = new Set<string>()
      for (let j = i; j < cps.length; j++) for (const p of cps[j].files.keys()) paths.add(p)
      return { id: cp.id, label: cp.label, fileCount: paths.size }
    }).reverse()
  }

  /** Restore conversation + files to the chosen checkpoint. */
  async function rewindTo(id: string) {
    setRewinding(false)
    const cps = checkpointsRef.current
    const idx = cps.findIndex(c => c.id === id)
    if (idx < 0 || !cmRef.current) return
    const target = cps[idx]
    cmRef.current.truncateTo(target.msgIndex)
    // Earliest-snapshot-wins across checkpoints idx..end gives the state as of `target`.
    const restore = new Map<string, string | null>()
    for (let i = idx; i < cps.length; i++) {
      for (const [p, c] of cps[i].files) if (!restore.has(p)) restore.set(p, c)
    }
    let reverted = 0
    for (const [p, content] of restore) {
      try {
        if (content === null) await rm(p, { force: true })
        else await writeFile(p, content)
        reverted++
      } catch { /* best-effort */ }
    }
    checkpointsRef.current = cps.slice(0, idx)
    setStats(cmRef.current.stats())
    void refreshMetrics()
    push({ role: 'output', text: `↩ Rewound to "${target.label.slice(0, 50)}" — undid ${cps.length - idx} message(s)${reverted ? ` and ${reverted} file change(s)` : ''}.` })
  }

  /** Persist a preference into SOUL.md and reload it into the live prompt. */
  async function applySoul(line: string) {
    const next = await addLearnedPreference(process.cwd(), os.homedir(), line)
    soulRef.current = next
    soulSeenRef.current.add(line.toLowerCase())
  }

  /** Apply a learned preference and announce it (used by the auto-evolution confirm). */
  async function commitSoul(line: string) {
    await applySoul(line)
    push({ role: 'note', text: `✎ Updated my soul: "${line}"` })
  }

  /** Decide whether the user's message implies a durable preference, and enqueue a confirm if so. */
  function maybeProposeSoul(userText: string) {
    const line = detectPreference(userText)
    if (!line) return
    const key = line.toLowerCase()
    if (soulSeenRef.current.has(key)) return                  // already asked/applied this session
    if (soulRef.current.toLowerCase().includes(key)) return   // already in the soul
    soulSeenRef.current.add(key)
    soulQueueRef.current.push(line)
  }

  /** Show the next queued soul proposal, but only once nothing else is on screen. */
  function pumpSoul() {
    setSoulProposal(prev => (prev ? prev : soulQueueRef.current.shift() ?? null))
  }

  /** Build a live metrics snapshot (system RAM + model resident memory + tok/s). */
  async function refreshMetrics() {
    const cm = cmRef.current
    const config = cfgRef.current
    if (!cm || !config) return
    const total = os.totalmem() / 1024 ** 3
    const ramUsedGB = (os.totalmem() - os.freemem()) / 1024 ** 3
    let modelMemGB: number | null = null
    try {
      const loaded = (await provider.ps?.()) ?? []
      const me = loaded.find(x => x.name === config.model) ?? loaded[0]
      if (me) modelMemGB = me.sizeBytes / 1024 ** 3
    } catch { /* backend may not support /api/ps */ }
    // Prefer the backend's real eval stats; fall back to the chars/4 estimate mid-stream.
    const gs = genStatsRef.current
    const start = genStartRef.current
    const tokensPerSec = gs.evalMs > 0
      ? gs.evalTokens / (gs.evalMs / 1000)
      : start ? (genCharsRef.current / 4) / Math.max(0.001, (Date.now() - start) / 1000) : null
    let temp: MetricsData['temp'] = null
    const reading = await readTemperature()
    if (reading) temp = { ...reading, zone: tempZone(reading) }
    setMetricsData({
      model: config.model, contextStats: cm.stats(), modelMemGB,
      ramUsedGB, ramTotalGB: Math.round(total), tokensPerSec, temp,
    })
  }

  // Poll metrics while the dashboard is on.
  useEffect(() => {
    if (!metricsOn) { setMetricsData(null); return }
    void refreshMetrics()
    const id = setInterval(() => { void refreshMetrics() }, 2000)
    return () => clearInterval(id)
  }, [metricsOn])

  /** Refresh the installed-model set from the backend, then show the setup screen. */
  async function refreshInstalledThenOpen() {
    try { setInstalled(new Set((await provider.listLocal()).map(m => m.name))) } catch { /* keep prior */ }
    setScreen('setup')
  }

  async function onWizardComplete(r: { model: string; contextSize: number }) {
    const next: PodiumConfig = { backend: 'ollama', model: r.model, contextSize: r.contextSize, mode: 'default' }
    await saveConfig(next)
    setCfgBoth(next); initRepl(next); setScreen('repl')
    void warmModel(next.model)
  }

  async function summarize(prompt: string): Promise<string> {
    const config = cfgRef.current
    if (!config) return ''
    let out = ''
    for await (const ev of provider.chat({ model: config.model, numCtx: config.contextSize, keepAlive: KEEP_ALIVE, messages: [{ role: 'user', content: prompt }] })) {
      if (ev.type === 'text') out += ev.delta
    }
    return out
  }

  function systemPrompt(): string {
    return buildSystemPrompt({
      cwd: process.cwd(), os: process.platform,
      toolNames: allTools.map(t => t.schema.name),
      memory: memoryRef.current || undefined,
      skillListing: buildSkillListing(registryRef.current.list()) || undefined,
      soul: soulRef.current || undefined,
      planMode: planRef.current,
    })
  }

  function askPermission(call: ToolCall): Promise<boolean> {
    if (alwaysAllowRef.current.has(call.name)) return Promise.resolve(true)
    return new Promise(resolve => setPending({ call, resolve }))
  }

  async function spawnAgent(prompt: string): Promise<string> {
    const config = cfgRef.current
    if (!config) return 'Error: not configured.'
    const cm2 = new ContextManager({ window: config.contextSize, outputReserve: 2000 })
    cm2.add({ role: 'user', content: prompt })
    return runTurn({
      provider, model: config.model, cm: cm2, tools: baseTools,
      systemPrompt: buildSystemPrompt({ cwd: process.cwd(), os: process.platform, toolNames: baseTools.map(t => t.schema.name) }),
      numCtx: config.contextSize, keepAlive: KEEP_ALIVE,
      // Esc on the main turn must also stop a running subagent.
      signal: abortRef.current?.signal,
      mode: (yoloRef.current ? 'yolo' : (config.mode ?? 'default')) as PermissionMode,
      todos: todoStore,
      bgTasks: bgStoreRef.current,
      onToolStart: (call) => setStatus(`Subagent: ${toolActivity(call)}…`),
      // Subagents must honor the same permission + hook gates as the main loop.
      onPermissionAsk: askPermission,
      preToolUse: (call) => runHooks(hooksRef.current, 'PreToolUse', call),
    })
  }

  async function exitPlan(plan: string): Promise<void> {
    push({ role: 'assistant', text: `Plan ready for approval:\n${plan}` })
    planRef.current = false
    setPlanMode(false)
  }

  /** Run one agent turn over the given user content; returns the final reply. */
  async function runAgentTurn(userContent: string, showAssistant: boolean, images?: string[]): Promise<string> {
    const cm = cmRef.current
    const config = cfgRef.current
    if (!cm || !config) return ''
    cm.add({ role: 'user', content: userContent, images: images?.length ? images : undefined })
    const controller = new AbortController()
    abortRef.current = controller
    setBusyBoth(true)
    setStatus('Loading model…')   // until the model emits its first token
    clearStreaming()
    todosRef.current = []
    setTodos([])
    genStartRef.current = Date.now()
    genCharsRef.current = 0
    genStatsRef.current = { evalTokens: 0, evalMs: 0 }
    push({ role: 'note', text: 'Hmm, let me get oriented and pick the next useful step.' })
    try {
      const reply = await runTurn({
        provider, model: config.model, cm, tools: allTools,
        systemPrompt: systemPrompt(),
        numCtx: config.contextSize,
        keepAlive: KEEP_ALIVE,
        signal: controller.signal,
        mode: (yoloRef.current ? 'yolo' : (config.mode ?? 'default')) as PermissionMode,
        planMode: planRef.current,
        todos: todoStore,
        skills: registryRef.current,
        spawnAgent,
        exitPlan,
        snapshot: snapshotFile,
        onAutoCompact: () => {
          setStatus('Context full — compacting…')
          push({ role: 'note', text: '🗜 Auto-compacting the conversation to free up context…' })
        },
        bgTasks: bgStoreRef.current,
        onModelStart: () => setStatus('Thinking…'),
        onText: (delta) => { genCharsRef.current += delta.length; pushStreamDelta(delta) },
        onStats: (s) => {
          genStatsRef.current.evalTokens += s.evalTokens ?? 0
          genStatsRef.current.evalMs += s.evalDurationMs ?? 0
        },
        onStepText: (t) => push({ role: 'assistant', text: t }),
        onPermissionAsk: askPermission,
        preToolUse: (call) => runHooks(hooksRef.current, 'PreToolUse', call),
        onToolStart: (call) => {
          clearStreaming()                       // tool starting; drop the pre-tool preview
          setStatus(`${toolActivity(call)}…`)
          push({ role: 'note', text: toolStartNote(call) })
          push({ role: 'tool', text: toolLabel(call) })
        },
        onToolResult: (call, result) => {
          const out = result.trim()
          if (!out) return
          const lines = out.split('\n')
          const shown = lines.length > 12
            ? `${lines.slice(0, 12).join('\n')}\n… +${lines.length - 12} more lines`
            : out
          push({ role: 'output', text: shown })
          push({ role: 'note', text: toolResultNote(call, result) })
        },
      })
      if (controller.signal.aborted) { push({ role: 'output', text: '⏹ Stopped.' }); return '' }
      if (showAssistant && reply) push({ role: 'assistant', text: reply })
      return reply
    } finally {
      abortRef.current = null
      genStartRef.current = null
      clearStreaming()
      setStatus('')
      setStats(cm.stats())
      setBusyBoth(false)
      // Persist the conversation so /resume can pick it up after a restart.
      if (cm.length() > 0) {
        void saveSession({
          model: config.model, contextSize: config.contextSize, cwd: process.cwd(),
          savedAt: Date.now(), messages: cm.messages(), transcript: transcriptRef.current,
        })
      }
    }
  }

  function abortTurn() { abortRef.current?.abort() }

  const slashCtx: SlashCtx = {
    stats: () => cmRef.current?.stats() ?? stats,
    clear: () => {
      const config = cfgRef.current
      if (!config) return
      const mgr = new ContextManager({ window: config.contextSize, outputReserve: 2000 })
      cmRef.current = mgr
      checkpointsRef.current = []
      transcriptRef.current = []
      setTranscript([]); setStats(mgr.stats())
      void clearSession(process.cwd())   // a cleared conversation shouldn't /resume back
    },
    compact: async () => {
      const cm = cmRef.current
      if (!cm) return 'Nothing to compact.'
      const before = cm.stats().used
      if (cm.messages().length <= 2) return `Not much to compact yet (~${fmtTokens(before)} tokens).`
      // Show a loader and block input while the summarizer runs.
      setBusyBoth(true)
      setStatus('Compacting conversation…')
      try {
        await runHooks(hooksRef.current, 'PreCompact', { reason: 'manual' })
        await compact(cm, { prefixCount: 1, summarize })
        checkpointsRef.current = []   // msg indices are invalid after summarization
      } finally {
        setStatus('')
        setBusyBoth(false)
      }
      const after = cm.stats().used
      setStats(cm.stats())
      void refreshMetrics()
      return after < before
        ? `Compacted: ${fmtTokens(before)} → ${fmtTokens(after)} tokens.`
        : `Compacted, but it didn't get smaller (${fmtTokens(before)} → ${fmtTokens(after)}) — not much to trim yet.`
    },
    openModelPicker: () => { void refreshInstalledThenOpen() },
    openSetup: () => { void refreshInstalledThenOpen() },
    listModels: async () => (await provider.listLocal()).map(m => m.name),
    pull: async (model) => { await provider.pull(model, () => {}) },
    listSkills: () => registryRef.current.list().map(m => m.name),
    hasSkill: (name) => registryRef.current.has(name),
    runSkill: async (name, args) => {
      const body = await registryRef.current.getBody(name, args)
      if (body == null) return `Unknown skill: ${name}`
      return (await runAgentTurn(body, false)) || '(skill complete)'
    },
    togglePlan: () => {
      planRef.current = !planRef.current
      setPlanMode(planRef.current)
      return planRef.current
    },
    soul: () => soulRef.current,
    updateSoul: async (text) => { await applySoul(text) },
    resetSoul: async () => {
      const next = await clearLearnedPreferences(process.cwd(), os.homedir())
      soulRef.current = next
      soulSeenRef.current.clear()
    },
    toggleMetrics: () => { const next = !metricsOn; setMetricsOn(next); return next },
    toggleYolo: () => { yoloRef.current = !yoloRef.current; setYoloOn(yoloRef.current); return yoloRef.current },
    tasksReport: () => {
      const ts = bgStoreRef.current.list()
      if (!ts.length) return 'No background tasks.'
      return ts.map(t => {
        const dur = Math.round((Date.now() - t.startedAt) / 1000)
        const head = `#${t.id} [${t.status}${t.exitCode != null ? ` ${t.exitCode}` : ''}] ${t.command}${t.url ? ` — ${t.url}` : ''} (${dur}s)`
        const tail = t.output.trim().split('\n').slice(-6).map(l => '   ' + l).join('\n')
        return tail ? `${head}\n${tail}` : head
      }).join('\n\n')
    },
    killTask: (arg) => {
      const a = arg.trim()
      if (a === 'all' || a === '') { bgStoreRef.current.killAll(); return 'Stopped all background tasks.' }
      const id = Number(a)
      if (!Number.isFinite(id)) return 'Usage: /tasks kill <id|all>'
      return bgStoreRef.current.kill(id) ? `Stopped task #${id}.` : `No task #${id}.`
    },
    openRewind: () => {
      if (busyRef.current) return 'Can\'t rewind while a turn is running — press Esc to stop it first.'
      if (!checkpointsRef.current.length) return 'Nothing to rewind to yet — checkpoints start after your first message (and reset on /compact).'
      setRewinding(true)
      return null
    },
    resume: async () => {
      if (busyRef.current) return 'Can\'t resume while a turn is running — press Esc to stop it first.'
      const config = cfgRef.current
      if (!config) return 'Not configured yet.'
      const saved = await loadSession(process.cwd())
      if (!saved) return 'No saved session for this project yet — sessions save automatically after each turn.'
      const mgr = new ContextManager({ window: config.contextSize, outputReserve: 2000 })
      for (const m of saved.messages) mgr.add(m)
      cmRef.current = mgr
      checkpointsRef.current = []   // file snapshots from the old run are gone
      // Append the restored transcript (the terminal scrollback is append-only).
      transcriptRef.current = [...transcriptRef.current, ...saved.transcript]
      setTranscript(transcriptRef.current)
      setStats(mgr.stats())
      const when = new Date(saved.savedAt).toLocaleString()
      const modelNote = saved.model !== config.model ? ` · saved with ${saved.model}` : ''
      return `↩ Resumed session from ${when} — ${saved.messages.length} messages restored${modelNote}.`
    },
    exit: () => {
      // Let the goodbye line render, then evict the model and quit.
      setTimeout(() => { void shutdown(0) }, 100)
      return 'Bye — unloading the model and exiting.'
    },
  }

  /** Run a single piece of user input: a slash command runs as a command, anything else as a turn. */
  async function runUserInput(text: string) {
    if (lastPromptRef.current !== text) {
      lastPromptRef.current = text
      void appendHistory(text)   // persists across restarts (↑ recall)
    }
    setHistory(h => (h[h.length - 1] === text ? h : [...h, text]))
    const slash = parseSlash(text)
    if (slash) {
      push({ role: 'user', text })
      const msg = await runSlash(slash, slashCtx)
      push({ role: 'assistant', text: msg })
      return
    }

    // Attachments: dragged/typed file paths become context (text files) or images.
    const { attachments, cleanedText } = await resolveAttachments(text, process.cwd())
    let content = text
    let images: string[] = []
    if (attachments.length) {
      const built = buildAttachedMessage(cleanedText, attachments)
      content = built.content
      images = built.images
      push({ role: 'user', text: cleanedText || '(attached files)' })
      for (const a of attachments) push({ role: 'note', text: `Attached ${a.note}` })
      if (images.length && !(await isVisionModel())) {
        push({ role: 'note', text: `Note: ${cfgRef.current?.model} can't see images. Use /model to pick a vision model (e.g. qwen2.5-vl, llava). Sending text only.` })
        images = []
      }
    } else {
      push({ role: 'user', text })
    }
    // Mark a rewind point just before this turn (state = before the user message).
    newCheckpoint(cleanedText || text)
    maybeProposeSoul(cleanedText || text)   // learn durable preferences (shown after the turn)
    await runHooks(hooksRef.current, 'UserPromptSubmit', { prompt: content })
    await runAgentTurn(content, true, images)
  }

  /** Cached check: does the active model support image input? */
  async function isVisionModel(): Promise<boolean> {
    const model = cfgRef.current?.model
    if (!model) return false
    if (visionCacheRef.current.has(model)) return visionCacheRef.current.get(model)!
    let vision = false
    try { vision = (await provider.capabilities(model)).vision ?? false } catch { /* assume no */ }
    visionCacheRef.current.set(model, vision)
    return vision
  }

  /**
   * Drain messages queued while busy. Consecutive plain messages are combined
   * into one turn; queued slash commands (/model, /clear, …) run individually,
   * in order, so a queued command actually executes.
   */
  async function drainQueue() {
    if (busyRef.current) return
    while (queuedRef.current.length) {
      const items = queuedRef.current
      queuedRef.current = []
      setQueued([])
      for (const group of groupQueuedInputs(items)) await runUserInput(group)
    }
  }

  function onQueue(text: string) {
    queuedRef.current = [...queuedRef.current, text]
    setQueued(queuedRef.current)
  }

  async function onSubmit(text: string) {
    if (!cmRef.current || !cfgRef.current || !sys) return
    if (busyRef.current) { onQueue(text); return }
    await runUserInput(text)
    await drainQueue()
    pumpSoul()   // surface any learned-preference confirms now that we're idle
  }

  if (screen === 'loading' || !sys) return <Text color="yellow">✦ {bootStatus}</Text>
  if (screen === 'backend-error')
    return (
      <Box flexDirection="column">
        <Text color="red">Couldn't start a local-model backend (Ollama).</Text>
        {backendReason === 'ollama-missing'
          ? <><Text>Install Homebrew (brew.sh), then re-run podium — it will install Ollama for you.</Text>
              <Text dimColor>Or: install Ollama from https://ollama.com and re-run podium.</Text></>
          : <><Text>Ollama is installed but wouldn't start. Try it manually:</Text>
              <Text>  ollama serve</Text>
              <Text dimColor>then re-run podium.</Text></>}
      </Box>
    )
  if (screen === 'setup')
    return (
      <SetupWizard
        sys={sys} catalog={catalog} installed={installed}
        provider={provider} onComplete={onWizardComplete}
        onCancel={cfg ? () => setScreen('repl') : undefined}
      />
    )

  const commandNames = [
    'setup', 'model', 'models', 'pull', 'skills', 'soul', 'metrics', 'plan', 'yolo', 'context', 'compact', 'resume', 'rewind', 'tasks', 'clear', 'exit', 'help',
    ...registryRef.current.list().map(m => m.name),
  ]

  return (
    <Box flexDirection="column">
      <Repl
        stats={stats} transcript={transcript} onSubmit={onSubmit} busy={busy}
        streaming={streaming} status={status} commands={commandNames}
        metrics={metricsOn ? (metricsData ?? undefined) : undefined}
        onAbort={abortTurn}
        todos={todos}
        model={cfg?.model ?? 'no model'} cwd={process.cwd()}
        history={history} queued={queued} onQueue={onQueue}
        inputActive={!rewinding && !pending && !soulProposal}
        planMode={planMode} yolo={yoloOn} bgTasks={bgTasks}
      />
      {pending && (
        <PermissionPrompt
          call={pending.call}
          onDecision={(answer) => {
            if (answer === 'always') alwaysAllowRef.current.add(pending.call.name)
            pending.resolve(answer !== 'no')
            setPending(null)
          }}
        />
      )}
      {rewinding && (
        <RewindPicker
          entries={rewindEntries()}
          onPick={(id) => { void rewindTo(id) }}
          onCancel={() => setRewinding(false)}
        />
      )}
      {soulProposal && (
        <SoulPrompt
          line={soulProposal}
          onDecision={(ok) => {
            const line = soulProposal
            setSoulProposal(null)
            if (ok && line) void commitSoul(line)
            pumpSoul()   // show the next queued proposal, if any
          }}
        />
      )}
    </Box>
  )
}
