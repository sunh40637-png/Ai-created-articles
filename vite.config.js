import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { createReadStream } from 'node:fs'
import { getJobAssetInfo } from './server/benchmarkAssets.js'
import {
  runBenchmarkAnalysis,
  runBenchmarkTranscription,
} from './server/benchmarkPipeline.js'
import {
  generateContentDraft,
  runInitialContentPipeline,
} from './server/contentCreation.js'
import {
  deletePersistedContentSessionPayload,
  readContentSessionPersistenceMeta,
  readPersistedContentSessionPayload,
  writePersistedContentSessionPayload,
} from './server/contentSessionPersistence.js'
import { parseRequestFormData } from './server/httpFormData.js'
import {
  deleteFixedLayoutAsset,
  readFixedLayoutConfig,
  updateFixedLayoutConfig,
  uploadFixedLayoutAsset,
} from './server/fixedLayoutConfig.js'
import {
  deleteLibraryAsset,
  listLibraryAssets,
  matchLibraryAssetsForArticle,
  recordLibraryAssetUsage,
  updateLibraryAsset,
} from './server/libraryAssets.js'
import { chatWithMiniMax } from './server/minimax.js'
import { resolveDoubaoAsrConfig, resolveMiniMaxConfig } from './server/runtimeConfig.js'
import { generateTopicRecommendations } from './server/topicRecommendations.js'
import { prepareWechatClipboardHtml } from './server/wechatClipboard.js'
import { readWechatDraftStatus, syncSessionToWechatDraft } from './server/wechatDraft.js'

function parseRangeHeader(rangeHeader, size) {
  if (!rangeHeader || !rangeHeader.startsWith('bytes=')) {
    return null
  }

  const [startPart, endPart] = rangeHeader.replace('bytes=', '').split('-')
  const parsedStart = startPart === '' ? null : Number.parseInt(startPart, 10)
  const parsedEnd = endPart === '' ? null : Number.parseInt(endPart, 10)

  if (
    (parsedStart !== null && !Number.isFinite(parsedStart)) ||
    (parsedEnd !== null && !Number.isFinite(parsedEnd))
  ) {
    return null
  }

  let start = parsedStart
  let end = parsedEnd

  if (start === null && end !== null) {
    start = Math.max(0, size - end)
    end = size - 1
  } else {
    start = Math.max(0, start ?? 0)
    end = Math.min(size - 1, end ?? size - 1)
  }

  if (start > end || start >= size) {
    return { invalid: true }
  }

  return { end, start }
}

function minimaxDevApi(env) {
  return {
    name: 'minimax-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/benchmark-chat', async (req, res, next) => {
        if (req.method !== 'POST') {
          next()
          return
        }

        try {
          const chunks = []

          for await (const chunk of req) {
            chunks.push(chunk)
          }

          const body = chunks.length > 0 ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}
          const result = await chatWithMiniMax({
            apiKey: env.MINIMAX_API_KEY,
            model: body.model || env.MINIMAX_MODEL,
            messages: body.messages ?? [],
          })

          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(
            JSON.stringify({
              content: result?.choices?.[0]?.message?.content ?? '',
              model: result?.model ?? env.MINIMAX_MODEL ?? 'MiniMax-M2.7',
              usage: result?.usage ?? null,
            }),
          )
        } catch (error) {
          res.statusCode = error.status || 500
          res.setHeader('Content-Type', 'application/json')
          res.end(
            JSON.stringify({
              error: error.message || '聊天请求失败',
              details: error.payload ?? null,
            }),
          )
        }
      })
    },
  }
}

function contentCreationDevApi(env) {
  return {
    name: 'content-creation-dev-api',
    configureServer(server) {
      async function readJsonBody(req) {
        const chunks = []

        for await (const chunk of req) {
          chunks.push(chunk)
        }

        return chunks.length > 0 ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}
      }

      function writeStreamEvent(res, payload) {
        res.write(`${JSON.stringify(payload)}\n`)
      }

      server.middlewares.use('/api/content-draft', async (req, res, next) => {
        if (req.method !== 'POST') {
          next()
          return
        }

        try {
          const body = await readJsonBody(req)

          if (body.streamProgress && body.action === 'initial') {
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
            res.setHeader('Cache-Control', 'no-cache, no-transform')
            res.setHeader('Connection', 'keep-alive')
            res.flushHeaders?.()

            try {
              const result = await runInitialContentPipeline({
                apiKey: env.MINIMAX_API_KEY,
                deepThinkingEnabled: body.deepThinkingEnabled ?? true,
                model: body.model || env.MINIMAX_MODEL,
                ruleProfileId: body.ruleProfileId,
                supplement: body.supplement || '',
                topic: body.topic || null,
                onProgress: (progress) => {
                  writeStreamEvent(res, {
                    type: 'progress',
                    ...progress,
                  })
                },
              })

              writeStreamEvent(res, {
                type: 'result',
                data: result,
              })
            } catch (error) {
              writeStreamEvent(res, {
                type: 'error',
                details: error.payload ?? null,
                error: error.message || '内容创作请求失败',
              })
            }

            res.end()
            return
          }

          const result = await generateContentDraft({
            action: body.action || 'initial',
            apiKey: env.MINIMAX_API_KEY,
            deepThinkingEnabled: body.deepThinkingEnabled ?? true,
            model: body.model || env.MINIMAX_MODEL,
            note: body.note || '',
            ruleProfileId: body.ruleProfileId,
            supplement: body.supplement || '',
            topic: body.topic || null,
          })

          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(result))
        } catch (error) {
          res.statusCode = error.status || 500
          res.setHeader('Content-Type', 'application/json')
          res.end(
            JSON.stringify({
              error: error.message || '内容创作请求失败',
              details: error.payload ?? null,
            }),
          )
        }
      })
    },
  }
}

