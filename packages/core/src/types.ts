export interface ContextStats {
  used: number          // estimated tokens currently in context
  effective: number     // usable window after output reserve
  window: number        // model context window
  percentUsed: number   // 0..1 of effective
}
