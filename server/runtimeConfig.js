import { readFileSync } from 'node:fs'
import {
  DEEPSEEK_PROVIDER,
  DEFAULT_GLM_MODEL,
  DEFAULT_LLM_PROFILE_ID,
  DEFAULT_LLM_PROFILE_NAME,
  DEFAULT_LLM_PROVIDER,
  LLM_CONFIG_PERSISTENCE_PATH,
  MINIMAX_PROVIDER,
  OPENAI_COMPATIBLE_PROVIDER,
} from './llm/constants.js'

const DEFAULT_DOUBAO_RESOURCE_ID = 'volc.bigasr.auc_turbo'
const SHARED_RUNTIME_CONFIG_FILE = '../runtime-config.shared.json'

const EMPTY_SHARED_RUNTIME_CONFIG = {
  aliyunOss: {
    accessKeyId: '',
    accessKeySecret: '',
    bucket: '',
    endpoint: '',
    region: '',
  },
  doubaoAsr: {
    accessKey: '',
    appId: '',
    resourceId: DEFAULT_DOUBAO_RESOURCE_ID,
  },
  llm: {
    activeProfileId: '',
    profiles: [],
  },
  glm: {
    apiKey: '',
    baseUrl: '',
    model: DEFAULT_GLM_MODEL,
  },
  minimax: {
    apiKey: '',
    baseUrl: '',
    model: DEFAULT_GLM_MODEL,
  },
  wechatOfficialAccount: {
    appId: '',
    appSecret: '',
  },
}

const EMPTY_LEGACY_LLM_CONFIG = {
  apiKey: '',
  baseUrl: '',
  model: DEFAULT_GLM_MODEL,
  provider: DEFAULT_LLM_PROVIDER,
}

let cachedDotEnvConfig = null
let cachedLegacyLlmConfig = null
let cachedResolvedRuntimeConfig = null
let cachedSharedRuntimeConfig = null

function normalizeTrimmedString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function normalizeBaseUrl(value = '') {
  return normalizeTrimmedString(value).replace(/\/+$/, '')
}

function stripProtocol(value = '') {
  return String(value).replace(/^https?:\/\//i, '').replace(/\/+$/, '')
}

function readDotEnvConfig() {
  if (cachedDotEnvConfig) {
    return cachedDotEnvConfig
  }

  try {
    const content = readFileSync(new URL('../.env', import.meta.url), 'utf8')
    const parsed = {}

    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim()

      if (!line || line.startsWith('#')) {
        continue
      }

      const separatorIndex = line.indexOf('=')

      if (separatorIndex === -1) {
        continue
      }

      const key = line.slice(0, separatorIndex).trim()
      const value = line.slice(separatorIndex + 1).trim()

      if (!key) {
        continue
      }

      parsed[key] = value
    }

    cachedDotEnvConfig = parsed
  } catch {
    cachedDotEnvConfig = {}
  }

  return cachedDotEnvConfig
}

function readSharedRuntimeConfig() {
  if (cachedSharedRuntimeConfig) {
    return cachedSharedRuntimeConfig
  }

  try {
    const content = readFileSync(new URL(SHARED_RUNTIME_CONFIG_FILE, import.meta.url), 'utf8')
    const parsed = JSON.parse(content)

    cachedSharedRuntimeConfig = {
      aliyunOss: {
        ...EMPTY_SHARED_RUNTIME_CONFIG.aliyunOss,
        ...(parsed?.aliyunOss ?? {}),
      },
      doubaoAsr: {
        ...EMPTY_SHARED_RUNTIME_CONFIG.doubaoAsr,
        ...(parsed?.doubaoAsr ?? {}),
      },
      llm: {
        ...EMPTY_SHARED_RUNTIME_CONFIG.llm,
        ...(parsed?.llm ?? {}),
      },
      glm: {
        ...EMPTY_SHARED_RUNTIME_CONFIG.glm,
        ...(parsed?.glm ?? {}),
      },
      minimax: {
        ...EMPTY_SHARED_RUNTIME_CONFIG.minimax,
        ...(parsed?.minimax ?? {}),
      },
      wechatOfficialAccount: {
        ...EMPTY_SHARED_RUNTIME_CONFIG.wechatOfficialAccount,
        ...(parsed?.wechatOfficialAccount ?? {}),
      },
    }
  } catch {
    cachedSharedRuntimeConfig = EMPTY_SHARED_RUNTIME_CONFIG
  }

  return cachedSharedRuntimeConfig
}

