import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowUp,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileText,
  History,
  LibraryBig,
  LayoutTemplate,
  ListFilter,
  LoaderCircle,
  Maximize2,
  MessageSquareText,
  Minimize2,
  Monitor,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Paperclip,
  Plus,
  ScrollText,
  Search,
  Smartphone,
  Trash2,
  X,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import {
  CONTENT_TOPIC_LIBRARY,
  createTopicRecommendations,
  getTopicById,
  getTopicStatusMap,
  getTopicRecommendationPageCount,
  TOPIC_LIBRARY_TYPES,
  useBenchmarkStore,
} from '@/stores/useBenchmarkStore.js'

const reasoningModel = 'MiniMax-M2.7 深度模式'
const highspeedModel = 'MiniMax-M2.7 标准模式'
const LEFT_PANE_MIN_WIDTH = 640
const RIGHT_PANE_MIN_WIDTH = 540
const FLOW_STEP_MIN_MS = 420
const FLOW_STEP_MAX_MS = 1100
const FLOW_STEP_RATIO_MS = 160
const CONTENT_FLOW_UI_PREVIEW = false
const INITIAL_DRAFT_FLOW_TITLE = '正在准备首版稿件'
const INITIAL_DRAFT_FLOW_SUMMARY = '正在完成从接收选题到首版稿件准备的处理流程。'
const INITIAL_DRAFT_FLOW_INTRO_MESSAGE =
  '已接收这个选题，正在生成首版稿件。系统会依次完成正文起草、内容审核和自动修订，处理完成后再把正文和校验报告展示在右侧。'
const INITIAL_DRAFT_FLOW_STEPS = [
  { label: '接收选题', seconds: 1 },
  { label: '整理写作要求', seconds: 2 },
  { label: '生成正文初稿', seconds: 16 },
  { label: '开始内容审核', seconds: 8 },
  { label: '输出审核结果', seconds: 10 },
  { label: '判定修改方式', seconds: 2 },
  { label: '自动修订内容', seconds: 6 },
  { label: '呈现首版稿件', seconds: 1 },
]

const quickMessageItems = [
  {
    id: 'tighten-title',
    label: '标题再收紧一点',
    disabled: false,
  },
  {
    id: 'stronger-opening',
    label: '开头再拉高情绪密度',
    disabled: false,
  },
  {
    id: 'less-preachy',
    label: '结尾别太说教，克制一点',
    disabled: false,
  },
  {
    id: 'story-detail',
    label: '把人物细节和转折写具体',
    disabled: false,
  },
]

const stageOrder = [
  { id: 'topic', label: '选题确认' },
  { id: 'draft', label: '文字稿确认' },
  { id: 'preview', label: '排版效果确认' },
]

const workbenchTabs = [
  { id: 'draft', label: '文字稿', icon: FileText },
  { id: 'report', label: '校验报告', icon: ScrollText },
  { id: 'preview', label: '排版预览', icon: LayoutTemplate },
  { id: 'versions', label: '版本记录', icon: History },
]

const sidebarModules = [
  { id: 'library', label: '选题库', icon: LibraryBig },
]

const topicLibraryItems = CONTENT_TOPIC_LIBRARY

const TOPIC_STATUS_META = {
  completed: {
    label: '已创作',
    className: 'border border-emerald-200/80 bg-emerald-50 text-emerald-700',
  },
  'in-progress': {
    label: '创作中',
    className: 'border border-amber-200/80 bg-amber-50 text-amber-700',
  },
  pending: {
    label: '待创作',
    className: 'bg-secondary text-muted-foreground',
  },
}

const markdownComponents = {
  h1: ({ node, ...props }) => <h1 className="mb-4 text-[22px] font-semibold leading-[1.45]" {...props} />,
  h2: ({ node, ...props }) => <h2 className="mb-3 text-[19px] font-semibold leading-[1.45]" {...props} />,
  h3: ({ node, ...props }) => <h3 className="mb-2 text-[17px] font-semibold leading-[1.45]" {...props} />,
  p: ({ node, ...props }) => <p className="mb-4 leading-[1.8] text-[15px] last:mb-0" {...props} />,
  ul: ({ node, ...props }) => <ul className="mb-4 list-disc pl-5 leading-[1.8]" {...props} />,
  ol: ({ node, ...props }) => <ol className="mb-4 list-decimal pl-5 leading-[1.8]" {...props} />,
  li: ({ node, ...props }) => <li className="mb-1.5" {...props} />,
  strong: ({ node, ...props }) => <strong className="font-semibold" {...props} />,
  blockquote: ({ node, ...props }) => (
    <blockquote className="mb-4 rounded-r-2xl border-l-2 border-primary/35 bg-primary/5 px-4 py-3 text-[14px]" {...props} />
  ),
}

const draftMarkdownComponents = {
  h1: ({ node, ...props }) => (
    <h1 className="mb-7 text-[24px] font-semibold leading-[1.42] tracking-[-0.035em] text-foreground" {...props} />
  ),
  h2: ({ node, ...props }) => (
    <h2
      className="mt-12 text-[21px] font-semibold leading-[1.55] tracking-[-0.03em] text-foreground first:mt-0 sm:text-[22px]"
      {...props}
    />
  ),
  h3: ({ node, ...props }) => (
    <h3 className="mt-9 text-[17px] font-semibold leading-[1.65] text-foreground first:mt-0 sm:text-[18px]" {...props} />
  ),
  p: ({ node, ...props }) => (
    <p className="mt-6 text-[15px] leading-[2] tracking-[0.01em] text-foreground/88 first:mt-0" {...props} />
  ),
  ul: ({ node, ...props }) => (
    <ul className="mt-6 list-disc space-y-3 pl-6 text-[15px] leading-[1.95] text-foreground/86" {...props} />
  ),
  ol: ({ node, ...props }) => (
    <ol className="mt-6 list-decimal space-y-3 pl-6 text-[15px] leading-[1.95] text-foreground/86" {...props} />
  ),
  li: ({ node, ...props }) => <li className="pl-1 marker:text-foreground/42" {...props} />,
  strong: ({ node, ...props }) => <strong className="font-semibold text-foreground" {...props} />,
  blockquote: ({ node, ...props }) => (
    <blockquote
      className="mt-8 rounded-[24px] border border-slate-200/70 bg-slate-50/70 px-5 py-4 text-[15px] leading-[1.92] text-foreground/74 sm:px-6 sm:text-[16px]"
      {...props}
    />
  ),
  hr: ({ node, ...props }) => <hr className="my-10 border-0 border-t border-border/70" {...props} />,
  table: ({ node, ...props }) => (
    <div className="my-8 overflow-x-auto rounded-[24px] border border-border/70 bg-white">
      <table className="min-w-[720px] w-full border-collapse text-left" {...props} />
    </div>
  ),
  thead: ({ node, ...props }) => <thead className="bg-secondary/45" {...props} />,
  tbody: ({ node, ...props }) => <tbody className="bg-white" {...props} />,
  tr: ({ node, ...props }) => <tr className="border-t border-border/60 first:border-t-0" {...props} />,
  th: ({ node, ...props }) => (
    <th className="min-w-[120px] px-4 py-3 text-[13px] font-semibold leading-6 text-foreground whitespace-normal align-top" {...props} />
  ),
  td: ({ node, ...props }) => (
    <td className="min-w-[120px] px-4 py-3 text-[15px] leading-7 text-foreground/82 whitespace-normal align-top" {...props} />
  ),
  img: ({ node, alt = '', src = '', ...props }) => (
    <img
      alt={alt}
      className="mt-8 block w-full rounded-[24px] border border-border/50 object-cover shadow-[0_16px_48px_rgba(15,23,42,0.06)]"
      loading="lazy"
      src={src}
      {...props}
    />
  ),
}

const reportMarkdownComponents = {
  h1: ({ node, ...props }) => <h1 className="mb-8 text-[28px] font-semibold tracking-[-0.03em] text-foreground" {...props} />,
  h2: ({ node, ...props }) => (
    <h2
      className="mt-12 pt-2 text-[26px] font-semibold tracking-[-0.03em] text-foreground first:mt-0 first:pt-0"
      {...props}
    />
  ),
  h3: ({ node, ...props }) => <h3 className="mt-8 text-[18px] font-semibold leading-[1.5] text-foreground" {...props} />,
  p: ({ node, ...props }) => <p className="mt-5 text-[15px] leading-[1.95] text-foreground/86 first:mt-0" {...props} />,
  ul: ({ node, ...props }) => <ul className="mt-5 space-y-3 pl-5 text-[15px] leading-[1.9] text-foreground/84" {...props} />,
  ol: ({ node, ...props }) => <ol className="mt-5 space-y-3 pl-5 text-[15px] leading-[1.9] text-foreground/84" {...props} />,
  li: ({ node, ...props }) => <li className="pl-1 marker:text-foreground/45" {...props} />,
  strong: ({ node, ...props }) => <strong className="font-semibold text-foreground" {...props} />,
  blockquote: ({ node, ...props }) => (
    <blockquote
      className="mt-6 rounded-[20px] border border-emerald-200/70 bg-emerald-50/70 px-5 py-4 text-[14px] leading-[1.8] text-emerald-900/80"
      {...props}
    />
  ),
  hr: () => null,
  table: ({ node, ...props }) => (
    <div className="my-8 overflow-x-auto rounded-[24px] border border-border/70 bg-white">
      <table className="min-w-[760px] w-full border-collapse text-left" {...props} />
    </div>
  ),
  thead: ({ node, ...props }) => <thead className="bg-secondary/45" {...props} />,
  tbody: ({ node, ...props }) => <tbody className="bg-white" {...props} />,
  tr: ({ node, ...props }) => <tr className="border-t border-border/60 first:border-t-0" {...props} />,
  th: ({ node, ...props }) => (
    <th className="min-w-[120px] px-4 py-3 text-[13px] font-semibold leading-6 text-foreground whitespace-normal align-top" {...props} />
  ),
  td: ({ node, ...props }) => (
    <td className="min-w-[120px] px-4 py-3 text-[14px] leading-7 text-foreground/82 whitespace-normal align-top" {...props} />
  ),
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function clampFlowStepDuration(seconds = 1) {
  return Math.min(Math.max(seconds * FLOW_STEP_RATIO_MS, FLOW_STEP_MIN_MS), FLOW_STEP_MAX_MS)
}

function formatFlowElapsedLabel(ms, status) {
  if (status === 'skipped') {
    return '已跳过'
  }

  if (status === 'waiting') {
    return '--'
  }

  if (!Number.isFinite(ms) || ms <= 0) {
    return status === 'failed' ? '失败' : '0.1s'
  }

  const seconds = Math.max(0.1, ms / 1000)
  return `${seconds.toFixed(1)}s`
}

function attachWorkflowToMessages(messages, messageId, workflow) {
  if (!Array.isArray(messages) || !messageId) {
    return messages ?? []
  }

  return messages.map((message) => {
    if (message.id !== messageId) {
      return message
    }

    return {
      ...message,
      workflow,
    }
  })
}

function updateMessageById(messages, messageId, updater) {
  if (!Array.isArray(messages) || !messageId) {
    return messages ?? []
  }

  return messages.map((message) => {
    if (message.id !== messageId) {
      return message
    }

    const patch = typeof updater === 'function' ? updater(message) : updater

    if (!patch) {
      return message
    }

    return {
      ...message,
      ...patch,
    }
  })
}

function mergeFlowProgressSteps(currentSteps, incomingSteps) {
  if (!Array.isArray(currentSteps) || !Array.isArray(incomingSteps)) {
    return currentSteps ?? []
  }

  return currentSteps.map((step, index) => {
    const incomingStep = incomingSteps[index]

    if (!incomingStep) {
      return step
    }

    return {
      ...step,
      ...incomingStep,
      id: step.id,
      label: incomingStep.label ?? step.label,
    }
  })
}

function appendMessageParagraph(content = '', paragraph = '') {
  return [content.trim(), paragraph.trim()].filter(Boolean).join('\n\n')
}

function resolveInitialDraftFlowOutcome(reportMarkdown = '', decisionHint = '') {
  const normalizedDecision = typeof decisionHint === 'string' ? decisionHint.trim().toLowerCase() : ''

  if (normalizedDecision === 'pass') {
    return {
      decision: '无需修改',
      shouldSkipAutoRevision: true,
    }
  }

  if (normalizedDecision === 'partial') {
    return {
      decision: '局部修改',
      shouldSkipAutoRevision: false,
    }
  }

  if (normalizedDecision === 'rewrite') {
    return {
      decision: '整篇重写',
      shouldSkipAutoRevision: false,
    }
  }

  if (!reportMarkdown) {
    return {
      decision: '无需修改',
      shouldSkipAutoRevision: false,
    }
  }

  const noAutoRevisionApplied = reportMarkdown.includes('程序兜底修正：本轮未触发。')

  return {
    decision: noAutoRevisionApplied ? '无需修改' : '局部修改',
    shouldSkipAutoRevision: noAutoRevisionApplied,
  }
}

function buildMockInitialDraftExperience({ current, topic }) {
  const workflowMessageId = createId('assistant')
  const startedAt = Date.now() - 9800
  const flow = {
    ...buildMockFlowSnapshot({
      startedAt,
      steps: [
        { label: '接收选题', status: 'done', elapsedMs: 900 },
        { label: '整理写作要求', status: 'done', elapsedMs: 1200 },
        { label: '生成正文初稿', status: 'running' },
        { label: '开始内容审核', status: 'waiting' },
        { label: '输出审核结果', status: 'waiting' },
        { label: '判定修改方式', status: 'waiting' },
        { label: '自动修订内容', status: 'waiting' },
        { label: '呈现首版稿件', status: 'waiting' },
      ],
    }),
    messageId: workflowMessageId,
  }

  return {
    activeWorkbenchTab: current.activeWorkbenchTab,
    draftReview: {
      ...current.draftReview,
      activeVersionId: null,
      latestNote: '',
      versions: [],
    },
    draft: '',
    isWorkbenchOpen: false,
    lastFlowSummary: null,
    messages: [
      ...current.messages,
      {
        id: createId('user'),
        role: 'user',
        content: `我选这个：${topic.title}`,
        createdAt: new Date(startedAt - 1500).toISOString(),
      },
      {
        id: workflowMessageId,
        role: 'assistant',
        content: INITIAL_DRAFT_FLOW_INTRO_MESSAGE,
        createdAt: new Date(startedAt).toISOString(),
        workflow: flow,
      },
    ],
    processingFlow: flow,
    stageId: 'draft',
    title: topic.title,
    topicSelection: {
      ...current.topicSelection,
      recommendationError: '',
      selectedTopicId: topic.id,
      selectedTopic: topic,
    },
  }
}

function getTopicStatusMeta(status = 'pending') {
  return TOPIC_STATUS_META[status] ?? TOPIC_STATUS_META.pending
}

function formatMessageTime(value) {
  if (!value) {
    return ''
  }

  try {
    return new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      month: 'numeric',
      day: 'numeric',
    }).format(new Date(value))
  } catch {
    return ''
  }
}

