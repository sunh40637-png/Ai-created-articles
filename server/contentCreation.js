import { chatWithMiniMax } from './minimax.js'
import {
  DEFAULT_CONTENT_RULE_PROFILE_ID,
  resolveContentRuleProfile,
} from './contentRuleProfiles.js'

const DEFAULT_MODEL = 'MiniMax-M2.7'
const CONTENT_ASSISTANT_NAME = '内容创作助手'

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

  return chatWithMiniMax({
    apiKey,
    assistantName: CONTENT_ASSISTANT_NAME,
    model,
    systemPrompt: buildContentSystemPrompt(ruleProfile),
    temperature: deepThinkingEnabled ? 0.35 : 0.2,
    timeoutMs: 300000,
    messages: [
      {
        role: 'user',
        content: buildContentUserPrompt({
          action,
          compact: false,
          deepThinkingEnabled,
          note,
          ruleProfile,
          supplement,
          topic,
        }),
      },
    ],
  })
}

async function requestStructuredContentStage({
  apiKey,
  assistantName = CONTENT_ASSISTANT_NAME,
  model,
  systemPrompt,
  temperature,
  timeoutMs = 300000,
  userPrompt,
}) {
  return chatWithMiniMax({
    apiKey,
    assistantName,
    model,
    systemPrompt,
    temperature,
    timeoutMs,
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

function countReadableLength(content = '') {
  return content
    .replace(/[#>*`\-\[\]\(\)\|]/g, '')
    .replace(/\s+/g, '')
    .trim().length
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

  const requiresFixedEnding = topic?.type === 'A型' || topic?.type === 'B型'

  if (requiresFixedEnding && !nextDraft.includes('点亮文末"爱心"')) {
    nextDraft = [
      nextDraft,
      '',
      '▽',
      '',
      '点亮文末"爱心"，愿你往后有光，心里有暖，脚下有路。转发分享，弘扬中华传统文化！',
    ].join('\n')
    adjustments.push('已自动补齐固定结尾语。')
  } else if (topic?.type === 'A型' && !nextDraft.includes('\n▽\n')) {
    nextDraft = `${nextDraft}\n\n▽`
    adjustments.push('已补齐 A 型文章要求的分割线。')
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
  const fixedEndingOk =
    topic?.type === 'A型' || topic?.type === 'B型'
      ? draftMarkdown.includes('点亮文末"爱心"')
      : true

  const lines = [
    '## 规则校验',
    '',
    `- 字数估算：约 ${readableLength} 字。`,
    `- 破折号检查：${hasDash ? '仍检测到破折号，建议人工复核。' : '通过。'}`,
    `- AI 腔词检查：${bannedHits.length === 0 ? '未发现明显禁用词。' : `发现 ${bannedHits.join('、')}。`}`,
    `- 固定结尾语检查：${fixedEndingOk ? '通过。' : '未通过，建议补齐。'}`,
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
    apiKey,
    model,
    systemPrompt: buildDraftGenerationSystemPrompt(ruleProfile),
    temperature: deepThinkingEnabled ? 0.35 : 0.2,
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
    apiKey,
    model,
    systemPrompt: buildDraftAuditSystemPrompt(ruleProfile),
    temperature: deepThinkingEnabled ? 0.2 : 0.1,
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
    apiKey,
    model,
    systemPrompt: buildDraftRevisionSystemPrompt(ruleProfile),
    temperature: deepThinkingEnabled ? 0.32 : 0.18,
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
  stagePayloads.generation = generationStage.rawContent

  const initialDraft = sanitizeDraftMarkdown(generationStage.draftMarkdown, topic)
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
  const finishedAt = Date.now()
  steps = completePipelineSteps(steps, finishedAt)
  pushProgress()

  return {
    decision,
    draftMarkdown: finalDraft.draftMarkdown,
    model,
    rawContent: stagePayloads,
    reportMarkdown: `${(finalReportMarkdown || buildFallbackReport({ action: 'initial', ruleProfile, supplement, topic })).trim()}\n\n${qualitySection}`,
    ruleProfileId: ruleProfile.id,
    ruleProfileLabel: ruleProfile.label,
    summary: (finalSummary || generationStage.summary || '首版稿件已经准备完成。').trim(),
    generatedTitle: finalGeneratedTitle || buildFallbackGeneratedTitle(topic),
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
    const error = new Error('MiniMax 没有返回可用的正文内容')
    error.status = 502
    throw error
  }

  return {
    draftMarkdown: sanitized.draftMarkdown,
    model: result?.model ?? model,
    rawContent,
    reportMarkdown: `${reportMarkdown}\n\n${qualitySection}`,
    ruleProfileId: ruleProfile.id,
    ruleProfileLabel: ruleProfile.label,
    summary,
    generatedTitle,
    usage: result?.usage ?? null,
  }
}
