import {
  deletePersistedShortContentPayload,
  readPersistedShortContentPayload,
  readShortContentPersistenceMeta,
  writePersistedShortContentPayload,
} from '../server/shortContentSessionPersistence.js'

export default async function handler(request, response) {
  if (request.method === 'GET') {
    try {
      const payload = await readPersistedShortContentPayload()
      response.status(200).json({
        ...(payload ?? { item: null, name: 'short-content-conversations-v1', updatedAt: null }),
        meta: readShortContentPersistenceMeta(),
      })
    } catch (error) {
      response.status(error.status || 500).json({
        error: error.message || '读取短文历史记录失败',
      })
    }

    return
  }

  if (request.method === 'PUT') {
    try {
      const payload = await writePersistedShortContentPayload({
        item: request.body?.item ?? null,
        name: request.body?.name ?? 'short-content-conversations-v1',
      })
      response.status(200).json({
        ...payload,
        meta: readShortContentPersistenceMeta(),
      })
    } catch (error) {
      response.status(error.status || 500).json({
        error: error.message || '写入短文历史记录失败',
      })
    }

    return
  }

  if (request.method === 'DELETE') {
    try {
      const payload = await deletePersistedShortContentPayload()
      response.status(200).json(payload)
    } catch (error) {
      response.status(error.status || 500).json({
        error: error.message || '删除短文历史记录失败',
      })
    }

    return
  }

  response.status(405).json({ error: 'Method Not Allowed' })
}
