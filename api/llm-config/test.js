import { chatWithLlm } from '../../server/llm/index.js'
import { normalizeLlmProfile, resolveActiveLlmProfile } from '../../server/runtimeConfig.js'

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method Not Allowed' })
    return
  }

  try {
    const profile = request.body?.profile
      ? normalizeLlmProfile(request.body.profile, 0)
      : resolveActiveLlmProfile()

    const result = await chatWithLlm({
      apiKey: profile.apiKey,
      baseUrl: profile.baseUrl,
      messages: [
        {
          role: 'user',
          content: '请只回复 ok',
        },
      ],
      model: profile.model,
      provider: profile.provider,
      systemPrompt: '你是一个连通性测试助手。',
      temperature: 0,
      thinking: false,
      timeoutMs: 60000,
      topP: 1,
    })

    response.status(200).json({
      content: result?.choices?.[0]?.message?.content ?? '',
      model: result?.model ?? profile.model,
      provider: profile.provider,
      success: true,
      usage: result?.usage ?? null,
    })
  } catch (error) {
    response.status(error.status || 500).json({
      error: error.message || '模型连通性测试失败',
      details: error.payload ?? null,
      success: false,
    })
  }
}
