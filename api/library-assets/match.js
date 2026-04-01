import { matchLibraryAssetsForArticle } from '../../server/libraryAssets.js'

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method Not Allowed' })
    return
  }

  try {
    const result = await matchLibraryAssetsForArticle({
      sections: Array.isArray(request.body?.sections) ? request.body.sections : [],
      topic: request.body?.topic || '',
      type: request.body?.type || '',
      wordCount: request.body?.wordCount || 0,
    })

    response.status(200).json(result)
  } catch (error) {
    response.status(error.status || 500).json({
      error: error.message || '自动匹配素材失败',
    })
  }
}
