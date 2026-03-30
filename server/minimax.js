const DEFAULT_MODEL = 'MiniMax-M2.7'
const MINIMAX_API_URL = 'https://api.minimaxi.com/v1/text/chatcompletion_v2'

function buildSystemPrompt() {
  return [
    '你是一个直播带货话术拆解助手。',
    '你的职责是围绕素材拆解、表达分析、模板提炼和下一步建议来帮助用户。',
    '回答要直接、具体、可执行，不要空泛。',
    '如果用户上传了附件，目前你只能基于附件的名称、类型和已经拿到的识别结果理解上下文，不能假装已经看懂画面。',
    '如果缺少关键信息，就明确告诉用户还缺什么材料。',
  ].join('\n')
}

function serializeAttachments(attachments = []) {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return ''
  }

  return attachments
    .map((attachment, index) => `${index + 1}. ${attachment.name}（${attachment.sizeLabel}）`)
    .join('\n')
}

function normalizeMessage(message) {
  if (message.role === 'assistant') {
    return {
      role: 'assistant',
      name: '话术拆解助手',
      content: message.content || '',
    }
  }

  const attachmentSummary = serializeAttachments(message.attachments)
  const content = [
    message.content?.trim() || '',
    attachmentSummary ? `附件：\n${attachmentSummary}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')

  return {
    role: 'user',
    name: '用户',
    content,
  }
}

async function requestMiniMax(payload, apiKey) {
  const response = await fetch(MINIMAX_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok || data?.base_resp?.status_code) {
    const error = new Error(
      data?.base_resp?.status_msg || data?.message || data?.error || 'MiniMax 请求失败',
    )
    error.status = response.status || 500
    error.payload = data
    throw error
  }

  return data
}

export async function chatWithMiniMax({
  apiKey,
  messages = [],
  model = DEFAULT_MODEL,
}) {
  if (!apiKey) {
    throw new Error('未配置 MINIMAX_API_KEY')
  }

  const payload = {
    model,
    stream: false,
    temperature: 0.2,
    top_p: 0.95,
    messages: [
      {
        role: 'system',
        name: '话术拆解助手',
        content: buildSystemPrompt(),
      },
      ...messages.map(normalizeMessage),
    ],
  }

  return requestMiniMax(payload, apiKey)
}
