import { performSystemSyncAction, readSystemSyncStatus } from '../server/systemSyncStatus.js'

export default async function handler(request, response) {
  try {
    if (request.method === 'GET') {
      const result = await readSystemSyncStatus()
      response.status(200).json(result)
      return
    }

    if (request.method === 'POST') {
      const result = await performSystemSyncAction({
        action: request.body?.action ?? '',
        target: request.body?.target ?? '',
      })
      response.status(200).json(result)
      return
    }

    response.status(405).json({ error: 'Method Not Allowed' })
  } catch (error) {
    response.status(error.status || 500).json({
      error: error.message || '同步请求失败',
    })
  }
}
