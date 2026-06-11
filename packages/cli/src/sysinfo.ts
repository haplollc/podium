import { execa } from 'execa'

export interface TempReading {
  celsius: number
  source: 'cpu' | 'battery'
}

let osxCpuTempChecked = false
let hasOsxCpuTemp = false

async function tryOsxCpuTemp(): Promise<number | null> {
  if (!osxCpuTempChecked) {
    osxCpuTempChecked = true
    const w = await execa('which', ['osx-cpu-temp'], { reject: false })
    hasOsxCpuTemp = w.exitCode === 0 && w.stdout.trim().length > 0
  }
  if (!hasOsxCpuTemp) return null
  const r = await execa('osx-cpu-temp', ['-c'], { reject: false })
  const m = /(-?\d+(?:\.\d+)?)/.exec(r.stdout)
  const c = m ? Number(m[1]) : NaN
  return Number.isFinite(c) && c > 0 ? c : null
}

async function tryBatteryTemp(): Promise<number | null> {
  // AppleSmartBattery "Temperature" is centi-°C (e.g. 3070 = 30.7°C). No sudo/install.
  const r = await execa('ioreg', ['-n', 'AppleSmartBattery'], { reject: false })
  const m = /"Temperature"\s*=\s*(\d+)/.exec(r.stdout)
  if (!m) return null
  const c = Number(m[1]) / 100
  return Number.isFinite(c) && c > 0 && c < 120 ? c : null
}

// Temperature moves slowly but each read spawns a process (ioreg/osx-cpu-temp),
// so cache readings briefly — the metrics dashboard polls much faster than this.
const TEMP_CACHE_MS = 5000
let tempCache: { at: number; value: TempReading | null } | null = null

/**
 * Best-available machine temperature with zero setup: real CPU °C via
 * `osx-cpu-temp` if installed, otherwise the battery sensor via `ioreg`
 * (works on any MacBook without sudo). Returns null if neither is available.
 */
export async function readTemperature(): Promise<TempReading | null> {
  if (tempCache && Date.now() - tempCache.at < TEMP_CACHE_MS) return tempCache.value
  let value: TempReading | null = null
  try {
    const cpu = await tryOsxCpuTemp()
    if (cpu != null) value = { celsius: cpu, source: 'cpu' }
  } catch { /* fall through */ }
  if (!value) {
    try {
      const batt = await tryBatteryTemp()
      if (batt != null) value = { celsius: batt, source: 'battery' }
    } catch { /* fall through */ }
  }
  tempCache = { at: Date.now(), value }
  return value
}

/** Green/yellow/red zone for a reading. CPU and battery have different safe ranges. */
export function tempZone(t: TempReading): 'green' | 'yellow' | 'red' {
  const [warn, hot] = t.source === 'cpu' ? [70, 85] : [38, 44]
  if (t.celsius >= hot) return 'red'
  if (t.celsius >= warn) return 'yellow'
  return 'green'
}
