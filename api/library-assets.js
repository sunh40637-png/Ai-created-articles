import { listLibraryAssets } from '../server/libraryAssets.js'

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.status(405).json({ error: 'Method Not Allowed' })
    return
  }

  try {
    const result = await listLibraryAssets({
      emotion: request.query?.emotion || '',
      figures: request.query?.figures || '',
      sort: request.query?.sort || '',
      topic: request.query?.topic || '',
    })

    response.status(200).json({ items: result })
  } catch (error) {
    response.status(error.status || 500).json({
      error: error.message || '读取素材库失败',
    })
  }
}
