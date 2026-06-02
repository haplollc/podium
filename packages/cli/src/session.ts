/**
 * Shared session hooks for process-level lifecycle. The app registers an
 * `unload` callback once it knows the active model; the entrypoint calls it on
 * exit/signals so the model is evicted from the GPU (no lingering hot process).
 */
export const session: { unload?: () => Promise<void> } = {}

let shuttingDown = false

/** Evict the model (best-effort, time-boxed) then exit. Safe to call repeatedly. */
export async function shutdown(code = 0): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  try {
    await Promise.race([
      session.unload?.() ?? Promise.resolve(),
      new Promise((r) => setTimeout(r, 1500)),  // never hang exit on a slow backend
    ])
  } catch { /* best-effort */ }
  process.exit(code)
}

/** Wire SIGINT/SIGTERM/SIGHUP so Ctrl+C and terminal-close both free the GPU. */
export function registerShutdown(): void {
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
    process.once(sig, () => { void shutdown(0) })
  }
}
