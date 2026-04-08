function buildOpenAiCompatibleUrl(baseUrl = '') {
  const normalized = String(baseUrl || '').trim().replace(/\/+$/, '')

  if (!normalized) {
    const error = new Error('当前兼容模型缺少 Base URL')
    error.status = 400
    throw error
  }

  if (normalized.endsWith('/chat/completions')) {
    return normalized
  }

  return `${normalized}/chat/completions`
}

async function requestOpenAiCompatible(payload, apiKey, timeoutMs = 300000, baseUrl = '') {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => {
    controller.abort()
  }, timeoutMs)

  let response

  try {
    response = await fetch(buildOpenAiCompatibleUrl(baseUrl), {
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
    const error = new Error(
      data?.error?.message || data?.message || data?.error || '兼容模型请求失败',
    )
    error.status = response.status || 500
    error.payload = data
    throw error
  }

  return {
    ...data,
    _requestMeta: {
      baseUrl: buildOpenAiCompatibleUrl(baseUrl),
      provider: 'openai-compatible',
      requestIdHeader:
        response.headers.get('x-request-id') ||
        response.headers.get('request-id') ||
        response.headers.get('x-trace-id') ||
        '',
      responseId: typeof data?.id === 'string' ? data.id.trim() : '',
      statusCode: response.status || 200,
    },
  }
}

export async function chatWithOpenAiCompatibleProvider({
  apiKey,
  baseUrl = '',
  maxTokens,
  messages,
  model,
  responseFormat = null,
  temperature = 0.2,
  timeoutMs = 300000,
  topP = 0.95,
}) {
  if (!model) {
    const error = new Error('当前兼容模型缺少 Model')
    error.status = 400
    throw error
  }

  const payload = {
    model,
    stream: false,
    temperature,
    top_p: topP,
    messages,
  }

  if (responseFormat) {
    payload.response_format =
      typeof responseFormat === 'string' ? { type: responseFormat } : responseFormat
  }

  if (Number.isFinite(maxTokens) && Number(maxTokens) > 0) {
    payload.max_tokens = Math.floor(Number(maxTokens))
  }

  return requestOpenAiCompatible(payload, apiKey, timeoutMs, baseUrl)
}
