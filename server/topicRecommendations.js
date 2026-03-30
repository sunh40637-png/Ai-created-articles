import { chatWithMiniMax } from './minimax.js'

const DEFAULT_MODEL = 'MiniMax-M2.7'
const TOPIC_ASSISTANT_NAME = '选题规划助手'
const ALLOWED_TYPES = new Set(['A型', 'B型', 'C型'])
const ALLOWED_THEMES = new Set(['做人处世智慧', '家庭关系', '晚年自处', '孝道与父母', '健康与生命'])

function buildTopicRecommendationSystemPrompt() {
  return [
    '你是公众号“煮酒问人生”的选题规划助手。',
    '你的任务是根据用户给出的偏好，生成 6 个适合该账号的选题建议。',
    '每个选题都必须输出：title、type、penName、theme、reason。',
    '文章类型只允许 A型、B型、C型。',
    '所属母题只允许：做人处世智慧、家庭关系、晚年自处、孝道与父母、健康与生命。',
    '笔名必须和类型对应：A型固定芷若，B型和C型固定明远。',
    '标题必须像真实公众号标题，不能空泛，不能输出解释性口语。',
    'reason 需要简短，说明为什么这个题适合当前账号和当前偏好。',
    '禁止输出娱乐八卦、游戏、科技、财经等不相关赛道。',
    '最终只返回 JSON 对象，不要代码块，不要额外解释。',
    'JSON 结构必须为：{"recommendations":[{"title":"","type":"","penName":"","theme":"","reason":""}]}。',
  ].join('\n')
}

function buildTopicRecommendationPrompt({ supplement = '' }) {
  return [
    '请基于以下偏好生成一组新的推荐选题：',
    `- 偏好说明：${supplement.trim() || '无'}`,
    '- 数量：6 个',
    '- 目标：更贴近该偏好的题目方向，而不是只改写同一批标题。',
    '- 标题要彼此拉开，不要只是换词复述。',
    '- 如果偏好更适合清单式，就多给 B 型；如果更适合细腻叙事，就考虑 A 型；只有明显热点表达才使用 C 型。',
  ].join('\n')
}

function normalizeTextContent(content) {
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') {
          return item
        }

        if (typeof item?.text === 'string') {
          return item.text
        }

        return ''
      })
      .filter(Boolean)
      .join('\n')
  }

  return ''
}

function stripCodeFence(content) {
  const trimmed = content.trim()
  const matched = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return matched ? matched[1].trim() : trimmed
}

function extractJsonObject(content) {
  const normalized = stripCodeFence(content)

  try {
    return JSON.parse(normalized)
  } catch {
    const start = normalized.indexOf('{')
    const end = normalized.lastIndexOf('}')

    if (start === -1 || end === -1 || end <= start) {
      return null
    }

    try {
      return JSON.parse(normalized.slice(start, end + 1))
    } catch {
      return null
    }
  }
}

function inferTopicTheme(title = '', fallbackTheme = '') {
  if (ALLOWED_THEMES.has(fallbackTheme)) {
    return fallbackTheme
  }

  if (/父母|母亲|父亲|孝|养老/.test(title)) {
    return '孝道与父母'
  }

  if (/婚姻|夫妻|家庭|婆媳|爱人|伴侣|感情|家/.test(title)) {
    return '家庭关系'
  }

  if (/晚年|老了|余生|老年|晚景|下半生/.test(title)) {
    return '晚年自处'
  }

  if (/健康|身体|生命|养生|保命|生死/.test(title)) {
    return '健康与生命'
  }

  return '做人处世智慧'
}

function inferTopicType(title = '', fallbackType = '') {
  if (ALLOWED_TYPES.has(fallbackType)) {
    return fallbackType
  }

  if (/\d/.test(title)) {
    return 'B型'
  }

  if (/热搜|热点|爆火|刷屏|事件|新闻/.test(title)) {
    return 'C型'
  }

  return 'A型'
}

function normalizeTopicItem(item, index) {
  const title = typeof item?.title === 'string' ? item.title.trim().slice(0, 40) : ''

  if (!title) {
    return null
  }

  const type = inferTopicType(title, item?.type)
  const penName = type === 'A型' ? '芷若' : '明远'
  const theme = inferTopicTheme(title, item?.theme)
  const reason =
    typeof item?.reason === 'string' && item.reason.trim()
      ? item.reason.trim()
      : `适合按${theme}母题展开，能更自然地贴近当前补充偏好。`

  return {
    id: `ai-topic-${Date.now()}-${index + 1}`,
    penName,
    reason,
    theme,
    title,
    type,
  }
}

export async function generateTopicRecommendations({
  apiKey,
  model = DEFAULT_MODEL,
  supplement = '',
}) {
  const result = await chatWithMiniMax({
    apiKey,
    assistantName: TOPIC_ASSISTANT_NAME,
    model,
    systemPrompt: buildTopicRecommendationSystemPrompt(),
    temperature: 0.65,
    timeoutMs: 120000,
    messages: [
      {
        role: 'user',
        content: buildTopicRecommendationPrompt({ supplement }),
      },
    ],
  })

  const content = normalizeTextContent(result?.choices?.[0]?.message?.content ?? '')
  const parsed = extractJsonObject(content)
  const recommendations = Array.isArray(parsed?.recommendations)
    ? parsed.recommendations.map(normalizeTopicItem).filter(Boolean)
    : []

  if (recommendations.length < 6) {
    const error = new Error('AI 返回的推荐选题数量不足')
    error.status = 502
    error.payload = { content, parsed }
    throw error
  }

  return {
    recommendations: recommendations.slice(0, 6),
    summary: supplement.trim()
      ? '已根据你的偏好重新生成 6 个选题方向。'
      : '已生成一组新的推荐选题。',
  }
}