function readPersistedLlmConfigStateFromLocal() {
  try {
    const content = readFileSync(LLM_CONFIG_PERSISTENCE_PATH, 'utf8')
    const parsed = JSON.parse(content)
    return parsed?.item?.state && typeof parsed.item.state === 'object' ? parsed.item.state : null
  } catch {
    return null
  }
}

function readLegacyLlmConfigFromRootDoc() {
  if (cachedLegacyLlmConfig) {
    return cachedLegacyLlmConfig
  }

  try {
    const content = readFileSync(new URL('../API_KEY.md', import.meta.url), 'utf8')
    const apiKeyMatch =
      content.match(/- (?:GLM|BigModel) API Key:\s*`([^`]+)`/) ||
      content.match(/- API Key:\s*`([^`]+)`/)
    const modelMatch =
      content.match(/- (?:GLM|BigModel) Model:\s*`([^`]+)`/) ||
      content.match(/- Model:\s*`([^`]+)`/)
    const baseUrlMatch =
      content.match(/- (?:GLM|BigModel) Base URL:\s*`([^`]+)`/) ||
      content.match(/- Base URL:\s*`([^`]+)`/)

    cachedLegacyLlmConfig = {
      apiKey: apiKeyMatch?.[1]?.trim() || '',
      baseUrl: normalizeBaseUrl(baseUrlMatch?.[1] || ''),
      model: modelMatch?.[1]?.trim() || DEFAULT_GLM_MODEL,
      provider: DEFAULT_LLM_PROVIDER,
    }
  } catch {
    cachedLegacyLlmConfig = EMPTY_LEGACY_LLM_CONFIG
  }

  return cachedLegacyLlmConfig
}

function normalizeLlmProvider(value) {
  if ([OPENAI_COMPATIBLE_PROVIDER, DEEPSEEK_PROVIDER, MINIMAX_PROVIDER].includes(value)) {
    return value
  }

  return DEFAULT_LLM_PROVIDER
}

function buildDefaultModelForProvider(provider) {
  return provider === DEFAULT_LLM_PROVIDER ? DEFAULT_GLM_MODEL : ''
}

function buildDefaultNameForProvider(provider, model) {
  if (provider === DEFAULT_LLM_PROVIDER) {
    return model ? `${model} 主账号` : DEFAULT_LLM_PROFILE_NAME
  }

  if (provider === DEEPSEEK_PROVIDER) {
    return model ? `${model} DeepSeek` : 'DeepSeek 模型'
  }

  if (provider === MINIMAX_PROVIDER) {
    return model ? `${model} MiniMax` : 'MiniMax 模型'
  }

  return model ? `${model} 兼容接入` : '兼容模型'
}

function buildProfileId(provider, index) {
  if (provider === OPENAI_COMPATIBLE_PROVIDER) {
    return `openai-compatible-${index + 1}`
  }

  if (provider === DEEPSEEK_PROVIDER) {
    return `deepseek-${index + 1}`
  }

  if (provider === MINIMAX_PROVIDER) {
    return `minimax-${index + 1}`
  }

  return `glm-${index + 1}`
}

export function normalizeLlmProfile(profile, index = 0) {
  const provider = normalizeLlmProvider(profile?.provider)
  const model = normalizeTrimmedString(profile?.model) || buildDefaultModelForProvider(provider)
  const baseUrl = normalizeBaseUrl(profile?.baseUrl || '')
  const id = normalizeTrimmedString(profile?.id) || buildProfileId(provider, index)

  return {
    apiKey: normalizeTrimmedString(profile?.apiKey),
    baseUrl,
    enabled: profile?.enabled !== false,
    id,
    model,
    name: normalizeTrimmedString(profile?.name) || buildDefaultNameForProvider(provider, model),
    provider,
  }
}

function dedupeProfiles(profiles = []) {
  const seen = new Set()

  return profiles.reduce((accumulator, profile, index) => {
    const normalized = normalizeLlmProfile(profile, index)

    if (!normalized.id || seen.has(normalized.id)) {
      const regenerated = {
        ...normalized,
        id: `${normalized.id || buildProfileId(normalized.provider, index)}-${index + 1}`,
      }
      seen.add(regenerated.id)
      accumulator.push(regenerated)
      return accumulator
    }

    seen.add(normalized.id)
    accumulator.push(normalized)
    return accumulator
  }, [])
}

