import { chatWithMiniMax } from './minimax.js'

const DEFAULT_MODEL = 'MiniMax-M2.7'
const CONTENT_ASSISTANT_NAME = '内容创作助手'
const WRITING_RULES_SUMMARY = [
  '账号：煮酒问人生。',
  '所有文章都必须严格遵守：不写娱乐八卦、游戏、科技、财经等偏赛道内容。',
  '句子尽量短，多用句号断句，多用排比或对比，避免长句和空话。',
  '古文引用格式必须统一为《书名》有言："......"或《书名》有云："......"，且引用必须真实存在，引用后必须有白话解释。',
  '故事必须有名有姓、有具体地点、有具体细节、有对话、有转折、有结果，并且要有打中情绪的那一刻。',
  '禁止使用破折号（——）。禁止省略号超过一次。',
  '禁止使用这些 AI 腔词汇：总的来说、综上所述、值得注意的是、不得不说、毋庸置疑、显而易见、由此可见、总而言之、在某种程度上、不仅如此。',
  '禁止直接说教，道理必须藏在故事里。禁止在正文里出现第一人称“我”。',
].join('\n')
const MINGYUAN_STYLE_SUMMARY = [
  '明远：见过是非、说话直接的长者口吻，直接、有力、不拖泥带水。',
  '更适合历史人物、真实名人、官员、文人、商人或冲突更强的故事。',
  '喜欢短句和长句交替，关键结论可以单独成段。',
  '喜欢对比结构、反问句和像锤子落地一样的总结句。',
  '结尾要把结论讲透，行动感更强，不能温吞，也不能太含蓄。',
  '禁止整篇都写成细腻轻声讲述。禁止主角一直软弱无反击。',
].join('\n')
const ZHIRUO_STYLE_SUMMARY = [
  '芷若：经历过生活起伏的中年女性口吻，温柔、细腻、有温度，但不软弱。',
  '更适合普通人主角，尤其是古代、民国背景的小人物。',
  '喜欢短句，一句话一个呼吸。情绪推进时句子越来越短。',
  '喜欢用物件承载情感，并在结尾形成细节回环。',
  '结尾点到为止，不直接说教，道理藏在一个让人鼻酸的瞬间里。',
  '禁止激烈喊话式语气。禁止励志鸡汤式结尾。禁止人物过于完美。',
].join('\n')
const FORBIDDEN_AI_PHRASES = [
  '总的来说',
  '综上所述',
  '值得注意的是',
  '不得不说',
  '毋庸置疑',
  '显而易见',
  '由此可见',
  '总而言之',
  '在某种程度上',
  '不仅如此',
]

function buildContentSystemPrompt() {
  return [
    '你是一个中文公众号内容创作助手，负责生成文章正文和详细校验报告。',
    '你必须严格围绕用户给出的选题、文章类型、笔名口吻、补充要求和修改意见来输出。',
    '正文必须使用 Markdown，适合公众号长文阅读，语言要自然、克制、有人味，避免 AI 套话。',
    '校验报告必须是 Markdown，并包含以下结构：结论、结构检查、风格检查、当前仍可优化的地方、AI 已处理动作。',
    '校验报告优先使用规范 Markdown 结构：二级标题、简洁列表；涉及逐项对照时使用 Markdown 表格，表头尽量简短。',
    '你收到的写作结构规范和笔名风格规范都属于硬性约束，优先级高于泛化写作习惯。',
    '如果标题、结构、口吻与规范冲突，必须优先修正到符合规范。',
    '你的最终回复必须是一个 JSON 对象，且只输出 JSON，不要使用代码块，不要添加额外解释。',
    'JSON 必须包含 draftMarkdown、reportMarkdown、summary 三个字符串字段。',
  ].join('\n')
}

function getPenStyleDoc(penName) {
  return penName === '明远' ? MINGYUAN_STYLE_SUMMARY : ZHIRUO_STYLE_SUMMARY
}

