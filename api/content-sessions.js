import {
  deletePersistedContentSessionPayloadFromLocal,
  readContentSessionPersistenceMeta,
  readPersistedContentSessionPayloadFromLocal,
  writePersistedContentSessionPayloadToLocal,
} from '../server/contentSessionPersistence.js'

export default async function handler(request, response) {
  if (request.method === 'GET') {
    try {
      const payload = await readPersistedContentSessionPayloadFromLocal()
      response.status(200).json({
        ...(payload ?? { item: null, name: 'content-creation-sessions-v1', updatedAt: null }),
        meta: readContentSessionPersistenceMeta(),
      })
    } catch (error) {
      response.status(error.status || 500).json({
        error: error.message || '读取本地历史记录失败',
      })
    }

    return
  }

  if (request.method === 'PUT') {
    try {
      const payload = await writePersistedContentSessionPayloadToLocal({
        item: request.body?.item ?? null,
        name: request.body?.name ?? 'content-creation-sessions-v1',
      })
      response.status(200).json({
        ...payload,
        meta: readContentSessionPersistenceMeta(),
      })
    } catch (error) {
      response.status(error.status || 500).json({
        error: error.message || '写入本地历史记录失败',
      })
    }

    return
  }

  if (request.method === 'DELETE') {
    try {
      const payload = await deletePersistedContentSessionPayloadFromLocal()
      response.status(200).json(payload)
    } catch (error) {
      response.status(error.status || 500).json({
        error: error.message || '删除本地历史记录失败',
      })
    }

    return
  }

  response.status(405).json({ error: 'Method Not Allowed' })
}
