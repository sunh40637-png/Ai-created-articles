import { generateContentDraft } from '../server/contentCreation.js'
import { resolveMiniMaxConfig } from '../server/runtimeConfig.js'

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method Not Allowed' })
    return
  }

  try {
    const minimaxConfig = resolveMiniMaxConfig({
      model: request.body?.model || process.env.MINIMAX_MODEL,
    })

    const result = await generateContentDraft({
      action: request.body?.action || 'initial',
      apiKey: minimaxConfig.apiKey,
      deepThinkingEnabled: request.body?.deepThinkingEnabled ?? true,
      model: minimaxConfig.model,
      note: request.body?.note || '',
      supplement: request.body?.supplement || '',
      topic: request.body?.topic || null,
    })

    response.status(200).json(result)
  } catch (error) {
    response.status(error.status || 500).json({
      error: error.message || '内容创作请求失败',
      details: error.payload ?? null,
    })
  }
}