function countReadableLength(content = '') {
  return content
    .replace(/[#>*`\-\[\]\(\)\|]/g, '')
    .replace(/\s+/g, '')
    .trim().length
}

function clampRightPaneWidth(width, containerWidth) {
  const maxWidth = Math.max(RIGHT_PANE_MIN_WIDTH, containerWidth - LEFT_PANE_MIN_WIDTH)
  return Math.min(Math.max(width, RIGHT_PANE_MIN_WIDTH), maxWidth)
}

function renderMarkdownBlock(content, components = markdownComponents) {
  return (
    <ReactMarkdown components={components} remarkPlugins={[remarkGfm]}>
      {content}
    </ReactMarkdown>
  )
}

function getSessionById(sessionId) {
  return useBenchmarkStore.getState().sessions.find((session) => session.id === sessionId) ?? null
}

function getSelectedTopic(session) {
  const selectedTopicId = session?.topicSelection?.selectedTopicId

  return (
    session?.topicSelection?.selectedTopic ??
    session?.topicSelection?.recommendations?.find((topic) => topic.id === selectedTopicId) ??
    getTopicById(selectedTopicId) ??
    session?.topicSelection?.recommendations?.[0] ??
    null
  )
}

function getActiveVersion(session) {
  const versions = session?.draftReview?.versions ?? []

  if (versions.length === 0) {
    return null
  }

  return (
    versions.find((version) => version.id === session?.draftReview?.activeVersionId) ??
    versions[versions.length - 1]
  )
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

function resolveVersionGeneratedTitle(version) {
  const directTitle = readLooseTitle(version?.generatedTitle)

  if (directTitle) {
    return directTitle
  }

  const legacyCandidate = Array.isArray(version?.titleCandidates) ? version.titleCandidates[0] : null
  return readLooseTitle(legacyCandidate)
}

function resolveVersionDisplayTitle(session, version) {
  return resolveVersionGeneratedTitle(version) || getSelectedTopic(session)?.title || session?.title || ''
}

function getDraftBodyMarkdown(version) {
  const draftMarkdown = version?.draftMarkdown ?? ''

  if (resolveVersionGeneratedTitle(version)) {
    return stripPreviewHeading(draftMarkdown)
  }

  return draftMarkdown
}

function hasSessionHistory(session) {
  if (!session) {
    return false
  }

  const messages = Array.isArray(session.messages) ? session.messages : []
  const hasUserMessage = messages.some((message) => message?.role === 'user')
  const hasSelectedTopic = Boolean(session?.topicSelection?.selectedTopicId)
  const hasGeneratedVersions = (session?.draftReview?.versions?.length ?? 0) > 0
  const hasAdvancedStage = typeof session?.stageId === 'string' && session.stageId !== 'topic'
  const hasFlow = Boolean(session?.processingFlow || session?.lastFlowSummary)

  return hasUserMessage || hasSelectedTopic || hasGeneratedVersions || hasAdvancedStage || hasFlow
}

function buildDraftVersion({ note = '', supplement = '', topic, versionNumber }) {
  const noteSummary = note.trim() ? `这次重点吸收了你的修改意见：${note.trim()}。` : ''
  const draftMarkdown = [
    `# ${topic.title}`,
    '',
    '> 很多关系的崩塌，不是因为一瞬间出了什么大事，而是一个人把失望忍得太久，久到连解释都懒得再说。',
    '',
    '有人总以为，真正让人离开的，是某一次争吵，是某一句狠话。可真正把心推远的，往往不是声量最大的那一下，而是无数次被忽视、被敷衍、被要求懂事的日常。',
    '',
    `这篇内容延续 ${topic.penName} 的叙述口吻，从一个具体人物进入，让读者先看见“那个人是怎么一步步寒下心来的”，再慢慢读懂：有些沉默不是不在乎，而是早就伤透了。`,
    '',
    '故事最好从一件很小的事开场。比如她深夜发来一句话，只是想确认一句“你到家了吗”，对方隔了很久才回复，语气平平，像完成任务一样。这样的细节不轰烈，却最能让读者代入，因为真实生活里的失望就是这么一点点堆起来的。',
    '',
    '接下来要把转折写清楚。不是突然决绝，而是在一次次自我劝说后，终于不想再替对方找理由。她会回想过去那些自己替别人圆回去的场面，也会意识到，原来被忽视久了，人最先失去的不是脾气，而是期待。',
    '',
    '文章中段可以加入一段更具体的动作感。比如他照例说“你别想太多”，她没有争，没有哭，只是把已经打好的长消息一个字一个字删掉。这个细节比任何指责都更有力，因为它让读者看到，一个人真正心冷时，反而会显得异常平静。',
    '',
    `在结尾部分，要把情绪从“委屈”收束到“清醒”。不是控诉谁坏，而是让读者明白：被反复忽略的人，最终离开的那一步，看起来很轻，背后却是很重的累积。${noteSummary}`.trim(),
    '',
    '所以这篇稿子的真正落点，不是教人立刻离开，而是提醒读者，任何关系里最危险的信号，从来不是争执，而是你已经越来越不想说话。',
  ].join('\n')

  const reportMarkdown = [
    '# 详细校验报告',
    '',
    '## 结论',
    '',
    `当前版本可直接进入下一节点，整体更贴近 ${topic.type} 的结构节奏，适合继续做配图与排版。`,
    '',
    '## 结构检查',
    '',
    '- 开篇：已用一句情绪钩子起势，有代入感。',
    '- 中段：有人物细节和动作转折，不是纯观点堆叠。',
    '- 结尾：回收到关系认知，情绪收束较稳。',
    '',
    '## 风格检查',
    '',
    `- 笔名风格：当前更偏 ${topic.penName} 的叙述方式。`,
    '- 禁用词：未使用总结式 AI 腔词汇。',
    '- 句式节奏：以短句和递进表达为主，适合公众号阅读。',
    '',
    '## 当前仍可优化的地方',
    '',
    '- 可以再补一个更扎心的瞬间，让读者更快鼻酸。',
    '- 若想提升传播性，可再收一版标题和首段。',
    note.trim() ? `- 本轮已根据你的修改意见处理：${note.trim()}` : '- 本轮暂无额外人工修改意见。',
    '',
    '## AI 已处理动作',
    '',
    `- 第 ${versionNumber} 版已完成正文修订。`,
    '- 当前版本未附加额外选题约束。',
  ].join('\n')

  return {
    id: createId('version'),
    createdAt: new Date().toISOString(),
    draftMarkdown,
    generatedTitle: buildFallbackGeneratedTitle(topic),
    label: `V${versionNumber}`,
    note: note.trim(),
    reportMarkdown,
    summary: note.trim() ? `根据“${note.trim()}”完成重写。` : '初稿生成完成，可进入文字稿确认。',
    wordCount: countReadableLength(draftMarkdown),
  }
}

function buildVersionFromGeneratedResult({ generated, note = '', supplement = '', topic, versionNumber }) {
  const fallbackVersion = buildDraftVersion({
    note,
    supplement,
    topic,
    versionNumber,
  })

  return {
    ...fallbackVersion,
    draftMarkdown: generated?.draftMarkdown?.trim() || fallbackVersion.draftMarkdown,
    generatedTitle: readLooseTitle(generated?.generatedTitle) || fallbackVersion.generatedTitle,
    reportMarkdown: generated?.reportMarkdown?.trim() || fallbackVersion.reportMarkdown,
    summary: generated?.summary?.trim() || fallbackVersion.summary,
    wordCount: countReadableLength(generated?.draftMarkdown?.trim() || fallbackVersion.draftMarkdown),
  }
}

function buildMockFlowSnapshot({ steps, startedAt, summary = INITIAL_DRAFT_FLOW_SUMMARY, title = INITIAL_DRAFT_FLOW_TITLE }) {
  const flowId = createId('flow')
  let cursor = startedAt

  const preparedSteps = steps.map((step, index) => {
    if (step.status === 'skipped') {
      return {
        ...step,
        completedAt: cursor,
        elapsedMs: 0,
        id: `${flowId}-step-${index + 1}`,
        startedAt: null,
      }
    }

    if (step.status === 'running') {
      return {
        ...step,
        completedAt: null,
        elapsedMs: 0,
        id: `${flowId}-step-${index + 1}`,
        startedAt: cursor,
      }
    }

    if (step.status === 'waiting' || step.status === 'failed') {
      return {
        ...step,
        completedAt: null,
        elapsedMs: 0,
        id: `${flowId}-step-${index + 1}`,
        startedAt: null,
      }
    }

    const elapsedMs = Math.max(100, step.elapsedMs ?? 1000)
    const stepStartedAt = cursor
    const completedAt = cursor + elapsedMs
    cursor = completedAt

    return {
      ...step,
      completedAt,
      elapsedMs,
      id: `${flowId}-step-${index + 1}`,
      startedAt: stepStartedAt,
    }
  })

  const hasIncompleteStep = preparedSteps.some((step) => step.status === 'running' || step.status === 'waiting' || step.status === 'failed')

  return {
    completedAt: hasIncompleteStep ? null : new Date(cursor).toISOString(),
    createdAt: new Date(startedAt).toISOString(),
    id: flowId,
    steps: preparedSteps,
    summary,
    title,
  }
}

async function requestGeneratedDraft({
  action,
  deepThinkingEnabled,
  note = '',
  onProgress,
  streamProgress = false,
  supplement = '',
  topic,
}) {
  const response = await fetch('/api/content-draft', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action,
      deepThinkingEnabled,
      note,
      streamProgress,
      supplement,
      topic,
    }),
  })

  if (streamProgress) {
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      throw new Error(payload?.error || '内容创作请求失败')
    }

    const reader = response.body?.getReader()

    if (!reader) {
      throw new Error('内容创作流读取失败')
    }

    const decoder = new TextDecoder()
    let buffer = ''
    let finalPayload = null

    function handleEventLine(line) {
      const trimmed = line.trim()

      if (!trimmed) {
        return
      }

      const event = JSON.parse(trimmed)

      if (event.type === 'progress') {
        onProgress?.(event)
        return
      }

      if (event.type === 'result') {
        finalPayload = event.data ?? null
        return
      }

      if (event.type === 'error') {
        const error = new Error(event.error || '内容创作请求失败')
        error.payload = event.details ?? null
        throw error
      }
    }

    while (true) {
      const { value, done } = await reader.read()
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done })

      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        handleEventLine(line)
      }

      if (done) {
        break
      }
    }

    if (buffer.trim()) {
      handleEventLine(buffer)
    }

    if (!finalPayload) {
      throw new Error('内容创作流未返回最终结果')
    }

    return finalPayload
  }

  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(payload?.error || 'MiniMax 内容创作失败')
  }

  return payload
}

function stripPreviewHeading(markdown = '') {
  const lines = markdown.split('\n')

  if (lines[0]?.trim().startsWith('# ')) {
    return lines.slice(1).join('\n').trim()
  }

  return markdown.trim()
}

function getPreviewMarkdownComponents(fontSize) {
  const bodyClassName =
    fontSize === 'small'
      ? 'text-[14px] leading-[2.05]'
      : fontSize === 'large'
        ? 'text-[17px] leading-[2.15]'
        : 'text-[15px] leading-[2.1]'

  return {
    h1: ({ node, ...props }) => <h2 className="mt-10 text-[22px] font-semibold leading-[1.6] text-black first:mt-0" {...props} />,
    h2: ({ node, ...props }) => <h2 className="mt-10 text-[22px] font-semibold leading-[1.6] text-black first:mt-0" {...props} />,
    h3: ({ node, ...props }) => <h3 className="mt-8 text-[18px] font-semibold leading-[1.7] text-black" {...props} />,
    p: ({ node, ...props }) => <p className={cn('mt-5 text-black first:mt-0', bodyClassName)} {...props} />,
    ul: ({ node, ...props }) => <ul className={cn('mt-5 list-disc space-y-2 pl-5 text-black', bodyClassName)} {...props} />,
    ol: ({ node, ...props }) => <ol className={cn('mt-5 list-decimal space-y-2 pl-5 text-black', bodyClassName)} {...props} />,
    li: ({ node, ...props }) => <li className="pl-1" {...props} />,
    strong: ({ node, ...props }) => <strong className="font-semibold text-black" {...props} />,
    blockquote: ({ node, ...props }) => (
      <blockquote className="mt-6 border-l-2 border-black/15 pl-4 text-[13px] leading-[2] text-black/72" {...props} />
    ),
    img: ({ node, alt = '', src = '', ...props }) => (
      <img
        alt={alt}
        className="mt-8 block w-full object-cover"
        loading="lazy"
        src={src}
        {...props}
      />
    ),
    hr: ({ node, ...props }) => <hr className="my-10 border-0 border-t border-black/8" {...props} />,
  }
}

