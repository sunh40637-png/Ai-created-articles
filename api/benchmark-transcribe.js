import { runBenchmarkTranscription } from '../server/benchmarkPipeline.js'
import { parseRequestFormData } from '../server/httpFormData.js'
import { resolveDoubaoAsrConfig } from '../server/runtimeConfig.js'

export const config = {
  api: {
    bodyParser: false,
  },
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method Not Allowed' })
    return
  }

  try {
    const doubaoConfig = resolveDoubaoAsrConfig()
    const formData = await parseRequestFormData(request)
    const files = formData
      .getAll('files')
      .filter((entry) => entry && typeof entry === 'object' && typeof entry.arrayBuffer === 'function')

    const result = await runBenchmarkTranscription({
      attachments: files,
      doubaoAccessKey: doubaoConfig.accessKey,
      doubaoAppId: doubaoConfig.appId,
      doubaoResourceId: doubaoConfig.resourceId,
    })

    response.status(200).json(result)
  } catch (error) {
    response.status(error.status || 500).json({
      error: error.message || '豆包识别失败',
      details: error.payload ?? null,
    })
  }
}
