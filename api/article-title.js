import { generateArticleTitle } from '../server/articleTitleGeneration.js'
import { DEFAULT_GLM_MODEL } from '../server/llm/constants.js'
import { resolveActiveLlmProfile } from '../server/runtimeConfig.js'

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method Not Allowed' })
    return
  }

  try {
    const llmProfile = resolveActiveLlmProfile({
      model: DEFAULT_GLM_MODEL,
    })
    const result = await generateArticleTitle({
      apiKey: llmProfile.apiKey,
      articleBodyMarkdown: request.body?.articleBodyMarkdown || '',
      articleTitle: request.body?.articleTitle || '',
      baseUrl: llmProfile.baseUrl,
      model: llmProfile.model,
      provider: llmProfile.provider,
      sessionId: request.body?.sessionId || '',
      theme: request.body?.theme || '',
      type: request.body?.type || '',
    })

    response.status(200).json(result)
  } catch (error) {
    response.status(error.status || 500).json({
      details: error.payload ?? null,
      error: error.message || '标题生成失败',
    })
  }
}
