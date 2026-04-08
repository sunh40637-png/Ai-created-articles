import { saveLlmConfig } from '../server/llm/config.js'
import { resolveActiveLlmProfile, resolveLlmConfig } from '../server/runtimeConfig.js'

export default async function handler(request, response) {
  try {
    if (request.method === 'GET') {
      response.status(200).json({
        activeProfile: resolveActiveLlmProfile(),
        config: resolveLlmConfig(),
      })
      return
    }

    if (request.method === 'PUT') {
      const result = await saveLlmConfig(request.body?.config ?? null)
      response.status(200).json(result)
      return
    }

    response.status(405).json({ error: 'Method Not Allowed' })
  } catch (error) {
    response.status(error.status || 500).json({
      error: error.message || '模型配置请求失败',
      details: error.payload ?? null,
    })
  }
}
