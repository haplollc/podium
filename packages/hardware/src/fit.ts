import type { SystemInfo } from './types.js'

export type FitVerdict = 'fits' | 'tight' | 'wont-run'

export interface ModelFootprint {
  weightsGB: number
  contextTokens: number
  kvPerKTokenGB: number     // KV-cache GB per 1k tokens of context
  overheadGB?: number       // OS + runtime overhead; default 2
}

export interface FitResult {
  requiredGB: number
  usableGB: number
  verdict: FitVerdict
  headroomGB: number        // usable - required (negative => over budget)
}

export function estimateFit(m: ModelFootprint, sys: SystemInfo): FitResult {
  const overhead = m.overheadGB ?? 2
  const kv = (m.contextTokens / 1000) * m.kvPerKTokenGB
  const requiredGB = Math.round((m.weightsGB + kv + overhead) * 10) / 10
  const usableGB = sys.usableMemoryGB
  const headroomGB = Math.round((usableGB - requiredGB) * 10) / 10
  let verdict: FitVerdict
  if (requiredGB <= usableGB * 0.9) verdict = 'fits'
  else if (requiredGB <= usableGB) verdict = 'tight'
  else verdict = 'wont-run'
  return { requiredGB, usableGB, verdict, headroomGB }
}
