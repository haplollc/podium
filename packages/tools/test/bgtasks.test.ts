import { describe, it, expect, vi } from 'vitest'
import { createBgTaskStore } from '../src/bgtasks.js'
import { bashTool } from '../src/bash.js'

describe('createBgTaskStore', () => {
  it('starts a process, tracks it, captures output, and marks it exited', async () => {
    const store = createBgTaskStore()
    const t = store.start("printf 'hello-bg'", process.cwd())
    expect(t.status).toBe('running')
    expect(store.list()).toHaveLength(1)
    await vi.waitFor(() => {
      const cur = store.get(t.id)
      expect(cur?.status).toBe('exited')
      expect(cur?.output).toContain('hello-bg')
    }, { timeout: 4000 })
  })

  it('derives a localhost URL from a server command port', () => {
    const store = createBgTaskStore()
    const t = store.start('python3 -m http.server 8123', process.cwd())
    expect(t.url).toBe('http://localhost:8123')
    store.killAll()
  })

  it('killAll stops running tasks', async () => {
    const store = createBgTaskStore()
    store.start('sleep 30', process.cwd())
    store.killAll()
    await vi.waitFor(() => expect(store.list()[0].status).toBe('exited'), { timeout: 4000 })
  })
})

describe('bashTool background routing', () => {
  it('auto-detects a server command and runs it via the bg store instead of blocking', async () => {
    const started: string[] = []
    const fakeStore = {
      start: (command: string) => { started.push(command); return { id: 7, command, startedAt: 0, status: 'running' as const, output: '', url: 'http://localhost:8000' } },
      list: () => [], get: () => undefined, kill: () => true, killAll: () => {},
    }
    const out = await bashTool.run({ command: 'python3 -m http.server' }, { cwd: process.cwd(), bgTasks: fakeStore })
    expect(started).toEqual(['python3 -m http.server'])
    expect(out).toContain('task #7')
    expect(out).toContain('http://localhost:8000')
  })

  it('honors explicit background:true', async () => {
    const started: string[] = []
    const fakeStore = {
      start: (command: string) => { started.push(command); return { id: 1, command, startedAt: 0, status: 'running' as const, output: '' } },
      list: () => [], get: () => undefined, kill: () => true, killAll: () => {},
    }
    await bashTool.run({ command: 'node watcher.js', background: true }, { cwd: process.cwd(), bgTasks: fakeStore })
    expect(started).toEqual(['node watcher.js'])
  })

  it('runs an ordinary command in the foreground (not backgrounded)', async () => {
    const started: string[] = []
    const fakeStore = {
      start: (command: string) => { started.push(command); return { id: 1, command, startedAt: 0, status: 'running' as const, output: '' } },
      list: () => [], get: () => undefined, kill: () => true, killAll: () => {},
    }
    const out = await bashTool.run({ command: "printf 'ok'" }, { cwd: process.cwd(), bgTasks: fakeStore })
    expect(started).toEqual([])           // not a server → foreground
    expect(out).toContain('ok')
  })
})
