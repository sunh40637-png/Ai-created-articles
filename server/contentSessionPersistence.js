import path from 'node:path'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'

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

async function ensureContentSessionPersistenceDir() {
  await mkdir(CONTENT_SESSION_PERSISTENCE_DIR, { recursive: true })
}

export async function readPersistedContentSessionPayload() {
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

export async function writePersistedContentSessionPayload({ item, name = 'content-creation-sessions-v1' } = {}) {
  if (!item || typeof item !== 'object') {
    throw new Error('缺少可持久化的会话数据')
  }

  await ensureContentSessionPersistenceDir()

  const payload = {
    item,
    name,
    updatedAt: new Date().toISOString(),
  }

  await writeFile(CONTENT_SESSION_PERSISTENCE_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  return payload
}

export async function deletePersistedContentSessionPayload() {
  try {
    await unlink(CONTENT_SESSION_PERSISTENCE_PATH)
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error
    }
  }

  return { deleted: true }
}
