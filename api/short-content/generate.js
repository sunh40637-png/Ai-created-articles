import { generateShortContent } from '../../server/shortContentGeneration.js'
import { resolveMiniMaxConfig } from '../../server/runtimeConfig.js'

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method Not Allowed' })
    return
  }

  try {
    const minimaxConfig = resolveMiniMaxConfig({
      model: request.body?.model,
    })

    const result = await generateShortContent({
      apiKey: minimaxConfig.apiKey,
      existingContents: request.body?.existingContents ?? [],
      model: minimaxConfig.model,
    })

    response.status(200).json(result)
  } catch (error) {
    response.status(error.status || 500).json({
      error: error.message || '短文生成失败',
      details: error.payload ?? null,
    })
  }
}