function buildLegacyLlmConfig({ dotEnvConfig, legacyDocConfig, sharedConfig }) {
  const provider =
    normalizeLlmProvider(
      normalizeTrimmedString(sharedConfig.llm?.provider) ||
        normalizeTrimmedString(process.env.LLM_PROVIDER) ||
        normalizeTrimmedString(dotEnvConfig.LLM_PROVIDER),
    ) || DEFAULT_LLM_PROVIDER
  const apiKey =
    normalizeTrimmedString(process.env.LLM_API_KEY) ||
    normalizeTrimmedString(dotEnvConfig.LLM_API_KEY) ||
    normalizeTrimmedString(process.env.GLM_API_KEY) ||
    normalizeTrimmedString(dotEnvConfig.GLM_API_KEY) ||
    normalizeTrimmedString(process.env.BIGMODEL_API_KEY) ||
    normalizeTrimmedString(dotEnvConfig.BIGMODEL_API_KEY) ||
    normalizeTrimmedString(process.env.MINIMAX_API_KEY) ||
    normalizeTrimmedString(dotEnvConfig.MINIMAX_API_KEY) ||
    normalizeTrimmedString(sharedConfig.glm.apiKey) ||
    normalizeTrimmedString(sharedConfig.minimax.apiKey) ||
    legacyDocConfig.apiKey
  const model =
    normalizeTrimmedString(process.env.LLM_MODEL) ||
    normalizeTrimmedString(dotEnvConfig.LLM_MODEL) ||
    normalizeTrimmedString(process.env.GLM_MODEL) ||
    normalizeTrimmedString(dotEnvConfig.GLM_MODEL) ||
    normalizeTrimmedString(process.env.BIGMODEL_MODEL) ||
    normalizeTrimmedString(dotEnvConfig.BIGMODEL_MODEL) ||
    normalizeTrimmedString(process.env.MINIMAX_MODEL) ||
    normalizeTrimmedString(dotEnvConfig.MINIMAX_MODEL) ||
    normalizeTrimmedString(sharedConfig.glm.model) ||
    normalizeTrimmedString(sharedConfig.minimax.model) ||
    legacyDocConfig.model ||
    buildDefaultModelForProvider(provider)
  const baseUrl =
    normalizeBaseUrl(process.env.LLM_BASE_URL) ||
    normalizeBaseUrl(dotEnvConfig.LLM_BASE_URL) ||
    normalizeBaseUrl(process.env.GLM_BASE_URL) ||
    normalizeBaseUrl(dotEnvConfig.GLM_BASE_URL) ||
    normalizeBaseUrl(sharedConfig.glm.baseUrl) ||
    normalizeBaseUrl(sharedConfig.minimax.baseUrl) ||
    legacyDocConfig.baseUrl

  return {
    activeProfileId: DEFAULT_LLM_PROFILE_ID,
    profiles: [
      {
        apiKey,
        baseUrl,
        enabled: true,
        id: DEFAULT_LLM_PROFILE_ID,
        model,
        name: DEFAULT_LLM_PROFILE_NAME,
        provider,
      },
    ],
  }
}

export function normalizeLlmConfig(config, fallbackConfig = null) {
  const fallbackProfiles = Array.isArray(fallbackConfig?.profiles) ? fallbackConfig.profiles : []
  const sourceProfiles =
    Array.isArray(config?.profiles) && config.profiles.length > 0
      ? config.profiles
      : fallbackProfiles.length > 0
        ? fallbackProfiles
        : [
            {
              id: DEFAULT_LLM_PROFILE_ID,
              name: DEFAULT_LLM_PROFILE_NAME,
              provider: DEFAULT_LLM_PROVIDER,
              model: DEFAULT_GLM_MODEL,
              apiKey: '',
              baseUrl: '',
              enabled: true,
            },
          ]
  const profiles = dedupeProfiles(sourceProfiles)
  const enabledProfiles = profiles.filter((profile) => profile.enabled)
  const activeProfileIdCandidate =
    normalizeTrimmedString(config?.activeProfileId) || normalizeTrimmedString(fallbackConfig?.activeProfileId)
  const activeProfile =
    profiles.find((profile) => profile.id === activeProfileIdCandidate) || enabledProfiles[0] || profiles[0]

  return {
    activeProfileId: activeProfile?.id || '',
    profiles,
  }
}

export function invalidateRuntimeConfigCache() {
  cachedDotEnvConfig = null
  cachedLegacyLlmConfig = null
  cachedResolvedRuntimeConfig = null
  cachedSharedRuntimeConfig = null
}

