export interface LocalModel { name: string; sizeBytes: number }
export interface RunningModel { name: string; sizeBytes: number; sizeVramBytes: number }
export interface PullProgress { status: string; completed?: number; total?: number }
export interface ModelCapabilities { tools: boolean; vision?: boolean; contextLength?: number }

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: ToolCall[]
  tool_call_id?: string
  /** For role:'tool' — the tool name (Ollama associates results by name). */
  name?: string
  /** Base64 images attached to a user message (vision models only). */
  images?: string[]
}
export interface ToolCall { id: string; name: string; arguments: Record<string, unknown> }

export interface ToolSchema {
  name: string
  description: string
  parameters: Record<string, unknown> // JSON Schema
}

export interface ChatRequest {
  model: string
  messages: ChatMessage[]
  tools?: ToolSchema[]
  numCtx?: number
  temperature?: number
  /** How long the backend should keep the model loaded (e.g. "30m"). */
  keepAlive?: string
  /** Abort the request mid-stream (e.g. user pressed Esc). */
  signal?: AbortSignal
}

export type ChatEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_call'; call: ToolCall }
  | { type: 'done' }

export interface HealthStatus { running: boolean; detail?: string }

export interface Provider {
  id: 'ollama' | 'lmstudio' | 'mlx'
  health(): Promise<HealthStatus>
  listLocal(): Promise<LocalModel[]>
  pull(model: string, onProgress: (p: PullProgress) => void): Promise<void>
  capabilities(model: string): Promise<ModelCapabilities>
  chat(req: ChatRequest): AsyncIterable<ChatEvent>
  /** Optional: preload the model into memory so the first real turn is fast. */
  warm?(model: string, keepAlive?: string): Promise<void>
  /** Optional: delete a downloaded model to free disk space. */
  remove?(model: string): Promise<void>
  /** Optional: list currently-loaded models and their memory footprint. */
  ps?(): Promise<RunningModel[]>
  /** Optional: evict a model from memory/GPU immediately (free resources on exit). */
  unload?(model: string): Promise<void>
}
