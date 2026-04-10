import { readFileSync } from 'node:fs'

const WRITING_RULES_PATH = new URL('../content-style/writing_rules.md', import.meta.url)

const TOPIC_INTENT_SECTION_HEADING = '## 二、选题类型判断（所有类型适用）'
const A_TYPE_DISCUSSION_SECTION_HEADING = '### 3.3 正文循环体规范（重复2-3次）'
const A_TYPE_ENDING_SECTION_HEADING = '### 3.4 结尾规范'
const B_TYPE_POINT_SECTION_HEADING = '### 4.3 每个"点"的结构'
const STORY_WRITING_SECTION_HEADING = '### 6.3 故事写作规范'
const OUTPUT_LAYOUT_SECTION_HEADING = '### 6.5 输出排版规范（影响最终发布效果）'

const PROGRESSIVE_TOPIC = 'progressive'
const SELF_TOPIC = 'self'
const RELATIONSHIP_TOPIC = 'relationship'
const UNKNOWN_TOPIC = 'unknown'

const PROGRESSIVE_KEYWORDS = ['守住', '底线', '硬气', '不争', '分寸', '边界', '退让', '好说话', '欺负']
const SELF_KEYWORDS = ['放下', '清静', '不计较', '看开', '减法', '释然', '活明白', '不值得', '惦记']
const RELATIONSHIP_KEYWORDS = [
  '家庭',
  '夫妻',
  '亲子',
  '孝道',
  '父母',
  '母亲',
  '父亲',
  '婚姻',
  '孩子',
  '儿女',
  '家人',
]

const FALLBACK_TOPIC_GUIDE = [
  '- 若标题更偏边界、底线、分寸、不退让，按进取型执行：故事结果要证明守住原则的人最终得好处，结尾强调“这样做对自己有什么好处”。',
  '- 若标题更偏清静、放下、减法、接受，按自处型执行：故事结果要证明放下之后反而轻松，结尾强调宁静和释然，不强加说教。',
  '- 若标题更偏家庭、夫妻、亲子、孝道，按关系型执行：故事结果要体现关系经营的重要性，结尾要有温情或行动召唤。',
].join('\n')

const FALLBACK_STORY_WRITING_GUIDE = [
  '- 人物必须有名有姓（可虚构，名字要符合时代背景）。',
  '- 地点要具体（XX省XX城/XX县）。',
  '- 细节要有画面感（具体物品、对话、动作）。',
  '- 每篇三个故事情感弧线要有差异。',
  '- 故事结尾要有“那一刻”——让读者情绪被击中的瞬间。',
  '- 反转爽感要求（进取型选题适用）：故事结果要证明“坚守原则的人最终得好处”，不要让读者读完憋屈。',
  '- 现代故事权重高于古代故事，每篇至少要有 1 个现代背景故事或案例。',
  '- 现代故事可以虚构，但必须符合现实生活逻辑，不能悬浮。',
  '- 除非明确要求纯历史主题，否则不要三个主体段都使用古代故事。',
].join('\n')

const FALLBACK_OUTPUT_LAYOUT_GUIDE = [
  '**段落内换行**：',
  '- 每句话不强制单独一行，但停顿处（句号）即分段。',
  '- 关键结论单独成行，加强语气。',
  '- 对话内容单独分段，不要混入叙述句。',
  '- 情绪转折点单独分段，让读者有节奏感。',
  '',
  '**段落之间**：',
  '- 正文每个大段落结束后空一行。',
  '- 古文引用前后各空一行。',
  '- 故事与故事之间空一行。',
  '',
  '**节奏感原则**：',
  '- 长句后留呼吸，短句后可直接接下一句。',
  '- 对比句式可以并排放置，形成视觉对照。',
  '- 排版的目的不是好看，是降低阅读阻力。',
].join('\n')