function getWechatCopyComponents(fontSize) {
  const bodySize = fontSize === 'small' ? '14px' : fontSize === 'large' ? '17px' : '15px'
  const bodyLineHeight = fontSize === 'small' ? '2.05' : fontSize === 'large' ? '2.15' : '2.1'

  return {
    h1: ({ node, ...props }) => (
      <h2 style={{ marginTop: '28px', fontSize: '22px', fontWeight: 600, lineHeight: 1.6, color: '#000000' }} {...props} />
    ),
    h2: ({ node, ...props }) => (
      <h2 style={{ marginTop: '28px', fontSize: '22px', fontWeight: 600, lineHeight: 1.6, color: '#000000' }} {...props} />
    ),
    h3: ({ node, ...props }) => (
      <h3 style={{ marginTop: '22px', fontSize: '18px', fontWeight: 600, lineHeight: 1.7, color: '#000000' }} {...props} />
    ),
    p: ({ node, ...props }) => (
      <p style={{ marginTop: '14px', fontSize: bodySize, lineHeight: bodyLineHeight, color: '#000000' }} {...props} />
    ),
    ul: ({ node, ...props }) => (
      <ul
        style={{
          marginTop: '14px',
          paddingLeft: '20px',
          fontSize: bodySize,
          lineHeight: bodyLineHeight,
          color: '#000000',
          listStyleType: 'disc',
        }}
        {...props}
      />
    ),
    ol: ({ node, ...props }) => (
      <ol
        style={{
          marginTop: '14px',
          paddingLeft: '20px',
          fontSize: bodySize,
          lineHeight: bodyLineHeight,
          color: '#000000',
          listStyleType: 'decimal',
        }}
        {...props}
      />
    ),
    li: ({ node, ...props }) => <li style={{ paddingLeft: '4px', marginBottom: '6px' }} {...props} />,
    strong: ({ node, ...props }) => <strong style={{ fontWeight: 600, color: '#000000' }} {...props} />,
    blockquote: ({ node, ...props }) => (
      <blockquote
        style={{
          marginTop: '18px',
          borderLeft: '2px solid rgba(0,0,0,0.15)',
          paddingLeft: '16px',
          fontSize: '13px',
          lineHeight: 2,
          color: 'rgba(0,0,0,0.72)',
        }}
        {...props}
      />
    ),
    img: ({ node, alt = '', src = '', ...props }) => (
      <img
        alt={alt}
        src={src}
        style={{ marginTop: '22px', display: 'block', width: '100%', objectFit: 'cover' }}
        {...props}
      />
    ),
    hr: ({ node, ...props }) => (
      <hr style={{ margin: '28px 0', border: 'none', borderTop: '1px solid rgba(0,0,0,0.08)' }} {...props} />
    ),
  }
}

async function copyHtmlToClipboard(html, plainText) {
  if (window.ClipboardItem && navigator.clipboard && window.isSecureContext) {
    const item = new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([plainText], { type: 'text/plain' }),
    })
    await navigator.clipboard.write([item])
    return true
  }

  const tmp = document.createElement('div')
  tmp.contentEditable = 'true'
  tmp.innerHTML = html
  Object.assign(tmp.style, {
    left: '-9999px',
    opacity: '0',
    position: 'fixed',
  })

  document.body.appendChild(tmp)
  const range = document.createRange()
  range.selectNodeContents(tmp)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
  document.execCommand('copy')
  selection?.removeAllRanges()
  document.body.removeChild(tmp)
  return true
}

function getAvailableTabs(session) {
  const tabs = []
  const hasDraft = Boolean(getActiveVersion(session)?.draftMarkdown)
  const hasPreview = session?.stageId === 'preview' || session?.stageId === 'completed'

  if (hasDraft) {
    tabs.push('draft', 'report')
  }

  if (hasPreview) {
    tabs.push('preview')
  }

  if ((session?.draftReview?.versions?.length ?? 0) > 0) {
    tabs.push('versions')
  }

  return tabs
}

function createPreparedFlowSteps(flowId, steps, startedAt) {
  return steps.map((step, index) => ({
    ...step,
    completedAt: null,
    elapsedMs: 0,
    id: `${flowId}-step-${index + 1}`,
    startedAt: index === 0 ? startedAt : null,
    status: index === 0 ? 'running' : 'waiting',
  }))
}

