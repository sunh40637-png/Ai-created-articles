import { generateContentDraft } from '../server/contentCreation.js'

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method Not Allowed' })
    return
  }

  try {
    const result = await generateContentDraft({
      action: request.body?.action || 'initial',
      apiKey: process.env.MINIMAX_API_KEY,
      deepThinkingEnabled: request.body?.deepThinkingEnabled ?? true,
      model: request.body?.model || process.env.MINIMAX_MODEL,
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
