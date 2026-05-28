export interface LocalModel { name: string; sizeBytes: number }
export interface PullProgress { status: string; completed?: number; total?: number }
export interface ModelCapabilities { tools: boolean; contextLength?: number }

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: ToolCall[]
  tool_call_id?: string
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
}