function advanceFlowSteps(steps, currentIndex, movedAt) {
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

function completeFlowSteps(steps, finishedAt) {
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

function failFlowSteps(steps, finishedAt) {
  const runningIndex = steps.findIndex((step) => step.status === 'running')
  const failureIndex = runningIndex === -1 ? steps.findLastIndex((step) => step.status === 'done') : runningIndex

  return steps.map((step, index) => {
    if (index === failureIndex) {
      const startedAt = step.startedAt ?? finishedAt

      return {
        ...step,
        completedAt: finishedAt,
        elapsedMs: Math.max(0, finishedAt - startedAt),
        startedAt,
        status: 'failed',
      }
    }

    if (step.status === 'running') {
      const startedAt = step.startedAt ?? finishedAt

      return {
        ...step,
        completedAt: finishedAt,
        elapsedMs: Math.max(0, finishedAt - startedAt),
        startedAt,
        status: index < failureIndex ? 'done' : 'waiting',
      }
    }

    return step
  })
}

function AttachmentPills({ attachments, onRemove, align = 'left' }) {
  if (attachments.length === 0) {
    return null
  }

  return (
    <div className={cn('flex flex-wrap gap-2', align === 'right' && 'justify-end')}>
      {attachments.map((attachment) => (
        <div
          key={attachment.id}
          className="flex items-center gap-2 rounded-full border border-border/70 bg-white px-3 py-1.5 text-[12px] text-foreground"
        >
          <Paperclip size={13} />
          <span className="max-w-[180px] truncate">{attachment.name}</span>
          <span className="text-muted-foreground">{attachment.sizeLabel}</span>
          {onRemove ? (
            <button
              className="rounded-full p-0.5 text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => onRemove(attachment.id)}
              type="button"
            >
              <X size={13} />
            </button>
          ) : null}
        </div>
      ))}
    </div>
  )
}

function CopyButton({ copied, onClick }) {
  return (
    <button
      className="inline-flex size-8 items-center justify-center rounded-full border border-border/70 bg-white text-muted-foreground opacity-0 shadow-none transition-all hover:border-foreground/15 hover:text-foreground group-hover/message:opacity-100"
      onClick={onClick}
      type="button"
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  )
}

function ThinkingToggle({ checked, onChange }) {
  return (
    <div className="inline-flex items-center gap-2">
      <button
        aria-pressed={checked}
        className="inline-flex items-center"
        onClick={onChange}
        type="button"
      >
        <span
          className={cn(
            'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
            checked ? 'bg-[#171b22]' : 'bg-secondary',
          )}
        >
          <span
            className={cn(
              'absolute left-0.5 size-4 rounded-full bg-white transition-transform',
              checked && 'translate-x-4',
            )}
          />
        </span>
      </button>

      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-default text-[12px] text-foreground">深度思考</span>
        </TooltipTrigger>
        <TooltipContent
          className="max-w-[260px] items-start rounded-xl bg-[#171b22] px-3 py-2 text-[12px] leading-5 text-white"
          side="top"
          sideOffset={8}
        >
          <span>
            开启时优先走完整创作链路，适合需要更稳稿件质量的场景。
            <br />
            关闭时会优先使用更快的生成策略。
          </span>
        </TooltipContent>
      </Tooltip>
    </div>
  )
}

function QuickMessageItem({ disabled = false, label, onSelect }) {
  return (
    <button
      className={cn(
        'flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px] transition-colors',
        disabled
          ? 'cursor-not-allowed border border-dashed border-border/60 bg-secondary/35 text-muted-foreground'
          : 'border border-transparent bg-white text-foreground hover:border-border/80 hover:bg-secondary/45',
      )}
      disabled={disabled}
      onClick={() => onSelect(label)}
      type="button"
    >
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        <MessageSquareText size={13} />
      </div>
      <span className="truncate">{label}</span>
    </button>
  )
}

function QuickMessageMenu({ disabled = false, onSelect }) {
  return (
    <div className="group/quick relative">
      <button
        className={cn(
          'inline-flex items-center gap-2 rounded-full border border-border/75 bg-white px-3.5 py-2 text-[13px] text-foreground transition-colors hover:border-foreground/15',
          disabled && 'cursor-not-allowed opacity-50 hover:border-border/75',
        )}
        disabled={disabled}
        type="button"
      >
        <MessageSquareText size={14} />
        <span>快捷消息</span>
        <ChevronRight
          className="text-muted-foreground transition-transform duration-150 group-hover/quick:translate-x-0.5"
          size={14}
        />
      </button>

      {!disabled ? (
        <div className="pointer-events-none absolute bottom-full right-0 z-30 mb-2 w-[296px] opacity-0 transition-all duration-150 group-hover/quick:pointer-events-auto group-hover/quick:opacity-100">
          <div className="rounded-2xl border border-border/80 bg-white p-2 shadow-[0_14px_32px_rgba(15,23,42,0.06)]">
            <div className="space-y-1.5">
              {quickMessageItems.map((item) => (
                <QuickMessageItem
                  disabled={item.disabled}
                  key={item.id}
                  label={item.label}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function SearchField({ onChange, value }) {
  return (
    <div className="relative mt-3">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        className="h-11 w-full rounded-2xl border border-border/75 bg-white pl-10 pr-4 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-foreground/15 focus:border-foreground/20"
        onChange={(event) => onChange(event.target.value)}
        placeholder="搜索文章标题"
        type="search"
        value={value}
      />
    </div>
  )
}

function PlaceholderAvatar({ compact = false }) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-full border border-white/80 bg-white shadow-[0_10px_22px_rgba(15,23,42,0.08)]',
        compact ? 'h-11 w-11' : 'h-12 w-12',
      )}
    >
      <img alt="内容创作头像" className="h-full w-full object-cover" src="/sidebar-avatar.png" />
    </div>
  )
}

function SidebarRailButton({ children, label, onClick, popup, selected = false, type = 'button' }) {
  return (
    <div className="relative">
      <button
        aria-label={label}
        className={cn(
          'inline-flex h-11 w-11 items-center justify-center rounded-[14px] border transition-all',
          selected
            ? 'border-border/80 bg-white text-foreground shadow-[0_8px_18px_rgba(15,23,42,0.04)]'
            : 'border-transparent bg-transparent text-muted-foreground hover:border-border/70 hover:bg-white hover:text-foreground',
        )}
        onClick={onClick}
        type={type}
      >
        {children}
      </button>
      {popup}
    </div>
  )
}

function HistoryHoverCard({ activeSessionId, onSelectSession, sessions }) {
  return (
    <div className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-40 w-[280px] -translate-y-1/2 rounded-[18px] border border-border/80 bg-white p-4 opacity-0 shadow-[0_24px_60px_rgba(15,23,42,0.14)] transition-all duration-150 group-hover/history-card:pointer-events-auto group-hover/history-card:opacity-100">
      <div className="relative">
        <span className="absolute left-[-15px] top-[-18px] h-[calc(100%+36px)] w-5" aria-hidden="true" />
        <span className="absolute left-[-15px] top-1/2 h-3 w-3 -translate-y-1/2 rotate-45 rounded-[3px] border-l border-t border-border/80 bg-white" />
        <div className="text-[12px] font-medium tracking-[0.08em] text-muted-foreground">历史记录</div>
        {sessions.length === 0 ? (
          <div className="mt-4 rounded-[16px] border border-border/70 bg-secondary/20 px-4 py-10 text-center text-[14px] text-muted-foreground">
            暂无历史对话
          </div>
        ) : (
          <div className="mt-3 space-y-0">
            {sessions.slice(0, 8).map((session) => (
              <button
                className={cn(
                  'flex w-full items-center justify-between rounded-[14px] px-3 py-2.5 text-left text-[14px] transition-colors',
                  session.id === activeSessionId ? 'bg-secondary text-foreground' : 'text-foreground/84 hover:bg-secondary/35',
                )}
                key={session.id}
                onClick={() => onSelectSession(session.id)}
                type="button"
              >
                <span className="truncate">{session.title}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function SidebarExpandedItem({ icon: Icon, label, onClick, selected = false }) {
  return (
    <button
      className={cn(
        'flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left transition-colors',
        selected ? 'bg-white text-foreground shadow-[0_8px_18px_rgba(15,23,42,0.05)]' : 'text-foreground/82 hover:bg-white/80',
      )}
      onClick={onClick}
      type="button"
    >
      <Icon className={cn(selected ? 'text-foreground' : 'text-muted-foreground')} size={20} strokeWidth={1.9} />
      <span className="text-[14px] font-medium">{label}</span>
    </button>
  )
}

function TopicCard({ disabled = false, isSelected, onSelect, topic, topicStatus = 'pending' }) {
  const topicStatusMeta = getTopicStatusMeta(topicStatus)

  return (
    <button
      className={cn(
        'w-full rounded-[24px] border px-5 py-5 text-left transition-all',
        isSelected
          ? 'border-primary/30 bg-primary/5 shadow-[0_10px_30px_rgba(14,159,110,0.08)]'
          : 'border-border/70 bg-white hover:border-foreground/15 hover:bg-secondary/25',
        disabled && 'cursor-not-allowed opacity-65',
      )}
      disabled={disabled}
      onClick={() => onSelect(topic.id)}
      type="button"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[15px] font-semibold leading-[1.55] text-foreground">{topic.title}</div>
          <p className="mt-2 text-[13px] leading-6 text-muted-foreground">{topic.reason}</p>
        </div>
        {isSelected ? (
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-white">
            <Check size={14} />
          </span>
        ) : null}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <span className={cn('rounded-full px-2.5 py-1 text-[11px]', topicStatusMeta.className)}>{topicStatusMeta.label}</span>
        <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] text-muted-foreground">{topic.penName}</span>
        <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] text-muted-foreground">{topic.theme}</span>
      </div>
    </button>
  )
}

function TopicLibraryCard({ topic, topicStatus = 'pending' }) {
  const topicStatusMeta = getTopicStatusMeta(topicStatus)

  return (
    <article className="rounded-[24px] border border-border/70 bg-white px-5 py-5 transition-all hover:border-foreground/15 hover:bg-secondary/25">
      <div className="min-w-0">
        <div className="text-[15px] font-semibold leading-[1.55] text-foreground">{topic.title}</div>
        <p className="mt-2 text-[13px] leading-6 text-muted-foreground">{topic.reason}</p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <span className={cn('rounded-full px-2.5 py-1 text-[11px]', topicStatusMeta.className)}>{topicStatusMeta.label}</span>
        <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] text-muted-foreground">{topic.penName}</span>
        <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] text-muted-foreground">{topic.theme}</span>
      </div>
    </article>
  )
}

function WorkflowTimeline({ flow }) {
  if (!flow) {
    return null
  }

  const hasRunningStep = flow.steps.some((step) => step.status === 'running')
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!hasRunningStep) {
      return
    }

    const timerId = window.setInterval(() => {
      setNow(Date.now())
    }, 100)

    return () => {
      window.clearInterval(timerId)
    }
  }, [hasRunningStep])

  return (
    <div className="mt-4 space-y-2.5">
      {flow.steps.map((step, index) => {
        const isRunning = step.status === 'running'
        const isDone = step.status === 'done'
        const isFailed = step.status === 'failed'
        const isSkipped = step.status === 'skipped'
        const isWaiting = step.status === 'waiting'
        const elapsedMs = isRunning ? now - (step.startedAt ?? now) : step.elapsedMs ?? 0

        return (
          <div className="relative flex min-h-[30px] items-center gap-2.5 pl-6" key={step.id}>
            {index < flow.steps.length - 1 ? (
              <span
                className={cn(
                  'absolute left-[9px] top-5.5 h-[calc(100%+8px)] w-px',
                  isDone || isSkipped ? 'bg-border/90' : 'bg-border/55',
                )}
              />
            ) : null}

            <span
              className={cn(
                'absolute left-0 top-1.5 inline-flex size-[18px] items-center justify-center rounded-full border bg-white',
                isRunning && 'border-primary/25 text-primary shadow-[0_0_0_4px_rgba(14,159,110,0.08)]',
                isDone && 'border-foreground/10 text-foreground',
                isSkipped && 'border-border/80 text-muted-foreground',
                isFailed && 'border-red-200 text-red-600',
                isWaiting && 'border-border/70 text-muted-foreground',
              )}
            >
              {isRunning ? <LoaderCircle className="animate-spin" size={10} /> : null}
              {isDone ? <Check size={10} /> : null}
              {isSkipped ? <History size={10} /> : null}
              {isFailed ? <X size={10} /> : null}
              {isWaiting ? <span className="size-1.5 rounded-full bg-current" /> : null}
            </span>

            <div className="flex max-w-full items-center gap-2">
              <div
                className={cn(
                  'inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] leading-none transition-colors',
                  isRunning && 'border-primary/20 bg-primary/[0.06] text-primary',
                  isDone && 'border-border/70 bg-white text-foreground/80',
                  isSkipped && 'border-border/70 bg-secondary/20 text-muted-foreground',
                  isFailed && 'border-red-200 bg-red-50/70 text-red-600',
                  isWaiting && 'border-border/70 bg-white text-muted-foreground',
                )}
              >
                <span className="max-w-[220px] truncate sm:max-w-[280px]">{step.label}</span>
              </div>

              <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                {formatFlowElapsedLabel(elapsedMs, step.status)}
              </span>
            </div>

          </div>
        )
      })}
    </div>
  )
}

function TopicStageCard({
  filterTypes,
  onApplyFilters,
  onClearFilters,
  onSelectPage,
  onSelectTopic,
  pageCount,
  pageIndex,
  recommendations,
  selectedTopicId,
  topicStatusById,
}) {
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [draftFilterTypes, setDraftFilterTypes] = useState(filterTypes)
  const filterPopoverRef = useRef(null)

  useEffect(() => {
    setDraftFilterTypes(filterTypes)
  }, [filterTypes])

  useEffect(() => {
    if (!isFilterOpen) {
      return
    }

    function handlePointerDown(event) {
      if (!filterPopoverRef.current?.contains(event.target)) {
        setIsFilterOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [isFilterOpen])

  function handleToggleDraftType(type) {
    setDraftFilterTypes((current) => {
      if (current.includes(type)) {
        return current.filter((item) => item !== type)
      }

      if (current.length >= 3) {
        return current
      }

      return [...current, type]
    })
  }

  function handleConfirmFilters() {
    onApplyFilters(draftFilterTypes)
    setIsFilterOpen(false)
  }

  function handleClearButtonClick(event) {
    event.stopPropagation()
    setDraftFilterTypes([])
    onClearFilters()
    setIsFilterOpen(false)
  }

  return (
    <div className="rounded-[30px] border border-border/70 bg-white p-5 shadow-[0_24px_50px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-[22px] font-semibold text-foreground">选题确认</h3>

        <div className="relative" ref={filterPopoverRef}>
          <button
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[13px] transition-colors',
              filterTypes.length > 0
                ? 'border-foreground/20 bg-foreground text-white'
                : 'border-border/75 bg-white text-foreground hover:border-foreground/15',
            )}
            onClick={() => {
              setDraftFilterTypes(filterTypes)
              setIsFilterOpen((current) => !current)
            }}
            type="button"
          >
            <ListFilter size={14} />
            <span>筛选</span>
            {filterTypes.length > 0 ? (
              <>
                <span className="rounded-full bg-white/14 px-1.5 py-0.5 text-[11px] leading-none text-white">
                  {filterTypes.length}
                </span>
                <span
                  className="inline-flex size-4 items-center justify-center rounded-full bg-white/12 text-white/88 transition-colors hover:bg-white/18"
                  onClick={handleClearButtonClick}
                  role="button"
                  tabIndex={0}
                >
                  <X size={11} />
                </span>
              </>
            ) : null}
          </button>

          {isFilterOpen ? (
            <div className="absolute right-0 top-[calc(100%+10px)] z-30 w-[300px] rounded-[22px] border border-border/80 bg-white p-4 shadow-[0_24px_60px_rgba(15,23,42,0.12)]">
              <div className="text-[14px] font-medium text-foreground">筛选预设选题</div>
              <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
                根据文章类型筛选当前预设选题，最多选择 3 个不同类型。
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {TOPIC_LIBRARY_TYPES.map((type) => {
                  const selected = draftFilterTypes.includes(type)

                  return (
                    <button
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-[12px] transition-colors',
                        selected
                          ? 'border-foreground/15 bg-foreground text-white'
                          : 'border-border/70 bg-white text-foreground hover:border-foreground/15 hover:bg-secondary/25',
                      )}
                      key={type}
                      onClick={() => handleToggleDraftType(type)}
                      type="button"
                    >
                      {type}
                    </button>
                  )
                })}
              </div>

              <div className="mt-5 flex items-center justify-between gap-3">
                <button
                  className="text-[12px] text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => {
                    setDraftFilterTypes([])
                    setIsFilterOpen(false)
                  }}
                  type="button"
                >
                  清空选择
                </button>
                <Button className="rounded-full" onClick={handleConfirmFilters} size="sm" type="button">
                  确定
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-3 xl:grid-cols-2">
        {recommendations.length === 0 ? (
          <div className="col-span-full rounded-[24px] border border-dashed border-border/80 bg-secondary/15 px-5 py-14 text-center text-[14px] text-muted-foreground">
            当前筛选条件下暂无预设选题，换一个类型再试试。
          </div>
        ) : (
          recommendations.map((topic) => (
            <TopicCard
              isSelected={topic.id === selectedTopicId}
              key={topic.id}
              onSelect={onSelectTopic}
              topic={topic}
              topicStatus={topicStatusById[topic.id] ?? 'pending'}
            />
          ))
        )}
      </div>

      {pageCount > 1 ? (
        <div className="mt-5 flex items-center justify-center gap-2">
          <button
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-white text-muted-foreground transition-colors hover:border-foreground/15 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"
            disabled={pageIndex === 0}
            onClick={() => onSelectPage(pageIndex - 1)}
            type="button"
          >
            <ChevronLeft size={14} />
          </button>

          {Array.from({ length: pageCount }, (_, index) => (
            <button
              className={cn(
                'inline-flex h-9 min-w-9 items-center justify-center rounded-full border px-3 text-[12px] transition-colors',
                pageIndex === index
                  ? 'border-foreground/15 bg-foreground text-white'
                  : 'border-border/70 bg-white text-foreground hover:border-foreground/15 hover:bg-secondary/25',
              )}
              key={`page-${index + 1}`}
              onClick={() => onSelectPage(index)}
              type="button"
            >
              {index + 1}
            </button>
          ))}

          <button
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-white text-muted-foreground transition-colors hover:border-foreground/15 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"
            disabled={pageIndex >= pageCount - 1}
            onClick={() => onSelectPage(pageIndex + 1)}
            type="button"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      ) : null}
    </div>
  )
}

function DraftStageCard({ activeVersion, onProceedWithoutChanges, onOpenTab, onRewriteAll }) {
  if (!activeVersion) {
    return null
  }

  return (
    <div className="rounded-[28px] border border-border/70 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.04)]">
      <div className="max-w-[640px]">
        <h3 className="text-[22px] font-semibold text-foreground">文字稿确认</h3>
      </div>

      <div className="mt-6 rounded-[24px] border border-border/70 bg-secondary/35 px-4 py-5 sm:px-5">
        <div className="flex flex-col gap-5">
          <div>
            <p className="text-[15px] font-medium text-foreground">右侧已更新当前版本</p>
            <p className="mt-1 text-[13px] leading-6 text-muted-foreground">继续修改，或直接进入排版。</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button className="rounded-full bg-[#171b22] px-5 text-white hover:bg-black" onClick={onProceedWithoutChanges} type="button">
              无需修改
            </Button>
            <Button className="rounded-full" onClick={onRewriteAll} type="button" variant="outline">
              整篇重写
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function PreviewStageCard({ onConfirm, onOpenTab }) {
  return (
    <div className="rounded-[28px] border border-border/70 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.04)]">
      <div className="max-w-[640px]">
        <h3 className="text-[22px] font-semibold text-foreground">排版效果确认</h3>
      </div>

      <div className="mt-6 rounded-[24px] border border-border/70 bg-secondary/35 px-4 py-5 sm:px-5">
        <div className="flex flex-col gap-5">
          <div>
            <p className="text-[15px] font-medium text-foreground">右侧已更新排版预览</p>
            <p className="mt-1 text-[13px] leading-6 text-muted-foreground">确认无误后完成本轮创作。</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button className="rounded-full bg-[#171b22] px-5 text-white hover:bg-black" onClick={onConfirm} type="button">
              确认排版
            </Button>
            <Button className="rounded-full" onClick={() => onOpenTab('preview')} type="button" variant="outline">
              查看排版预览
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function CompletedStageCard({ onOpenTab }) {
  return (
    <div className="rounded-[28px] border border-border/70 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.04)]">
      <div className="flex items-center gap-2 text-[12px] font-medium tracking-[0.08em] text-muted-foreground">
        当前版本已完成
        <CheckCircle2 className="text-primary" size={14} />
      </div>
      <h3 className="mt-2 text-[22px] font-semibold text-foreground">排版确认完成</h3>
      <p className="mt-1 text-[14px] leading-6 text-muted-foreground">
        这篇文章已经完成本轮内容创作。你可以继续在右侧查看正文、校验报告和排版预览。
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button className="rounded-full" onClick={() => onOpenTab('preview')} size="sm" type="button" variant="outline">
          <LayoutTemplate size={14} />
          查看排版预览
        </Button>
        <Button className="rounded-full" onClick={() => onOpenTab('draft')} size="sm" type="button" variant="outline">
          <FileText size={14} />
          查看文字稿
        </Button>
      </div>
    </div>
  )
}

function SessionSidebar({
  activeModule,
  activeSessionId,
  isCollapsed,
  onChangeModule,
  onCreateSession,
  onDeleteSession,
  onSelectSession,
  onToggleCollapsed,
  sessions,
}) {
  if (isCollapsed) {
    return (
      <aside className="relative flex h-full w-[88px] shrink-0 flex-col items-center border-r border-border/70 bg-[#f5f5f5] px-3 py-4">
        <div className="flex w-full justify-center">
          <button
            aria-label="展开导航"
            className="inline-flex h-11 w-11 items-center justify-center rounded-[14px] border border-border/70 bg-white shadow-[0_8px_18px_rgba(15,23,42,0.05)] transition-colors hover:border-foreground/15 hover:bg-secondary/45"
            onClick={onToggleCollapsed}
            type="button"
          >
            <PanelLeftOpen size={18} strokeWidth={1.9} />
          </button>
        </div>

        <div className="mt-7 flex w-full flex-col items-center gap-2">
          <SidebarRailButton label="新建" onClick={onCreateSession} selected={activeModule === 'content'}>
            <Plus size={20} strokeWidth={1.9} />
          </SidebarRailButton>

          {sidebarModules.map((module) => (
            <SidebarRailButton
              key={module.id}
              label={module.label}
              onClick={() => onChangeModule(module.id)}
              selected={activeModule === module.id}
            >
              <module.icon size={20} strokeWidth={1.9} />
            </SidebarRailButton>
          ))}
        </div>

        <div className="mt-6 h-px w-10 rounded-full bg-border/70" />

        <div className="mt-4">
          <div className="group/history-card relative">
            <span className="absolute left-full top-[-18px] h-[84px] w-5" aria-hidden="true" />
            <SidebarRailButton
              label="AI 对话历史"
              onClick={() => onChangeModule('content')}
              popup={
                <HistoryHoverCard
                  activeSessionId={activeSessionId}
                  onSelectSession={onSelectSession}
                  sessions={sessions}
                />
              }
            >
              <History size={20} strokeWidth={1.9} />
            </SidebarRailButton>
          </div>
        </div>
      </aside>
    )
  }

  return (
    <aside className="flex h-full w-[320px] shrink-0 flex-col border-r border-border/70 bg-[#f5f5f5] px-4 py-5">
      <div className="flex items-center gap-3">
        <button
          aria-label="收起导航"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-border/70 bg-white text-muted-foreground shadow-[0_8px_18px_rgba(15,23,42,0.05)] transition-colors hover:border-foreground/15 hover:bg-secondary/45 hover:text-foreground"
          onClick={onToggleCollapsed}
          type="button"
        >
          <PanelLeftClose size={18} strokeWidth={1.9} />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <PlaceholderAvatar />
            <div className="truncate text-[14px] font-medium text-foreground">内容创作</div>
          </div>
        </div>
      </div>

      <div className="mt-8 space-y-1.5">
        <SidebarExpandedItem icon={Plus} label="新建" onClick={onCreateSession} selected={activeModule === 'content'} />
        {sidebarModules.map((module) => (
          <SidebarExpandedItem
            icon={module.icon}
            key={module.id}
            label={module.label}
            onClick={() => onChangeModule(module.id)}
            selected={activeModule === module.id}
          />
        ))}
      </div>

      <div className="mt-8 text-[12px] font-medium tracking-[0.08em] text-muted-foreground">AI 对话历史</div>

      <div className="benchmark-scroll-hidden mt-3 min-h-0 flex-1 overflow-y-auto pb-4">
        {sessions.length === 0 ? (
          <div className="rounded-[16px] border border-border/70 bg-white px-4 py-10 text-center text-[14px] text-muted-foreground shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
            暂无历史对话
          </div>
        ) : (
          <div className="space-y-0">
            {sessions.map((session) => (
              <div
                className={cn(
                  'group/session flex items-center gap-2 rounded-[14px] border px-3 py-2.5 transition-colors',
                  session.id === activeSessionId
                    ? 'border-border/80 bg-white shadow-[0_8px_18px_rgba(15,23,42,0.04)]'
                    : 'border-transparent bg-transparent hover:border-border/70 hover:bg-white/75',
                )}
                key={session.id}
              >
                <button
                  className={cn(
                    'min-w-0 flex-1 text-left text-[14px] transition-colors',
                    session.id === activeSessionId ? 'text-foreground' : 'text-foreground/78 group-hover/session:text-foreground',
                  )}
                  onClick={() => onSelectSession(session.id)}
                  title={session.title}
                  type="button"
                >
                  <span className="block truncate">{session.title}</span>
                </button>

                <button
                  aria-label={`删除 ${session.title}`}
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-all hover:bg-secondary hover:text-foreground group-hover/session:opacity-100"
                  onClick={(event) => {
                    event.stopPropagation()
                    onDeleteSession(session)
                  }}
                  type="button"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
        </div>
    </aside>
  )
}

function DeleteSessionDialog({ onClose, onConfirm, open, sessionTitle }) {
  if (!open || typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/18 p-6 backdrop-blur-[8px]"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-[460px] overflow-hidden rounded-[26px] border border-white/80 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.16)]"
        onClick={(event) => event.stopPropagation()}
        role="presentation"
      >
        <div className="flex items-start justify-between gap-5 px-6 pb-0 pt-6">
          <div className="space-y-2">
            <h2 className="text-[24px] font-semibold leading-[1.2] tracking-[-0.02em] text-foreground">
              删除这篇文章？
            </h2>
            <p className="text-[14px] leading-[1.7] text-muted-foreground">
              《{sessionTitle}》会从本地历史记录里彻底删除，这个操作不能撤销。
            </p>
          </div>
          <button
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/70 bg-white text-muted-foreground shadow-sm transition-all hover:-translate-y-px hover:border-foreground/15 hover:bg-slate-50 hover:text-foreground"
            onClick={onClose}
            type="button"
          >
            <X size={17} />
          </button>
        </div>

        <div className="flex flex-col-reverse gap-3 px-6 pb-6 pt-6 sm:flex-row sm:justify-end">
          <Button
            className="h-11 rounded-xl border border-border/70 bg-white px-5 shadow-sm transition-all hover:-translate-y-px hover:border-foreground/15 hover:bg-slate-50 hover:text-foreground"
            onClick={onClose}
            type="button"
            variant="outline"
          >
            取消
          </Button>
          <Button
            className="h-11 rounded-xl bg-[#171b22] px-5 text-white shadow-none transition-all hover:-translate-y-px hover:bg-black"
            onClick={onConfirm}
            type="button"
          >
            确认删除
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function MessageBubble({ copiedMessageId, message, onCopy }) {
  const isAssistant = message.role === 'assistant'
  const isUser = message.role === 'user'
  const hasWorkflow = isAssistant && Boolean(message.workflow)

  return (
    <div
      className={cn(
        'group/message relative',
        isAssistant ? 'max-w-3xl' : 'ml-auto max-w-2xl text-right',
      )}
    >
      {message.attachments?.length ? (
        <div className={cn('mb-4', isUser && 'flex justify-end')}>
          <AttachmentPills align={isAssistant ? 'left' : 'right'} attachments={message.attachments} />
        </div>
      ) : null}

      <div
        className={cn(
          'text-[15px] leading-[1.7] text-foreground sm:text-[16px]',
          hasWorkflow && 'max-w-[720px]',
          isUser && 'ml-auto w-fit max-w-full rounded-[24px] bg-secondary/65 px-6 py-5 text-left font-medium',
        )}
      >
        {isAssistant ? renderMarkdownBlock(message.content) : message.content}
      </div>

      {hasWorkflow ? <WorkflowTimeline flow={message.workflow} /> : null}

      <div
        className={cn(
          'flex items-center gap-2 text-[12px] text-muted-foreground opacity-0 transition-opacity duration-150 group-hover/message:opacity-100',
          hasWorkflow ? 'mt-4' : 'mt-3',
          isAssistant && 'justify-start',
          isUser && 'justify-end',
        )}
      >
        <span>{formatMessageTime(message.createdAt)}</span>
        <CopyButton copied={copiedMessageId === message.id} onClick={() => onCopy(message.id, message.content)} />
      </div>
    </div>
  )
}

function GeneratedTitleSection({ title = '' }) {
  if (!title.trim()) {
    return null
  }

  return (
    <section className="mb-8 sm:mb-10">
      <div className="text-[18px] font-semibold leading-[1.75] text-foreground sm:text-[20px]">
        {title}
      </div>
    </section>
  )
}

function DraftWorkbench({ session, version }) {
  if (!version) {
    return <div className="text-[14px] text-muted-foreground">当前还没有文字稿。</div>
  }

  const topic = getSelectedTopic(session)
  const generatedTitle = resolveVersionGeneratedTitle(version)

  return (
    <div className="px-4 py-6 sm:px-6 sm:py-7">
      <div className="mx-auto max-w-[780px]">
        <div className="mb-6 flex flex-wrap items-center gap-2.5">
          <span className="rounded-full border border-border/70 bg-secondary/55 px-3 py-1.5 text-[12px] text-muted-foreground">
            {version.label}
          </span>
          <span className="rounded-full border border-border/70 bg-secondary/55 px-3 py-1.5 text-[12px] text-muted-foreground">
            {version.wordCount} 字
          </span>
          <span className="rounded-full border border-border/70 bg-secondary/55 px-3 py-1.5 text-[12px] text-muted-foreground">
            {topic?.penName || '未命名作者'}
          </span>
          <span className="rounded-full border border-border/70 bg-secondary/55 px-3 py-1.5 text-[12px] text-muted-foreground">
            {topic?.type || '未分类'}
          </span>
        </div>

        <article className="border-t border-border/65 pt-8 sm:pt-10">
          <GeneratedTitleSection title={generatedTitle} />
          {renderMarkdownBlock(getDraftBodyMarkdown(version), draftMarkdownComponents)}
        </article>
      </div>
    </div>
  )
}

function ReportWorkbench({ version }) {
  if (!version) {
    return <div className="text-[14px] text-muted-foreground">当前还没有校验报告。</div>
  }

  return (
    <div className="px-4 py-6 sm:px-6 sm:py-7">
      <div className="mx-auto max-w-[720px]">
        {renderMarkdownBlock(version.reportMarkdown, reportMarkdownComponents)}
      </div>
    </div>
  )
}

function ArticlePreview({ fontSize, session }) {
  const topic = getSelectedTopic(session)
  const version = getActiveVersion(session)
  const previewMarkdown = stripPreviewHeading(version?.draftMarkdown ?? '')
  const previewComponents = useMemo(() => getPreviewMarkdownComponents(fontSize), [fontSize])
  const displayTitle = resolveVersionDisplayTitle(session, version)

  return (
    <div className="px-4 py-6 sm:px-6 sm:py-7">
      <div className="mx-auto max-w-[720px]">
        <header className="text-center">
          <h2 className="mx-auto max-w-[640px] text-[24px] font-semibold leading-[1.45] tracking-[-0.02em] text-black">
            {displayTitle}
          </h2>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[12px] tracking-[0.08em] text-black/42">
            <span>{topic?.penName}</span>
            <span>{topic?.type}</span>
            <span>{version?.wordCount ?? 0} 字</span>
          </div>
        </header>

        <article className="mt-8 border-t border-black/8 pt-8">
          <ReactMarkdown components={previewComponents} remarkPlugins={[remarkGfm]}>
            {previewMarkdown}
          </ReactMarkdown>
        </article>

        <div className="mt-14 border-t border-black/8 pt-10 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-black/10 bg-[#f7f4ee] text-[15px] font-semibold text-black">
            煮
          </div>
          <div className="mt-4 text-[14px] font-semibold tracking-[0.12em] text-black">煮酒问人生</div>
          <p className="mx-auto mt-3 max-w-[420px] text-[13px] leading-7 text-black/56">
            在这里继续读人情、家事、晚年与人生。看完这一篇，也欢迎把它留给同样需要的人。
          </p>
          <div className="mx-auto mt-6 max-w-[320px] rounded-[22px] border border-black/10 bg-[#fbfaf7] px-5 py-4">
            <div className="text-[12px] tracking-[0.12em] text-black/48">固定引导关注区域</div>
            <div className="mt-2 text-[14px] font-medium text-black">关注“煮酒问人生”</div>
            <div className="mt-1 text-[12px] leading-6 text-black/56">持续查看同风格的晚年、关系和处世文章。</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function PreviewWorkbench({ onSetDevice, onSetFontSize, session }) {
  const { device, fontSize } = session.layoutReview
  const [copyStatus, setCopyStatus] = useState('idle')
  const copySourceRef = useRef(null)
  const topic = getSelectedTopic(session)
  const version = getActiveVersion(session)
  const previewMarkdown = stripPreviewHeading(version?.draftMarkdown ?? '')
  const wechatComponents = useMemo(() => getWechatCopyComponents(fontSize), [fontSize])
  const displayTitle = resolveVersionDisplayTitle(session, version)

  async function handleCopyWechat() {
    if (!copySourceRef.current) {
      return
    }

    try {
      await copyHtmlToClipboard(copySourceRef.current.innerHTML, copySourceRef.current.innerText)
      setCopyStatus('copied')
      window.setTimeout(() => {
        setCopyStatus('idle')
      }, 2000)
    } catch {
      setCopyStatus('error')
      window.setTimeout(() => {
        setCopyStatus('idle')
      }, 2000)
    }
  }

  return (
    <div className="benchmark-scroll-hidden min-h-0 overflow-y-auto px-6 py-6">
      <div ref={copySourceRef} style={{ left: '-9999px', opacity: 0, pointerEvents: 'none', position: 'fixed', top: 0 }}>
        <div style={{ maxWidth: '680px', margin: '0 auto', padding: '20px', backgroundColor: '#ffffff' }}>
          <h2
            style={{
              color: '#000000',
              fontSize: '24px',
              fontWeight: 600,
              lineHeight: 1.45,
              margin: '0 auto',
              maxWidth: '620px',
              textAlign: 'center',
            }}
          >
            {displayTitle || ''}
          </h2>
          <div
            style={{
              color: 'rgba(0,0,0,0.42)',
              display: 'flex',
              flexWrap: 'wrap',
              fontSize: '12px',
              gap: '12px',
              justifyContent: 'center',
              letterSpacing: '0.08em',
              marginTop: '16px',
            }}
          >
            <span>{topic?.penName || ''}</span>
            <span>{topic?.type || ''}</span>
            <span>{version?.wordCount ?? 0} 字</span>
          </div>
          <div style={{ borderTop: '1px solid rgba(0,0,0,0.08)', marginTop: '32px', paddingTop: '32px' }}>
            <ReactMarkdown components={wechatComponents} remarkPlugins={[remarkGfm]}>
              {previewMarkdown}
            </ReactMarkdown>
          </div>
          <div style={{ borderTop: '1px solid rgba(0,0,0,0.08)', marginTop: '56px', paddingTop: '40px', textAlign: 'center' }}>
            <div
              style={{
                alignItems: 'center',
                backgroundColor: '#f7f4ee',
                border: '1px solid rgba(0,0,0,0.1)',
                borderRadius: '9999px',
                color: '#000000',
                display: 'flex',
                fontSize: '15px',
                fontWeight: 600,
                height: '56px',
                justifyContent: 'center',
                margin: '0 auto',
                width: '56px',
              }}
            >
              煮
            </div>
            <div style={{ color: '#000000', fontSize: '14px', fontWeight: 600, letterSpacing: '0.12em', marginTop: '16px' }}>
              煮酒问人生
            </div>
            <p
              style={{
                color: 'rgba(0,0,0,0.56)',
                fontSize: '13px',
                lineHeight: 1.9,
                margin: '12px auto 0',
                maxWidth: '420px',
              }}
            >
              在这里继续读人情、家事、晚年与人生。看完这一篇，也欢迎把它留给同样需要的人。
            </p>
            <div
              style={{
                backgroundColor: '#fbfaf7',
                border: '1px solid rgba(0,0,0,0.1)',
                borderRadius: '22px',
                margin: '24px auto 0',
                maxWidth: '320px',
                padding: '16px 20px',
              }}
            >
              <div style={{ color: 'rgba(0,0,0,0.48)', fontSize: '12px', letterSpacing: '0.12em' }}>固定引导关注区域</div>
              <div style={{ color: '#000000', fontSize: '14px', fontWeight: 500, marginTop: '8px' }}>关注“煮酒问人生”</div>
              <div style={{ color: 'rgba(0,0,0,0.56)', fontSize: '12px', lineHeight: 1.8, marginTop: '4px' }}>
                持续查看同风格的晚年、关系和处世文章。
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[980px] flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-1">
          <div className="flex flex-wrap gap-2">
            <div className="inline-flex rounded-full bg-secondary/70 p-1">
              {[
                { id: 'mobile', label: '移动端', icon: Smartphone },
                { id: 'desktop', label: 'PC端', icon: Monitor },
              ].map((item) => (
                <button
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full px-3 py-2 text-[12px] transition-colors',
                    device === item.id ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground',
                  )}
                  key={item.id}
                  onClick={() => onSetDevice(item.id)}
                  type="button"
                >
                  <item.icon size={13} />
                  {item.label}
                </button>
              ))}
            </div>

            <div className="inline-flex rounded-full bg-secondary/70 p-1">
              {[
                { id: 'small', label: '小' },
                { id: 'medium', label: '推荐' },
                { id: 'large', label: '大' },
              ].map((item) => (
                <button
                  className={cn(
                    'rounded-full px-3 py-2 text-[12px] transition-colors',
                    fontSize === item.id ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground',
                  )}
                  key={item.id}
                  onClick={() => onSetFontSize(item.id)}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button className="rounded-full" onClick={handleCopyWechat} size="sm" type="button" variant="outline">
              {copyStatus === 'copied' ? (
                <>
                  <Check size={13} className="mr-1.5" />
                  已复制
                </>
              ) : copyStatus === 'error' ? (
                <>
                  <X size={13} className="mr-1.5" />
                  复制失败
                </>
              ) : (
                <>
                  <Copy size={13} className="mr-1.5" />
                  复制微信样式
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="flex justify-center">
          <div
            className={cn(
              'transition-all',
              device === 'mobile' ? 'w-[390px]' : 'w-full max-w-[860px]',
            )}
          >
            <ArticlePreview fontSize={fontSize} session={session} />
          </div>
        </div>
      </div>
    </div>
  )
}

function VersionsWorkbench({ activeVersionId, onSelectVersion, versions }) {
  return (
    <div className="mx-auto w-full max-w-[820px] space-y-4">
      {versions
        .slice()
        .reverse()
        .map((version) => (
          <div
            className={cn(
              'rounded-[26px] border p-5 transition-colors',
              version.id === activeVersionId ? 'border-primary/20 bg-primary/5' : 'border-border/70 bg-white',
            )}
            key={version.id}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[16px] font-semibold text-foreground">{version.label}</div>
                <div className="mt-1 text-[12px] text-muted-foreground">
                  {formatMessageTime(version.createdAt)} · {version.wordCount} 字
                </div>
              </div>
              <Button
                className="rounded-full"
                onClick={() => onSelectVersion(version.id)}
                size="sm"
                type="button"
                variant={version.id === activeVersionId ? 'default' : 'outline'}
              >
                {version.id === activeVersionId ? '当前查看中' : '切换查看'}
              </Button>
            </div>
            <div className="mt-3 text-[13px] leading-6 text-muted-foreground">{version.summary}</div>
            {version.note ? (
              <div className="mt-3 rounded-2xl bg-secondary/25 px-4 py-3 text-[13px] text-foreground">
                修改意见：{version.note}
              </div>
            ) : null}
          </div>
        ))}
    </div>
  )
}

function RightWorkbenchShell({
  activeTabId,
  onOpenTab,
  onSelectVersion,
  onSetDevice,
  onSetFontSize,
  session,
  tabs,
}) {
  const activeVersion = getActiveVersion(session)
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    if (!isFullscreen) {
      return
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setIsFullscreen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isFullscreen])

  function renderBody() {
    switch (activeTabId) {
      case 'draft':
        return <DraftWorkbench session={session} version={activeVersion} />
      case 'report':
        return <ReportWorkbench version={activeVersion} />
      case 'preview':
        return <PreviewWorkbench onSetDevice={onSetDevice} onSetFontSize={onSetFontSize} session={session} />
      case 'versions':
        return (
          <VersionsWorkbench
            activeVersionId={session.draftReview.activeVersionId}
            onSelectVersion={onSelectVersion}
            versions={session.draftReview.versions}
          />
        )
      default:
        return null
    }
  }

  const shellContent = (
    <aside
      className={cn(
        'flex min-h-0 flex-col overflow-hidden bg-white',
        isFullscreen ? 'fixed inset-0 z-50 rounded-none border-none' : 'h-full rounded-tl-[30px] border-l border-t border-border/70',
      )}
    >
      <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
        <div className="benchmark-scroll-hidden flex min-w-0 gap-2 overflow-x-auto pb-1">
            {tabs.map((tabId) => {
              const tab = workbenchTabs.find((item) => item.id === tabId)

              if (!tab) {
                return null
              }

              return (
                <button
                  className={cn(
                    'inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-[13px] transition-colors',
                    activeTabId === tab.id
                      ? 'border-border/75 bg-white text-foreground'
                      : 'border-transparent text-muted-foreground hover:bg-secondary/40 hover:text-foreground',
                  )}
                  key={tab.id}
                  onClick={() => onOpenTab(tab.id)}
                  type="button"
                >
                  <tab.icon size={14} />
                  {tab.label}
                </button>
              )
            })}
        </div>
        <button
          aria-label={isFullscreen ? '退出全屏' : '全屏视图'}
          className="ml-2 inline-flex shrink-0 items-center justify-center rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary/40 hover:text-foreground"
          onClick={() => setIsFullscreen((prev) => !prev)}
          type="button"
        >
          {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>
      </div>

      <div className="benchmark-scroll-hidden min-h-0 flex-1 overflow-y-auto bg-white px-6 py-6">
        {renderBody()}
      </div>
    </aside>
  )

  if (isFullscreen) {
    return createPortal(shellContent, document.body)
  }

  return shellContent
}

function LibraryModuleCanvas({ topicStatusById }) {
  return (
    <div className="benchmark-scroll-hidden min-h-0 flex-1 overflow-y-auto bg-white">
      <div className="mx-auto w-full max-w-[1320px] px-4 py-8 sm:px-5 lg:px-6">
        <div className="mb-6">
          <h1 className="text-[30px] font-semibold tracking-[-0.03em] text-foreground sm:text-[34px]">选题库</h1>
          <p className="mt-2 text-[14px] leading-6 text-muted-foreground">
            当前选题状态会和创作流程联动，已创作或创作中的选题会在这里同步标记。
          </p>
          <div className="mt-4 inline-flex rounded-full bg-secondary px-3 py-1.5 text-[12px] text-muted-foreground">
            当前预置 {topicLibraryItems.length} 个选题
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {topicLibraryItems.map((topic) => (
            <TopicLibraryCard key={topic.id} topic={topic} topicStatus={topicStatusById[topic.id] ?? 'pending'} />
          ))}
        </div>
      </div>
    </div>
  )
}

export default function BenchmarkWorkbenchPage() {
  const activeSessionId = useBenchmarkStore((state) => state.activeSessionId)
  const createSession = useBenchmarkStore((state) => state.createSession)
  const deleteSession = useBenchmarkStore((state) => state.deleteSession)
  const isSidebarCollapsed = useBenchmarkStore((state) => state.isSidebarCollapsed)
  const resetAllSessions = useBenchmarkStore((state) => state.resetAllSessions)
  const setSidebarCollapsed = useBenchmarkStore((state) => state.setSidebarCollapsed)
  const sessions = useBenchmarkStore((state) => state.sessions)
  const setActiveSessionId = useBenchmarkStore((state) => state.setActiveSessionId)
  const updateSession = useBenchmarkStore((state) => state.updateSession)

  const [searchQuery, setSearchQuery] = useState('')
  const [activeModule, setActiveModule] = useState('content')
  const [sessionPendingDelete, setSessionPendingDelete] = useState(null)
  const [copiedMessageId, setCopiedMessageId] = useState(null)
  const [isResizingSplit, setIsResizingSplit] = useState(false)
  const [rightPaneWidth, setRightPaneWidth] = useState(620)

  const composerRef = useRef(null)
  const splitContainerRef = useRef(null)

  const orderedSessions = useMemo(
    () =>
      [...sessions]
        .filter((session) => {
          if (!searchQuery.trim()) {
            return true
          }

          return session.title.toLowerCase().includes(searchQuery.trim().toLowerCase())
        })
        .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()),
    [searchQuery, sessions],
  )
  const historySessions = useMemo(() => orderedSessions.filter(hasSessionHistory), [orderedSessions])
  const topicStatusById = useMemo(() => getTopicStatusMap(sessions), [sessions])

  const activeSession =
    sessions.find((session) => session.id === activeSessionId) ?? orderedSessions[0] ?? sessions[0] ?? null
  const currentSessionId = activeSession?.id ?? null
  const currentStageId = activeSession?.stageId ?? 'topic'
  const selectedTopic = activeSession ? getSelectedTopic(activeSession) : null
  const activeVersion = activeSession ? getActiveVersion(activeSession) : null
  const activeFilterTypes = activeSession?.topicSelection?.filterTypes ?? []
  const visibleTopicRecommendations = useMemo(() => {
    if (!activeSession) {
      return []
    }

    if (activeSession.topicSelection.source !== 'preset') {
      return activeSession.topicSelection.recommendations ?? []
    }

    return createTopicRecommendations({
      filterTypes: activeFilterTypes,
      pageIndex: activeSession.topicSelection.pageIndex ?? 0,
      excludeSessionId: activeSession.id,
      sessions,
    })
  }, [activeFilterTypes, activeSession, sessions])
  const topicPageCount = useMemo(() => {
    if (!activeSession) {
      return 1
    }

    if (activeSession.topicSelection.source !== 'preset') {
      return Math.max(1, Math.ceil((activeSession.topicSelection.recommendations?.length ?? 0) / 6))
    }

    return getTopicRecommendationPageCount(activeFilterTypes, {
      excludeSessionId: activeSession.id,
      sessions,
    })
  }, [activeFilterTypes, activeSession, sessions])
  const availableTabs = activeSession ? getAvailableTabs(activeSession) : []
  const isBusy = Boolean(activeSession?.processingFlow)
  const isContentModule = activeModule === 'content'
  const composerDisabled = currentStageId !== 'draft' || isBusy
  const canSend = !composerDisabled && Boolean(activeSession?.draft.trim())
  const hasWorkbenchOutputs = availableTabs.length > 0
  const shouldRenderHero = isContentModule && currentStageId === 'topic' && !activeSession?.topicSelection?.selectedTopicId
  const showWorkbench = isContentModule && activeSession?.isWorkbenchOpen && hasWorkbenchOutputs

  useEffect(() => {
    if (!currentSessionId && orderedSessions[0]) {
      setActiveSessionId(orderedSessions[0].id)
    }
  }, [currentSessionId, orderedSessions, setActiveSessionId])

  useEffect(() => {
    if (!activeSession || availableTabs.length === 0) {
      return
    }

    if (!availableTabs.includes(activeSession.activeWorkbenchTab)) {
      updateSession(activeSession.id, {
        activeWorkbenchTab: availableTabs[0],
      })
    }
  }, [activeSession, availableTabs, updateSession])

  useEffect(() => {
    if (!activeSession || activeSession.topicSelection.source !== 'preset') {
      return
    }

    const currentPageIndex = activeSession.topicSelection.pageIndex ?? 0
    const clampedPageIndex = Math.min(Math.max(currentPageIndex, 0), topicPageCount - 1)

    if (clampedPageIndex === currentPageIndex) {
      return
    }

    updateSession(activeSession.id, (current) => ({
      ...current,
      topicSelection: {
        ...current.topicSelection,
        pageIndex: clampedPageIndex,
        recommendationError: '',
        recommendations: createTopicRecommendations({
          filterTypes: current.topicSelection.filterTypes,
          pageIndex: clampedPageIndex,
          excludeSessionId: current.id,
          sessions,
        }),
      },
    }))
  }, [activeSession, sessions, topicPageCount, updateSession])

  useLayoutEffect(() => {
    const container = splitContainerRef.current

    if (!container) {
      return
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]

      if (!entry) {
        return
      }

      setRightPaneWidth((current) => clampRightPaneWidth(current, entry.contentRect.width))
    })

    observer.observe(container)

    return () => {
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    if (!isResizingSplit) {
      return
    }

    function handlePointerMove(event) {
      const container = splitContainerRef.current

      if (!container) {
        return
      }

      const rect = container.getBoundingClientRect()
      const nextRightWidth = rect.right - event.clientX
      setRightPaneWidth(clampRightPaneWidth(nextRightWidth, rect.width))
    }

    function handlePointerUp() {
      setIsResizingSplit(false)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }

    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
    window.addEventListener('mousemove', handlePointerMove)
    window.addEventListener('mouseup', handlePointerUp)

    return () => {
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      window.removeEventListener('mousemove', handlePointerMove)
      window.removeEventListener('mouseup', handlePointerUp)
    }
  }, [isResizingSplit])

  function updateCurrentSession(updater) {
    if (!currentSessionId) {
      return
    }

    updateSession(currentSessionId, updater)
  }

  async function runFlow({
    awaitResultStepIndex,
    introMessageContent,
    onComplete,
    onError,
    resolveFlowOnComplete,
    resolveResult,
    resolveStepDelayMs,
    sessionId,
    summary,
    steps,
    title,
  }) {
    const flowId = createId('flow')
    const messageId = createId('assistant')
    const startedAt = Date.now()
    const holdStepIndex = Math.min(Math.max(awaitResultStepIndex ?? steps.length - 1, 0), steps.length - 1)
    const preparedSteps = createPreparedFlowSteps(flowId, steps, startedAt)

    const startedFlow = {
      createdAt: new Date(startedAt).toISOString(),
      id: flowId,
      messageId,
      steps: preparedSteps,
      summary,
      title,
    }

    updateSession(sessionId, (current) => ({
      ...current,
      messages: [
        ...current.messages,
        {
          content: introMessageContent || summary || title,
          createdAt: new Date(startedAt).toISOString(),
          id: messageId,
          role: 'assistant',
          workflow: startedFlow,
        },
      ],
      processingFlow: startedFlow,
    }))

    const updateExternalFlowSteps = (incomingSteps) => {
      updateSession(sessionId, (current) => {
        const activeFlow = current.processingFlow

        if (!activeFlow || activeFlow.id !== flowId) {
          return current
        }

        const nextFlow = {
          ...activeFlow,
          steps: mergeFlowProgressSteps(activeFlow.steps, incomingSteps),
        }

        return {
          ...current,
          messages: attachWorkflowToMessages(current.messages, messageId, nextFlow),
          processingFlow: nextFlow,
        }
      })
    }

    const resultPromise = resolveResult
      ? Promise.resolve().then(() =>
          resolveResult({
            flowId,
            messageId,
            startedAt,
            updateFlowSteps: updateExternalFlowSteps,
          }),
        )
      : Promise.resolve(null)

    for (let index = 0; index < holdStepIndex; index += 1) {
      const step = preparedSteps[index]
      const stepDelayMs =
        typeof resolveStepDelayMs === 'function'
          ? Math.max(0, resolveStepDelayMs(step, index, preparedSteps))
          : clampFlowStepDuration(step?.seconds ?? 1)

      await delay(stepDelayMs)

      updateSession(sessionId, (current) => {
        const activeFlow = current.processingFlow

        if (!activeFlow || activeFlow.id !== flowId) {
          return current
        }

        const nextSteps = advanceFlowSteps(activeFlow.steps, index, Date.now())
        const nextFlow = {
          ...activeFlow,
          steps: nextSteps,
        }

        return {
          ...current,
          messages: attachWorkflowToMessages(current.messages, messageId, nextFlow),
          processingFlow: nextFlow,
        }
      })
    }

    let resolvedResult = null

    try {
      resolvedResult = await resultPromise
    } catch (error) {
      updateSession(sessionId, (current) => {
        const activeFlow = current.processingFlow?.id === flowId ? current.processingFlow : startedFlow
        const failedFlow = {
          ...activeFlow,
          completedAt: new Date().toISOString(),
          errorMessage: error.message,
          steps: failFlowSteps(activeFlow.steps, Date.now()),
        }
        const nextSession = onError
          ? onError(current, error, { flowId, messageId, startedAt })
          : {
              activeWorkbenchTab: 'draft',
              isWorkbenchOpen: true,
              messages: updateMessageById(current.messages, messageId, (message) => ({
                content: appendMessageParagraph(message.content, `这一步执行失败了：${error.message}`),
              })),
            }

        return {
          ...current,
          ...nextSession,
          messages: attachWorkflowToMessages(nextSession.messages ?? current.messages, messageId, failedFlow),
          lastFlowSummary: failedFlow,
          processingFlow: null,
          runLogs: [failedFlow, ...(current.runLogs ?? [])].slice(0, 12),
        }
      })

      return
    }

    updateSession(sessionId, (current) => {
      const activeFlow = current.processingFlow?.id === flowId ? current.processingFlow : startedFlow
      const finishedAt = Date.now()
      let finalSteps = completeFlowSteps(activeFlow.steps, finishedAt)

      if (resolveFlowOnComplete) {
        finalSteps = resolveFlowOnComplete(finalSteps, resolvedResult, finishedAt)
      }

      const completedFlow = {
        ...activeFlow,
        completedAt: new Date(finishedAt).toISOString(),
        steps: finalSteps,
      }
      const nextSession = onComplete(current, resolvedResult, { flowId, messageId, startedAt })

      return {
        ...current,
        ...nextSession,
        messages: attachWorkflowToMessages(nextSession.messages ?? current.messages, messageId, completedFlow),
        lastFlowSummary: completedFlow,
        processingFlow: null,
        runLogs: [completedFlow, ...(current.runLogs ?? [])].slice(0, 12),
      }
    })
  }

  async function handleSelectTopic(topicId, topicOverride = null) {
    if (!currentSessionId || !activeSession) {
      return
    }

    const topic =
      topicOverride ??
      visibleTopicRecommendations.find((item) => item.id === topicId)

    if (!topic) {
      return
    }

    if (CONTENT_FLOW_UI_PREVIEW) {
      updateSession(currentSessionId, (current) => buildMockInitialDraftExperience({ current, topic }))
      return
    }

    updateSession(currentSessionId, (current) => ({
      ...current,
      messages: [
        ...current.messages,
        {
          id: createId('user'),
          role: 'user',
          content: `我选这个：${topic.title}`,
          createdAt: new Date().toISOString(),
        },
      ],
      title: topic.title,
      topicSelection: {
        ...current.topicSelection,
        recommendationError: '',
        selectedTopicId: topicId,
        selectedTopic: topic,
      },
    }))

    await runFlow({
      awaitResultStepIndex: 0,
      introMessageContent: INITIAL_DRAFT_FLOW_INTRO_MESSAGE,
      onComplete: (current, generated, { messageId }) => {
        const currentTopic = getSelectedTopic(current)
        const version = buildVersionFromGeneratedResult({
          generated,
          note: '',
          supplement: '',
          topic: currentTopic,
          versionNumber: 1,
        })

        return {
          activeWorkbenchTab: 'draft',
          draftReview: {
            ...current.draftReview,
            activeVersionId: version.id,
            latestNote: '',
            versions: [version],
          },
          isWorkbenchOpen: true,
          messages: updateMessageById(current.messages, messageId, (message) => ({
            content: appendMessageParagraph(
              message.content,
              '首版稿件已经准备好了，右侧可以查看正文和校验报告。你确认后，我会继续生成排版预览。',
            ),
          })),
          stageId: 'draft',
          title: resolveVersionDisplayTitle(current, version),
        }
      },
      onError: (current, error, { messageId }) => ({
        activeWorkbenchTab: 'draft',
        isWorkbenchOpen: true,
        messages: updateMessageById(current.messages, messageId, (message) => ({
          content: appendMessageParagraph(
            message.content,
            `首版稿件生成失败了：${error.message}。你可以重新点击当前选题，再试一次。`,
          ),
        })),
        topicSelection: {
          ...current.topicSelection,
          selectedTopicId: null,
          selectedTopic: null,
        },
      }),
      resolveResult: ({ updateFlowSteps }) =>
        requestGeneratedDraft({
          action: 'initial',
          deepThinkingEnabled: activeSession.deepThinkingEnabled,
          onProgress: (event) => {
            updateFlowSteps(event.steps)
          },
          streamProgress: true,
          supplement: '',
          topic,
        }),
      resolveFlowOnComplete: (flowSteps, generated, finishedAt) => {
        const { decision, shouldSkipAutoRevision } = resolveInitialDraftFlowOutcome(
          generated?.reportMarkdown ?? '',
          generated?.decision ?? '',
        )
        return flowSteps.map((step, index) => {
          if (index === 5) {
            return {
              ...step,
              label: `判定修改方式（${decision}）`,
            }
          }

          if (index !== 6 || !shouldSkipAutoRevision) {
            return step
          }

          return {
            ...step,
            completedAt: finishedAt,
            elapsedMs: 0,
            startedAt: null,
            status: 'skipped',
          }
        })
      },
      sessionId: currentSessionId,
      summary: INITIAL_DRAFT_FLOW_SUMMARY,
      steps: INITIAL_DRAFT_FLOW_STEPS,
      title: INITIAL_DRAFT_FLOW_TITLE,
    })
  }

  function handleApplyTopicFilters(nextFilterTypes) {
    if (!currentSessionId || !activeSession) {
      return
    }

    const normalizedFilterTypes = Array.from(new Set(nextFilterTypes)).slice(0, 3)
    const nextRecommendations = createTopicRecommendations({
      filterTypes: normalizedFilterTypes,
      pageIndex: 0,
      excludeSessionId: currentSessionId,
      sessions,
    })

    updateSession(currentSessionId, (current) => ({
      ...current,
      topicSelection: {
        ...current.topicSelection,
        filterTypes: normalizedFilterTypes,
        pageIndex: 0,
        recommendationError: '',
        recommendations: nextRecommendations,
        selectedTopicId: null,
        selectedTopic: null,
        source: 'preset',
      },
    }))
  }

  function handleClearTopicFilters() {
    handleApplyTopicFilters([])
  }

  function handleSelectTopicPage(nextPageIndex) {
    if (!currentSessionId || !activeSession) {
      return
    }

    const clampedPageIndex = Math.min(Math.max(nextPageIndex, 0), topicPageCount - 1)
    const nextRecommendations = createTopicRecommendations({
      filterTypes: activeSession.topicSelection.filterTypes,
      pageIndex: clampedPageIndex,
      excludeSessionId: currentSessionId,
      sessions,
    })

    updateSession(currentSessionId, (current) => ({
      ...current,
      topicSelection: {
        ...current.topicSelection,
        pageIndex: clampedPageIndex,
        recommendationError: '',
        recommendations: nextRecommendations,
        selectedTopicId: null,
        selectedTopic: null,
        source: 'preset',
      },
    }))
  }

  function handleSelectWorkbenchTab(tabId) {
    updateCurrentSession((current) => ({
      ...current,
      activeWorkbenchTab: tabId,
      isWorkbenchOpen: true,
    }))
  }

  async function handleProceedWithoutChanges() {
    if (!currentSessionId) {
      return
    }

    updateSession(currentSessionId, (current) => ({
      ...current,
      messages: [
        ...current.messages,
        {
          id: createId('user'),
          role: 'user',
          content: '无需修改',
          createdAt: new Date().toISOString(),
        },
      ],
    }))

    await runFlow({
      introMessageContent:
        '收到，这一版文字稿已确认。我现在开始整理排版预览，完成后右侧会显示可确认的排版效果。',
      onComplete: (current, _generated, { messageId }) => {
        return {
          activeWorkbenchTab: 'preview',
          messages: updateMessageById(current.messages, messageId, (message) => ({
            content: appendMessageParagraph(
              message.content,
              '极简排版预览已经准备好了。右侧可以切换 PC、移动端和字号，确认后这轮内容创作就完成了。',
            ),
          })),
          stageId: 'preview',
        }
      },
      sessionId: currentSessionId,
      summary: '文字稿确认完成，系统正在整理极简排版预览。',
      steps: [
        { label: '整理标题、正文和段落层级', seconds: 5, tabId: 'draft' },
        { label: '生成 PC 端排版预览', seconds: 6, tabId: 'preview' },
        { label: '生成移动端排版预览', seconds: 6, tabId: 'preview' },
      ],
      title: '正在生成排版预览',
    })
  }

  async function handleRewriteWholeDraft() {
    if (!currentSessionId || !activeSession) {
      return
    }

    const rewriteInstruction = '请整篇重写当前文章，保留核心主题，但重新组织结构、故事和表达节奏。'

    updateSession(currentSessionId, (current) => ({
      ...current,
      messages: [
        ...current.messages,
        {
          id: createId('user'),
          role: 'user',
          content: '整篇重写',
          createdAt: new Date().toISOString(),
        },
      ],
    }))

    await runFlow({
      introMessageContent:
        '收到，我会按整篇重写的方式重新处理这一版文字稿。完成后，右侧会同步更新正文和校验报告。',
      onComplete: (current, generated, { messageId }) => {
        const currentTopic = getSelectedTopic(current)
        const nextVersion = buildVersionFromGeneratedResult({
          generated,
          note: rewriteInstruction,
          supplement: '',
          topic: currentTopic,
          versionNumber: current.draftReview.versions.length + 1,
        })

        return {
          activeWorkbenchTab: 'draft',
          draftReview: {
            ...current.draftReview,
            activeVersionId: nextVersion.id,
            latestNote: rewriteInstruction,
            versions: [...current.draftReview.versions, nextVersion],
          },
          isWorkbenchOpen: true,
          messages: updateMessageById(current.messages, messageId, (message) => ({
            content: appendMessageParagraph(
              message.content,
              '我已经按“整篇重写”的方式重新生成了一版，右侧的正文和校验报告都更新好了。',
            ),
          })),
          title: resolveVersionDisplayTitle(current, nextVersion),
        }
      },
      onError: (current, error, { messageId }) => ({
        activeWorkbenchTab: 'draft',
        isWorkbenchOpen: true,
        messages: updateMessageById(current.messages, messageId, (message) => ({
          content: appendMessageParagraph(
            message.content,
            `整篇重写失败了：${error.message}。你可以稍后再试，或改用局部修改。`,
          ),
        })),
      }),
      resolveResult: () =>
        requestGeneratedDraft({
          action: 'revise',
          deepThinkingEnabled: activeSession.deepThinkingEnabled,
          note: rewriteInstruction,
          supplement: '',
          topic: selectedTopic,
        }),
      sessionId: currentSessionId,
      summary: '正在整篇重写当前文字稿。',
      steps: [
        { label: '重新规划文章结构与节奏', seconds: 4, tabId: 'draft' },
        { label: '整篇重写正文', seconds: 9, tabId: 'draft' },
        { label: '重新输出详细校验报告', seconds: 5, tabId: 'report' },
      ],
      title: '正在整篇重写',
    })
  }

  async function handleComposerSubmit() {
    if (!currentSessionId || !activeSession || !canSend) {
      return
    }

    const currentDraft = activeSession.draft.trim()

    updateSession(currentSessionId, (current) => ({
      ...current,
      draft: '',
      messages: [
        ...current.messages,
        {
          id: createId('user'),
          role: 'user',
          content: currentDraft,
          createdAt: new Date().toISOString(),
        },
      ],
    }))

    if (currentStageId === 'draft') {
      await runFlow({
        introMessageContent:
          '收到，我先根据你的修改意见重新处理这一版文字稿。完成后，右侧会同步更新正文和校验报告。',
        onComplete: (current, generated, { messageId }) => {
          const currentTopic = getSelectedTopic(current)
          const nextVersion = buildVersionFromGeneratedResult({
            generated,
            note: currentDraft,
            supplement: '',
            topic: currentTopic,
            versionNumber: current.draftReview.versions.length + 1,
          })

          return {
            activeWorkbenchTab: 'draft',
            draftReview: {
              ...current.draftReview,
              activeVersionId: nextVersion.id,
              latestNote: currentDraft,
              versions: [...current.draftReview.versions, nextVersion],
            },
            isWorkbenchOpen: true,
            messages: updateMessageById(current.messages, messageId, (message) => ({
              content: appendMessageParagraph(
                message.content,
                '我已经按你的修改意见完成重写，这一版正文和校验报告都更新在右侧了。',
              ),
            })),
            title: resolveVersionDisplayTitle(current, nextVersion),
          }
        },
        onError: (current, error, { messageId }) => ({
          activeWorkbenchTab: 'draft',
          draft: currentDraft,
          isWorkbenchOpen: true,
          messages: updateMessageById(current.messages, messageId, (message) => ({
            content: appendMessageParagraph(
              message.content,
              `这轮改稿失败了：${error.message}。修改意见我先帮你保留在输入框里了，处理好后可以直接重试。`,
            ),
          })),
        }),
        resolveResult: () =>
          requestGeneratedDraft({
            action: 'revise',
            deepThinkingEnabled: activeSession.deepThinkingEnabled,
            note: currentDraft,
            supplement: '',
            topic: selectedTopic,
          }),
        sessionId: currentSessionId,
        summary: '正在根据你的意见重写这一版文字稿。',
        steps: [
          { label: '读取修改意见并定位段落', seconds: 3, tabId: 'draft' },
          { label: '完成局部改写', seconds: 7, tabId: 'draft' },
          { label: '重新输出详细校验报告', seconds: 5, tabId: 'report' },
      ],
      title: '正在重写当前文字稿',
      })

      return
    }

    updateSession(currentSessionId, (current) => ({
      ...current,
      messages: [
        ...current.messages,
        {
          id: createId('assistant'),
          role: 'assistant',
          content: '我已经记下这条补充说明了。当前节点先在右侧确认预览效果。',
          createdAt: new Date().toISOString(),
        },
      ],
    }))
  }

  function handleSubmit(event) {
    event.preventDefault()
    handleComposerSubmit()
  }

  function handleComposerKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleComposerSubmit()
    }
  }

  async function handleConfirmPreview() {
    if (!currentSessionId) {
      return
    }

    updateSession(currentSessionId, (current) => ({
      ...current,
      messages: [
        ...current.messages,
        {
          id: createId('user'),
          role: 'user',
          content: '排版确认通过',
          createdAt: new Date().toISOString(),
        },
      ],
    }))

    await runFlow({
      introMessageContent:
        '收到，我正在完成这轮排版确认并收束最终结果。完成后，当前版本会进入已确认状态。',
      onComplete: (current, _generated, { messageId }) => ({
        activeWorkbenchTab: 'preview',
        messages: updateMessageById(current.messages, messageId, (message) => ({
          content: appendMessageParagraph(
            message.content,
            '当前版本已经完成排版确认。你可以继续在右侧查看正文、校验报告和最终预览。',
          ),
        })),
        stageId: 'completed',
      }),
      sessionId: currentSessionId,
      summary: '排版确认完成，系统正在收束本轮内容创作结果。',
      steps: [
        { label: '确认正文层级与段落间距', seconds: 4, tabId: 'preview' },
        { label: '写入最终字号与设备偏好', seconds: 4, tabId: 'preview' },
      ],
      title: '正在完成本轮排版确认',
    })
  }

  function handleDraftChange(nextDraft) {
    updateCurrentSession((current) => ({
      ...current,
      draft: nextDraft,
    }))
  }

  function handleToggleDeepThinking() {
    updateCurrentSession((current) => ({
      ...current,
      deepThinkingEnabled: !current.deepThinkingEnabled,
    }))
  }

  function handleToggleSidebarCollapsed() {
    setSidebarCollapsed(!isSidebarCollapsed)
  }

  function handleToggleWorkbench() {
    updateCurrentSession((current) => ({
      ...current,
      isWorkbenchOpen: !current.isWorkbenchOpen,
    }))
  }

  function handleCreateSession() {
    const nextSessionId = createSession()
    setActiveModule('content')
    setCopiedMessageId(null)

    if (nextSessionId) {
      window.requestAnimationFrame(() => {
        composerRef.current?.focus()
      })
    }
  }

  function handleRequestDeleteSession(session) {
    setSessionPendingDelete({
      id: session.id,
      title: session.title,
    })
  }

  function handleCancelDeleteSession() {
    setSessionPendingDelete(null)
  }

  function handleConfirmDeleteSession() {
    if (!sessionPendingDelete?.id) {
      return
    }

    deleteSession(sessionPendingDelete.id)
    setSessionPendingDelete(null)
    setCopiedMessageId(null)
  }

  function handleSelectSession(sessionId) {
    setActiveModule('content')
    setActiveSessionId(sessionId)
    setCopiedMessageId(null)
  }

  function handleQuickMessageInsert(label) {
    if (composerDisabled) {
      return
    }

    updateCurrentSession((current) => {
      const trimmed = current.draft.trim()

      if (!trimmed) {
        return {
          ...current,
          draft: label,
        }
      }

      return {
        ...current,
        draft: trimmed.includes(label) ? trimmed : `${trimmed} ${label}`,
      }
    })

    window.requestAnimationFrame(() => {
      composerRef.current?.focus()
    })
  }

  async function handleCopyMessage(messageId, content) {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedMessageId(messageId)
      window.setTimeout(() => {
        setCopiedMessageId((current) => (current === messageId ? null : current))
      }, 1500)
    } catch {
      setCopiedMessageId(null)
    }
  }

  function getComposerPlaceholder() {
    if (isBusy) {
      return '当前正在生成首版稿件，请先等待这轮处理完成'
    }

    if (currentStageId === 'topic') {
      return '先在上方确认推荐选题，或通过筛选切换当前显示的选题类型'
    }

    if (currentStageId === 'draft') {
      return '输入修改意见，按 Enter 发送'
    }

    if (currentStageId === 'preview') {
      return '当前先在右侧确认排版效果'
    }

    return '当前版本已经完成排版确认'
  }

  return (
    <section className="flex h-screen min-h-0 overflow-hidden bg-white">
      <SessionSidebar
        activeModule={activeModule}
        activeSessionId={currentSessionId}
        isCollapsed={isSidebarCollapsed}
        onChangeModule={setActiveModule}
        onCreateSession={handleCreateSession}
        onDeleteSession={handleRequestDeleteSession}
        onSearchChange={setSearchQuery}
        onSelectSession={handleSelectSession}
        onToggleCollapsed={handleToggleSidebarCollapsed}
        searchQuery={searchQuery}
        sessions={historySessions}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white">
        <div className="flex h-[76px] shrink-0 items-center justify-end bg-white px-6">
          {isContentModule && !shouldRenderHero ? (
            <button
              aria-label={activeSession?.isWorkbenchOpen ? '收起右侧工作区' : '展开右侧工作区'}
              className="inline-flex h-11 min-w-11 items-center justify-center rounded-2xl border border-border/80 bg-white px-3 text-muted-foreground transition-colors hover:text-foreground"
              disabled={!hasWorkbenchOutputs}
              onClick={handleToggleWorkbench}
              type="button"
            >
              {activeSession?.isWorkbenchOpen ? (
                <PanelRightClose className={cn(!hasWorkbenchOutputs && 'opacity-35')} size={18} strokeWidth={1.9} />
              ) : (
                <PanelRightOpen className={cn(!hasWorkbenchOutputs && 'opacity-35')} size={18} strokeWidth={1.9} />
              )}
            </button>
          ) : null}
        </div>

        <div ref={splitContainerRef} className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <div
            className="flex min-h-0 min-w-0 flex-1 flex-col bg-white"
            style={{
              minWidth: `${LEFT_PANE_MIN_WIDTH}px`,
              width: showWorkbench ? `calc(100% - ${rightPaneWidth}px)` : '100%',
            }}
          >
            {!isContentModule ? (
              <LibraryModuleCanvas topicStatusById={topicStatusById} />
            ) : shouldRenderHero ? (
              <div className="benchmark-scroll-hidden min-h-0 flex-1 overflow-y-auto">
                <div className="mx-auto flex w-full max-w-[1240px] flex-col items-center px-6 py-8 sm:px-8 lg:px-12">
                  <div className="max-w-[880px] text-center">
                    <h1 className="text-[34px] font-semibold tracking-[-0.03em] text-foreground sm:text-[42px]">
                      开始内容创作
                    </h1>
                    <p className="mx-auto mt-3 max-w-[820px] text-[15px] leading-7 text-muted-foreground">
                      系统会优先从未进入创作的选题里随机加载 6 个预设选题。你也可以按类型筛选后翻页查看更多选题。
                    </p>
                  </div>

                  <div className="mt-8 w-full max-w-[1120px]">
                    <TopicStageCard
                      filterTypes={activeSession?.topicSelection?.filterTypes ?? []}
                      onApplyFilters={handleApplyTopicFilters}
                      onClearFilters={handleClearTopicFilters}
                      onSelectPage={handleSelectTopicPage}
                      onSelectTopic={handleSelectTopic}
                      pageCount={topicPageCount}
                      pageIndex={activeSession?.topicSelection?.pageIndex ?? 0}
                      recommendations={visibleTopicRecommendations}
                      selectedTopicId={activeSession?.topicSelection?.selectedTopicId ?? null}
                      topicStatusById={topicStatusById}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="mx-auto flex min-h-0 w-full max-w-[1240px] flex-1 flex-col px-4 sm:px-6 lg:px-8">
                <div className="min-h-0 flex-1 overflow-hidden">
                  <div className="benchmark-scroll-hidden h-full overflow-y-auto pb-1">
                    <div className="flex flex-col gap-8 pb-6 pt-6">
                      {(activeSession?.messages ?? []).map((message) => (
                        <MessageBubble
                          copiedMessageId={copiedMessageId}
                          key={message.id}
                          message={message}
                          onCopy={handleCopyMessage}
                        />
                      ))}

                      {!isBusy && currentStageId === 'draft' ? (
                        <DraftStageCard
                          activeVersion={activeVersion}
                          onOpenTab={handleSelectWorkbenchTab}
                          onProceedWithoutChanges={handleProceedWithoutChanges}
                          onRewriteAll={handleRewriteWholeDraft}
                        />
                      ) : null}

                      {!isBusy && currentStageId === 'preview' ? (
                        <PreviewStageCard onConfirm={handleConfirmPreview} onOpenTab={handleSelectWorkbenchTab} />
                      ) : null}

                      {!isBusy && currentStageId === 'completed' ? (
                        <CompletedStageCard onOpenTab={handleSelectWorkbenchTab} />
                      ) : null}
                    </div>
                  </div>
                </div>

                <footer className="shrink-0 bg-white pb-3 pt-1 sm:pb-5">
                  <form className="mx-auto w-full max-w-[1120px]" onSubmit={handleSubmit}>
                    <div className="rounded-[24px] border border-border/80 bg-white px-4 py-3">
                      <Textarea
                        className="benchmark-scroll-hidden max-h-[68px] min-h-[58px] resize-none border-0 bg-transparent px-1 py-2 text-[15px] leading-[1.5] shadow-none focus-visible:border-0 focus-visible:ring-0 sm:text-[15px]"
                        disabled={composerDisabled}
                        onChange={(event) => handleDraftChange(event.target.value)}
                        onKeyDown={handleComposerKeyDown}
                        placeholder={getComposerPlaceholder()}
                        ref={composerRef}
                        rows={1}
                        value={activeSession?.draft ?? ''}
                      />

                      <div className="mt-2 flex items-center justify-between border-t border-border/70 px-1 pt-3">
                        <div className="flex items-center gap-2">
                          <ThinkingToggle checked={activeSession?.deepThinkingEnabled ?? true} onChange={handleToggleDeepThinking} />
                        </div>

                        <div className="flex items-center gap-2">
                          <QuickMessageMenu disabled={composerDisabled} onSelect={handleQuickMessageInsert} />
                          <div className="rounded-full px-2.5 py-1 text-[13px] text-foreground">
                            {activeSession?.deepThinkingEnabled ? reasoningModel : highspeedModel}
                          </div>
                          <Button
                            className="size-10 rounded-full bg-[#171b22] text-white shadow-none hover:bg-black"
                            disabled={!canSend}
                            size="icon-lg"
                            type="submit"
                          >
                            {isBusy ? <LoaderCircle className="animate-spin" size={16} /> : <ArrowUp size={16} />}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </form>
                </footer>
              </div>
            )}
          </div>

          {showWorkbench ? (
            <div
              className="relative min-h-0 shrink-0 bg-white"
              style={{ minWidth: `${RIGHT_PANE_MIN_WIDTH}px`, width: `${rightPaneWidth}px` }}
            >
              <button
                aria-label="调整左右宽度"
                className="group absolute inset-y-0 left-0 z-20 w-6 -translate-x-1/2 cursor-col-resize"
                onMouseDown={() => setIsResizingSplit(true)}
                type="button"
              >
                <span className="absolute bottom-0 left-1/2 top-8 w-px -translate-x-1/2 bg-border/80 transition-colors group-hover:bg-foreground/35" />
                <span className="absolute left-1/2 top-1/2 h-10 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-border/80 bg-white shadow-[0_8px_18px_rgba(15,23,42,0.05)] transition-colors group-hover:border-foreground/20">
                  <span className="absolute inset-x-[3px] top-1/2 h-4 -translate-y-1/2 rounded-full bg-secondary/90" />
                </span>
              </button>
              <RightWorkbenchShell
                activeTabId={activeSession.activeWorkbenchTab}
                onOpenTab={handleSelectWorkbenchTab}
                onSelectVersion={(versionId) =>
                  updateCurrentSession((current) => {
                    const nextSession = {
                      ...current,
                      activeWorkbenchTab: 'draft',
                      draftReview: {
                        ...current.draftReview,
                        activeVersionId: versionId,
                      },
                    }
                    const nextVersion =
                      nextSession.draftReview.versions.find((version) => version.id === versionId) ??
                      nextSession.draftReview.versions[nextSession.draftReview.versions.length - 1]

                    return {
                      ...nextSession,
                      title: resolveVersionDisplayTitle(nextSession, nextVersion),
                    }
                  })
                }
                onSetDevice={(device) =>
                  updateCurrentSession((current) => ({
                    ...current,
                    layoutReview: {
                      ...current.layoutReview,
                      device,
                    },
                  }))
                }
                onSetFontSize={(fontSize) =>
                  updateCurrentSession((current) => ({
                    ...current,
                    layoutReview: {
                      ...current.layoutReview,
                      fontSize,
                    },
                  }))
                }
                session={activeSession}
                tabs={availableTabs}
              />
            </div>
          ) : null}
        </div>
      </div>

      <DeleteSessionDialog
        onClose={handleCancelDeleteSession}
        onConfirm={handleConfirmDeleteSession}
        open={Boolean(sessionPendingDelete)}
        sessionTitle={sessionPendingDelete?.title ?? ''}
      />
    </section>
  )
}
