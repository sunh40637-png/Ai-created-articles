import { runBenchmarkAnalysis } from '../server/benchmarkPipeline.js'
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

    const result = await runBenchmarkAnalysis({
      jobId: request.body?.jobId,
      minimaxApiKey: activeProfile.apiKey,
      minimaxModel: activeProfile.model,
      prompt: request.body?.prompt || '',
    })

    response.status(200).json(result)
  } catch (error) {
    response.status(error.status || 500).json({
      error: error.message || '当前模型分析失败',
      details: error.payload ?? null,
    })
  }
}
