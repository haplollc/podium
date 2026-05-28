import { execa } from 'execa'
import { OpenAICompatProvider } from './openai-compat.js'
import type { PullProgress } from './types.js'

export class LMStudioProvider extends OpenAICompatProvider {
  constructor(base = process.env.LMSTUDIO_HOST ?? 'http://localhost:1234/v1') {
    super('lmstudio', base)
  }

  /** Download via the LM Studio CLI (`lms`). Requires `lms` on PATH. */
  override async pull(model: string, onProgress: (p: PullProgress) => void): Promise<void> {
    onProgress({ status: `lms get ${model}` })
    await execa('lms', ['get', model], { reject: true })
    onProgress({ status: 'success' })
  }
}
