import {
  readContentSessionPayloadFromOss,
  readShortContentPayloadFromOss,
  isAliyunOssConfigured,
} from '../server/ossContentStorage.js'

export default async function handler(request, response) {
  try {
    if (request.method === 'GET') {
      if (!isAliyunOssConfigured()) {
        response.status(400).json({ error: '未配置阿里云 OSS' })
        return
      }

      const [contentPayload, shortPayload] = await Promise.all([
        readContentSessionPayloadFromOss().catch(() => null),
        readShortContentPayloadFromOss().catch(() => null),
      ])

      const contentSessions = Array.isArray(contentPayload?.item?.state?.sessions)
        ? contentPayload.item.state.sessions
        : []
      
      const shortConversations = Array.isArray(shortPayload?.item?.state?.conversations)
        ? shortPayload.item.state.conversations
        : []

      response.status(200).json({
        content: contentSessions,
        shortContent: shortConversations,
      })
      return
    }

    response.status(405).json({ error: 'Method Not Allowed' })
  } catch (error) {
    response.status(error.status || 500).json({
      error: error.message || '获取云端数据失败',
    })
  }
}