function topicRecommendationDevApi(env) {
  return {
    name: 'topic-recommendation-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/topic-recommendations', async (req, res, next) => {
        if (req.method !== 'POST') {
          next()
          return
        }

        try {
          const chunks = []

          for await (const chunk of req) {
            chunks.push(chunk)
          }

          const body = chunks.length > 0 ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}
          const result = await generateTopicRecommendations({
            apiKey: env.MINIMAX_API_KEY,
            model: body.model || env.MINIMAX_MODEL,
            supplement: body.supplement || '',
          })

          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(result))
        } catch (error) {
          res.statusCode = error.status || 500
          res.setHeader('Content-Type', 'application/json')
          res.end(
            JSON.stringify({
              error: error.message || '推荐选题生成失败',
              details: error.payload ?? null,
            }),
          )
        }
      })
    },
  }
}

function libraryAssetsDevApi() {
  return {
    name: 'library-assets-dev-api',
    configureServer(server) {
      async function readJsonBody(req) {
        const chunks = []

        for await (const chunk of req) {
          chunks.push(chunk)
        }

        return chunks.length > 0 ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}
      }

      server.middlewares.use('/api/library-assets', async (req, res, next) => {
        const requestUrl = new URL(req.url, 'http://127.0.0.1')
        const pathname = requestUrl.pathname || '/'
        const assetId = pathname !== '/' ? decodeURIComponent(pathname.replace(/^\//, '')) : ''

        try {
          if (req.method === 'POST' && pathname === '/match') {
            const body = await readJsonBody(req)
            const result = await matchLibraryAssetsForArticle({
              sections: Array.isArray(body?.sections) ? body.sections : [],
              topic: body?.topic || '',
              type: body?.type || '',
              wordCount: body?.wordCount || 0,
            })

            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(result))
            return
          }

          if (req.method === 'POST' && pathname === '/usage') {
            const body = await readJsonBody(req)
            const result = await recordLibraryAssetUsage({
              assetIds: body?.assetIds ?? [],
              usedAt: body?.usedAt,
            })

            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(result))
            return
          }

          if ((req.method === 'GET' || req.method === 'HEAD') && pathname === '/') {
            const items = await listLibraryAssets({
              emotion: requestUrl.searchParams.get('emotion') || '',
              figures: requestUrl.searchParams.get('figures') || '',
              sort: requestUrl.searchParams.get('sort') || '',
              topic: requestUrl.searchParams.get('topic') || '',
            })

            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ items }))
            return
          }

          if (req.method === 'PATCH' && assetId) {
            const body = await readJsonBody(req)
            const result = await updateLibraryAsset(assetId, body)

            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(result))
            return
          }

          if (req.method === 'DELETE' && assetId) {
            const result = await deleteLibraryAsset(assetId)

            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(result))
            return
          }

          next()
        } catch (error) {
          res.statusCode = error.status || 500
          res.setHeader('Content-Type', 'application/json')
          res.end(
            JSON.stringify({
              error: error.message || '素材库请求失败',
            }),
          )
        }
      })
    },
  }
}

