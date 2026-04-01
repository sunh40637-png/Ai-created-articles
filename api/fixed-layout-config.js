import { readFixedLayoutConfig, updateFixedLayoutText } from '../server/fixedLayoutConfig.js'

export default async function handler(request, response) {
  if (request.method === 'GET') {
    try {
      const result = await readFixedLayoutConfig()
      response.status(200).json(result)
    } catch (error) {
      response.status(error.status || 500).json({
        error: error.message || '读取固定内容配置失败',
      })
    }

    return
  }

  if (request.method === 'PATCH') {
    try {
      const result = await updateFixedLayoutText({
        endingText: request.body?.endingText ?? '',
      })
      response.status(200).json(result)
    } catch (error) {
      response.status(error.status || 500).json({
        error: error.message || '更新固定文案失败',
      })
    }

    return
  }

  response.status(405).json({ error: 'Method Not Allowed' })
}
