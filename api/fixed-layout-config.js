import { readFixedLayoutConfig, updateFixedLayoutConfig } from '../server/fixedLayoutConfig.js'

export default async function handler(request, response) {
  if (request.method === 'GET') {
    try {
      const result = await readFixedLayoutConfig()
      response.status(200).json(result)
    } catch (error) {
      response.status(error.status || 500).json({
        error: error.message || '读取模板配置失败',
      })
    }

    return
  }

  if (request.method === 'PATCH') {
    try {
      const result = await updateFixedLayoutConfig({
        imageSlots: request.body?.imageSlots,
      })
      response.status(200).json(result)
    } catch (error) {
      response.status(error.status || 500).json({
        error: error.message || '更新模板配置失败',
      })
    }

    return
  }

  response.status(405).json({ error: 'Method Not Allowed' })
}
