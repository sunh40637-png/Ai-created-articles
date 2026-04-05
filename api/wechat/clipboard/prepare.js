import { prepareWechatClipboardHtml } from '../../../server/wechatClipboard.js'

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method Not Allowed' })
    return
  }

  try {
    const result = await prepareWechatClipboardHtml({
      bodyHtml: request.body?.bodyHtml ?? '',
      plainText: request.body?.plainText ?? '',
    })

    response.status(200).json(result)
  } catch (error) {
    response.status(error.status || 500).json({
      details: error.payload ?? null,
      error: error.message || '准备复制微信样式失败',
    })
  }
}
