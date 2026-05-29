// Live Phase 3 checks: skill invocation + subagent, against a real Ollama model.
// Run with:  PODIUM_LIVE=1 pnpm vitest run packages/cli/test/live-p3.test.ts
import { describe, it, expect } from 'vitest'
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { OllamaProvider } from '@podium/providers'
import { ContextManager, buildSystemPrompt, runTurn } from '@podium/core'
import { allTools, baseTools } from '@podium/tools'
import { discoverSkills, SkillRegistry, buildSkillListing } from '@podium/skills'

const LIVE = process.env.PODIUM_LIVE === '1'
const MODEL = process.env.PODIUM_MODEL ?? 'qwen2.5-coder:7b'

describe.skipIf(!LIVE)('live phase 3', () => {
  it('loads a skill body that drives a real file write', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'podium-skill-'))
    const skillsRoot = path.join(dir, '.podium', 'skills', 'make-marker')
    await mkdir(skillsRoot, { recursive: true })
    await writeFile(path.join(skillsRoot, 'SKILL.md'),
      `---\nname: make-marker\ndescription: create a marker file\n---\nUse the Write tool to create a file named marker.txt in the current directory containing exactly: SKILL_OK. Then stop.`)

    const registry = new SkillRegistry(await discoverSkills([path.join(dir, '.podium', 'skills')]))
    const body = await registry.getBody('make-marker', '')
    expect(body).toContain('SKILL_OK')

    const cm = new ContextManager({ window: 16384, outputReserve: 2000 })
    cm.add({ role: 'user', content: body! })
    const provider = new OllamaProvider()
    await runTurn({
      provider, model: MODEL, cm, tools: allTools,
      systemPrompt: buildSystemPrompt({
        cwd: dir, os: process.platform, toolNames: allTools.map(t => t.schema.name),
        skillListing: buildSkillListing(registry.list()),
      }),
      numCtx: 16384, cwd: dir, skills: registry,
      onToolStart: (c) => console.log(`[skill-tool] ${c.name}`),
    })

    const content = (await readFile(path.join(dir, 'marker.txt'), 'utf8')).trim()
    await rm(dir, { recursive: true, force: true })
    expect(content).toContain('SKILL_OK')
  }, 180_000)

  it('runs a subagent (baseTools, fresh context) that does real work', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'podium-subagent-'))
    const provider = new OllamaProvider()
    // This is exactly what app.spawnAgent does internally.
    const cm = new ContextManager({ window: 16384, outputReserve: 2000 })
    cm.add({ role: 'user', content: 'Use the Write tool to create a file sub.txt containing the word AGENT in the current directory, then report done.' })
    const report = await runTurn({
      provider, model: MODEL, cm, tools: baseTools,
      systemPrompt: buildSystemPrompt({ cwd: dir, os: process.platform, toolNames: baseTools.map(t => t.schema.name) }),
      numCtx: 16384, cwd: dir,
      onToolStart: (c) => console.log(`[subagent-tool] ${c.name}`),
    })
    console.log(`[subagent-report] ${report}`)
    const content = (await readFile(path.join(dir, 'sub.txt'), 'utf8')).trim()
    await rm(dir, { recursive: true, force: true })
    expect(content).toContain('AGENT')
  }, 180_000)
})
