import { generateTopicRecommendations } from '../server/topicRecommendations.js'

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method Not Allowed' })
    return
  }

  try {
    const result = await generateTopicRecommendations({
      apiKey: process.env.MINIMAX_API_KEY,
      model: request.body?.model || process.env.MINIMAX_MODEL,
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
