import { chatWithMiniMax } from '../server/minimax.js'

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method Not Allowed' })
    return
  }

  try {
    const result = await chatWithMiniMax({
      apiKey: process.env.MINIMAX_API_KEY,
      model: request.body?.model || process.env.MINIMAX_MODEL,
      messages: request.body?.messages ?? [],
    })

    response.status(200).json({
      content: result?.choices?.[0]?.message?.content ?? '',
      model: result?.model ?? process.env.MINIMAX_MODEL ?? 'MiniMax-M2.7',
      usage: result?.usage ?? null,
    })
  } catch (error) {
    response.status(error.status || 500).json({
      error: error.message || '聊天请求失败',
      details: error.payload ?? null,
    })
  }
}