export function resolveSharedRuntimeConfig() {
  if (cachedResolvedRuntimeConfig) {
    return cachedResolvedRuntimeConfig
  }

  const sharedConfig = readSharedRuntimeConfig()
  const dotEnvConfig = readDotEnvConfig()
  const legacyDocConfig = readLegacyLlmConfigFromRootDoc()
  const legacyLlmConfig = buildLegacyLlmConfig({
    dotEnvConfig,
    legacyDocConfig,
    sharedConfig,
  })
  const persistedLlmState = readPersistedLlmConfigStateFromLocal()
  const llmConfig = normalizeLlmConfig(
    persistedLlmState || (sharedConfig.llm?.profiles?.length ? sharedConfig.llm : null),
    legacyLlmConfig,
  )
  const activeProfile =
    llmConfig.profiles.find((profile) => profile.id === llmConfig.activeProfileId) || llmConfig.profiles[0] || null

  cachedResolvedRuntimeConfig = {
    aliyunOss: {
      accessKeyId:
        normalizeTrimmedString(sharedConfig.aliyunOss.accessKeyId) ||
        normalizeTrimmedString(process.env.ALIYUN_OSS_ACCESS_KEY_ID) ||
        normalizeTrimmedString(dotEnvConfig.ALIYUN_OSS_ACCESS_KEY_ID),
      accessKeySecret:
        normalizeTrimmedString(sharedConfig.aliyunOss.accessKeySecret) ||
        normalizeTrimmedString(process.env.ALIYUN_OSS_ACCESS_KEY_SECRET) ||
        normalizeTrimmedString(dotEnvConfig.ALIYUN_OSS_ACCESS_KEY_SECRET),
      bucket:
        normalizeTrimmedString(sharedConfig.aliyunOss.bucket) ||
        normalizeTrimmedString(process.env.ALIYUN_OSS_BUCKET) ||
        normalizeTrimmedString(dotEnvConfig.ALIYUN_OSS_BUCKET),
      endpoint:
        stripProtocol(sharedConfig.aliyunOss.endpoint) ||
        stripProtocol(process.env.ALIYUN_OSS_ENDPOINT) ||
        stripProtocol(dotEnvConfig.ALIYUN_OSS_ENDPOINT),
      region:
        normalizeTrimmedString(sharedConfig.aliyunOss.region) ||
        normalizeTrimmedString(process.env.ALIYUN_OSS_REGION) ||
        normalizeTrimmedString(dotEnvConfig.ALIYUN_OSS_REGION),
    },
    doubaoAsr: {
      accessKey:
        normalizeTrimmedString(sharedConfig.doubaoAsr.accessKey) ||
        normalizeTrimmedString(process.env.DOUBAO_ASR_ACCESS_KEY) ||
        normalizeTrimmedString(dotEnvConfig.DOUBAO_ASR_ACCESS_KEY),
      appId:
        normalizeTrimmedString(sharedConfig.doubaoAsr.appId) ||
        normalizeTrimmedString(process.env.DOUBAO_ASR_APP_ID) ||
        normalizeTrimmedString(dotEnvConfig.DOUBAO_ASR_APP_ID),
      resourceId:
        normalizeTrimmedString(sharedConfig.doubaoAsr.resourceId) ||
        normalizeTrimmedString(process.env.DOUBAO_ASR_RESOURCE_ID) ||
        normalizeTrimmedString(dotEnvConfig.DOUBAO_ASR_RESOURCE_ID) ||
        DEFAULT_DOUBAO_RESOURCE_ID,
    },
    glm: {
      apiKey: activeProfile?.apiKey || '',
      baseUrl: activeProfile?.baseUrl || '',
      model: activeProfile?.model || DEFAULT_GLM_MODEL,
      provider: activeProfile?.provider || DEFAULT_LLM_PROVIDER,
    },
    llm: llmConfig,
    minimax: {
      apiKey: activeProfile?.apiKey || '',
      baseUrl: activeProfile?.baseUrl || '',
      model: activeProfile?.model || DEFAULT_GLM_MODEL,
      provider: activeProfile?.provider || DEFAULT_LLM_PROVIDER,
    },
    wechatOfficialAccount: {
      appId:
        normalizeTrimmedString(sharedConfig.wechatOfficialAccount.appId) ||
        normalizeTrimmedString(process.env.WECHAT_OFFICIAL_ACCOUNT_APP_ID) ||
        normalizeTrimmedString(dotEnvConfig.WECHAT_OFFICIAL_ACCOUNT_APP_ID) ||
        normalizeTrimmedString(process.env.WECHAT_APP_ID) ||
        normalizeTrimmedString(dotEnvConfig.WECHAT_APP_ID),
      appSecret:
        normalizeTrimmedString(sharedConfig.wechatOfficialAccount.appSecret) ||
        normalizeTrimmedString(process.env.WECHAT_OFFICIAL_ACCOUNT_APP_SECRET) ||
        normalizeTrimmedString(dotEnvConfig.WECHAT_OFFICIAL_ACCOUNT_APP_SECRET) ||
        normalizeTrimmedString(process.env.WECHAT_APP_SECRET) ||
        normalizeTrimmedString(dotEnvConfig.WECHAT_APP_SECRET),
    },
  }

  return cachedResolvedRuntimeConfig
}

