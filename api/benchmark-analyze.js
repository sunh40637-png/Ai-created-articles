import { runBenchmarkAnalysis } from '../server/benchmarkPipeline.js'

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method Not Allowed' })
    return
  }

  try {
    const result = await runBenchmarkAnalysis({
      jobId: request.body?.jobId,
      minimaxApiKey: process.env.MINIMAX_API_KEY,
      minimaxModel: request.body?.model || process.env.MINIMAX_MODEL,
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
