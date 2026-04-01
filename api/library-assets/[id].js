import { deleteLibraryAsset, updateLibraryAsset } from '../../server/libraryAssets.js'

export default async function handler(request, response) {
  const assetId = request.query?.id

  if (request.method === 'PATCH') {
    try {
      const result = await updateLibraryAsset(assetId, request.body ?? {})
      response.status(200).json(result)
    } catch (error) {
      response.status(error.status || 500).json({
        error: error.message || '更新素材失败',
      })
    }
    return
  }

  if (request.method === 'DELETE') {
    try {
      const result = await deleteLibraryAsset(assetId)
      response.status(200).json(result)
    } catch (error) {
      response.status(error.status || 500).json({
        error: error.message || '删除素材失败',
      })
    }
    return
  }

  response.status(405).json({ error: 'Method Not Allowed' })
}
