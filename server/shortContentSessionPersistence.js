import path from 'node:path'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'

export const SHORT_CONTENT_SESSION_PERSISTENCE_DIR = path.resolve(process.cwd(), '.local-data')
export const SHORT_CONTENT_SESSION_PERSISTENCE_PATH = path.join(
  SHORT_CONTENT_SESSION_PERSISTENCE_DIR,
  'short-content-conversations.json',
)

function normalizePersistedShortContentPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  return {
    item: payload.item && typeof payload.item === 'object' ? payload.item : null,
    name:
      typeof payload.name === 'string' && payload.name.trim()
        ? payload.name.trim()
        : 'short-content-conversations-v1',
    updatedAt: typeof payload.updatedAt === 'string' && payload.updatedAt.trim() ? payload.updatedAt.trim() : null,
  }
}

async function ensureShortContentPersistenceDir() {
  await mkdir(SHORT_CONTENT_SESSION_PERSISTENCE_DIR, { recursive: true })
}

export async function readPersistedShortContentPayload() {
  await ensureShortContentPersistenceDir()

  try {
    const raw = await readFile(SHORT_CONTENT_SESSION_PERSISTENCE_PATH, 'utf8')
    return normalizePersistedShortContentPayload(JSON.parse(raw))
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null
    }

    throw error
  }
}

export async function writePersistedShortContentPayload({
  item,
  name = 'short-content-conversations-v1',
} = {}) {
  if (!item || typeof item !== 'object') {
    throw new Error('缺少可持久化的短文会话数据')
  }

  await ensureShortContentPersistenceDir()

  const payload = {
    item,
    name,
    updatedAt: new Date().toISOString(),
  }

  await writeFile(SHORT_CONTENT_SESSION_PERSISTENCE_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  return payload
}

export async function deletePersistedShortContentPayload() {
  try {
    await unlink(SHORT_CONTENT_SESSION_PERSISTENCE_PATH)
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error
    }
  }

  return { deleted: true }
}

export function readShortContentPersistenceMeta() {
  return {
    localPath: SHORT_CONTENT_SESSION_PERSISTENCE_PATH,
  }
}
