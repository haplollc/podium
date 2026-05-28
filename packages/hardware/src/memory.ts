import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import os from 'node:os'
import type { SystemInfo } from './types.js'

const pExecFile = promisify(execFile)

export type SysctlRunner = (key: string) => Promise<string>

const realSysctl: SysctlRunner = async (key) => {
  const { stdout } = await pExecFile('sysctl', ['-n', key])
  return stdout.trim()
}

export interface ComputeOpts {
  sysctl?: SysctlRunner
  arch?: string
}

export async function computeSystemInfo(opts: ComputeOpts = {}): Promise<SystemInfo> {
  const sysctl = opts.sysctl ?? realSysctl
  const arch = opts.arch ?? os.arch()
  const [memStr, chip, ncpu] = await Promise.all([
    sysctl('hw.memsize'),
    sysctl('machdep.cpu.brand_string'),
    sysctl('hw.ncpu'),
  ])
  const totalMemoryBytes = Number(memStr) || 0
  const totalMemoryGB = Math.round(totalMemoryBytes / 1024 ** 3)
  const usableMemoryGB = Math.round(totalMemoryGB * 0.7 * 10) / 10
  return {
    totalMemoryBytes,
    totalMemoryGB,
    usableMemoryGB,
    chip: chip || 'Unknown',
    arch,
    cpuCores: Number(ncpu) || os.cpus().length,
  }
}
