import { execa, type ResultPromise } from 'execa'
import type { BgTask, BgTaskStore } from './types.js'

const MAX_OUTPUT = 4000   // keep only the tail of a chatty server's logs

/** Pull a localhost URL (or a bare port) out of a server's startup logs. */
function detectUrl(text: string): string | undefined {
  const direct = text.match(/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?[^\s"']*/i)
  if (direct) return direct[0].replace('0.0.0.0', 'localhost')
  const port = text.match(/\b(?:port|listening on|serving .*?)\D{0,8}(\d{2,5})\b/i)
  if (port) return `http://localhost:${port[1]}`
  return undefined
}

/** Best-effort port from the command itself (e.g. `http.server 8000`, `--port 3000`, `-p 5173`). */
function portFromCommand(cmd: string): string | undefined {
  if (/\bhttp\.server\b/.test(cmd) && !/\bhttp\.server\s+\d/.test(cmd)) return '8000' // python default
  const m = cmd.match(/(?:--port[ =]|--port=|-p\s+|http\.server\s+|:)(\d{2,5})\b/)
  return m?.[1]
}

/** Create the registry the CLI shares with the Bash tool to run/track background processes. */
export function createBgTaskStore(): BgTaskStore {
  const procs = new Map<number, ResultPromise>()
  const tasks = new Map<number, BgTask>()
  let nextId = 1

  return {
    start(command, cwd) {
      const id = nextId++
      const port = portFromCommand(command)
      const task: BgTask = {
        id,
        command,
        startedAt: Date.now(),
        status: 'running',
        output: '',
        url: port ? `http://localhost:${port}` : undefined,
      }
      tasks.set(id, task)
      const proc = execa(command, { shell: true, cwd, all: true, reject: false })
      procs.set(id, proc)
      proc.all?.on('data', (d: Buffer) => {
        task.output = (task.output + d.toString()).slice(-MAX_OUTPUT)
        if (!task.url) task.url = detectUrl(task.output)
      })
      proc.then(
        (r) => { task.status = 'exited'; task.exitCode = r.exitCode ?? undefined },
        () => { task.status = 'exited' },
      )
      return { ...task }
    },
    list() {
      return [...tasks.values()].map(t => ({ ...t }))
    },
    get(id) {
      const t = tasks.get(id)
      return t ? { ...t } : undefined
    },
    kill(id) {
      const proc = procs.get(id)
      if (!proc) return false
      proc.kill('SIGTERM')
      const t = tasks.get(id)
      if (t) t.status = 'exited'
      return true
    },
    killAll() {
      for (const proc of procs.values()) proc.kill('SIGTERM')
    },
  }
}
