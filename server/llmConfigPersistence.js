import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import {
  LLM_CONFIG_PERSISTENCE_DIR,
  LLM_CONFIG_PERSISTENCE_PATH,
  LLM_CONFIG_STORAGE_KEY,
} from './llm/constants.js'
import { invalidateRuntimeConfigCache, resolveLlmConfig } from './runtimeConfig.js'

export { LLM_CONFIG_PERSISTENCE_DIR, LLM_CONFIG_PERSISTENCE_PATH, LLM_CONFIG_STORAGE_KEY }

function normalizePersistedLlmConfigPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  return {
    item: payload.item && typeof payload.item === 'object' ? payload.item : null,
    name: typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : LLM_CONFIG_STORAGE_KEY,
    updatedAt: typeof payload.updatedAt === 'string' && payload.updatedAt.trim() ? payload.updatedAt.trim() : null,
  }
}

async function ensureLlmConfigPersistenceDir() {
  await mkdir(LLM_CONFIG_PERSISTENCE_DIR, { recursive: true })
}

export async function readPersistedLlmConfigPayloadFromLocal() {
  await ensureLlmConfigPersistenceDir()

  try {
    const raw = await readFile(LLM_CONFIG_PERSISTENCE_PATH, 'utf8')
    return normalizePersistedLlmConfigPayload(JSON.parse(raw))
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null
    }

    throw error
  }
}

export async function readEffectiveLlmConfigPayloadFromLocal() {
  const localPayload = await readPersistedLlmConfigPayloadFromLocal()

  if (localPayload?.item?.state) {
    return localPayload
  }

  const state = resolveLlmConfig()

  if (!Array.isArray(state?.profiles) || state.profiles.length === 0) {
    return null
  }

  return {
    item: {
      state,
      version: 1,
    },
    name: LLM_CONFIG_STORAGE_KEY,
    updatedAt: null,
  }
}

export async function writePersistedLlmConfigPayloadToLocal({ item, name = LLM_CONFIG_STORAGE_KEY } = {}) {
  if (!item || typeof item !== 'object') {
    throw new Error('缺少可持久化的模型配置数据')
  }

  await ensureLlmConfigPersistenceDir()

  const payload = {
    item,
    name,
    updatedAt: new Date().toISOString(),
  }

  await writeFile(LLM_CONFIG_PERSISTENCE_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  invalidateRuntimeConfigCache()
  return payload
}

export async function deletePersistedLlmConfigPayloadFromLocal() {
  try {
    await unlink(LLM_CONFIG_PERSISTENCE_PATH)
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error
    }
  }

  invalidateRuntimeConfigCache()
  return { deleted: true }
}

export function readLlmConfigPersistenceMeta() {
  return {
    localPath: LLM_CONFIG_PERSISTENCE_PATH,
  }
}
