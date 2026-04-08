import { chatWithLlm } from './llm/index.js'
import {
  CONTENT_TARGET_WORD_COUNT_RANGE,
  CONTENT_WRITING_WORD_COUNT_RANGE,
  CONTENT_WORD_COUNT_SECTION_GUIDE,
  DEFAULT_CONTENT_RULE_PROFILE_ID,
  resolveContentRuleProfile,
} from './contentRuleProfiles.js'
import { appendContentLlmTelemetryEvent } from './contentLlmTelemetry.js'
import { countReadableLength } from '../shared/readableLength.js'

const DEFAULT_MODEL = 'glm-5.1'
const CONTENT_ASSISTANT_NAME = '内容创作助手'
const REQUIRED_DRAFT_PLACEHOLDERS = ['[IMAGE_1]', '[IMAGE_2]', '[IMAGE_3]', '[ENDING]']

const TITLE_FORMULA_GUIDE = [
  '1. 转折反常识式：用“不是……而是……”或“越……反而越……”制造反转。',
  '2. 处境精准锚定式：精准点出某一类人的具体处境。',
  '3. 结论前置式：直接抛出反常识结论。',
  '4. 现象解读式：先写日常现象，再给深层解释。',
  '5. 人生感悟式：用一句有分量的判断道出普遍真相。',
  '6. 警示提醒式：用“别”“不要”“千万别”等提醒语触发防御本能。',
  '7. 故事开头式：用故事细节起手，制造悬念。',
  '8. 处境共情式：点中某个人生阶段的情绪。',
  '9. 身份认同式：直接点出目标读者的身份标签，形成“这是写给我的”感觉。',
].join('\n')

const TITLE_GENERATION_REQUIREMENTS = [
  '正式标题生成要求：',
  '- 标题要基于已经写出的正文内容来反推，不要用标题去反向限制正文。',
  '- 只输出 1 个正式标题，直接用于右侧文字稿顶部和后续排版。',
  '- 标题尽量贴近九种标题公式中的高质量写法，但不要生硬套模板。',
  '- 优先写出更自然、更像真人会说的话的标题，不要空泛，不要为了技巧感牺牲内容匹配。',
  '- 标题控制在 16 到 26 字之间。',
  '- 禁止数字开头、疑问句结尾、感叹号、夸张词（震惊/绝对/最强/第一/100%）、空洞鸡汤和 AI 腔标题。',
  '- generatedTitle 必须是字符串，只放标题本身，不要带序号、说明或公式标签。',
  '可用标题公式：',
  TITLE_FORMULA_GUIDE,
].join('\n')

const DRAFT_TEMPLATE_CONTRACT_GUIDE = [
  '固定 Markdown 骨架要求：',
  '- 正文第一行必须是且只允许是 1 个一级标题：# 文章标题。',
  '- 一级标题后先写开头正文，用于引出全文，不要在开头正文里插图片占位符。',
  '- 主体固定写 3 段，结构必须严格为：## 正文1标题 + 正文1正文 + [IMAGE_1]；## 正文2标题 + 正文2正文 + [IMAGE_2]；## 正文3标题 + 正文3正文 + [IMAGE_3]。',
  '- [IMAGE_1]、[IMAGE_2]、[IMAGE_3]、[ENDING] 必须各出现且只出现一次，顺序固定不能打乱。',
  '- [ENDING] 必须出现在第三部分正文和 [IMAGE_3] 之后，表示进入结尾区域。',
  '- [ENDING] 后必须继续输出 1 个二级标题作为结尾标题，再写结尾正文，最后单独写 1 段祝福语。',
  '- [ENDING] 之后禁止再展开新的主体观点，禁止再插入新的图片占位符。',
  '- 不要在正文里主动输出 ▽、作者/来源、二维码提示、关注引导或底部动图提示，这些都由固定模板统一渲染。',
  `- 可读正文字数尽量收敛在 ${CONTENT_WRITING_WORD_COUNT_RANGE.min} 到 ${CONTENT_WRITING_WORD_COUNT_RANGE.max} 字，最终必须落在 ${CONTENT_TARGET_WORD_COUNT_RANGE.min} 到 ${CONTENT_TARGET_WORD_COUNT_RANGE.max} 字。`,
  '- 程序统计字数时，不计一级标题、不计 [IMAGE_1]/[IMAGE_2]/[IMAGE_3]/[ENDING] 占位符、不计 Markdown 符号与空白，只统计可读中文/字母/数字字符。',
  CONTENT_WORD_COUNT_SECTION_GUIDE,
].join('\n')

function buildContentSystemPrompt(ruleProfile) {
  return ruleProfile.contentSystemPrompt
}

function getPenStyleDoc(ruleProfile, penName) {
  return ruleProfile.penStyleSummaries?.[penName] ?? ruleProfile.penStyleSummaries?.芷若 ?? ''
}

function buildTypeExecutionNotes(ruleProfile, type) {
  return ruleProfile.typeExecutionNotes?.[type] ?? ruleProfile.typeFallbackNote
}

function buildPenExecutionNotes(ruleProfile, penName) {
  return ruleProfile.penExecutionNotes?.[penName] ?? ruleProfile.penExecutionNotes?.芷若 ?? ''
}

function buildCompactRuleChecklist(ruleProfile, topic) {
  return ruleProfile.compactRuleChecklist({ topic })
}

function buildSharedContentContextLines({
  action,
  compact = false,
  deepThinkingEnabled,
  note = '',
  ruleProfile,
  supplement = '',
  topic,
}) {
  const taskLabel = action === 'revise' ? '根据修改意见重写当前文章' : '生成第一版文章'
  const modeLabel = deepThinkingEnabled ? '深度模式' : '标准模式'
  const ruleBlock = compact
    ? buildCompactRuleChecklist(ruleProfile, topic)
    : [
        '基础结构规范摘要：',
        ruleProfile.writingRulesSummary,
        '',
        `当前笔名风格摘要（${topic?.penName ?? '未指定'}）：`,
        getPenStyleDoc(ruleProfile, topic?.penName),
      ].join('\n')

  return [
    `任务：${taskLabel}`,
    `推理模式：${modeLabel}`,
    `规则版本：${ruleProfile.label}`,
    '',
    '创作要求：',
    `- 选题标题：${topic?.title ?? '未提供'}`,
    `- 文章类型：${topic?.type ?? '未提供'}`,
    `- 笔名口吻：${topic?.penName ?? '未提供'}`,
    `- 推荐理由：${topic?.reason ?? '无'}`,
    `- 补充要求：${supplement.trim() || '无'}`,
    `- 修改意见：${note.trim() || '无'}`,
    '',
    buildTypeExecutionNotes(ruleProfile, topic?.type),
    '',
    buildPenExecutionNotes(ruleProfile, topic?.penName),
    '',
    ruleBlock,
    '',
    DRAFT_TEMPLATE_CONTRACT_GUIDE,
  ]
}