function buildTypeExecutionNotes(type) {
  if (type === 'A型') {
    return [
      'A型执行重点：',
      '- 开篇必须用名人名言起手，再点痛点，再引出主题。',
      '- 正文要有 2 到 3 个循环体，每个循环体都要有小标题、古文、论述、故事、古文收尾。',
      '- 结尾必须出现单独一行的 ▽，并使用固定结尾语。',
      '- 总字数控制在 1800 到 2000 字。',
    ].join('\n')
  }

  if (type === 'B型') {
    return [
      'B型执行重点：',
      '- 标题必须包含明确数字，整篇必须是清单式结构。',
      '- 开篇先用生活场景切入，再自然引出今天要聊的 3 件事、3 句话或 3 个方法。',
      '- 正文固定写三点，每一点都要有古文或俗语、故事、可操作的道理收尾。',
      '- 结尾必须使用固定结尾语。',
      '- 总字数控制在 1500 到 1800 字。',
    ].join('\n')
  }

  if (type === 'C型') {
    return [
      'C型执行重点：',
      '- 开篇必须是具体热点事件，不空泛，不评论热点本身。',
      '- 正文写三层普世道理，每层都要有古文、案例或故事支撑。',
      '- 结尾必须是行动召唤，不使用祈愿句。',
      '- 总字数控制在 1800 到 2000 字。',
    ].join('\n')
  }

  return '未识别文章类型时，默认按给定标题和笔名风格写出最贴近规范的文章。'
}

function buildPenExecutionNotes(penName) {
  if (penName === '明远') {
    return [
      '明远执行重点：',
      '- 语气直接、有力、带穿透力，但不粗鲁。',
      '- 更适合历史人物、真实名人或冲突更强的故事。',
      '- 结尾不能太含蓄，要把结论说透，说出行动感。',
    ].join('\n')
  }

  return [
    '芷若执行重点：',
    '- 语气温柔、细腻、克制，不要用强硬喊话式表达。',
    '- 以普通人为主角，细节要有物件感和回环。',
    '- 道理藏在故事里，结尾点到为止，不说教。',
  ].join('\n')
}

function buildCompactRuleChecklist(topic) {
  const rules = [
    '硬性规则：',
    '- 正文必须是中文 Markdown，适合公众号阅读。',
    '- 不要使用破折号（——）。省略号最多一次。',
    `- 不要出现这些 AI 腔词：${FORBIDDEN_AI_PHRASES.join('、')}。`,
    '- 古文引用必须真实，格式统一为《书名》有言："......"或《书名》有云："......"，并在引用后做白话解释。',
    '- 故事必须有名有姓、有地点、有细节、有对话、有转折、有结果。',
    '- 不要直接说教，不要在正文出现第一人称“我”。',
  ]

  if (topic?.type === 'A型' || topic?.type === 'B型') {
    rules.push('- 结尾必须包含▽和固定结尾语：点亮文末"爱心"，愿[祈愿内容]。转发分享，弘扬中华传统文化！')
  }

  return rules.join('\n')
}

function buildSharedContentContextLines({ action, compact = false, deepThinkingEnabled, note = '', supplement = '', topic }) {
  const taskLabel = action === 'revise' ? '根据修改意见重写当前文章' : '生成第一版文章'
  const modeLabel = deepThinkingEnabled ? '深度模式' : '标准模式'
  const ruleBlock = compact
    ? buildCompactRuleChecklist(topic)
    : [
        '基础结构规范摘要：',
        WRITING_RULES_SUMMARY,
        '',
        `当前笔名风格摘要（${topic?.penName ?? '未指定'}）：`,
        getPenStyleDoc(topic?.penName),
      ].join('\n')

  return [
    `任务：${taskLabel}`,
    `推理模式：${modeLabel}`,
    '',
    '创作要求：',
    `- 选题标题：${topic?.title ?? '未提供'}`,
    `- 文章类型：${topic?.type ?? '未提供'}`,
    `- 笔名口吻：${topic?.penName ?? '未提供'}`,
    `- 推荐理由：${topic?.reason ?? '无'}`,
    `- 补充要求：${supplement.trim() || '无'}`,
    `- 修改意见：${note.trim() || '无'}`,
    '',
    buildTypeExecutionNotes(topic?.type),
    '',
    buildPenExecutionNotes(topic?.penName),
    '',
    ruleBlock,
  ]
}

function buildContentUserPrompt({ action, compact = false, deepThinkingEnabled, note = '', supplement = '', topic }) {
  return [
    ...buildSharedContentContextLines({
      action,
      compact,
      deepThinkingEnabled,
      note,
      supplement,
      topic,
    }),
    '',
    '输出要求：',
    '- draftMarkdown：直接可读的公众号正文 Markdown，允许使用一级标题、引用、段落、小标题、列表。',
    '- reportMarkdown：详细校验报告 Markdown，按“结论 / 结构检查 / 风格检查 / 当前仍可优化的地方 / AI 已处理动作”输出。',
    '- reportMarkdown 优先使用二级标题、列表和表格，不要输出大段没有层级的纯文本。',
    '- summary：一句适合展示在工作流里的简短总结。',
    '',
    '如果是首稿，请直接给出完整正文与完整报告。',
    '如果是改稿，请优先做局部优化；只有在修改意见明确要求结构重写时，才做较大幅度重构。',
    '',
    '再次提醒：只返回 JSON 对象本身，不要加 ```json 代码块。',
  ].join('\n')
}

