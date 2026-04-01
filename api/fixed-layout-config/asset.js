import { deleteFixedLayoutAsset } from '../../server/fixedLayoutConfig.js'

export default async function handler(request, response) {
  if (request.method !== 'DELETE') {
    response.status(405).json({ error: 'Method Not Allowed' })
    return
  }

  try {
    const result = await deleteFixedLayoutAsset(request.body?.slot ?? '')
    response.status(200).json(result)
  } catch (error) {
    response.status(error.status || 500).json({
      error: error.message || '删除固定图片失败',
    })
  }
}
