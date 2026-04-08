import { DEFAULT_GLM_MODEL } from '../constants.js'

const GLM_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'

async function requestGlm(payload, apiKey, timeoutMs = 300000, baseUrl = '') {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => {
    controller.abort()
  }, timeoutMs)

  let response

  try {
    response = await fetch(baseUrl || GLM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error('模型请求超时，请稍后重试')
      timeoutError.status = 504
      throw timeoutError
    }

    throw error
  } finally {
    clearTimeout(timeoutId)
  }

  const data = await response.json().catch(() => ({}))

  if (!response.ok || data?.error) {
    const error = new Error(data?.error?.message || data?.message || data?.error || 'GLM 请求失败')
    error.status = response.status || 500
    error.payload = data
    throw error
  }

  return data
}

export async function chatWithGlmProvider({
  apiKey,
  baseUrl = '',
  maxTokens,
  messages,
  model = DEFAULT_GLM_MODEL,
  responseFormat = null,
  temperature = 0.2,
  thinking = null,
  timeoutMs = 300000,
  topP = 0.95,
}) {
  const payload = {
    model,
    stream: false,
    temperature,
    top_p: topP,
    messages,
  }

  if (typeof thinking === 'boolean') {
    payload.thinking = {
      type: thinking ? 'enabled' : 'disabled',
    }
  }

  if (responseFormat) {
    payload.response_format =
      typeof responseFormat === 'string' ? { type: responseFormat } : responseFormat
  }

  if (Number.isFinite(maxTokens) && Number(maxTokens) > 0) {
    payload.max_tokens = Math.floor(Number(maxTokens))
  }

  return requestGlm(payload, apiKey, timeoutMs, baseUrl)
}