function fixedLayoutConfigDevApi() {
  return {
    name: 'fixed-layout-config-dev-api',
    configureServer(server) {
      async function readJsonBody(req) {
        const chunks = []

        for await (const chunk of req) {
          chunks.push(chunk)
        }

        return chunks.length > 0 ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}
      }

      server.middlewares.use('/api/fixed-layout-config', async (req, res, next) => {
        const requestUrl = new URL(req.url, 'http://127.0.0.1')
        const pathname = requestUrl.pathname || '/'

        try {
          if ((req.method === 'GET' || req.method === 'HEAD') && pathname === '/') {
            const result = await readFixedLayoutConfig()

            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(result))
            return
          }

          if (req.method === 'PATCH' && pathname === '/') {
            const body = await readJsonBody(req)
            const result = await updateFixedLayoutConfig({
              imageSlots: body?.imageSlots,
              metrics: body?.metrics,
            })

            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(result))
            return
          }

          if (req.method === 'POST' && pathname === '/upload') {
            const formData = await parseRequestFormData(req)
            const slot = typeof formData.get('slot') === 'string' ? formData.get('slot').trim() : ''
            const file = formData.get('file')
            const result = await uploadFixedLayoutAsset({
              file,
              slot,
            })

            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ asset: result }))
            return
          }

          if (req.method === 'DELETE' && pathname === '/asset') {
            const body = await readJsonBody(req)
            const result = await deleteFixedLayoutAsset(body?.slot ?? '')

            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(result))
            return
          }

          next()
        } catch (error) {
          res.statusCode = error.status || 500
          res.setHeader('Content-Type', 'application/json')
          res.end(
            JSON.stringify({
              error: error.message || '模板配置请求失败',
            }),
          )
        }
      })
    },
  }
}

function contentSessionsDevApi() {
  return {
    name: 'content-sessions-dev-api',
    configureServer(server) {
      async function readJsonBody(req) {
        const chunks = []

        for await (const chunk of req) {
          chunks.push(chunk)
        }

        return chunks.length > 0 ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}
      }

      server.middlewares.use('/api/content-sessions', async (req, res, next) => {
        try {
          if (req.method === 'GET' || req.method === 'HEAD') {
            const payload = await readPersistedContentSessionPayload()

            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(
              JSON.stringify({
                ...(payload ?? { item: null, name: 'content-creation-sessions-v1', updatedAt: null }),
                meta: readContentSessionPersistenceMeta(),
              }),
            )
            return
          }

          if (req.method === 'PUT') {
            const body = await readJsonBody(req)
            const payload = await writePersistedContentSessionPayload({
              item: body?.item ?? null,
              name: body?.name ?? 'content-creation-sessions-v1',
            })

            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(
              JSON.stringify({
                ...payload,
                meta: readContentSessionPersistenceMeta(),
              }),
            )
            return
          }

          if (req.method === 'DELETE') {
            const payload = await deletePersistedContentSessionPayload()

            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(payload))
            return
          }

          next()
        } catch (error) {
          res.statusCode = error.status || 500
          res.setHeader('Content-Type', 'application/json')
          res.end(
            JSON.stringify({
              error: error.message || '本地历史记录请求失败',
            }),
          )
        }
      })
    },
  }
}

function wechatDraftDevApi() {
  return {
    name: 'wechat-draft-dev-api',
    configureServer(server) {
      async function readJsonBody(req) {
        const chunks = []

        for await (const chunk of req) {
          chunks.push(chunk)
        }

        return chunks.length > 0 ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}
      }

      server.middlewares.use('/api/wechat/draft', async (req, res, next) => {
        const requestUrl = new URL(req.url, 'http://127.0.0.1')
        const pathname = requestUrl.pathname || '/'

        try {
          if ((req.method === 'GET' || req.method === 'HEAD') && pathname === '/status') {
            const result = await readWechatDraftStatus({
              sessionId: requestUrl.searchParams.get('sessionId') || '',
            })

            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(result))
            return
          }

          if (req.method === 'POST' && pathname === '/sync') {
            const body = await readJsonBody(req)
            const result = await syncSessionToWechatDraft({
              article: body?.article ?? {},
              sessionId: body?.sessionId ?? '',
            })

            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(result))
            return
          }

          next()
        } catch (error) {
          res.statusCode = error.status || 500
          res.setHeader('Content-Type', 'application/json')
          res.end(
            JSON.stringify({
              details: error.payload ?? null,
              error: error.message || '微信草稿同步失败',
            }),
          )
        }
      })

      server.middlewares.use('/api/wechat/clipboard', async (req, res, next) => {
        const requestUrl = new URL(req.url, 'http://127.0.0.1')
        const pathname = requestUrl.pathname || '/'

        try {
          if (req.method === 'POST' && pathname === '/prepare') {
            const body = await readJsonBody(req)
            const result = await prepareWechatClipboardHtml({
              bodyHtml: body?.bodyHtml ?? '',
              plainText: body?.plainText ?? '',
            })

            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(result))
            return
          }

          next()
        } catch (error) {
          res.statusCode = error.status || 500
          res.setHeader('Content-Type', 'application/json')
          res.end(
            JSON.stringify({
              details: error.payload ?? null,
              error: error.message || '准备复制微信样式失败',
            }),
          )
        }
      })
    },
  }
}

