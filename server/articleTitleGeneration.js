import { readFile } from 'node:fs/promises'
import { DEFAULT_GLM_MODEL, DEFAULT_LLM_PROVIDER } from './llm/constants.js'
import { chatWithLlm } from './llm/index.js'

const TITLE_ASSISTANT_NAME = '文章标题助手'
const TITLE_RULES_PATH = new URL('./prompts/title_generation_rules.md', import.meta.url)
const TITLE_LENGTH_MIN = 30
const TITLE_LENGTH_MAX = 50
const TITLE_GENERATION_MAX_ATTEMPTS = 3

let cachedTitleRules = null

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

function stripCodeFence(content = '') {
  const trimmed = String(content || '').trim()
  const matched = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return matched ? matched[1].trim() : trimmed
}

function stripThinkingBlock(content = '') {
  return String(content || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .trim()
}

function extractJsonObject(content = '') {
  const normalized = stripThinkingBlock(stripCodeFence(content))

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

function normalizeGeneratedTitle(value = '') {
  return String(value || '')
    .replace(/^标题[:：]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function countTitleLength(value = '') {
  return Array.from(String(value || '').replace(/\s+/g, '')).length
}

function createArticleTitleError(message, status = 400, payload = null) {
  const error = new Error(message)
  error.status = status
  error.payload = payload
  return error
}

async function readTitleRules() {
  if (typeof cachedTitleRules === 'string' && cachedTitleRules.trim()) {
    return cachedTitleRules
  }

  cachedTitleRules = await readFile(TITLE_RULES_PATH, 'utf8')
  return cachedTitleRules
}

function buildTitleGenerationSystemPrompt() {
  return [
    '你是公众号“煮酒问人生”的文章标题生成助手。',
    '你必须严格依据用户提供的标题规则和文章正文来生成标题。',
    '你只输出 1 个最终标题，不要候选列表，不要标题公式，不要点击动机，不要解释。',
    '标题必须是自然、口语化、适合真实公众号发布的中文标题。',
    `标题长度必须严格控制在 ${TITLE_LENGTH_MIN} 到 ${TITLE_LENGTH_MAX} 字之间。`,
    `程序会按字符数校验标题长度：汉字、数字、英文、标点都算 1 个字符，空格不计入长度。`,
    '不要输出思考过程、不要输出 <think> 标签中的内容，完成检查后直接给出最终答案。',
    '最终只返回 JSON 对象，不要代码块，不要额外解释。',
    'JSON 结构必须为：{"title":""}。',
  ].join('\n')
}

function buildTitleGenerationPrompt({
  articleBodyMarkdown = '',
  articleTitle = '',
  repairInstruction = '',
  sessionId = '',
  theme = '',
  type = '',
  titleRules = '',
}) {
  return [
    '以下是必须严格遵守的标题规则：',
    titleRules.trim(),
    '',
    '请基于下面这篇已经确认排版的文章，生成 1 个可直接发布的新标题。',
    `- 会话 ID：${sessionId || '未提供'}`,
    `- 当前标题：${articleTitle.trim() || '无'}`,
    `- 文章母题：${theme.trim() || '未设置'}`,
    `- 文章类型：${type.trim() || '未设置'}`,
    `- 输出要求：只返回 1 个最终标题；标题长度严格为 ${TITLE_LENGTH_MIN} 到 ${TITLE_LENGTH_MAX} 字；不要返回解释或候选列表。`,
    `- 长度计算方式：汉字、数字、英文、标点都算 1 个字符，空格不计入长度。输出前请自行检查。`,
    ...(repairInstruction.trim()
      ? [
          '',
          '上一次输出未通过程序校验，请严格修正：',
          repairInstruction.trim(),
        ]
      : []),
    '',
    '文章正文：',
    articleBodyMarkdown.trim(),
  ].join('\n')
}

async function requestGeneratedTitle({
  apiKey,
  articleBodyMarkdown,
  articleTitle,
  baseUrl,
  model,
  provider,
  repairInstruction = '',
  sessionId,
  theme,
  titleRules,
  type,
}) {
  const result = await chatWithLlm({
    apiKey,
    assistantName: TITLE_ASSISTANT_NAME,
    baseUrl,
    maxTokens: 1800,
    model,
    provider,
    responseFormat: 'json_object',
    systemPrompt: buildTitleGenerationSystemPrompt(),
    temperature: 0.7,
    thinkingType: 'disabled',
    timeoutMs: 120000,
    messages: [
      {
        role: 'user',
        content: buildTitleGenerationPrompt({
          articleBodyMarkdown,
          articleTitle,
          repairInstruction,
          sessionId,
          theme,
          titleRules,
          type,
        }),
      },
    ],
  })

  const rawContent = normalizeTextContent(result?.choices?.[0]?.message?.content ?? '')
  const parsed = extractJsonObject(rawContent)
  const title = normalizeGeneratedTitle(parsed?.title)
  const titleLength = countTitleLength(title)

  return {
    parsed,
    rawContent,
    result,
    title,
    titleLength,
  }
}

export async function generateArticleTitle({
  apiKey,
  articleBodyMarkdown = '',
  articleTitle = '',
  baseUrl = '',
  model = DEFAULT_GLM_MODEL,
  provider = DEFAULT_LLM_PROVIDER,
  sessionId = '',
  theme = '',
  type = '',
}) {
  if (typeof articleBodyMarkdown !== 'string' || !articleBodyMarkdown.trim()) {
    throw createArticleTitleError('缺少可用于生成标题的文章正文')
  }

  const titleRules = await readTitleRules()
  let repairInstruction = ''
  let lastError = null

  for (let attempt = 0; attempt < TITLE_GENERATION_MAX_ATTEMPTS; attempt += 1) {
    const { parsed, rawContent, result, title, titleLength } = await requestGeneratedTitle({
      apiKey,
      articleBodyMarkdown,
      articleTitle,
      baseUrl,
      model,
      provider,
      repairInstruction,
      sessionId,
      theme,
      titleRules,
      type,
    })

    if (!title) {
      lastError = createArticleTitleError('当前模型没有返回可用的标题', 502, {
        content: rawContent,
        parsed,
      })
      repairInstruction = '你上一次没有返回可用标题。请不要输出思考过程，只返回形如 {"title":"..."} 的 JSON。'
      continue
    }

    if (titleLength < TITLE_LENGTH_MIN || titleLength > TITLE_LENGTH_MAX) {
      lastError = createArticleTitleError(`生成标题长度不符合要求（当前 ${titleLength} 字，要求 ${TITLE_LENGTH_MIN}-${TITLE_LENGTH_MAX} 字）`, 502, {
        content: rawContent,
        parsed,
        title,
        titleLength,
      })
      repairInstruction = `你上一次返回的标题是“${title}”，程序按字符数统计为 ${titleLength} 字，不符合 ${TITLE_LENGTH_MIN}-${TITLE_LENGTH_MAX} 字要求。请重新生成，并在输出前自行检查长度。`
      continue
    }

    return {
      model: result?.model ?? model,
      title,
      usage: result?.usage ?? null,
    }
  }

  throw lastError || createArticleTitleError('标题生成失败', 502)
}
