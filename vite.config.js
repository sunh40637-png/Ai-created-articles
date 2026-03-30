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
import { parseRequestFormData } from './server/httpFormData.js'
import { chatWithMiniMax } from './server/minimax.js'

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

  return {
    plugins: [
      react(),
      tailwindcss(),
      minimaxDevApi(env),
      benchmarkPipelineDevApi(env),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  }
})
