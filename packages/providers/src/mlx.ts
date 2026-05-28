import { OpenAICompatProvider } from './openai-compat.js'

export class MLXProvider extends OpenAICompatProvider {
  constructor(base = process.env.MLX_HOST ?? 'http://localhost:8080/v1') {
    super('mlx', base)
  }
  // pull() inherited: MLX downloads models from Hugging Face on first load.
}