function buildContentUserPrompt({
  action,
  compact = false,
  deepThinkingEnabled,
  note = '',
  ruleProfile,
  supplement = '',
  topic,
}) {
  return [
    ...buildSharedContentContextLines({
      action,
      compact,
      deepThinkingEnabled,
      note,
      ruleProfile,
      supplement,
      topic,
    }),
    '',
    '输出要求：',
    '- draftMarkdown：直接可读的公众号正文 Markdown，允许使用一级标题、引用、段落、小标题、列表。',
    '- draftMarkdown 必须严格遵守固定 Markdown 骨架与占位符结构。',
    ruleProfile.reportInstruction,
    ruleProfile.reportFormattingInstruction,
    '- generatedTitle：基于最终正文内容生成的 1 个正式标题，直接供右侧文字稿和后续排版使用。',
    '- summary：一句适合展示在工作流里的简短总结。',
    '',
    '如果是首稿，请直接给出完整正文与完整报告。',
    '如果是改稿，请优先做局部优化；只有在修改意见明确要求结构重写时，才做较大幅度重构。',
    '',
    TITLE_GENERATION_REQUIREMENTS,
    '',
    '再次提醒：只返回 JSON 对象本身，不要加 ```json 代码块。',
  ].join('\n')
}

function buildDraftGenerationSystemPrompt(ruleProfile) {
  return ruleProfile.draftGenerationSystemPrompt
}

function buildDraftGenerationUserPrompt({ deepThinkingEnabled, ruleProfile, supplement = '', topic }) {
  return [
    ...buildSharedContentContextLines({
      action: 'initial',
      compact: false,
      deepThinkingEnabled,
      note: '',
      ruleProfile,
      supplement,
      topic,
    }),
    '',
    '输出要求：',
    '- draftMarkdown：直接可读的公众号正文 Markdown，允许使用一级标题、引用、段落、小标题、列表。',
    '- draftMarkdown 必须严格遵守固定 Markdown 骨架与占位符结构。',
    '- summary：一句适合展示在工作流里的简短总结。',
    '- 只输出正文草稿，不要输出审核报告。',
    '',
    '再次提醒：只返回 JSON 对象本身，不要加 ```json 代码块。',
  ].join('\n')
}

function buildDraftAuditSystemPrompt(ruleProfile) {
  return ruleProfile.draftAuditSystemPrompt
}

function buildDraftAuditUserPrompt({ deepThinkingEnabled, draftMarkdown = '', ruleProfile, supplement = '', topic }) {
  return [
    ...buildSharedContentContextLines({
      action: 'initial',
      compact: true,
      deepThinkingEnabled,
      note: '',
      ruleProfile,
      supplement,
      topic,
    }),
    '',
    '待审核正文：',
    draftMarkdown.trim(),
    '',
    '输出要求：',
    ruleProfile.reportInstruction,
    ruleProfile.reportFormattingInstruction,
    '- 必须额外检查正文里 [IMAGE_1]、[IMAGE_2]、[IMAGE_3]、[ENDING] 是否齐全且顺序正确。',
    '- 必须额外检查正文是否满足“一级标题 + 开头正文 + 3 个主体段 + [ENDING] + 结尾标题 + 结尾正文 + 祝福语”的固定 Markdown 骨架。',
    '- 如果主体段数不等于 3，可记录为结构偏差，但不要因此丢弃正文内容；只有在标题层级、结尾结构或主体边界无法稳定识别时，才优先判为 rewrite。',
    '- generatedTitle：基于当前正文内容生成的 1 个正式标题，直接供右侧文字稿和后续排版使用。',
    '- decision：只能输出 pass / partial / rewrite 其中一个。',
    '- summary：一句适合展示在工作流里的简短总结。',
    '',
    TITLE_GENERATION_REQUIREMENTS,
    '',
    '再次提醒：只返回 JSON 对象本身，不要加 ```json 代码块。',
  ].join('\n')
}

function buildDraftRevisionSystemPrompt(ruleProfile) {
  return ruleProfile.draftRevisionSystemPrompt
}

function buildDraftRevisionUserPrompt({
  decision = 'partial',
  deepThinkingEnabled,
  draftMarkdown = '',
  reportMarkdown = '',
  ruleProfile,
  supplement = '',
  topic,
}) {
  const revisionLabel = decision === 'rewrite' ? '整篇重写' : '局部修订'

  return [
    ...buildSharedContentContextLines({
      action: 'revise',
      compact: true,
      deepThinkingEnabled,
      note: reportMarkdown.trim(),
      ruleProfile,
      supplement,
      topic,
    }),
    '',
    `修订方式：${revisionLabel}`,
    '',
    '当前正文：',
    draftMarkdown.trim(),
    '',
    '审核报告：',
    reportMarkdown.trim(),
    '',
    '输出要求：',
    '- draftMarkdown：修订后的最终正文 Markdown。',
    '- 修订后的 draftMarkdown 必须严格遵守固定 Markdown 骨架与占位符结构。',
    '- reportMarkdown：基于修订后正文输出的最终校验报告 Markdown。',
    '- generatedTitle：基于修订后正文内容生成的 1 个正式标题，直接供右侧文字稿和后续排版使用。',
    '- summary：一句适合展示在工作流里的简短总结。',
    '',
    TITLE_GENERATION_REQUIREMENTS,
    '',
    '再次提醒：只返回 JSON 对象本身，不要加 ```json 代码块。',
  ].join('\n')
}

async function requestContentGeneration({
  action,
  apiKey,
  deepThinkingEnabled,
  model,
  note,
  ruleProfileId = DEFAULT_CONTENT_RULE_PROFILE_ID,
  supplement,
  topic,
}) {
  const ruleProfile = resolveContentRuleProfile(ruleProfileId, topic)
  const systemPrompt = buildContentSystemPrompt(ruleProfile)
  const userPrompt = buildContentUserPrompt({
    action,
    compact: false,
    deepThinkingEnabled,
    note,
    ruleProfile,
    supplement,
    topic,
  })

  return executeContentLlmRequest({
    action,
    apiKey,
    assistantName: CONTENT_ASSISTANT_NAME,
    model,
    responseFormat: 'json_object',
    stage: action === 'revise' ? 'revise' : 'direct',
    systemPrompt,
    temperature: deepThinkingEnabled ? 0.35 : 0.2,
    thinkingType: deepThinkingEnabled ? 'enabled' : 'disabled',
    timeoutMs: 300000,
    topic,
    messages: [
      {
        role: 'user',
        content: userPrompt,
      },
    ],
  })
}

