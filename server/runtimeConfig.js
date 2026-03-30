import { readFileSync } from 'node:fs'

const DEFAULT_MINIMAX_MODEL = 'MiniMax-M2.7'
const EMPTY_MINIMAX_CONFIG = {
  apiKey: '',
  model: DEFAULT_MINIMAX_MODEL,
}

let cachedMiniMaxConfig = null

function readMiniMaxConfigFromRootDoc() {
  if (cachedMiniMaxConfig) {
    return cachedMiniMaxConfig
  }

  try {
    const content = readFileSync(new URL('../API_KEY.md', import.meta.url), 'utf8')
    const apiKeyMatch = content.match(/- API Key:\s*`([^`]+)`/)
    const modelMatch = content.match(/- Model:\s*`([^`]+)`/)

    cachedMiniMaxConfig = {
      apiKey: apiKeyMatch?.[1]?.trim() || '',
      model: modelMatch?.[1]?.trim() || DEFAULT_MINIMAX_MODEL,
    }
  } catch {
    cachedMiniMaxConfig = EMPTY_MINIMAX_CONFIG
  }

  return cachedMiniMaxConfig
}

export function resolveMiniMaxConfig(overrides = {}) {
  const docConfig = readMiniMaxConfigFromRootDoc()
  const overrideApiKey = typeof overrides.apiKey === 'string' ? overrides.apiKey.trim() : ''
  const overrideModel = typeof overrides.model === 'string' ? overrides.model.trim() : ''
  const envApiKey = typeof process.env.MINIMAX_API_KEY === 'string' ? process.env.MINIMAX_API_KEY.trim() : ''
  const envModel = typeof process.env.MINIMAX_MODEL === 'string' ? process.env.MINIMAX_MODEL.trim() : ''

  return {
    apiKey: overrideApiKey || envApiKey || docConfig.apiKey,
    model: overrideModel || envModel || docConfig.model || DEFAULT_MINIMAX_MODEL,
  }
}
