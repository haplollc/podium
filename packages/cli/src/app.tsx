import React, { useState, useEffect, useRef } from 'react'
import os from 'node:os'
import { Box, Text } from 'ink'
import { computeSystemInfo, type SystemInfo } from '@podium/hardware'
import { OllamaProvider, loadCatalog } from '@podium/providers'
import type { HealthStatus, CatalogModel, ToolCall } from '@podium/providers'
import {
  ContextManager, buildSystemPrompt, runTurn, compact, parseSlash,
  type ContextStats, type PermissionMode,
} from '@podium/core'
import { allTools, baseTools, type TodoItem, type TodoStore } from '@podium/tools'
import { discoverSkills, defaultSkillRoots, SkillRegistry, buildSkillListing, mergeSkills, builtinSkills } from '@podium/skills'
import { SetupWizard, Repl, PermissionPrompt, Banner, type TranscriptEntry, type MetricsData } from '@podium/tui'
import { loadConfig, saveConfig, type PodiumConfig } from './config.js'
import { loadMemory } from './memory.js'
import { loadSoul, DEFAULT_SOUL } from './soul.js'
import { runSlash, type SlashCtx } from './slash-handlers.js'
import { loadHooks, runHooks, type HookConfig } from './hooks.js'
import { toolLabel, toolActivity } from './tool-label.js'

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
  const [metricsOn, setMetricsOn] = useState(false)
  const [metricsData, setMetricsData] = useState<MetricsData | null>(null)
  const [yoloOn, setYoloOn] = useState(false)

  const KEEP_ALIVE = '30m'

  const cmRef = useRef<ContextManager | null>(null)
  const todosRef = useRef<TodoItem[]>([])
  const planRef = useRef(false)
  const registryRef = useRef<SkillRegistry>(new SkillRegistry(builtinSkills))
  const memoryRef = useRef('')
  const soulRef = useRef(DEFAULT_SOUL)
  const hooksRef = useRef<HookConfig>({})
  const genStartRef = useRef<number | null>(null)  // turn start (ms) for tok/s
  const genCharsRef = useRef(0)                     // streamed chars this turn
  const yoloRef = useRef(false)                     // skip permission prompts
  const abortRef = useRef<AbortController | null>(null) // cancels the active turn

  const todoStore: TodoStore = {
    set: (items) => { todosRef.current = items; setTodos(items) },
    get: () => todosRef.current,
  }

  useEffect(() => {
    void (async () => {
      const [s, c, health, existing, skillMetas, mem, soul, hooks] = await Promise.all([
        computeSystemInfo(), loadCatalog(), provider.health(), loadConfig(),
        discoverSkills(defaultSkillRoots(os.homedir(), process.cwd())),
        loadMemory(process.cwd(), os.homedir()),
        loadSoul(process.cwd(), os.homedir()),
        loadHooks(),
      ])
      setSys(s); setCatalog(c); setCfg(existing)
      registryRef.current = new SkillRegistry(mergeSkills(skillMetas, builtinSkills))
      memoryRef.current = mem
      soulRef.current = soul
      hooksRef.current = hooks
      void runHooks(hooks, 'SessionStart', { cwd: process.cwd() })
      if (health.running) setInstalled(new Set((await provider.listLocal()).map(m => m.name)))
      const decided = decideStartScreen(existing, health)
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
    setBusy(true)
    try { await provider.warm(model, KEEP_ALIVE) } catch { /* best-effort */ }
    setStatus('')
    setBusy(false)
  }

  function push(entry: TranscriptEntry) { setTranscript(t => [...t, entry]) }

  /** Build a live metrics snapshot (system RAM + model resident memory + tok/s). */
  async function refreshMetrics() {
    const cm = cmRef.current
    if (!cm || !cfg) return
    const total = os.totalmem() / 1024 ** 3
    const ramUsedGB = (os.totalmem() - os.freemem()) / 1024 ** 3
    let modelMemGB: number | null = null
    try {
      const loaded = (await provider.ps?.()) ?? []
      const me = loaded.find(x => x.name === cfg.model) ?? loaded[0]
      if (me) modelMemGB = me.sizeBytes / 1024 ** 3
    } catch { /* backend may not support /api/ps */ }
    const start = genStartRef.current
    const tokensPerSec = start ? (genCharsRef.current / 4) / Math.max(0.001, (Date.now() - start) / 1000) : null
    setMetricsData({
      model: cfg.model, contextStats: cm.stats(), modelMemGB,
      ramUsedGB, ramTotalGB: Math.round(total), tokensPerSec,
    })
  }

  // Poll metrics while the dashboard is on.
  useEffect(() => {
    if (!metricsOn) { setMetricsData(null); return }
    void refreshMetrics()
    const id = setInterval(() => { void refreshMetrics() }, 1200)
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
    setCfg(next); initRepl(next); setScreen('repl')
    void warmModel(next.model)
  }

  async function summarize(prompt: string): Promise<string> {
    let out = ''
    for await (const ev of provider.chat({ model: cfg!.model, numCtx: cfg!.contextSize, messages: [{ role: 'user', content: prompt }] })) {
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
    return new Promise(resolve => setPending({ call, resolve }))
  }

  async function spawnAgent(prompt: string): Promise<string> {
    if (!cfg) return 'Error: not configured.'
    const cm2 = new ContextManager({ window: cfg.contextSize, outputReserve: 2000 })
    cm2.add({ role: 'user', content: prompt })
    return runTurn({
      provider, model: cfg.model, cm: cm2, tools: baseTools,
      systemPrompt: buildSystemPrompt({ cwd: process.cwd(), os: process.platform, toolNames: baseTools.map(t => t.schema.name) }),
      numCtx: cfg.contextSize, keepAlive: KEEP_ALIVE, mode: 'default', todos: todoStore,
    })
  }

  async function exitPlan(plan: string): Promise<void> {
    push({ role: 'assistant', text: `Plan ready for approval:\n${plan}` })
    planRef.current = false
    setPlanMode(false)
  }

  /** Run one agent turn over the given user content; returns the final reply. */
  async function runAgentTurn(userContent: string, showAssistant: boolean): Promise<string> {
    const cm = cmRef.current
    if (!cm || !cfg) return ''
    cm.add({ role: 'user', content: userContent })
    const controller = new AbortController()
    abortRef.current = controller
    setBusy(true)
    setStatus('Loading model…')   // until the model emits its first token
    setStreaming('')
    todosRef.current = []
    setTodos([])
    genStartRef.current = Date.now()
    genCharsRef.current = 0
    try {
      const reply = await runTurn({
        provider, model: cfg.model, cm, tools: allTools,
        systemPrompt: systemPrompt(),
        numCtx: cfg.contextSize,
        keepAlive: KEEP_ALIVE,
        signal: controller.signal,
        mode: (yoloRef.current ? 'yolo' : (cfg.mode ?? 'default')) as PermissionMode,
        planMode: planRef.current,
        todos: todoStore,
        skills: registryRef.current,
        spawnAgent,
        exitPlan,
        onModelStart: () => setStatus('Thinking…'),
        onText: (delta) => { genCharsRef.current += delta.length; setStreaming(s => s + delta) },
        onPermissionAsk: askPermission,
        preToolUse: (call) => runHooks(hooksRef.current, 'PreToolUse', call),
        onToolStart: (call) => {
          setStreaming('')                       // tool starting; drop the pre-tool preview
          setStatus(`${toolActivity(call)}…`)
          push({ role: 'tool', text: toolLabel(call) })
        },
        onToolResult: (_call, result) => {
          const out = result.trim()
          if (!out) return
          const lines = out.split('\n')
          const shown = lines.length > 12
            ? `${lines.slice(0, 12).join('\n')}\n… +${lines.length - 12} more lines`
            : out
          push({ role: 'output', text: shown })
        },
      })
      if (controller.signal.aborted) { push({ role: 'output', text: '⏹ Stopped.' }); return '' }
      if (showAssistant && reply) push({ role: 'assistant', text: reply })
      return reply
    } finally {
      abortRef.current = null
      genStartRef.current = null
      setStreaming('')
      setStatus('')
      setStats(cm.stats())
      setBusy(false)
    }
  }

  function abortTurn() { abortRef.current?.abort() }

  const slashCtx: SlashCtx = {
    stats: () => cmRef.current?.stats() ?? stats,
    clear: () => {
      if (!cfg) return
      const mgr = new ContextManager({ window: cfg.contextSize, outputReserve: 2000 })
      cmRef.current = mgr
      setTranscript([]); setStats(mgr.stats())
    },
    compact: async () => {
      if (!cmRef.current) return
      await runHooks(hooksRef.current, 'PreCompact', { reason: 'manual' })
      await compact(cmRef.current, { prefixCount: 1, summarize })
      setStats(cmRef.current.stats())
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
    toggleMetrics: () => { const next = !metricsOn; setMetricsOn(next); return next },
    toggleYolo: () => { yoloRef.current = !yoloRef.current; setYoloOn(yoloRef.current); return yoloRef.current },
  }

  async function onSubmit(text: string) {
    if (!cmRef.current || !cfg || !sys || busy) return
    const slash = parseSlash(text)
    if (slash) {
      push({ role: 'user', text })
      const msg = await runSlash(slash, slashCtx)
      push({ role: 'assistant', text: msg })
      return
    }
    push({ role: 'user', text })
    await runHooks(hooksRef.current, 'UserPromptSubmit', { prompt: text })
    await runAgentTurn(text, true)
  }

  if (screen === 'loading' || !sys) return <Text>Starting Podium…</Text>
  if (screen === 'backend-error')
    return (
      <Box flexDirection="column">
        <Text color="red">No local-model backend detected (Ollama).</Text>
        <Text>Install:  brew install ollama</Text>
        <Text>Start:    ollama serve</Text>
        <Text dimColor>Then relaunch podium.</Text>
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
    'setup', 'model', 'models', 'pull', 'skills', 'soul', 'metrics', 'plan', 'yolo', 'context', 'compact', 'clear', 'help',
    ...registryRef.current.list().map(m => m.name),
  ]

  return (
    <Box flexDirection="column">
      <Banner model={cfg?.model ?? 'no model'} cwd={process.cwd()} />
      {planMode && <Text color="magenta">— PLAN MODE (read-only) —</Text>}
      {yoloOn && <Text color="red">⚠ YOLO — skipping all permission prompts</Text>}
      <Repl
        stats={stats} transcript={transcript} onSubmit={onSubmit} busy={busy}
        streaming={streaming} status={status} commands={commandNames}
        metrics={metricsOn ? (metricsData ?? undefined) : undefined}
        onAbort={abortTurn}
        todos={todos}
      />
      {pending && (
        <PermissionPrompt
          call={pending.call}
          onDecision={(ok) => { pending.resolve(ok); setPending(null) }}
        />
      )}
    </Box>
  )
}
