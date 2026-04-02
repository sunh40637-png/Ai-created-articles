import { readFileSync } from 'node:fs'

const DEFAULT_MINIMAX_MODEL = 'MiniMax-M2.7'
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
  minimax: {
    apiKey: '',
    model: DEFAULT_MINIMAX_MODEL,
  },
  wechatOfficialAccount: {
    appId: '',
    appSecret: '',
  },
}

const EMPTY_MINIMAX_CONFIG = {
  apiKey: '',
  model: DEFAULT_MINIMAX_MODEL,
}

let cachedDotEnvConfig = null
let cachedMiniMaxConfig = null
let cachedSharedRuntimeConfig = null

function normalizeTrimmedString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
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

export function resolveSharedRuntimeConfig() {
  const sharedConfig = readSharedRuntimeConfig()
  const dotEnvConfig = readDotEnvConfig()
  const minimaxDocConfig = readMiniMaxConfigFromRootDoc()

  return {
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
    minimax: {
      apiKey:
        normalizeTrimmedString(sharedConfig.minimax.apiKey) ||
        normalizeTrimmedString(process.env.MINIMAX_API_KEY) ||
        normalizeTrimmedString(dotEnvConfig.MINIMAX_API_KEY) ||
        minimaxDocConfig.apiKey,
      model:
        normalizeTrimmedString(sharedConfig.minimax.model) ||
        normalizeTrimmedString(process.env.MINIMAX_MODEL) ||
        normalizeTrimmedString(dotEnvConfig.MINIMAX_MODEL) ||
        minimaxDocConfig.model ||
        DEFAULT_MINIMAX_MODEL,
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
}

export function resolveMiniMaxConfig(overrides = {}) {
  const sharedRuntimeConfig = resolveSharedRuntimeConfig()
  const overrideApiKey = normalizeTrimmedString(overrides.apiKey)
  const overrideModel = normalizeTrimmedString(overrides.model)

  return {
    apiKey: overrideApiKey || sharedRuntimeConfig.minimax.apiKey,
    model: overrideModel || sharedRuntimeConfig.minimax.model || DEFAULT_MINIMAX_MODEL,
  }
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
