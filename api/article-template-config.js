import { readArticleTemplateConfig, writeArticleTemplateConfig } from '../server/articleTemplateConfig.js'

export default async function handler(request, response) {
  if (request.method === 'GET') {
    try {
      const result = await readArticleTemplateConfig()
      response.status(200).json(result)
    } catch (error) {
      response.status(error.status || 500).json({
        error: error.message || '读取排版模板配置失败',
      })
    }

    return
  }

  if (request.method === 'PUT') {
    try {
      const result = await writeArticleTemplateConfig(request.body ?? {})
      response.status(200).json(result)
    } catch (error) {
      response.status(error.status || 500).json({
        error: error.message || '保存排版模板配置失败',
      })
    }

    return
  }

  response.status(405).json({ error: 'Method Not Allowed' })
}