function benchmarkPipelineDevApi(env) {
  return {
    name: 'benchmark-pipeline-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/benchmark-transcribe', async (req, res, next) => {
        if (req.method !== 'POST') {
          next()
          return
        }

        try {
          const formData = await parseRequestFormData(req)
          const files = formData
            .getAll('files')
            .filter((entry) => entry && typeof entry === 'object' && typeof entry.arrayBuffer === 'function')

          const result = await runBenchmarkTranscription({
            attachments: files,
            doubaoAccessKey: env.DOUBAO_ASR_ACCESS_KEY,
            doubaoAppId: env.DOUBAO_ASR_APP_ID,
            doubaoResourceId: env.DOUBAO_ASR_RESOURCE_ID,
          })

          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(result))
        } catch (error) {
          res.statusCode = error.status || 500
          res.setHeader('Content-Type', 'application/json')
          res.end(
            JSON.stringify({
              error: error.message || '豆包识别失败',
              details: error.payload ?? null,
            }),
          )
        }
      })

      server.middlewares.use('/api/benchmark-analyze', async (req, res, next) => {
        if (req.method !== 'POST') {
          next()
          return
        }

        try {
          const chunks = []

          for await (const chunk of req) {
            chunks.push(chunk)
          }

          const body = chunks.length > 0 ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}
          const result = await runBenchmarkAnalysis({
            jobId: body.jobId,
            minimaxApiKey: env.MINIMAX_API_KEY,
            minimaxModel: body.model || env.MINIMAX_MODEL,
            prompt: body.prompt || '',
          })

          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(result))
        } catch (error) {
          res.statusCode = error.status || 500
          res.setHeader('Content-Type', 'application/json')
          res.end(
            JSON.stringify({
              error: error.message || 'MiniMax 分析失败',
              details: error.payload ?? null,
            }),
          )
        }
      })

      server.middlewares.use('/api/benchmark-asset', async (req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          next()
          return
        }

        try {
          const requestUrl = new URL(req.url, 'http://127.0.0.1')
          const jobId = requestUrl.searchParams.get('jobId')
          const relativePath = requestUrl.searchParams.get('path')

          if (!jobId || !relativePath) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: '缺少 jobId 或 path' }))
            return
          }

          const asset = await getJobAssetInfo({ jobId, relativePath })
          const range = parseRangeHeader(req.headers.range, asset.size)

          res.setHeader('Accept-Ranges', 'bytes')
          res.setHeader('Content-Type', asset.contentType)
          res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(asset.fileName)}"`)
          res.setHeader('Cache-Control', 'no-store')

          if (range?.invalid) {
            res.statusCode = 416
            res.setHeader('Content-Range', `bytes */${asset.size}`)
            res.end()
            return
          }

          if (range) {
            const contentLength = range.end - range.start + 1
            res.statusCode = 206
            res.setHeader('Content-Length', contentLength)
            res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${asset.size}`)

            if (req.method === 'HEAD') {
              res.end()
              return
            }

            createReadStream(asset.absolutePath, {
              end: range.end,
              start: range.start,
            }).pipe(res)
            return
          }

          res.statusCode = 200
          res.setHeader('Content-Length', asset.size)

          if (req.method === 'HEAD') {
            res.end()
            return
          }

          createReadStream(asset.absolutePath).pipe(res)
        } catch (error) {
          res.statusCode = error.status || 500
          res.setHeader('Content-Type', 'application/json')
          res.end(
            JSON.stringify({
              error: error.message || '读取素材失败',
            }),
          )
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const minimaxConfig = resolveMiniMaxConfig({
    apiKey: env.MINIMAX_API_KEY,
    model: env.MINIMAX_MODEL,
  })
  const doubaoConfig = resolveDoubaoAsrConfig({
    accessKey: env.DOUBAO_ASR_ACCESS_KEY,
    appId: env.DOUBAO_ASR_APP_ID,
    resourceId: env.DOUBAO_ASR_RESOURCE_ID,
  })
  const runtimeEnv = {
    ...env,
    DOUBAO_ASR_ACCESS_KEY: doubaoConfig.accessKey,
    DOUBAO_ASR_APP_ID: doubaoConfig.appId,
    DOUBAO_ASR_RESOURCE_ID: doubaoConfig.resourceId,
    MINIMAX_API_KEY: minimaxConfig.apiKey,
    MINIMAX_MODEL: minimaxConfig.model,
  }

  return {
    plugins: [
      react(),
      tailwindcss(),
      minimaxDevApi(runtimeEnv),
      contentCreationDevApi(runtimeEnv),
      topicRecommendationDevApi(runtimeEnv),
      libraryAssetsDevApi(),
      fixedLayoutConfigDevApi(),
      contentSessionsDevApi(),
      wechatDraftDevApi(),
      benchmarkPipelineDevApi(runtimeEnv),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  }
})
