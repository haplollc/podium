export { loadCatalog, recommendedFor } from './catalog.js'
export type { CatalogModel } from './catalog.js'
export { OllamaProvider } from './ollama.js'
export { OpenAICompatProvider } from './openai-compat.js'
export { LMStudioProvider } from './lmstudio.js'
export { MLXProvider } from './mlx.js'
export { getProvider, detectBackends } from './factory.js'
export type { BackendId } from './factory.js'
export type {
  Provider, LocalModel, RunningModel, PullProgress, ModelCapabilities, ChatMessage,
  ToolCall, ToolSchema, ChatRequest, ChatEvent, HealthStatus,
} from './types.js'