async function requestStructuredContentStage({
  action = 'initial',
  apiKey,
  assistantName = CONTENT_ASSISTANT_NAME,
  model,
  stage = 'draft',
  thinkingType = 'disabled',
  systemPrompt,
  temperature,
  timeoutMs = 300000,
  topic,
  userPrompt,
}) {
  return executeContentLlmRequest({
    action,
    apiKey,
    assistantName,
    model,
    responseFormat: 'json_object',
    stage,
    systemPrompt,
    temperature,
    thinkingType,
    timeoutMs,
    topic,
    messages: [
      {
        role: 'user',
        content: userPrompt,
      },
    ],
  })
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

function truncateTelemetryText(value, maxLength = 320) {
  if (typeof value !== 'string') {
    return ''
  }

  const trimmed = value.trim()

  if (!trimmed || trimmed.length <= maxLength) {
    return trimmed
  }

  return `${trimmed.slice(0, maxLength)}...`
}

function serializeTelemetryPayload(value) {
  if (typeof value === 'string') {
    return value
  }

  try {
    return JSON.stringify(value ?? null)
  } catch {
    return '[unserializable payload]'
  }
}

function readRequestMeta(result) {
  const requestMeta = result?._requestMeta && typeof result._requestMeta === 'object' ? result._requestMeta : {}
  return {
    baseUrl: typeof requestMeta.baseUrl === 'string' ? requestMeta.baseUrl : '',
    provider: typeof requestMeta.provider === 'string' ? requestMeta.provider : '',
    requestIdHeader: typeof requestMeta.requestIdHeader === 'string' ? requestMeta.requestIdHeader : '',
    responseId:
      typeof requestMeta.responseId === 'string' && requestMeta.responseId.trim()
        ? requestMeta.responseId.trim()
        : typeof result?.id === 'string'
          ? result.id.trim()
          : '',
    statusCode: Number.isFinite(requestMeta.statusCode) ? requestMeta.statusCode : null,
  }
}

function buildTopicTelemetry(topic) {
  if (!topic || typeof topic !== 'object') {
    return null
  }

  return {
    penName: typeof topic.penName === 'string' ? topic.penName : '',
    title: typeof topic.title === 'string' ? topic.title : '',
    type: typeof topic.type === 'string' ? topic.type : '',
  }
}

async function appendContentStageTelemetry(entry) {
  try {
    await appendContentLlmTelemetryEvent(entry)
  } catch {
    return null
  }

  return entry
}

function createContentTelemetryId() {
  return `content-llm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

async function executeContentLlmRequest({
  action = 'initial',
  apiKey,
  assistantName = CONTENT_ASSISTANT_NAME,
  messages = [],
  model,
  responseFormat = 'json_object',
  stage = 'direct',
  systemPrompt = '',
  temperature = 0.2,
  thinkingType = 'disabled',
  timeoutMs = 300000,
  topic,
}) {
  const requestStartedAt = Date.now()
  const startedAtIso = new Date(requestStartedAt).toISOString()
  const telemetryId = createContentTelemetryId()

  try {
    const result = await chatWithLlm({
      apiKey,
      assistantName,
      messages,
      model,
      responseFormat,
      systemPrompt,
      temperature,
      thinkingType,
      timeoutMs,
    })
    const requestFinishedAt = Date.now()
    const requestMeta = readRequestMeta(result)
    const telemetry = await appendContentStageTelemetry({
      action,
      elapsedMs: Math.max(0, requestFinishedAt - requestStartedAt),
      finishedAt: new Date(requestFinishedAt).toISOString(),
      id: telemetryId,
      messageCount: Array.isArray(messages) ? messages.length : 0,
      model: typeof result?.model === 'string' && result.model.trim() ? result.model.trim() : model,
      provider: requestMeta.provider,
      requestIdHeader: requestMeta.requestIdHeader,
      responseChars: normalizeTextContent(result?.choices?.[0]?.message?.content).length,
      responseId: requestMeta.responseId,
      stage,
      startedAt: startedAtIso,
      status: 'success',
      statusCode: requestMeta.statusCode,
      systemPromptChars: systemPrompt.length,
      temperature,
      thinkingType,
      timeoutMs,
      topic: buildTopicTelemetry(topic),
      usage: result?.usage ?? null,
      userPromptChars: Array.isArray(messages)
        ? messages.reduce((total, message) => total + normalizeTextContent(message?.content).length, 0)
        : 0,
      url: requestMeta.baseUrl,
    })

    return {
      ...result,
      llmTelemetry: telemetry,
    }
  } catch (error) {
    const requestFinishedAt = Date.now()
    const telemetry = await appendContentStageTelemetry({
      action,
      elapsedMs: Math.max(0, requestFinishedAt - requestStartedAt),
      errorMessage: truncateTelemetryText(error?.message || '内容创作请求失败'),
      errorPayload: truncateTelemetryText(serializeTelemetryPayload(error?.payload)),
      errorStatus: Number.isFinite(error?.status) ? error.status : null,
      finishedAt: new Date(requestFinishedAt).toISOString(),
      id: telemetryId,
      messageCount: Array.isArray(messages) ? messages.length : 0,
      model,
      provider: '',
      requestIdHeader: '',
      responseChars: 0,
      responseId: '',
      stage,
      startedAt: startedAtIso,
      status: 'error',
      statusCode: null,
      systemPromptChars: systemPrompt.length,
      temperature,
      thinkingType,
      timeoutMs,
      topic: buildTopicTelemetry(topic),
      usage: null,
      userPromptChars: Array.isArray(messages)
        ? messages.reduce((total, message) => total + normalizeTextContent(message?.content).length, 0)
        : 0,
      url: '',
    })

    if (telemetry) {
      error.llmTelemetry = [telemetry]
    }

    throw error
  }
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

function buildFallbackReport({ action, note = '', ruleProfile, supplement = '', topic }) {
  if (ruleProfile.id === 'B') {
    return [
      '# 详细校验报告',
      '',
      '## 结论',
      '',
      action === 'revise'
        ? '局部修改'
        : 'pass',
      '',
      '## 判定理由',
      '',
      action === 'revise'
        ? '本轮已经根据修改意见完成修订，建议继续核对真实性和结构随机性要求。'
        : `当前版本已经围绕《${topic?.title ?? '未命名文章'}》生成完成，可继续检查事实性与结构细节。`,
      '',
      '## 结构检查',
      '',
      '- 已生成完整正文，请重点检查开头钩子、中段转折、段落开头方式是否至少有两种变化。',
      '',
      '## 风格检查',
      '',
      `- 当前文案按 ${topic?.penName ?? '默认笔名'} 的口吻生成。`,
      supplement.trim() ? `- 已吸收补充要求：${supplement.trim()}` : '- 当前无额外补充要求。',
      '',
      '## AI腔词汇检查',
      '',
      '- 当前 fallback 报告未发现明显 AI 腔词，建议人工复核。',
      '',
      '## 硬性规则检查',
      '',
      '- 请重点复核赛道约束、破折号、省略号和固定结尾语。',
      '',
      '## 古文真实性核查',
      '',
      '- 当前 fallback 报告无法逐条给出古文核查结果，建议人工重点复核。',
      '',
      '## 可优化建议',
      '',
      note.trim()
        ? `- 可继续围绕“${note.trim()}”做下一轮精修。`
        : '- 如果需要更强情绪张力或更克制表达，可以继续补充修改意见。',
      '',
      '## AI 已处理动作',
      '',
      action === 'revise'
        ? `- 已执行一轮改稿，核心意见为：${note.trim() || '未提供具体意见'}。`
        : '- 已完成首稿生成并输出基础校验结果。',
    ].join('\n')
  }

  return [
    '# 详细校验报告',
    '',
    '## 结论',
    '',
    action === 'revise'
      ? '本轮已经根据修改意见完成重写，建议在右侧继续查看正文细节后再决定是否进入下一节点。'
      : `当前版本已经围绕《${topic?.title ?? '未命名文章'}》生成完成，可继续检查内容细节。`,
    '',
    '## 结构检查',
    '',
    '- 已生成完整正文，请重点检查开头钩子、中段转折和结尾收束是否符合预期。',
    '',
    '## 风格检查',
    '',
    `- 当前文案按 ${topic?.penName ?? '默认笔名'} 的口吻生成。`,
    supplement.trim() ? `- 已吸收补充要求：${supplement.trim()}` : '- 当前无额外补充要求。',
    '',
    '## 当前仍可优化的地方',
    '',
    note.trim() ? `- 可继续围绕“${note.trim()}”做下一轮精修。`
      : '- 如果需要更强情绪张力或更克制表达，可以继续补充修改意见。',
    '',
    '## AI 已处理动作',
    '',
    action === 'revise'
      ? `- 已执行一轮改稿，核心意见为：${note.trim() || '未提供具体意见'}。`
      : '- 已完成首稿生成并输出基础校验结果。',
  ].join('\n')
}

function buildFallbackSummary({ action, note = '' }) {
  if (action === 'revise') {
    return note.trim() ? `根据“${note.trim()}”完成重写。` : '已根据当前要求完成重写。'
  }

  return '初稿生成完成，可进入文字稿确认。'
}

function normalizeDraftMarkdown(content = '') {
  return typeof content === 'string' ? content.replace(/\r/g, '').trim() : ''
}

function validateDraftPlaceholderStructure(draftMarkdown = '') {
  const normalizedDraft = normalizeDraftMarkdown(draftMarkdown)
  const markerDetails = REQUIRED_DRAFT_PLACEHOLDERS.map((marker) => ({
    marker,
    count: normalizedDraft.split(marker).length - 1,
    index: normalizedDraft.indexOf(marker),
  }))
  const issues = []

  markerDetails.forEach((detail) => {
    if (detail.count === 0) {
      issues.push(`缺少 ${detail.marker}`)
    } else if (detail.count > 1) {
      issues.push(`${detail.marker} 出现了 ${detail.count} 次`)
    }
  })

  const indexes = markerDetails.map((detail) => detail.index)
  const hasOrderedMarkers =
    markerDetails.every((detail) => detail.count === 1 && detail.index >= 0) &&
    indexes.every((index, markerIndex) => markerIndex === 0 || index > indexes[markerIndex - 1])

  if (!hasOrderedMarkers) {
    issues.push('占位符顺序不正确，应为 [IMAGE_1] → [IMAGE_2] → [IMAGE_3] → [ENDING]')
  }

  return {
    issues,
    valid: issues.length === 0,
  }
}

function readSectionHeadingLine(markdown = '') {
  const normalized = normalizeDraftMarkdown(markdown)
  const match = normalized.match(/^##\s+(.+?)(?:\n|$)/)

  if (!match) {
    return null
  }

  return {
    bodyMarkdown: normalized.slice(match[0].length).trim(),
    title: match[1].trim(),
  }
}

function isOutroHeadingTitle(title = '') {
  return /(写在最后|写到最后|最后|结尾|结语|尾声|收尾)/.test(String(title).trim())
}

function parseStructuredDraftMarkdown(draftMarkdown = '') {
  const normalizedDraft = normalizeDraftMarkdown(draftMarkdown)
  const issues = []

  if (!normalizedDraft) {
    return {
      issues: ['正文为空'],
      valid: false,
    }
  }

  const titleMatch = normalizedDraft.match(/^#\s+(.+?)(?:\n|$)/)

  if (!titleMatch?.[1]?.trim()) {
    return {
      issues: ['缺少一级标题，固定骨架必须以 # 文章标题 开头'],
      valid: false,
    }
  }

  const articleTitle = titleMatch[1].trim()
  const bodyWithoutTitle = normalizedDraft.slice(titleMatch[0].length).trim()
  const blocks = bodyWithoutTitle
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block, index) => ({
      clean: block.replace(/\[IMAGE_[123]\]|\[ENDING\]/g, '').trim(),
      index,
      isDivider: /^([-*_]){3,}$/.test(block.replace(/\s/g, '')),
      isEndingMarker: block === '[ENDING]',
      isHeading: /^##\s+/.test(block.replace(/\[IMAGE_[123]\]|\[ENDING\]/g, '').trim()),
      isMarker: REQUIRED_DRAFT_PLACEHOLDERS.includes(block),
      raw: block,
    }))
  const headingIndices = blocks.filter((block) => block.isHeading).map((block) => block.index)
  const endingMarkerIndex = blocks.findIndex((block) => block.isEndingMarker)
  let outroHeadingIndex = -1
  let sectionHeadingIndices = []

  if (endingMarkerIndex >= 0) {
    const headingsAfterEnding = headingIndices.filter((index) => index > endingMarkerIndex)

    if (headingsAfterEnding.length !== 1) {
      issues.push('结尾结构无法稳定识别')
    }

    outroHeadingIndex = headingsAfterEnding[0] ?? -1
    sectionHeadingIndices = headingIndices.filter((index) => index < endingMarkerIndex)
  } else if (headingIndices.length >= 2) {
    const trailingHeading = readSectionHeadingLine(blocks[headingIndices[headingIndices.length - 1]]?.clean || '')

    if (isOutroHeadingTitle(trailingHeading?.title || '')) {
      outroHeadingIndex = headingIndices[headingIndices.length - 1]
      sectionHeadingIndices = headingIndices.slice(0, -1)
    } else {
      issues.push('结尾结构无法稳定识别')
      sectionHeadingIndices = headingIndices
    }
  } else {
    if (headingIndices.length === 0) {
      issues.push('主体标题无法稳定识别')
    }

    issues.push('结尾结构无法稳定识别')
  }

  if (sectionHeadingIndices.length === 0) {
    issues.push('主体标题无法稳定识别')
  }

  const introBoundaryIndex = sectionHeadingIndices[0] ?? outroHeadingIndex
  const introBody =
    introBoundaryIndex > 0
      ? blocks
          .slice(0, introBoundaryIndex)
          .filter((block) => !block.isDivider && !block.isMarker && block.clean)
          .map((block) => block.clean)
          .join('\n\n')
          .trim()
      : ''

  const sectionResults = sectionHeadingIndices.map((headingIndex) => {
    const nextHeadingIndex =
      sectionHeadingIndices.find((index) => index > headingIndex) ??
      (outroHeadingIndex > -1 ? outroHeadingIndex : blocks.length)
    const heading = readSectionHeadingLine(blocks[headingIndex]?.clean || '')

    if (!heading?.title) {
      return null
    }

    const bodyMarkdown = blocks
      .slice(headingIndex + 1, nextHeadingIndex)
      .filter((block) => !block.isDivider && !block.isMarker && block.clean)
      .map((block) => block.clean)
      .join('\n\n')
      .trim()

    return {
      bodyMarkdown,
      title: heading.title,
    }
  })

  const parsedOutro = outroHeadingIndex > -1 ? readSectionHeadingLine(blocks[outroHeadingIndex]?.clean || '') : null
  const endingBlocks =
    outroHeadingIndex > -1
      ? blocks
          .slice(outroHeadingIndex + 1)
          .filter((block) => !block.isDivider && !block.isMarker && block.clean)
          .map((block) => block.clean)
      : []

  if (!parsedOutro?.title) {
    issues.push('缺少结尾标题')
  }

  if (endingBlocks.length === 0) {
    issues.push('缺少结尾正文')
  }

  const blessing = endingBlocks.length > 1 ? endingBlocks[endingBlocks.length - 1] : ''
  const outroBody = (endingBlocks.length > 1 ? endingBlocks.slice(0, -1) : endingBlocks).join('\n\n').trim()

  return {
    articleTitle,
    blessing,
    introBody,
    issues: Array.from(new Set(issues)),
    outro: parsedOutro
      ? {
          bodyMarkdown: outroBody,
          title: parsedOutro.title,
        }
      : null,
    sections: sectionResults.filter(Boolean),
    valid: issues.length === 0 && sectionResults.filter(Boolean).length > 0 && Boolean(parsedOutro?.title) && Boolean(outroBody),
  }
}

function validateStructuredDraftMarkdown(draftMarkdown = '') {
  const parsed = parseStructuredDraftMarkdown(draftMarkdown)

  return {
    issues: Array.isArray(parsed?.issues) ? parsed.issues : [],
    valid: Boolean(parsed?.valid),
  }
}

function sanitizeDraftMarkdown(draftMarkdown, topic) {
  let nextDraft = draftMarkdown.trim()
  const adjustments = []

  if (nextDraft.includes('——')) {
    nextDraft = nextDraft.replace(/——+/g, '，')
    adjustments.push('已将正文中的破折号替换为逗号，避免违反硬性规则。')
  }

  let ellipsisCount = 0
  nextDraft = nextDraft.replace(/(\.{3,}|…{2,})/g, () => {
    ellipsisCount += 1
    if (ellipsisCount === 1) {
      return '……'
    }

    adjustments.push('已收敛多余省略号，避免超过一次。')
    return '。'
  })

  if (nextDraft.includes('▽')) {
    nextDraft = nextDraft.replace(/\n*\s*▽\s*/g, '\n\n').trim()
    adjustments.push('已移除正文中的 ▽ 分隔符，避免与固定模板重复。')
  }

  if (nextDraft.includes('点亮文末"爱心"') || nextDraft.includes('点亮文末“爱心”')) {
    nextDraft = nextDraft
      .replace(/\n*\s*点亮文末["“]爱心["”][\s\S]*?弘扬中华传统文化！?/g, '')
      .trim()
    adjustments.push('已移除正文里的固定关注引导语，改由模板统一渲染。')
  }

  if (/(?:^|\n)\s*作者：.*?来源：.*?(?=\n|$)/.test(nextDraft)) {
    nextDraft = nextDraft.replace(/(?:^|\n)\s*作者：.*?来源：.*?(?=\n|$)/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
    adjustments.push('已移除正文里的作者/来源信息，改由模板统一渲染。')
  }

  if (nextDraft.includes('长按识别二维码') || nextDraft.includes('关注我们')) {
    nextDraft = nextDraft
      .replace(/\n*\s*[▲△]?\s*长按识别二维码\s*关注我们\s*/g, '\n\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    adjustments.push('已移除正文里的二维码提示语，改由模板统一渲染。')
  }

  return {
    adjustments,
    draftMarkdown: nextDraft,
  }
}

function buildQualityCheckSection({ adjustments, draftMarkdown, ruleProfile, topic }) {
  const readableLength = countReadableLength(draftMarkdown)
  const bannedHits = ruleProfile.forbiddenAiPhrases.filter((phrase) => draftMarkdown.includes(phrase))
  const hasDash = draftMarkdown.includes('——')
  const placeholderCheck = validateDraftPlaceholderStructure(draftMarkdown)
  const structureCheck = validateStructuredDraftMarkdown(draftMarkdown)
  const withinTargetWordCount =
    readableLength >= CONTENT_TARGET_WORD_COUNT_RANGE.min && readableLength <= CONTENT_TARGET_WORD_COUNT_RANGE.max

  const lines = [
    '## 规则校验',
    '',
    `- 可读正文字数估算：约 ${readableLength} 字（目标范围：${CONTENT_TARGET_WORD_COUNT_RANGE.min}~${CONTENT_TARGET_WORD_COUNT_RANGE.max} 字，${withinTargetWordCount ? '当前在范围内' : '当前不在范围内'}）。`,
    `- 破折号检查：${hasDash ? '仍检测到破折号，建议人工复核。' : '通过。'}`,
    `- AI 腔词检查：${bannedHits.length === 0 ? '未发现明显禁用词。' : `发现 ${bannedHits.join('、')}。`}`,
    `- 固定模板占位符检查：${placeholderCheck.valid ? '通过。' : `未通过：${placeholderCheck.issues.join('；')}`}`,
    `- 固定 Markdown 骨架检查：${structureCheck.valid ? '通过。' : `未通过：${structureCheck.issues.join('；')}`}`,
    adjustments.length > 0 ? `- 程序兜底修正：${adjustments.join(' ')}` : '- 程序兜底修正：本轮未触发。',
  ]

  if (ruleProfile.id === 'B') {
    lines.splice(lines.length - 1, 0, '- 古文真实性核查：请以审核报告中的专项核查结果为准。')
  }

  return lines.join('\n')
}

function normalizeStageText(content) {
  return normalizeTextContent(content).trim()
}

function readStringField(parsed, fieldName, fallback = '') {
  return typeof parsed?.[fieldName] === 'string' && parsed[fieldName].trim() ? parsed[fieldName].trim() : fallback
}

function buildFallbackGeneratedTitle(topic) {
  return typeof topic?.title === 'string' ? topic.title.trim() : ''
}

function readLooseTitle(value) {
  if (typeof value === 'string') {
    return value.trim()
  }

  if (!value || typeof value !== 'object') {
    return ''
  }

  if (typeof value.title === 'string' && value.title.trim()) {
    return value.title.trim()
  }

  if (typeof value.text === 'string' && value.text.trim()) {
    return value.text.trim()
  }

  if (typeof value.content === 'string' && value.content.trim()) {
    return value.content.trim()
  }

  return ''
}

function readGeneratedTitle(parsed, topic) {
  const directTitle = readLooseTitle(parsed?.generatedTitle)

  if (directTitle) {
    return directTitle
  }

  const legacyCandidate = Array.isArray(parsed?.titleCandidates) ? parsed.titleCandidates[0] : null
  const legacyTitle = readLooseTitle(legacyCandidate)

  if (legacyTitle) {
    return legacyTitle
  }

  return buildFallbackGeneratedTitle(topic)
}

function normalizeRevisionDecision(value, fallback = 'pass') {
  if (typeof value !== 'string') {
    return fallback
  }

  const normalized = value.trim().toLowerCase()

  if (normalized === 'pass' || normalized === 'partial' || normalized === 'rewrite') {
    return normalized
  }

  if (normalized === '无需修改' || normalized === '通过') {
    return 'pass'
  }

  if (normalized === '局部修改' || normalized === '局部修订') {
    return 'partial'
  }

  if (normalized === '重写' || normalized === '整篇重写') {
    return 'rewrite'
  }

  return fallback
}

function createPipelineSteps(stepCount, startedAt) {
  return Array.from({ length: stepCount }, (_, index) => ({
    completedAt: null,
    elapsedMs: 0,
    startedAt: index === 0 ? startedAt : null,
    status: index === 0 ? 'running' : 'waiting',
  }))
}

function advancePipelineSteps(steps, currentIndex, movedAt) {
  return steps.map((step, stepIndex) => {
    if (stepIndex < currentIndex) {
      return step
    }

    if (stepIndex === currentIndex) {
      const startedAt = step.startedAt ?? movedAt

      return {
        ...step,
        completedAt: movedAt,
        elapsedMs: Math.max(0, movedAt - startedAt),
        startedAt,
        status: 'done',
      }
    }

    if (stepIndex === currentIndex + 1) {
      return {
        ...step,
        startedAt: step.startedAt ?? movedAt,
        status: 'running',
      }
    }

    return step
  })
}

function skipPipelineStep(steps, skippedIndex, movedAt) {
  return steps.map((step, stepIndex) => {
    if (stepIndex < skippedIndex) {
      return step
    }

    if (stepIndex === skippedIndex) {
      return {
        ...step,
        completedAt: movedAt,
        elapsedMs: 0,
        startedAt: null,
        status: 'skipped',
      }
    }

    if (stepIndex === skippedIndex + 1 && step.status === 'waiting') {
      return {
        ...step,
        startedAt: movedAt,
        status: 'running',
      }
    }

    return step
  })
}

function completePipelineSteps(steps, finishedAt) {
  return steps.map((step) => {
    if (step.status === 'done' || step.status === 'skipped') {
      return step
    }

    const startedAt = step.startedAt ?? finishedAt

    return {
      ...step,
      completedAt: finishedAt,
      elapsedMs: Math.max(0, finishedAt - startedAt),
      startedAt,
      status: 'done',
    }
  })
}

function clonePipelineSteps(steps) {
  return steps.map((step) => ({
    completedAt: step.completedAt,
    elapsedMs: step.elapsedMs,
    startedAt: step.startedAt,
    status: step.status,
  }))
}

async function requestDraftGenerationStage({
  apiKey,
  deepThinkingEnabled,
  model,
  ruleProfileId = DEFAULT_CONTENT_RULE_PROFILE_ID,
  supplement,
  topic,
}) {
  const ruleProfile = resolveContentRuleProfile(ruleProfileId, topic)
  const result = await requestStructuredContentStage({
    action: 'initial',
    apiKey,
    model,
    stage: 'draft',
    thinkingType: deepThinkingEnabled ? 'enabled' : 'disabled',
    systemPrompt: buildDraftGenerationSystemPrompt(ruleProfile),
    temperature: deepThinkingEnabled ? 0.35 : 0.2,
    topic,
    userPrompt: buildDraftGenerationUserPrompt({
      deepThinkingEnabled,
      ruleProfile,
      supplement,
      topic,
    }),
  })
  const rawContent = normalizeStageText(result?.choices?.[0]?.message?.content)
  const parsed = extractJsonObject(rawContent)

  return {
    draftMarkdown: readStringField(parsed, 'draftMarkdown', rawContent),
    llmTelemetry: result?.llmTelemetry ?? null,
    model: result?.model ?? model,
    rawContent,
    summary: readStringField(parsed, 'summary', '正文初稿生成完成。'),
    usage: result?.usage ?? null,
  }
}

async function requestDraftAuditStage({
  apiKey,
  deepThinkingEnabled,
  draftMarkdown,
  model,
  ruleProfileId = DEFAULT_CONTENT_RULE_PROFILE_ID,
  supplement,
  topic,
}) {
  const ruleProfile = resolveContentRuleProfile(ruleProfileId, topic)
  const result = await requestStructuredContentStage({
    action: 'initial',
    apiKey,
    model,
    stage: 'audit',
    thinkingType: deepThinkingEnabled ? 'enabled' : 'disabled',
    systemPrompt: buildDraftAuditSystemPrompt(ruleProfile),
    temperature: deepThinkingEnabled ? 0.2 : 0.1,
    topic,
    userPrompt: buildDraftAuditUserPrompt({
      deepThinkingEnabled,
      draftMarkdown,
      ruleProfile,
      supplement,
      topic,
    }),
  })
  const rawContent = normalizeStageText(result?.choices?.[0]?.message?.content)
  const parsed = extractJsonObject(rawContent)

  return {
    decision: normalizeRevisionDecision(parsed?.decision, 'pass'),
    model: result?.model ?? model,
    llmTelemetry: result?.llmTelemetry ?? null,
    rawContent,
    reportMarkdown: readStringField(
      parsed,
      'reportMarkdown',
      buildFallbackReport({ action: 'initial', ruleProfile, supplement, topic }),
    ),
    summary: readStringField(parsed, 'summary', '审核完成，已生成审核结果。'),
    generatedTitle: readGeneratedTitle(parsed, topic),
    usage: result?.usage ?? null,
  }
}

async function requestDraftRevisionStage({
  apiKey,
  decision,
  deepThinkingEnabled,
  draftMarkdown,
  model,
  reportMarkdown,
  ruleProfileId = DEFAULT_CONTENT_RULE_PROFILE_ID,
  supplement,
  topic,
}) {
  const ruleProfile = resolveContentRuleProfile(ruleProfileId, topic)
  const result = await requestStructuredContentStage({
    action: 'initial',
    apiKey,
    model,
    stage: 'revision',
    thinkingType: deepThinkingEnabled ? 'enabled' : 'disabled',
    systemPrompt: buildDraftRevisionSystemPrompt(ruleProfile),
    temperature: deepThinkingEnabled ? 0.32 : 0.18,
    topic,
    userPrompt: buildDraftRevisionUserPrompt({
      decision,
      deepThinkingEnabled,
      draftMarkdown,
      reportMarkdown,
      ruleProfile,
      supplement,
      topic,
    }),
  })
  const rawContent = normalizeStageText(result?.choices?.[0]?.message?.content)
  const parsed = extractJsonObject(rawContent)

  return {
    draftMarkdown: readStringField(parsed, 'draftMarkdown', draftMarkdown),
    generatedTitle: readGeneratedTitle(parsed, topic),
    llmTelemetry: result?.llmTelemetry ?? null,
    model: result?.model ?? model,
    rawContent,
    reportMarkdown: readStringField(parsed, 'reportMarkdown', reportMarkdown),
    summary: readStringField(parsed, 'summary', '自动修订完成，已生成最终版本。'),
    usage: result?.usage ?? null,
  }
}

export async function runInitialContentPipeline({
  apiKey,
  deepThinkingEnabled = true,
  model = DEFAULT_MODEL,
  ruleProfileId = DEFAULT_CONTENT_RULE_PROFILE_ID,
  supplement = '',
  topic,
  onProgress,
}) {
  const ruleProfile = resolveContentRuleProfile(ruleProfileId, topic)
  const startedAt = Date.now()
  const stepCount = 8
  let steps = createPipelineSteps(stepCount, startedAt)
  const stageTelemetry = []
  const stageUsages = []
  const stagePayloads = {}
  const pushProgress = () => {
    if (typeof onProgress === 'function') {
      onProgress({
        steps: clonePipelineSteps(steps),
      })
    }
  }
  const advance = (currentIndex) => {
    steps = advancePipelineSteps(steps, currentIndex, Date.now())
    pushProgress()
  }

  pushProgress()
  advance(0)
  advance(1)

  const generationStage = await requestDraftGenerationStage({
    apiKey,
    deepThinkingEnabled,
    model,
    ruleProfileId: ruleProfile.id,
    supplement,
    topic,
  })
  stageUsages.push({ stage: 'draft', usage: generationStage.usage ?? null })
  if (generationStage.llmTelemetry) {
    stageTelemetry.push(generationStage.llmTelemetry)
  }
  stagePayloads.generation = generationStage.rawContent

  const initialDraft = sanitizeDraftMarkdown(generationStage.draftMarkdown, topic)
  const initialPlaceholderCheck = validateDraftPlaceholderStructure(initialDraft.draftMarkdown)
  const initialStructureCheck = validateStructuredDraftMarkdown(initialDraft.draftMarkdown)
  advance(2)
  advance(3)

  const auditStage = await requestDraftAuditStage({
    apiKey,
    deepThinkingEnabled,
    draftMarkdown: initialDraft.draftMarkdown,
    model,
    ruleProfileId: ruleProfile.id,
    supplement,
    topic,
  })
  stageUsages.push({ stage: 'audit', usage: auditStage.usage ?? null })
  if (auditStage.llmTelemetry) {
    stageTelemetry.push(auditStage.llmTelemetry)
  }
  stagePayloads.audit = auditStage.rawContent

  advance(4)

  const decision = normalizeRevisionDecision(auditStage.decision, 'pass')
  let finalDraft = initialDraft
  let finalReportMarkdown = auditStage.reportMarkdown
  let finalSummary = auditStage.summary || generationStage.summary
  let finalGeneratedTitle = auditStage.generatedTitle

  advance(5)

  if (decision === 'pass') {
    steps = skipPipelineStep(steps, 6, Date.now())
    pushProgress()
  } else {
    const revisionStage = await requestDraftRevisionStage({
      apiKey,
      decision,
      deepThinkingEnabled,
      draftMarkdown: initialDraft.draftMarkdown,
      model,
      reportMarkdown: auditStage.reportMarkdown,
      ruleProfileId: ruleProfile.id,
      supplement,
      topic,
    })
    stageUsages.push({ stage: 'revision', usage: revisionStage.usage ?? null })
    if (revisionStage.llmTelemetry) {
      stageTelemetry.push(revisionStage.llmTelemetry)
    }
    stagePayloads.revision = revisionStage.rawContent

    finalDraft = sanitizeDraftMarkdown(revisionStage.draftMarkdown, topic)
    finalGeneratedTitle = revisionStage.generatedTitle
    finalReportMarkdown = revisionStage.reportMarkdown || auditStage.reportMarkdown
    finalSummary = revisionStage.summary || finalSummary

    advance(6)
  }

  const qualitySection = buildQualityCheckSection({
    adjustments: finalDraft.adjustments,
    draftMarkdown: finalDraft.draftMarkdown,
    ruleProfile,
    topic,
  })
  const finalPlaceholderCheck = validateDraftPlaceholderStructure(finalDraft.draftMarkdown)
  const finalStructureCheck = validateStructuredDraftMarkdown(finalDraft.draftMarkdown)
  const finishedAt = Date.now()
  steps = completePipelineSteps(steps, finishedAt)
  pushProgress()

  return {
    decision,
    draftMarkdown: finalDraft.draftMarkdown,
    model,
    rawContent: stagePayloads,
    reportMarkdown: `${(finalReportMarkdown || buildFallbackReport({ action: 'initial', ruleProfile, supplement, topic })).trim()}\n\n${
      !initialPlaceholderCheck.valid
        ? `## 固定模板结构检查\n\n- 首稿占位符结构未通过，已强制进入重写。\n- 问题：${initialPlaceholderCheck.issues.join('；')}\n\n`
        : ''
    }${
      !initialStructureCheck.valid
        ? `## 固定 Markdown 骨架检查\n\n- 首稿骨架未通过，已强制进入重写。\n- 问题：${initialStructureCheck.issues.join('；')}\n\n`
        : ''
    }${
      !finalPlaceholderCheck.valid
        ? `## 固定模板结构结果\n\n- 最终正文仍未完全符合固定模板要求。\n- 问题：${finalPlaceholderCheck.issues.join('；')}\n\n`
        : ''
    }${
      !finalStructureCheck.valid
        ? `## 固定 Markdown 骨架结果\n\n- 最终正文仍未完全符合固定骨架要求。\n- 问题：${finalStructureCheck.issues.join('；')}\n\n`
        : ''
    }${qualitySection}`,
    ruleProfileId: ruleProfile.id,
    ruleProfileLabel: ruleProfile.label,
    summary: (
      !finalStructureCheck.valid
        ? '正文已生成，但当前结构存在兼容问题，进入排版前建议先复核。'
        : !finalPlaceholderCheck.valid
          ? '正文已生成，但图片占位符结构存在问题，排版前建议先复核。'
          : finalSummary || generationStage.summary || '首版稿件已经准备完成。'
    ).trim(),
    generatedTitle: finalGeneratedTitle || buildFallbackGeneratedTitle(topic),
    llmTelemetry: stageTelemetry,
    provider: stageTelemetry[0]?.provider || '',
    usage: stageUsages,
  }
}

export async function generateContentDraft({
  action = 'initial',
  apiKey,
  deepThinkingEnabled = true,
  model = DEFAULT_MODEL,
  note = '',
  ruleProfileId = DEFAULT_CONTENT_RULE_PROFILE_ID,
  supplement = '',
  topic,
}) {
  const ruleProfile = resolveContentRuleProfile(ruleProfileId)
  const result = await requestContentGeneration({
    action,
    apiKey,
    deepThinkingEnabled,
    model,
    note,
    ruleProfileId: ruleProfile.id,
    supplement,
    topic,
  })

  const rawContent = normalizeTextContent(result?.choices?.[0]?.message?.content)
  const parsed = extractJsonObject(rawContent)
  const draftMarkdown =
    typeof parsed?.draftMarkdown === 'string' && parsed.draftMarkdown.trim()
      ? parsed.draftMarkdown.trim()
      : rawContent.trim()
  const reportMarkdown =
    typeof parsed?.reportMarkdown === 'string' && parsed.reportMarkdown.trim()
      ? parsed.reportMarkdown.trim()
      : buildFallbackReport({ action, note, ruleProfile, supplement, topic })
  const sanitized = sanitizeDraftMarkdown(draftMarkdown, topic)
  const placeholderCheck = validateDraftPlaceholderStructure(sanitized.draftMarkdown)
  const structureCheck = validateStructuredDraftMarkdown(sanitized.draftMarkdown)
  const qualitySection = buildQualityCheckSection({
    adjustments: sanitized.adjustments,
    draftMarkdown: sanitized.draftMarkdown,
    ruleProfile,
    topic,
  })
  const summary =
    typeof parsed?.summary === 'string' && parsed.summary.trim()
      ? parsed.summary.trim()
      : buildFallbackSummary({ action, note })
  const generatedTitle = readGeneratedTitle(parsed, topic)

  if (!sanitized.draftMarkdown) {
    const error = new Error('当前模型没有返回可用的正文内容')
    error.status = 502
    throw error
  }

  return {
    draftMarkdown: sanitized.draftMarkdown,
    llmTelemetry: result?.llmTelemetry ? [result.llmTelemetry] : [],
    model: result?.model ?? model,
    provider: result?.llmTelemetry?.provider || '',
    rawContent,
    reportMarkdown: `${reportMarkdown}\n\n${
      placeholderCheck.valid
        ? ''
        : `## 固定模板结构检查\n\n- 当前正文未完全符合固定模板要求。\n- 问题：${placeholderCheck.issues.join('；')}\n\n`
    }${
      structureCheck.valid
        ? ''
        : `## 固定 Markdown 骨架检查\n\n- 当前正文未完全符合固定骨架要求。\n- 问题：${structureCheck.issues.join('；')}\n\n`
    }${qualitySection}`,
    ruleProfileId: ruleProfile.id,
    ruleProfileLabel: ruleProfile.label,
    summary: structureCheck.valid
      ? placeholderCheck.valid
        ? summary
        : '正文已生成，但图片占位符结构存在问题，排版前建议先复核。'
      : '正文已生成，但当前结构存在兼容问题，进入排版前建议先复核。',
    generatedTitle,
    usage: result?.usage ?? null,
  }
}
