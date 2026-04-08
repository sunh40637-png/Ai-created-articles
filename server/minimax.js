import { chatWithLlm } from './llm/index.js'

export async function chatWithMiniMax(options = {}) {
  return chatWithLlm(options)
}

export const chatWithGlm = chatWithLlm