const FALLBACK_A_TYPE_DISCUSSION_GUIDE = [
  '**③ 展开论述**',
  '- 2-3句口语化道理。',
  '- 多用排比或对比句式。',
  '- 句式示例：`你若……，他便……` / `不是……，而是……` / `越是……，越会……`。',
  '- 话术必须硬气（进取型选题适用）：当涉及拒绝、立规矩、维护边界时，态度要不卑不亢，让读者觉得作者守住了底线而非示弱。',
].join('\n')

const FALLBACK_A_TYPE_ENDING_GUIDE = [
  '**升华段**：3-5句，语气从平静变为有力，多用排比，不直接说教。',
  '**利他心理设计原则**：结尾不要说“你要怎样”，而要说“这样做对你有什么好处”。',
  '**固定结尾语（可选项）**：若文章主题本身已有强说服力的结语，可省略固定结尾语，以自然收尾为优先。',
].join('\n')

const FALLBACK_B_TYPE_CLOSING_GUIDE = [
  '**④ 道理收尾：** 2-3句，有可操作性，读者知道“我能怎么做”。',
  '- 进取型选题：话术要硬气，体现底线和边界。',
  '- 自处型选题：语气要释然，体现放下和接受。',
].join('\n')

let cachedDocument = null
let cachedTopicIntentGuideMap = null
let cachedStoryWritingGuide = null
let cachedOutputLayoutGuide = null
let cachedATypeDiscussionGuide = null
let cachedATypeEndingGuide = null
let cachedBTypeClosingGuide = null

function readWritingRulesDocument() {
  if (cachedDocument !== null) {
    return cachedDocument
  }

  try {
    cachedDocument = readFileSync(WRITING_RULES_PATH, 'utf8')
  } catch {
    cachedDocument = ''
  }

  return cachedDocument
}

