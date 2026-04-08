import { readFileSync } from 'node:fs'
import { chatWithLlm } from './llm/index.js'

const DEFAULT_MODEL = 'glm-5.1'
const WRITING_RULES_PATH = new URL('./prompts/writing_rules_D_type.md', import.meta.url)
const ENDING_LINES = {
  agree: '同意请点亮文末"爱心"，转发分享，弘扬中华传统文化！',
  identify: '认同的点亮文末"爱心"，转发分享，弘扬中华传统文化！',
}

let cachedWritingRules = null

function readWritingRules() {
  if (cachedWritingRules !== null) {
    return cachedWritingRules
  }

  cachedWritingRules = readFileSync(WRITING_RULES_PATH, 'utf8').trim()
  return cachedWritingRules
}

function normalizeExistingContents(existingContents = []) {
  if (!Array.isArray(existingContents)) {
    return []
  }

  return existingContents
    .map((content) => (typeof content === 'string' ? content.trim() : ''))
    .filter(Boolean)
}

function resolveEndingVariant(versionIndex) {
  return versionIndex % 2 === 0 ? 'agree' : 'identify'
}

function stripLeadingTitle(text = '') {
  const lines = String(text).replace(/\r\n?/g, '\n').trim().split('\n')
  const firstNumberedIndex = lines.findIndex((line) => /^\s*1、/.test(line))

  if (firstNumberedIndex <= 0) {
    return lines.join('\n').trim()
  }

  return lines.slice(firstNumberedIndex).join('\n').trim()
}

function removeTrailingEnding(text = '') {
  return String(text)
    .replace(/\n{2,}(认同的点亮文末"爱心"，转发分享，弘扬中华传统文化！|同意请点亮文末"爱心"，转发分享，弘扬中华传统文化！)\s*$/u, '')
    .trim()
}

function normalizeShortContent(rawContent = '', endingLine) {
  let normalized = String(rawContent)
    .replace(/^```(?:\w+)?\s*/u, '')
    .replace(/\s*```$/u, '')
    .replace(/\r\n?/g, '\n')
    .trim()

  normalized = stripLeadingTitle(normalized)
  const numberedStartIndex = normalized.search(/(?:^|\n)\s*1、/u)

  if (numberedStartIndex > 0) {
    normalized = normalized.slice(numberedStartIndex).trim()
  }

  normalized = removeTrailingEnding(normalized)
    .replace(/\n(?=\s*\d+、)/gu, '\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (!normalized) {
    throw new Error('当前模型没有返回可用的短文内容')
  }

  return `${normalized}\n\n${endingLine}`
}

function buildExistingContentPrompt(existingContents = []) {
  if (existingContents.length === 0) {
    return '这是当前会话的第一版，请直接生成一条全新的 D 型纯文字短合集。'
  }

  return [
    '以下是当前会话已经生成过的版本，请避免重复它们的主题组合、开头观点、段落顺序、排比表达和结尾前的收束句：',
    ...existingContents.map((content, index) => `【历史版本 ${index + 1}】\n${content}`),
  ].join('\n\n')
}

function buildSystemPrompt({ endingLine }) {
  return [
    '你是“煮酒问人生”账号的 D 型纯文字短合集写作助手。',
    '你必须严格遵守下面这份写作规则，生成可以直接发布的纯文字内容。',
    '',
    readWritingRules(),
    '',
    '额外执行要求：',
    '- 只输出最终正文，不要解释，不要标题，不要 Markdown 标题，不要代码块，不要项目符号，不要额外说明。',
    '- 正文必须直接从“1、”开始。',
    '- 只允许输出 4 到 6 个编号段落，段落之间空一行。',
    '- 每段 100 到 200 字，总字数控制在 500 到 1000 字。',
    '- 自动从规则中的主题方向里选择 1 到 2 个主题组合。',
    '- 全文不能出现古文引用、标题、图片说明、括号里的创作提示或任何 AI 自述。',
    '- 禁止使用破折号（——）、“综上所述”“不得不说”“值得注意的是”等 AI 腔。',
    `- 最后一行必须严格等于：${endingLine}`,
  ].join('\n')
}

export async function generateShortContent({
  apiKey,
  existingContents = [],
  model = DEFAULT_MODEL,
} = {}) {
  const normalizedExistingContents = normalizeExistingContents(existingContents)
  const versionIndex = normalizedExistingContents.length + 1
  const endingVariant = resolveEndingVariant(versionIndex)
  const endingLine = ENDING_LINES[endingVariant]

  const result = await chatWithLlm({
    apiKey,
    assistantName: '短文写作助手',
    model,
    systemPrompt: buildSystemPrompt({ endingLine }),
    temperature: 0.85,
    topP: 0.95,
    messages: [
      {
        role: 'user',
        content: [
          `请生成当前会话的第 ${versionIndex} 版 D 型纯文字短合集。`,
          buildExistingContentPrompt(normalizedExistingContents),
          `固定结尾语：${endingLine}`,
        ].join('\n\n'),
      },
    ],
  })

  const content = normalizeShortContent(result?.choices?.[0]?.message?.content ?? '', endingLine)

  return {
    content,
    endingVariant,
    model: result?.model ?? model,
    usage: result?.usage ?? null,
  }
}