function buildDraftGenerationSystemPrompt() {
  return [
    '你是一个中文公众号写稿助手，只负责输出正文草稿。',
    '你必须严格遵守用户提供的选题、类型、笔名口吻和硬性规则。',
    '正文必须是自然、克制、有人味的中文 Markdown，不要夹带解释，不要输出报告。',
    '你的最终回复必须是一个 JSON 对象，且只输出 JSON，不要使用代码块。',
    'JSON 必须包含 draftMarkdown、summary 两个字符串字段。',
  ].join('\n')
}

function buildDraftGenerationUserPrompt({ deepThinkingEnabled, supplement = '', topic }) {
  return [
    ...buildSharedContentContextLines({
      action: 'initial',
      compact: false,
      deepThinkingEnabled,
      note: '',
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

function buildDraftAuditSystemPrompt() {
  return [
    '你是一个中文公众号内容审核助手，只负责审核文章并决定是否需要自动修订。',
    '你必须严格依据选题要求、结构规则、笔名风格和硬性写作规范来审核。',
    '你的最终回复必须是一个 JSON 对象，且只输出 JSON，不要使用代码块。',
    'JSON 必须包含 reportMarkdown、decision、summary 三个字段。',
    'decision 只能是 pass、partial、rewrite 三个值之一。',
    '当文章整体可用时返回 pass；需要局部修改时返回 partial；结构方向明显不对时返回 rewrite。',
  ].join('\n')
}

function buildDraftAuditUserPrompt({ deepThinkingEnabled, draftMarkdown = '', supplement = '', topic }) {
  return [
    ...buildSharedContentContextLines({
      action: 'initial',
      compact: true,
      deepThinkingEnabled,
      note: '',
      supplement,
      topic,
    }),
    '',
    '待审核正文：',
    draftMarkdown.trim(),
    '',
    '输出要求：',
    '- reportMarkdown：详细校验报告 Markdown，按“结论 / 结构检查 / 风格检查 / 当前仍可优化的地方 / AI 已处理动作”输出。',
    '- reportMarkdown 优先使用二级标题、列表和表格，不要输出大段没有层级的纯文本。',
    '- decision：只能输出 pass / partial / rewrite 其中一个。',
    '- summary：一句适合展示在工作流里的简短总结。',
    '',
    '再次提醒：只返回 JSON 对象本身，不要加 ```json 代码块。',
  ].join('\n')
}

function buildDraftRevisionSystemPrompt() {
  return [
    '你是一个中文公众号内容修订助手，负责根据审核结果自动修订正文并给出最终可展示的审核报告。',
    '你必须严格遵守选题、类型、笔名口吻和硬性写作规则。',
    '修订时优先按审核结论执行：partial 做局部修订，rewrite 做整篇重构。',
    '你的最终回复必须是一个 JSON 对象，且只输出 JSON，不要使用代码块。',
    'JSON 必须包含 draftMarkdown、reportMarkdown、summary 三个字符串字段。',
  ].join('\n')
}

function buildDraftRevisionUserPrompt({
  decision = 'partial',
  deepThinkingEnabled,
  draftMarkdown = '',
  reportMarkdown = '',
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
    '- summary：一句适合展示在工作流里的简短总结。',
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
  supplement,
  topic,
}) {
  return chatWithMiniMax({
    apiKey,
    assistantName: CONTENT_ASSISTANT_NAME,
    model,
    systemPrompt: buildContentSystemPrompt(),
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

function buildFallbackReport({ action, note = '', supplement = '', topic }) {
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

function buildQualityCheckSection({ adjustments, draftMarkdown, topic }) {
  const readableLength = countReadableLength(draftMarkdown)
  const bannedHits = FORBIDDEN_AI_PHRASES.filter((phrase) => draftMarkdown.includes(phrase))
  const hasDash = draftMarkdown.includes('——')
  const fixedEndingOk =
    topic?.type === 'A型' || topic?.type === 'B型'
      ? draftMarkdown.includes('点亮文末"爱心"')
      : true

  return [
    '## 规则校验',
    '',
    `- 字数估算：约 ${readableLength} 字。`,
    `- 破折号检查：${hasDash ? '仍检测到破折号，建议人工复核。' : '通过。'}`,
    `- AI 腔词检查：${bannedHits.length === 0 ? '未发现明显禁用词。' : `发现 ${bannedHits.join('、')}。`}`,
    `- 固定结尾语检查：${fixedEndingOk ? '通过。' : '未通过，建议补齐。'}`,
    adjustments.length > 0 ? `- 程序兜底修正：${adjustments.join(' ')}` : '- 程序兜底修正：本轮未触发。',
  ].join('\n')
}

function normalizeStageText(content) {
  return normalizeTextContent(content).trim()
}

function readStringField(parsed, fieldName, fallback = '') {
  return typeof parsed?.[fieldName] === 'string' && parsed[fieldName].trim() ? parsed[fieldName].trim() : fallback
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

async function requestDraftGenerationStage({ apiKey, deepThinkingEnabled, model, supplement, topic }) {
  const result = await requestStructuredContentStage({
    apiKey,
    model,
    systemPrompt: buildDraftGenerationSystemPrompt(),
    temperature: deepThinkingEnabled ? 0.35 : 0.2,
    userPrompt: buildDraftGenerationUserPrompt({
      deepThinkingEnabled,
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

async function requestDraftAuditStage({ apiKey, deepThinkingEnabled, draftMarkdown, model, supplement, topic }) {
  const result = await requestStructuredContentStage({
    apiKey,
    model,
    systemPrompt: buildDraftAuditSystemPrompt(),
    temperature: deepThinkingEnabled ? 0.2 : 0.1,
    userPrompt: buildDraftAuditUserPrompt({
      deepThinkingEnabled,
      draftMarkdown,
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
    reportMarkdown: readStringField(parsed, 'reportMarkdown', buildFallbackReport({ action: 'initial', supplement, topic })),
    summary: readStringField(parsed, 'summary', '审核完成，已生成审核结果。'),
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
  supplement,
  topic,
}) {
  const result = await requestStructuredContentStage({
    apiKey,
    model,
    systemPrompt: buildDraftRevisionSystemPrompt(),
    temperature: deepThinkingEnabled ? 0.32 : 0.18,
    userPrompt: buildDraftRevisionUserPrompt({
      decision,
      deepThinkingEnabled,
      draftMarkdown,
      reportMarkdown,
      supplement,
      topic,
    }),
  })
  const rawContent = normalizeStageText(result?.choices?.[0]?.message?.content)
  const parsed = extractJsonObject(rawContent)

  return {
    draftMarkdown: readStringField(parsed, 'draftMarkdown', draftMarkdown),
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
  supplement = '',
  topic,
  onProgress,
}) {
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
      supplement,
      topic,
    })
    stageUsages.push({ stage: 'revision', usage: revisionStage.usage ?? null })
    stagePayloads.revision = revisionStage.rawContent

    finalDraft = sanitizeDraftMarkdown(revisionStage.draftMarkdown, topic)
    finalReportMarkdown = revisionStage.reportMarkdown || auditStage.reportMarkdown
    finalSummary = revisionStage.summary || finalSummary

    advance(6)
  }

  const qualitySection = buildQualityCheckSection({
    adjustments: finalDraft.adjustments,
    draftMarkdown: finalDraft.draftMarkdown,
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
    reportMarkdown: `${(finalReportMarkdown || buildFallbackReport({ action: 'initial', supplement, topic })).trim()}\n\n${qualitySection}`,
    summary: (finalSummary || generationStage.summary || '首版稿件已经准备完成。').trim(),
    usage: stageUsages,
  }
}

export async function generateContentDraft({
  action = 'initial',
  apiKey,
  deepThinkingEnabled = true,
  model = DEFAULT_MODEL,
  note = '',
  supplement = '',
  topic,
}) {
  const result = await requestContentGeneration({
    action,
    apiKey,
    deepThinkingEnabled,
    model,
    note,
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
      : buildFallbackReport({ action, note, supplement, topic })
  const sanitized = sanitizeDraftMarkdown(draftMarkdown, topic)
  const qualitySection = buildQualityCheckSection({
    adjustments: sanitized.adjustments,
    draftMarkdown: sanitized.draftMarkdown,
    topic,
  })
  const summary =
    typeof parsed?.summary === 'string' && parsed.summary.trim()
      ? parsed.summary.trim()
      : buildFallbackSummary({ action, note })

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
    summary,
    usage: result?.usage ?? null,
  }
}
