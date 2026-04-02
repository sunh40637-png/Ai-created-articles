import { syncSessionToWechatDraft } from '../../../server/wechatDraft.js'

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method Not Allowed' })
    return
  }

  try {
    const result = await syncSessionToWechatDraft({
      article: request.body?.article ?? {},
      sessionId: request.body?.sessionId ?? '',
    })

    response.status(200).json(result)
  } catch (error) {
    response.status(error.status || 500).json({
      details: error.payload ?? null,
      error: error.message || '同步微信草稿失败',
    })
  }
}
