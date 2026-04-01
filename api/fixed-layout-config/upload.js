import { parseRequestFormData } from '../../server/httpFormData.js'
import { uploadFixedLayoutAsset } from '../../server/fixedLayoutConfig.js'

export const config = {
  api: {
    bodyParser: false,
  },
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method Not Allowed' })
    return
  }

  try {
    const formData = await parseRequestFormData(request)
    const slot = typeof formData.get('slot') === 'string' ? formData.get('slot').trim() : ''
    const file = formData.get('file')

    const result = await uploadFixedLayoutAsset({
      file,
      slot,
    })

    response.status(200).json(result)
  } catch (error) {
    response.status(error.status || 500).json({
      error: error.message || '上传固定图片失败',
    })
  }
}
