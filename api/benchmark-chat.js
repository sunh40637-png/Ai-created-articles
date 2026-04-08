import { chatWithLlm } from '../server/llm/index.js'
import { resolveActiveLlmProfile } from '../server/runtimeConfig.js'

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method Not Allowed' })
    return
  }

  try {
    const activeProfile = resolveActiveLlmProfile({
      model: request.body?.model,
    })

    const result = await chatWithLlm({
      apiKey: activeProfile.apiKey,
      baseUrl: activeProfile.baseUrl,
      model: activeProfile.model,
      provider: activeProfile.provider,
      messages: request.body?.messages ?? [],
    })

    response.status(200).json({
      content: result?.choices?.[0]?.message?.content ?? '',
      model: result?.model ?? activeProfile.model ?? '当前模型',
      usage: result?.usage ?? null,
    })
  } catch (error) {
    response.status(error.status || 500).json({
      error: error.message || '聊天请求失败',
      details: error.payload ?? null,
    })
  }
}
