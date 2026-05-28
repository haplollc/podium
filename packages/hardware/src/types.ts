export interface SystemInfo {
  totalMemoryBytes: number
  totalMemoryGB: number      // rounded to 1 decimal
  usableMemoryGB: number     // 0.7 * total, the budget for weights+KV
  chip: string               // e.g. "Apple M2"
  arch: string               // e.g. "arm64"
  cpuCores: number
}
