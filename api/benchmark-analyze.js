import { runBenchmarkAnalysis } from '../server/benchmarkPipeline.js'
import { resolveMiniMaxConfig } from '../server/runtimeConfig.js'

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method Not Allowed' })
    return
  }

  try {
    const minimaxConfig = resolveMiniMaxConfig({
      model: request.body?.model,
    })

    const result = await runBenchmarkAnalysis({
      jobId: request.body?.jobId,
      minimaxApiKey: minimaxConfig.apiKey,
      minimaxModel: minimaxConfig.model,
      prompt: request.body?.prompt || '',
    })

    response.status(200).json(result)
  } catch (error) {
    response.status(error.status || 500).json({
      error: error.message || 'MiniMax 分析失败',
      details: error.payload ?? null,
    })
  }
}