export function resolveLlmConfig() {
  return resolveSharedRuntimeConfig().llm
}

export function listLlmProfiles() {
  return resolveLlmConfig().profiles
}

export function resolveActiveLlmProfile(overrides = {}) {
  const llmConfig = resolveLlmConfig()
  const activeProfile =
    llmConfig.profiles.find((profile) => profile.id === llmConfig.activeProfileId) || llmConfig.profiles[0] || null
  const overrideProfile = overrides.profile ? normalizeLlmProfile(overrides.profile, 0) : null
  const resolved = overrideProfile || activeProfile || normalizeLlmProfile({}, 0)

  return {
    ...resolved,
    apiKey: normalizeTrimmedString(overrides.apiKey) || resolved.apiKey,
    baseUrl: normalizeBaseUrl(overrides.baseUrl || '') || resolved.baseUrl,
    model: normalizeTrimmedString(overrides.model) || resolved.model || DEFAULT_GLM_MODEL,
    provider: normalizeLlmProvider(overrides.provider || resolved.provider),
  }
}

export function resolveMiniMaxConfig(overrides = {}) {
  return resolveActiveLlmProfile(overrides)
}

export function resolveGlmConfig(overrides = {}) {
  return resolveActiveLlmProfile(overrides)
}

export function resolveAliyunOssConfig(overrides = {}) {
  const sharedRuntimeConfig = resolveSharedRuntimeConfig()
  const bucket = normalizeTrimmedString(overrides.bucket) || sharedRuntimeConfig.aliyunOss.bucket
  const region = normalizeTrimmedString(overrides.region) || sharedRuntimeConfig.aliyunOss.region
  const endpoint = stripProtocol(overrides.endpoint || '') || sharedRuntimeConfig.aliyunOss.endpoint
  const accessKeyId = normalizeTrimmedString(overrides.accessKeyId) || sharedRuntimeConfig.aliyunOss.accessKeyId
  const accessKeySecret =
    normalizeTrimmedString(overrides.accessKeySecret) || sharedRuntimeConfig.aliyunOss.accessKeySecret

  return {
    accessKeyId,
    accessKeySecret,
    bucket,
    enabled: Boolean(bucket && endpoint && accessKeyId && accessKeySecret),
    endpoint,
    region,
  }
}

export function resolveDoubaoAsrConfig(overrides = {}) {
  const sharedRuntimeConfig = resolveSharedRuntimeConfig()
  const appId = normalizeTrimmedString(overrides.appId) || sharedRuntimeConfig.doubaoAsr.appId
  const accessKey = normalizeTrimmedString(overrides.accessKey) || sharedRuntimeConfig.doubaoAsr.accessKey
  const resourceId =
    normalizeTrimmedString(overrides.resourceId) || sharedRuntimeConfig.doubaoAsr.resourceId || DEFAULT_DOUBAO_RESOURCE_ID

  return {
    accessKey,
    appId,
    configured: Boolean(appId && accessKey),
    resourceId,
  }
}

export function resolveWeChatOfficialAccountConfig(overrides = {}) {
  const sharedRuntimeConfig = resolveSharedRuntimeConfig()
  const appId = normalizeTrimmedString(overrides.appId) || sharedRuntimeConfig.wechatOfficialAccount.appId
  const appSecret =
    normalizeTrimmedString(overrides.appSecret) || sharedRuntimeConfig.wechatOfficialAccount.appSecret

  return {
    appId,
    appSecret,
    configured: Boolean(appId && appSecret),
  }
}
