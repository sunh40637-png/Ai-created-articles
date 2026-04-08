import path from 'node:path'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import {
  deleteContentSessionPayloadFromOss,
  getAliyunOssPublicConfig,
  isAliyunOssConfigured,
  readContentSessionPayloadFromOss,
  writeContentSessionPayloadToOss,
} from './ossContentStorage.js'
import { CONTENT_LLM_TELEMETRY_PATH } from './contentLlmTelemetry.js'

export const CONTENT_SESSION_PERSISTENCE_DIR = path.resolve(process.cwd(), '.local-data')
export const CONTENT_SESSION_PERSISTENCE_PATH = path.join(CONTENT_SESSION_PERSISTENCE_DIR, 'content-creation-sessions.json')

function normalizePersistedContentSessionPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  return {
    item: payload.item && typeof payload.item === 'object' ? payload.item : null,
    name: typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : 'content-creation-sessions-v1',
    updatedAt: typeof payload.updatedAt === 'string' && payload.updatedAt.trim() ? payload.updatedAt.trim() : null,
  }
}

function toTimestamp(value) {
  const timestamp = new Date(value || 0).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

function getPersistedSessionStateLatestTimestamp(item = null) {
  const sessions = Array.isArray(item?.state?.sessions) ? item.state.sessions : []
  const sessionTimestamps = sessions.map((session) => toTimestamp(session?.updatedAt)).filter(Boolean)
  const activeSessionTimestamp = toTimestamp(item?.state?.updatedAt)
  return [activeSessionTimestamp, ...sessionTimestamps].reduce((latest, current) => (current > latest ? current : latest), 0)
}

function pickNewerPayload(left, right) {
  if (!left) {
    return right
  }

  if (!right) {
    return left
  }

  return toTimestamp(right.updatedAt) > toTimestamp(left.updatedAt) ? right : left
}

async function ensureContentSessionPersistenceDir() {
  await mkdir(CONTENT_SESSION_PERSISTENCE_DIR, { recursive: true })
}

export async function readPersistedContentSessionPayloadFromLocal() {
  await ensureContentSessionPersistenceDir()

  try {
    const raw = await readFile(CONTENT_SESSION_PERSISTENCE_PATH, 'utf8')
    return normalizePersistedContentSessionPayload(JSON.parse(raw))
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null
    }

    throw error
  }
}

export async function writePersistedContentSessionPayloadToLocal({ item, name = 'content-creation-sessions-v1' } = {}) {
  if (!item || typeof item !== 'object') {
    throw new Error('缺少可持久化的会话数据')
  }

  await ensureContentSessionPersistenceDir()

  const existingPayload = await readPersistedContentSessionPayloadFromLocal().catch(() => null)
  const existingLatestTimestamp = getPersistedSessionStateLatestTimestamp(existingPayload?.item)
  const incomingLatestTimestamp = getPersistedSessionStateLatestTimestamp(item)

  if (existingPayload && existingLatestTimestamp > incomingLatestTimestamp) {
    return existingPayload
  }

  const payload = {
    item,
    name,
    updatedAt: new Date().toISOString(),
  }

  await writeFile(CONTENT_SESSION_PERSISTENCE_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  return payload
}

export async function deletePersistedContentSessionPayloadFromLocal() {
  try {
    await unlink(CONTENT_SESSION_PERSISTENCE_PATH)
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error
    }
  }

  return { deleted: true }
}

export async function readPersistedContentSessionPayload() {
  const localPayload = await readPersistedContentSessionPayloadFromLocal()

  if (!isAliyunOssConfigured()) {
    return localPayload
  }

  try {
    const cloudPayload = await readContentSessionPayloadFromOss({
      name: localPayload?.name || 'content-creation-sessions-v1',
    })

    return pickNewerPayload(localPayload, normalizePersistedContentSessionPayload(cloudPayload))
  } catch {
    return localPayload
  }
}

export async function writePersistedContentSessionPayload({ item, name = 'content-creation-sessions-v1' } = {}) {
  const localPayload = await writePersistedContentSessionPayloadToLocal({ item, name })

  if (!isAliyunOssConfigured()) {
    return localPayload
  }

  try {
    const cloudPayload = await writeContentSessionPayloadToOss({ item, name })
    return pickNewerPayload(localPayload, normalizePersistedContentSessionPayload(cloudPayload))
  } catch {
    return localPayload
  }
}

export async function deletePersistedContentSessionPayload() {
  const localPayload = await deletePersistedContentSessionPayloadFromLocal()

  if (!isAliyunOssConfigured()) {
    return localPayload
  }

  await deleteContentSessionPayloadFromOss().catch(() => null)
  return localPayload
}

export function readContentSessionPersistenceMeta() {
  return {
    cloud: getAliyunOssPublicConfig(),
    llmTelemetryPath: CONTENT_LLM_TELEMETRY_PATH,
    localPath: CONTENT_SESSION_PERSISTENCE_PATH,
  }
}
