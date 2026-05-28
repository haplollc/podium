import React, { useState, useEffect, useRef } from 'react'
import os from 'node:os'
import { Box, Text } from 'ink'
import { computeSystemInfo, type SystemInfo } from '@maestro/hardware'
import { OllamaProvider, loadCatalog } from '@maestro/providers'
import type { HealthStatus, CatalogModel, ToolCall } from '@maestro/providers'
import {
  ContextManager, buildSystemPrompt, runTurn, compact, parseSlash,
  type ContextStats, type PermissionMode,
} from '@maestro/core'
import { allTools, baseTools, type TodoItem, type TodoStore } from '@maestro/tools'
import { discoverSkills, defaultSkillRoots, SkillRegistry, buildSkillListing } from '@maestro/skills'
import { SetupWizard, Repl, PermissionPrompt, type TranscriptEntry } from '@maestro/tui'
import { loadConfig, saveConfig, type MaestroConfig } from './config.js'
import { loadMemory } from './memory.js'
import { runSlash, type SlashCtx } from './slash-handlers.js'

export type StartScreen = 'setup' | 'backend-error' | 'repl'

export function decideStartScreen(cfg: MaestroConfig | null, health: HealthStatus): StartScreen {
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
  const [cfg, setCfg] = useState<MaestroConfig | null>(null)
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [stats, setStats] = useState<ContextStats>({ used: 0, effective: 0, window: 0, percentUsed: 0 })
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<PendingPermission | null>(null)
  const [todos, setTodos] = useState<TodoItem[]>([])
  const [planMode, setPlanMode] = useState(false)

  const cmRef = useRef<ContextManager | null>(null)
  const todosRef = useRef<TodoItem[]>([])
  const planRef = useRef(false)
  const registryRef = useRef<SkillRegistry>(new SkillRegistry([]))
  const memoryRef = useRef('')

  const todoStore: TodoStore = {
    set: (items) => { todosRef.current = items; setTodos(items) },
    get: () => todosRef.current,
  }

  useEffect(() => {
    void (async () => {
      const [s, c, health, existing, skillMetas, mem] = await Promise.all([
        computeSystemInfo(), loadCatalog(), provider.health(), loadConfig(),
        discoverSkills(defaultSkillRoots(os.homedir(), process.cwd())),
        loadMemory(process.cwd(), os.homedir()),
      ])
      setSys(s); setCatalog(c); setCfg(existing)
      registryRef.current = new SkillRegistry(skillMetas)
      memoryRef.current = mem
      if (health.running) setInstalled(new Set((await provider.listLocal()).map(m => m.name)))
      const decided = decideStartScreen(existing, health)
      if (decided === 'repl' && existing) initRepl(existing)
      setScreen(decided)
    })()
  }, [])

  function initRepl(config: MaestroConfig) {
    const mgr = new ContextManager({ window: config.contextSize, outputReserve: 2000 })
    cmRef.current = mgr
    setStats(mgr.stats())
  }

  function push(entry: TranscriptEntry) { setTranscript(t => [...t, entry]) }

  async function onWizardComplete(r: { model: string; contextSize: number }) {
    const next: MaestroConfig = { backend: 'ollama', model: r.model, contextSize: r.contextSize, mode: 'default' }
    await saveConfig(next)
    setCfg(next); initRepl(next); setScreen('repl')
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
      numCtx: cfg.contextSize, mode: 'default', todos: todoStore,
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
    setBusy(true)
    try {
      const reply = await runTurn({
        provider, model: cfg.model, cm, tools: allTools,
        systemPrompt: systemPrompt(),
        numCtx: cfg.contextSize,
        mode: (cfg.mode ?? 'default') as PermissionMode,
        planMode: planRef.current,
        todos: todoStore,
        skills: registryRef.current,
        spawnAgent,
        exitPlan,
        onPermissionAsk: askPermission,
        onToolStart: (call) => push({ role: 'tool', text: `${call.name}(${JSON.stringify(call.arguments)})` }),
      })
      if (showAssistant && reply) push({ role: 'assistant', text: reply })
      return reply
    } finally {
      setStats(cm.stats())
      setBusy(false)
    }
  }

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
      await compact(cmRef.current, { prefixCount: 1, summarize })
      setStats(cmRef.current.stats())
    },
    openModelPicker: () => setScreen('setup'),
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
    await runAgentTurn(text, true)
  }

  if (screen === 'loading' || !sys) return <Text>Starting Maestro…</Text>
  if (screen === 'backend-error')
    return (
      <Box flexDirection="column">
        <Text color="red">No local-model backend detected (Ollama).</Text>
        <Text>Install:  brew install ollama</Text>
        <Text>Start:    ollama serve</Text>
        <Text dimColor>Then relaunch maestro.</Text>
      </Box>
    )
  if (screen === 'setup')
    return (
      <SetupWizard
        sys={sys} catalog={catalog} installed={installed}
        provider={provider} onComplete={onWizardComplete}
      />
    )

  return (
    <Box flexDirection="column">
      {planMode && <Text color="magenta">— PLAN MODE (read-only) —</Text>}
      {todos.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          {todos.map((t, i) => (
            <Text key={i} dimColor>
              {t.status === 'completed' ? '[x]' : t.status === 'in_progress' ? '[~]' : '[ ]'} {t.content}
            </Text>
          ))}
        </Box>
      )}
      <Repl stats={stats} transcript={transcript} onSubmit={onSubmit} busy={busy} />
      {pending && (
        <PermissionPrompt
          call={pending.call}
          onDecision={(ok) => { pending.resolve(ok); setPending(null) }}
        />
      )}
    </Box>
  )
}
