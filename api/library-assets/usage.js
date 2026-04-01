import { recordLibraryAssetUsage } from '../../server/libraryAssets.js'

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method Not Allowed' })
    return
  }

  try {
    const result = await recordLibraryAssetUsage({
      assetIds: request.body?.assetIds ?? [],
      usedAt: request.body?.usedAt,
    })

    response.status(200).json(result)
  } catch (error) {
    response.status(error.status || 500).json({
      error: error.message || '更新素材使用记录失败',
    })
  }
}
