import { generateContentDraft } from '../server/contentCreation.js'
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

    const result = await generateContentDraft({
      action: request.body?.action || 'initial',
      apiKey: activeProfile.apiKey,
      deepThinkingEnabled: request.body?.deepThinkingEnabled ?? true,
      model: activeProfile.model,
      note: request.body?.note || '',
      ruleProfileId: request.body?.ruleProfileId,
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
