import React, { useState, useEffect } from 'react'
import { Box, Text } from 'ink'
import { computeSystemInfo, type SystemInfo } from '@maestro/hardware'
import { OllamaProvider, loadCatalog } from '@maestro/providers'
import type { HealthStatus, CatalogModel } from '@maestro/providers'
import {
  ContextManager, buildSystemPrompt, runTurn, type ContextStats,
} from '@maestro/core'
import { allTools } from '@maestro/tools'
import { SetupWizard, Repl, type TranscriptEntry } from '@maestro/tui'
import { loadConfig, saveConfig, type MaestroConfig } from './config.js'

export type StartScreen = 'setup' | 'backend-error' | 'repl'

export function decideStartScreen(cfg: MaestroConfig | null, health: HealthStatus): StartScreen {
  // Nothing works without a running backend — surface that first.
  if (!health.running) return 'backend-error'
  if (!cfg) return 'setup'
  return 'repl'
}

export function App(): React.ReactElement {
  const provider = new OllamaProvider()
  const [screen, setScreen] = useState<StartScreen | 'loading'>('loading')
  const [sys, setSys] = useState<SystemInfo | null>(null)
  const [catalog, setCatalog] = useState<CatalogModel[]>([])
  const [installed, setInstalled] = useState<Set<string>>(new Set())
  const [cfg, setCfg] = useState<MaestroConfig | null>(null)
  const [cm, setCm] = useState<ContextManager | null>(null)
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [stats, setStats] = useState<ContextStats>({ used: 0, effective: 0, window: 0, percentUsed: 0 })
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void (async () => {
      const [s, c, health, existing] = await Promise.all([
        computeSystemInfo(), loadCatalog(), provider.health(), loadConfig(),
      ])
      setSys(s); setCatalog(c); setCfg(existing)
      if (health.running) setInstalled(new Set((await provider.listLocal()).map(m => m.name)))
      const decided = decideStartScreen(existing, health)
      if (decided === 'repl' && existing) initRepl(existing)
      setScreen(decided)
    })()
  }, [])

  function initRepl(config: MaestroConfig) {
    const mgr = new ContextManager({ window: config.contextSize, outputReserve: 2000 })
    setCm(mgr)
    setStats(mgr.stats())
  }

  async function onWizardComplete(r: { model: string; contextSize: number }) {
    const next: MaestroConfig = { backend: 'ollama', model: r.model, contextSize: r.contextSize }
    await saveConfig(next)
    setCfg(next); initRepl(next); setScreen('repl')
  }

  async function onSubmit(text: string) {
    if (!cm || !cfg || !sys) return
    cm.add({ role: 'user', content: text })
    setTranscript(t => [...t, { role: 'user', text }])
    setBusy(true)
    const reply = await runTurn({
      provider, model: cfg.model, cm, tools: allTools,
      systemPrompt: buildSystemPrompt({ cwd: process.cwd(), os: process.platform, toolNames: allTools.map(t => t.schema.name) }),
      numCtx: cfg.contextSize,
      onToolStart: (call) => setTranscript(t => [...t, { role: 'tool', text: `${call.name}(${JSON.stringify(call.arguments)})` }]),
    })
    setTranscript(t => [...t, { role: 'assistant', text: reply }])
    setStats(cm.stats())
    setBusy(false)
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
  return <Repl stats={stats} transcript={transcript} onSubmit={onSubmit} busy={busy} />
}