function countHeadingLevel(line = '') {
  const match = line.trim().match(/^(#{1,6})\s+/u)
  return match ? match[1].length : 0
}

function extractMarkdownSection(content, heading) {
  const lines = String(content).split(/\r?\n/)
  const startIndex = lines.findIndex((line) => line.trim() === heading.trim())

  if (startIndex === -1) {
    return ''
  }

  const currentLevel = countHeadingLevel(lines[startIndex])
  const sectionLines = []

  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    const headingLevel = countHeadingLevel(line)

    if (headingLevel > 0 && headingLevel <= currentLevel) {
      break
    }

    sectionLines.push(line)
  }

  return sectionLines.join('\n').trim()
}

function extractBlock(sectionBody, startMarker, endMarker = '') {
  const startIndex = sectionBody.indexOf(startMarker)

  if (startIndex === -1) {
    return ''
  }

  const rest = sectionBody.slice(startIndex)

  if (!endMarker) {
    return rest.trim()
  }

  const endIndex = rest.indexOf(endMarker)
  return (endIndex === -1 ? rest : rest.slice(0, endIndex)).trim()
}

function normalizeRuleGuide(sectionBody = '', { omitExamples = false } = {}) {
  const lines = String(sectionBody).split(/\r?\n/)
  const normalizedLines = []
  let inCodeBlock = false

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    const trimmed = line.trim()

    if (!trimmed) {
      if (normalizedLines[normalizedLines.length - 1] !== '') {
        normalizedLines.push('')
      }
      continue
    }

    if (trimmed.startsWith('```')) {
      inCodeBlock = !inCodeBlock
      if (!omitExamples) {
        normalizedLines.push(trimmed)
      }
      continue
    }

    if (omitExamples && inCodeBlock) {
      continue
    }

    if (omitExamples && (trimmed === '**示例对比**：' || trimmed.startsWith('❌') || trimmed.startsWith('✅'))) {
      continue
    }

    normalizedLines.push(trimmed)
  }

  return normalizedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

function buildTopicIntentGuideMap() {
  if (cachedTopicIntentGuideMap !== null) {
    return cachedTopicIntentGuideMap
  }

  const section = extractMarkdownSection(readWritingRulesDocument(), TOPIC_INTENT_SECTION_HEADING)

  cachedTopicIntentGuideMap = {
    [PROGRESSIVE_TOPIC]: normalizeRuleGuide(
      extractBlock(section, '**第一类：进取型选题**', '**第二类：自处型选题**'),
    ),
    [SELF_TOPIC]: normalizeRuleGuide(
      extractBlock(section, '**第二类：自处型选题**', '**第三类：关系型选题**'),
    ),
    [RELATIONSHIP_TOPIC]: normalizeRuleGuide(extractBlock(section, '**第三类：关系型选题**')),
  }

  return cachedTopicIntentGuideMap
}

export function detectTopicIntentCategory(title = '') {
  const normalizedTitle = String(title).trim()

  if (!normalizedTitle) {
    return UNKNOWN_TOPIC
  }

  if (RELATIONSHIP_KEYWORDS.some((keyword) => normalizedTitle.includes(keyword))) {
    return RELATIONSHIP_TOPIC
  }

  if (SELF_KEYWORDS.some((keyword) => normalizedTitle.includes(keyword))) {
    return SELF_TOPIC
  }

  if (PROGRESSIVE_KEYWORDS.some((keyword) => normalizedTitle.includes(keyword))) {
    return PROGRESSIVE_TOPIC
  }

  return UNKNOWN_TOPIC
}

export function readTopicIntentGuide(category = UNKNOWN_TOPIC) {
  const guideMap = buildTopicIntentGuideMap()
  return guideMap[category] || FALLBACK_TOPIC_GUIDE
}

export function readStoryWritingGuide() {
  if (cachedStoryWritingGuide !== null) {
    return cachedStoryWritingGuide
  }

  const section = extractMarkdownSection(readWritingRulesDocument(), STORY_WRITING_SECTION_HEADING)
  cachedStoryWritingGuide = normalizeRuleGuide(section) || FALLBACK_STORY_WRITING_GUIDE
  return cachedStoryWritingGuide
}

export function readOutputLayoutGuide() {
  if (cachedOutputLayoutGuide !== null) {
    return cachedOutputLayoutGuide
  }

  const section = extractMarkdownSection(readWritingRulesDocument(), OUTPUT_LAYOUT_SECTION_HEADING)
  cachedOutputLayoutGuide = normalizeRuleGuide(section, { omitExamples: true }) || FALLBACK_OUTPUT_LAYOUT_GUIDE
  return cachedOutputLayoutGuide
}

export function readATypeDiscussionGuide() {
  if (cachedATypeDiscussionGuide !== null) {
    return cachedATypeDiscussionGuide
  }

  const section = extractMarkdownSection(readWritingRulesDocument(), A_TYPE_DISCUSSION_SECTION_HEADING)
  const excerpt = extractBlock(section, '**③ 展开论述**', '**④ 故事**')
  cachedATypeDiscussionGuide = normalizeRuleGuide(excerpt) || FALLBACK_A_TYPE_DISCUSSION_GUIDE
  return cachedATypeDiscussionGuide
}

export function readATypeEndingGuide() {
  if (cachedATypeEndingGuide !== null) {
    return cachedATypeEndingGuide
  }

  const section = extractMarkdownSection(readWritingRulesDocument(), A_TYPE_ENDING_SECTION_HEADING)
  cachedATypeEndingGuide = normalizeRuleGuide(section) || FALLBACK_A_TYPE_ENDING_GUIDE
  return cachedATypeEndingGuide
}

export function readBTypeClosingGuide() {
  if (cachedBTypeClosingGuide !== null) {
    return cachedBTypeClosingGuide
  }

  const section = extractMarkdownSection(readWritingRulesDocument(), B_TYPE_POINT_SECTION_HEADING)
  const excerpt = extractBlock(section, '**④ 道理收尾：**')
  cachedBTypeClosingGuide = normalizeRuleGuide(excerpt) || FALLBACK_B_TYPE_CLOSING_GUIDE
  return cachedBTypeClosingGuide
}
