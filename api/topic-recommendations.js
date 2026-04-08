import { generateTopicRecommendations } from '../server/topicRecommendations.js'
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

    const result = await generateTopicRecommendations({
      apiKey: activeProfile.apiKey,
      model: activeProfile.model,
      supplement: request.body?.supplement || '',
    })

    response.status(200).json(result)
  } catch (error) {
    response.status(error.status || 500).json({
      error: error.message || '推荐选题生成失败',
      details: error.payload ?? null,
    })
  }
}
