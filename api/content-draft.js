import { generateContentDraft, runInitialContentPipeline } from '../server/contentCreation.js'
import { resolveActiveLlmProfile } from '../server/runtimeConfig.js'

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method Not Allowed' })
    return
  }

  try {
    const action = request.body?.action || 'initial'
    const activeProfile = resolveActiveLlmProfile({
      model: request.body?.model,
    })

    if (request.body?.streamProgress && action === 'initial') {
      response.status(200)
      response.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
      response.setHeader('Cache-Control', 'no-cache, no-transform')
      response.setHeader('Connection', 'keep-alive')
      response.flushHeaders?.()

      const writeEvent = (payload) => {
        response.write(`${JSON.stringify(payload)}\n`)
      }

      try {
        const result = await runInitialContentPipeline({
          apiKey: activeProfile.apiKey,
          baseUrl: activeProfile.baseUrl,
          deepThinkingEnabled: request.body?.deepThinkingEnabled ?? true,
          model: activeProfile.model,
          provider: activeProfile.provider,
          ruleProfileId: request.body?.ruleProfileId,
          supplement: request.body?.supplement || '',
          topic: request.body?.topic || null,
          onProgress: (progress) => {
            writeEvent({
              type: 'progress',
              ...progress,
            })
          },
        })

        writeEvent({
          type: 'result',
          data: result,
        })
      } catch (error) {
        writeEvent({
          type: 'error',
          details: error.payload ?? null,
          error: error.message || '内容创作请求失败',
        })
      }

      response.end()
      return
    }

    const result =
      action === 'initial'
        ? await runInitialContentPipeline({
            apiKey: activeProfile.apiKey,
            baseUrl: activeProfile.baseUrl,
            deepThinkingEnabled: request.body?.deepThinkingEnabled ?? true,
            model: activeProfile.model,
            provider: activeProfile.provider,
            ruleProfileId: request.body?.ruleProfileId,
            supplement: request.body?.supplement || '',
            topic: request.body?.topic || null,
          })
        : await generateContentDraft({
            action,
            apiKey: activeProfile.apiKey,
            baseUrl: activeProfile.baseUrl,
            deepThinkingEnabled: request.body?.deepThinkingEnabled ?? true,
            model: activeProfile.model,
            note: request.body?.note || '',
            provider: activeProfile.provider,
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
