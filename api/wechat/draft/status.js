import { readWechatDraftStatus } from '../../../server/wechatDraft.js'

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.status(405).json({ error: 'Method Not Allowed' })
    return
  }

  try {
    const result = await readWechatDraftStatus({
      sessionId: request.query?.sessionId ?? '',
    })

    response.status(200).json(result)
  } catch (error) {
    response.status(error.status || 500).json({
      error: error.message || '读取微信草稿状态失败',
    })
  }
}
