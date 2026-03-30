import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowUp,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  FileText,
  History,
  LibraryBig,
  LayoutTemplate,
  LoaderCircle,
  MessageSquareText,
  Monitor,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Paperclip,
  PenSquare,
  Plus,
  RefreshCw,
  ScrollText,
  Search,
  Smartphone,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { createTopicRecommendations, useBenchmarkStore } from '@/stores/useBenchmarkStore.js'

const reasoningModel = 'MiniMax-M2.7 深度模式'
const highspeedModel = 'MiniMax-M2.7 标准模式'
const LEFT_PANE_MIN_WIDTH = 640
const RIGHT_PANE_MIN_WIDTH = 540
const FLOW_DELAY_MS = 260

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

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
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

function renderMarkdownBlock(content) {
  return (
    <ReactMarkdown components={markdownComponents} remarkPlugins={[remarkGfm]}>
      {content}
    </ReactMarkdown>
  )
}

function getSessionById(sessionId) {
  return useBenchmarkStore.getState().sessions.find((session) => session.id === sessionId) ?? null
}

function getSelectedTopic(session) {
  return (
    session?.topicSelection?.recommendations?.find((topic) => topic.id === session.topicSelection.selectedTopicId) ??
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

function getStageIndex(stageId) {
  return stageOrder.findIndex((stage) => stage.id === stageId)
}

function getStageStatus(stageId, currentStageId) {
  if (currentStageId === 'completed') {
    return 'done'
  }

  const currentIndex = getStageIndex(currentStageId)
  const stageIndex = getStageIndex(stageId)

  if (stageIndex < currentIndex) {
    return 'done'
  }

  if (stageIndex === currentIndex) {
    return 'current'
  }

  return 'pending'
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

function normalizeRecommendedTopics(recommendations = []) {
  return recommendations
    .map((topic, index) => {
      const title = typeof topic?.title === 'string' ? topic.title.trim() : ''

      if (!title) {
        return null
      }

      return {
        id: typeof topic?.id === 'string' ? topic.id : createId(`recommended-topic-${index + 1}`),
        penName: typeof topic?.penName === 'string' && topic.penName.trim() ? topic.penName : '明远',
        reason:
          typeof topic?.reason === 'string' && topic.reason.trim()
            ? topic.reason.trim()
            : '这个方向更贴近你刚才补充的选题偏好。',
        theme: typeof topic?.theme === 'string' && topic.theme.trim() ? topic.theme.trim() : '做人处世智慧',
        title,
        type: typeof topic?.type === 'string' && topic.type.trim() ? topic.type.trim() : 'B型',
      }
    })
    .filter(Boolean)
}

function inferTopicTheme(title = '') {
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

function inferTopicType(title = '') {
  if (/\d/.test(title)) {
    return 'B型'
  }

  if (/热搜|热点|爆火|刷屏|事件|新闻/.test(title)) {
    return 'C型'
  }

  return 'A型'
}

function buildCustomTopic(title) {
  const trimmedTitle = title.trim().slice(0, 30)
  const type = inferTopicType(trimmedTitle)
  const theme = inferTopicTheme(trimmedTitle)
  const penName = type === 'A型' ? '芷若' : '明远'

  return {
    id: createId('custom-topic'),
    penName,
    reason: `根据你输入的自定义选题，系统判断更适合按${type}来写，并归入“${theme}”这个母题。`,
    theme,
    title: trimmedTitle,
    type,
  }
}

function buildDraftVersion({ note = '', supplement = '', topic, versionNumber }) {
  const noteSummary = note.trim() ? `这次重点吸收了你的修改意见：${note.trim()}。` : ''
  const supplementSummary = supplement.trim() ? `系统已同时吸收补充要求：${supplement.trim()}。` : ''
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
    `在结尾部分，要把情绪从“委屈”收束到“清醒”。不是控诉谁坏，而是让读者明白：被反复忽略的人，最终离开的那一步，看起来很轻，背后却是很重的累积。${supplementSummary}${noteSummary}`.trim(),
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
    supplement.trim() ? `- 已吸收补充要求：${supplement.trim()}` : '- 当前未添加额外补充要求。',
  ].join('\n')

  return {
    id: createId('version'),
    createdAt: new Date().toISOString(),
    draftMarkdown,
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
    reportMarkdown: generated?.reportMarkdown?.trim() || fallbackVersion.reportMarkdown,
    summary: generated?.summary?.trim() || fallbackVersion.summary,
    wordCount: countReadableLength(generated?.draftMarkdown?.trim() || fallbackVersion.draftMarkdown),
  }
}

async function requestGeneratedDraft({ action, deepThinkingEnabled, note = '', supplement = '', topic }) {
  const response = await fetch('/api/content-draft', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action,
      deepThinkingEnabled,
      note,
      supplement,
      topic,
    }),
  })

  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(payload?.error || 'MiniMax 内容创作失败')
  }

  return payload
}

async function requestTopicRecommendations({ supplement = '' }) {
  const response = await fetch('/api/topic-recommendations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      supplement,
    }),
  })

  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(payload?.error || '推荐选题生成失败')
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
      ? 'text-[13px] leading-[2.05]'
      : fontSize === 'large'
        ? 'text-[16px] leading-[2.15]'
        : 'text-[14px] leading-[2.1]'

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

function formatEstimateLabel(steps = []) {
  const total = steps.reduce((sum, step) => sum + (step.seconds ?? 0), 0)

  if (total <= 0) {
    return ''
  }

  return `预计 ${total} 秒`
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
    <div className="pointer-events-none absolute left-[calc(100%+16px)] top-1/2 z-40 w-[280px] -translate-y-1/2 rounded-[18px] border border-border/80 bg-white p-4 opacity-0 shadow-[0_24px_60px_rgba(15,23,42,0.14)] transition-all duration-150 group-hover/history-card:pointer-events-auto group-hover/history-card:opacity-100">
      <div className="relative">
        <span className="absolute left-[-21px] top-1/2 h-3 w-3 -translate-y-1/2 rotate-45 rounded-[3px] border-l border-t border-border/80 bg-white" />
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
                {session.id === activeSessionId ? <span className="ml-3 text-[11px] text-muted-foreground">当前</span> : null}
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

function NodeProgressRail({ currentStageId }) {
  return (
    <div className="flex flex-wrap gap-2">
      {stageOrder.map((stage, index) => {
        const status = getStageStatus(stage.id, currentStageId)

        return (
          <div
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] transition-colors',
              status === 'done' && 'border-primary/20 bg-primary/10 text-primary',
              status === 'current' && 'border-foreground/15 bg-foreground text-white',
              status === 'pending' && 'border-border/70 bg-white text-muted-foreground',
            )}
            key={stage.id}
          >
            <span className="flex size-4 items-center justify-center rounded-full bg-white/80 text-[10px] text-current">
              {index + 1}
            </span>
            <span>{stage.label}</span>
          </div>
        )
      })}
    </div>
  )
}

function TopicCard({ disabled = false, isSelected, onSelect, topic }) {
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
        <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] text-muted-foreground">{topic.penName}</span>
        <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] text-muted-foreground">{topic.theme}</span>
      </div>
    </button>
  )
}

function WorkflowCard({ flow, onOpenTab }) {
  if (!flow) {
    return null
  }

  return (
    <div className="rounded-[28px] border border-border/70 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-[12px] text-muted-foreground">
            <Sparkles size={12} />
            自动流程
          </div>
          <h3 className="mt-3 text-[18px] font-semibold text-foreground">{flow.title}</h3>
          {flow.summary ? <p className="mt-1 text-[13px] leading-6 text-muted-foreground">{flow.summary}</p> : null}
        </div>
        {flow.estimatedTimeLabel ? (
          <div className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-3 py-1 text-[12px] text-muted-foreground">
            <Clock3 size={12} />
            {flow.estimatedTimeLabel}
          </div>
        ) : null}
      </div>

      <div className="mt-5 space-y-2.5">
        {flow.steps.map((step) => {
          const isRunning = step.status === 'running'
          const isDone = step.status === 'done'
          const isFailed = step.status === 'failed'

          return (
            <button
              className={cn(
                'flex w-full items-center justify-between rounded-2xl border px-3 py-3 text-left transition-colors',
                isRunning && 'border-primary/25 bg-primary/5',
                isDone && 'border-border/70 bg-white',
                isFailed && 'border-red-200 bg-red-50/70',
                step.status === 'pending' && 'border-border/65 bg-secondary/20',
              )}
              disabled={!step.tabId}
              key={step.id}
              onClick={() => step.tabId && onOpenTab(step.tabId)}
              type="button"
            >
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    'inline-flex size-7 items-center justify-center rounded-full',
                    isRunning && 'bg-primary text-white',
                    isDone && 'bg-secondary text-foreground',
                    isFailed && 'bg-red-100 text-red-600',
                    step.status === 'pending' && 'bg-white text-muted-foreground',
                  )}
                >
                  {isRunning ? <LoaderCircle className="animate-spin" size={14} /> : null}
                  {isDone ? <Check size={14} /> : null}
                  {isFailed ? <X size={14} /> : null}
                  {step.status === 'pending' ? <History size={13} /> : null}
                </span>
                <div>
                  <div className="text-[13px] font-medium text-foreground">{step.label}</div>
                  {step.helper ? <div className="mt-0.5 text-[12px] text-muted-foreground">{step.helper}</div> : null}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {step.durationLabel ? <span className="text-[12px] text-muted-foreground">{step.durationLabel}</span> : null}
                {step.tabId ? <ChevronRight className="text-muted-foreground" size={14} /> : null}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function TopicStageCard({
  onChangeSupplement,
  onChangeCustomTopic,
  onCreateCustomTopic,
  onOpenCustomTopic,
  onOpenSupplement,
  onRefreshTopics,
  onSaveSupplement,
  recommendations,
  selectedTopicId,
  supplement,
  customTopicInput,
  customTopicOpen,
  supplementOpen,
  isRefreshing,
  recommendationError,
  onSelectTopic,
}) {
  return (
    <div className="rounded-[30px] border border-border/70 bg-white p-5 shadow-[0_24px_50px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-[22px] font-semibold text-foreground">选题确认</h3>
        <div className="flex flex-wrap gap-2">
          <Button
            className="rounded-full"
            disabled={isRefreshing}
            onClick={onRefreshTopics}
            size="sm"
            type="button"
            variant="outline"
          >
            {isRefreshing ? <LoaderCircle className="animate-spin" size={14} /> : <RefreshCw size={14} />}
            换一批
          </Button>
          <Button
            className="rounded-full"
            disabled={isRefreshing}
            onClick={onOpenCustomTopic}
            size="sm"
            type="button"
            variant="outline"
          >
            <Plus size={14} />
            我有题目
          </Button>
          <Button
            className="rounded-full"
            disabled={isRefreshing}
            onClick={onOpenSupplement}
            size="sm"
            type="button"
            variant="outline"
          >
            <PenSquare size={14} />
            按偏好重推
          </Button>
        </div>
      </div>

      {recommendationError ? (
        <div className="mt-4 rounded-[20px] border border-red-200 bg-red-50/70 px-4 py-3 text-[13px] leading-6 text-red-700">
          {recommendationError}
        </div>
      ) : null}

      {supplementOpen ? (
        <div className="mt-4 rounded-[24px] border border-border/70 bg-secondary/20 p-4">
          <div className="text-[13px] font-medium text-foreground">按偏好重推</div>
          <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
            写清你想要的方向，系统会重新生成 6 个更贴近偏好的选题。
          </p>
          <Textarea
            className="mt-3 min-h-[92px] border-border/70 bg-white text-[14px]"
            onChange={(event) => onChangeSupplement(event.target.value)}
            placeholder="例如：更偏女性情感、少一点说教感、开头更克制。"
            value={supplement}
          />
          <div className="mt-3 flex justify-end">
            <Button
              className="rounded-full"
              disabled={!supplement.trim() || isRefreshing}
              onClick={onSaveSupplement}
              size="sm"
              type="button"
            >
              {isRefreshing ? <LoaderCircle className="animate-spin" size={14} /> : null}
              重新生成推荐
            </Button>
          </div>
        </div>
      ) : null}

      {customTopicOpen ? (
        <div className="mt-4 rounded-[24px] border border-border/70 bg-secondary/20 p-4">
          <div className="text-[13px] font-medium text-foreground">我有题目</div>
          <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
            限 30 字以内。系统会自动判断文章类型、建议笔名和所属母题。
          </p>
          <Textarea
            className="mt-3 min-h-[88px] border-border/70 bg-white text-[14px]"
            maxLength={30}
            onChange={(event) => onChangeCustomTopic(event.target.value.slice(0, 30))}
            placeholder="例如：人到晚年，最难得的是把自己的日子过安静。"
            value={customTopicInput}
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="text-[12px] text-muted-foreground">{customTopicInput.length}/30</div>
            <Button
              className="rounded-full"
              disabled={!customTopicInput.trim() || isRefreshing}
              onClick={onCreateCustomTopic}
              size="sm"
              type="button"
            >
              使用这个选题
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {recommendations.map((topic) => (
          <TopicCard
            disabled={isRefreshing}
            isSelected={topic.id === selectedTopicId}
            key={topic.id}
            onSelect={onSelectTopic}
            topic={topic}
          />
        ))}
      </div>
    </div>
  )
}

function DraftStageCard({ activeVersion, onConfirmDraft, onOpenTab, onRewriteAll }) {
  if (!activeVersion) {
    return null
  }

  return (
    <div className="rounded-[28px] border border-border/70 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[12px] font-medium tracking-[0.08em] text-muted-foreground">节点二</div>
          <h3 className="mt-2 text-[22px] font-semibold text-foreground">文字稿确认</h3>
          <p className="mt-1 text-[14px] leading-6 text-muted-foreground">
            正文和详细校验都在右侧。你可以直接确认，也可以通过底部输入框继续提修改意见。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-secondary px-3 py-1.5 text-[12px] text-muted-foreground">{activeVersion.label}</span>
          <span className="rounded-full bg-secondary px-3 py-1.5 text-[12px] text-muted-foreground">{activeVersion.wordCount} 字</span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button className="rounded-full" onClick={() => onOpenTab('draft')} size="sm" type="button" variant="outline">
          <FileText size={14} />
          看文字稿
        </Button>
        <Button className="rounded-full" onClick={() => onOpenTab('report')} size="sm" type="button" variant="outline">
          <ScrollText size={14} />
          看校验报告
        </Button>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <Button className="rounded-full bg-[#171b22] px-5 text-white hover:bg-black" onClick={() => onConfirmDraft('确认通过')} type="button">
          确认通过
        </Button>
        <Button className="rounded-full" onClick={() => onConfirmDraft('无需修改')} type="button" variant="outline">
          无需修改
        </Button>
        <Button className="rounded-full" onClick={onRewriteAll} type="button" variant="outline">
          整篇重写
        </Button>
      </div>
    </div>
  )
}

function PreviewStageCard({ onConfirm, onOpenTab }) {
  return (
    <div className="rounded-[28px] border border-border/70 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.04)]">
      <div className="text-[12px] font-medium tracking-[0.08em] text-muted-foreground">节点三</div>
      <h3 className="mt-2 text-[22px] font-semibold text-foreground">排版效果确认</h3>
      <p className="mt-1 text-[14px] leading-6 text-muted-foreground">
        右侧是极简白底黑字的真实预览。你可以切换 PC / 移动端和字号大小，确认后当前版本就完成了。
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button className="rounded-full" onClick={() => onOpenTab('preview')} size="sm" type="button" variant="outline">
          <LayoutTemplate size={14} />
          查看排版预览
        </Button>
      </div>

      <div className="mt-5">
        <Button className="rounded-full bg-[#171b22] px-5 text-white hover:bg-black" onClick={onConfirm} type="button">
          确认排版
        </Button>
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
          isUser && 'ml-auto w-fit max-w-full rounded-[24px] bg-secondary/65 px-6 py-5 text-left font-medium',
        )}
      >
        {isAssistant ? renderMarkdownBlock(message.content) : message.content}
      </div>

      <div
        className={cn(
          'mt-3 flex items-center gap-2 text-[12px] text-muted-foreground opacity-0 transition-opacity duration-150 group-hover/message:opacity-100',
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

function DraftWorkbench({ version }) {
  if (!version) {
    return <div className="text-[14px] text-muted-foreground">当前还没有文字稿。</div>
  }

  return (
    <div className="mx-auto w-full max-w-[760px] rounded-[28px] border border-border/70 bg-white p-6">
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-secondary px-3 py-1.5 text-[12px] text-muted-foreground">{version.label}</span>
        <span className="rounded-full bg-secondary px-3 py-1.5 text-[12px] text-muted-foreground">{version.wordCount} 字</span>
        <span className="rounded-full bg-secondary px-3 py-1.5 text-[12px] text-muted-foreground">
          {formatMessageTime(version.createdAt)}
        </span>
      </div>
      {renderMarkdownBlock(version.draftMarkdown)}
    </div>
  )
}

function ReportWorkbench({ version }) {
  if (!version) {
    return <div className="text-[14px] text-muted-foreground">当前还没有校验报告。</div>
  }

  return (
    <div className="mx-auto w-full max-w-[760px] rounded-[28px] border border-border/70 bg-white p-6">
      {renderMarkdownBlock(version.reportMarkdown)}
    </div>
  )
}

function ArticlePreview({ fontSize, session }) {
  const topic = getSelectedTopic(session)
  const version = getActiveVersion(session)
  const previewMarkdown = stripPreviewHeading(version?.draftMarkdown ?? '')
  const previewComponents = useMemo(() => getPreviewMarkdownComponents(fontSize), [fontSize])

  return (
    <div className="rounded-[26px] border border-black/8 bg-white p-6 shadow-[0_20px_44px_rgba(15,23,42,0.05)] sm:p-8">
      <div className="mx-auto max-w-[720px]">
        <header className="text-center">
          <h2 className="mx-auto max-w-[640px] text-[29px] font-semibold leading-[1.45] tracking-[-0.02em] text-black sm:text-[31px]">
            {topic?.title}
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

  return (
    <div className="benchmark-scroll-hidden min-h-0 overflow-y-auto px-6 py-6">
      <div className="mx-auto flex w-full max-w-[980px] flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-border/70 bg-white px-5 py-4">
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
                { id: 'medium', label: '中' },
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
                  字号{item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="text-[12px] text-muted-foreground">
            当前查看：{device === 'mobile' ? '移动端预览' : 'PC 预览'}
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
  onClose,
  onOpenTab,
  onSelectVersion,
  onSetDevice,
  onSetFontSize,
  session,
  tabs,
}) {
  const activeVersion = getActiveVersion(session)

  function renderBody() {
    switch (activeTabId) {
      case 'draft':
        return <DraftWorkbench version={activeVersion} />
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

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-tl-[30px] border-l border-t border-border/70 bg-white">
      <div className="border-b border-border/70 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="benchmark-scroll-hidden flex min-w-0 gap-2 overflow-x-auto pb-1">
            {tabs.map((tabId) => {
              const tab = workbenchTabs.find((item) => item.id === tabId)

              if (!tab) {
                return null
              }

              return (
                <button
                  className={cn(
                    'inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-[13px] transition-colors',
                    activeTabId === tab.id ? 'bg-secondary text-foreground shadow-sm' : 'text-muted-foreground hover:bg-secondary/40',
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
            className="inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            onClick={onClose}
            type="button"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="benchmark-scroll-hidden min-h-0 flex-1 overflow-y-auto bg-[#FCFCFD] px-6 py-6">
        {renderBody()}
      </div>
    </aside>
  )
}

function LibraryModuleCanvas() {
  return (
    <div className="flex min-h-0 flex-1 bg-white" />
  )
}

export default function BenchmarkWorkbenchPage() {
  const activeSessionId = useBenchmarkStore((state) => state.activeSessionId)
  const createSession = useBenchmarkStore((state) => state.createSession)
  const deleteSession = useBenchmarkStore((state) => state.deleteSession)
  const isSidebarCollapsed = useBenchmarkStore((state) => state.isSidebarCollapsed)
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

  const activeSession =
    sessions.find((session) => session.id === activeSessionId) ?? orderedSessions[0] ?? sessions[0] ?? null
  const currentSessionId = activeSession?.id ?? null
  const currentStageId = activeSession?.stageId ?? 'topic'
  const selectedTopic = activeSession ? getSelectedTopic(activeSession) : null
  const activeVersion = activeSession ? getActiveVersion(activeSession) : null
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

  async function runFlow({ onComplete, onError, resolveResult, sessionId, summary, steps, title }) {
    const flowId = createId('flow')
    const preparedSteps = steps.map((step, index) => ({
      ...step,
      id: `${flowId}-step-${index + 1}`,
      status: index === 0 ? 'running' : 'pending',
    }))
    const resultPromise = resolveResult ? Promise.resolve().then(resolveResult) : Promise.resolve(null)

    const startedFlow = {
      createdAt: new Date().toISOString(),
      estimatedTimeLabel: formatEstimateLabel(steps),
      id: flowId,
      steps: preparedSteps,
      summary,
      title,
    }

    updateSession(sessionId, {
      processingFlow: startedFlow,
    })

    for (let index = 0; index < preparedSteps.length; index += 1) {
      await delay(FLOW_DELAY_MS)
      const isLastStep = index === preparedSteps.length - 1

      updateSession(sessionId, (current) => {
        const activeFlow = current.processingFlow

        if (!activeFlow || activeFlow.id !== flowId) {
          return current
        }

        const nextSteps = activeFlow.steps.map((step, stepIndex) => {
          if (stepIndex < index) {
            return { ...step, status: 'done' }
          }

          if (stepIndex === index) {
            return { ...step, status: isLastStep ? 'running' : 'done' }
          }

          if (stepIndex === index + 1) {
            return { ...step, status: 'running' }
          }

          return step
        })

        return {
          ...current,
          processingFlow: {
            ...activeFlow,
            steps: nextSteps,
          },
        }
      })
    }

    let resolvedResult = null

    try {
      resolvedResult = await resultPromise
    } catch (error) {
      const failedSteps = preparedSteps.map((step, index) => ({
        ...step,
        status: index === preparedSteps.length - 1 ? 'failed' : 'done',
      }))
      const failedFlow = {
        ...startedFlow,
        errorMessage: error.message,
        steps: failedSteps,
      }

      updateSession(sessionId, (current) => {
        const nextSession = onError
          ? onError(current, error)
          : {
              activeWorkbenchTab: 'draft',
              isWorkbenchOpen: true,
              messages: [
                ...current.messages,
                {
                  id: createId('assistant'),
                  role: 'assistant',
                  content: `这一步执行失败了：${error.message}`,
                  createdAt: new Date().toISOString(),
                },
              ],
            }

        return {
          ...current,
          ...nextSession,
          lastFlowSummary: failedFlow,
          processingFlow: null,
          runLogs: [failedFlow, ...(current.runLogs ?? [])].slice(0, 12),
        }
      })

      return
    }

    const finalSteps = preparedSteps.map((step) => ({
      ...step,
      status: 'done',
    }))

    const completedFlow = {
      ...startedFlow,
      steps: finalSteps,
    }

    updateSession(sessionId, (current) => {
      const nextSession = onComplete(current, resolvedResult)

      return {
        ...current,
        ...nextSession,
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
      activeSession.topicSelection.recommendations.find((item) => item.id === topicId)

    if (!topic) {
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
      },
    }))

    await runFlow({
      onComplete: (current, generated) => {
        const currentTopic = getSelectedTopic(current)
        const version = buildVersionFromGeneratedResult({
          generated,
          note: '',
          supplement: current.topicSelection.supplement,
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
          messages: [
            ...current.messages,
            {
              id: createId('assistant'),
              role: 'assistant',
              content: '第一版文字稿已经准备好了，右侧可以查看正文和详细校验报告。你确认后，我会继续生成排版预览。',
              createdAt: new Date().toISOString(),
            },
          ],
          stageId: 'draft',
        }
      },
      onError: (current, error) => ({
        activeWorkbenchTab: 'draft',
        isWorkbenchOpen: true,
        messages: [
          ...current.messages,
          {
            id: createId('assistant'),
            role: 'assistant',
            content: `第一版文字稿生成失败了：${error.message}。你可以重新点击当前选题，再试一次。`,
            createdAt: new Date().toISOString(),
          },
        ],
        topicSelection: {
          ...current.topicSelection,
          selectedTopicId: null,
        },
      }),
      resolveResult: () =>
        requestGeneratedDraft({
          action: 'initial',
          deepThinkingEnabled: activeSession.deepThinkingEnabled,
          supplement: activeSession.topicSelection.supplement,
          topic,
        }),
      sessionId: currentSessionId,
      summary: '已确认选题，系统开始自动完成正文、校验与首版修订。',
      steps: [
        { label: '锁定文章结构与笔名口吻', seconds: 5, tabId: 'draft' },
        { label: '生成第一版正文', seconds: 8, tabId: 'draft' },
        { label: '输出详细校验报告', seconds: 6, tabId: 'report' },
        { label: '完成自动修订', seconds: 4, tabId: 'versions' },
      ],
      title: '正在生成第一版文字稿',
    })
  }

  function handleRefreshTopics() {
    if (!currentSessionId || !activeSession) {
      return
    }

    const supplement = activeSession.topicSelection.supplement.trim()

    if (supplement) {
      updateSession(currentSessionId, (current) => ({
        ...current,
        topicSelection: {
          ...current.topicSelection,
          isRefreshingRecommendations: true,
          recommendationError: '',
        },
      }))

      requestTopicRecommendations({ supplement })
        .then((result) => {
          const nextRecommendations = normalizeRecommendedTopics(result.recommendations)

          if (nextRecommendations.length < 6) {
            throw new Error('AI 返回的推荐选题数量不足，请重试')
          }

          updateSession(currentSessionId, (current) => ({
            ...current,
            messages: [
              ...current.messages,
              {
                id: createId('assistant'),
                role: 'assistant',
                content: result.summary || '我已经按你的偏好重新整理了一组新的选题方向。',
                createdAt: new Date().toISOString(),
              },
            ],
            topicSelection: {
              ...current.topicSelection,
              isRefreshingRecommendations: false,
              recommendationError: '',
              recommendations: nextRecommendations,
              selectedTopicId: null,
            },
          }))
        })
        .catch((error) => {
          updateSession(currentSessionId, (current) => ({
            ...current,
            topicSelection: {
              ...current.topicSelection,
              isRefreshingRecommendations: false,
              recommendationError: error.message || '按偏好重推失败了，请稍后重试。',
            },
          }))
        })

      return
    }

    const nextBatchIndex = (activeSession.topicSelection.batchIndex + 1) % 3

    updateSession(currentSessionId, (current) => ({
      ...current,
      topicSelection: {
        ...current.topicSelection,
        batchIndex: nextBatchIndex,
        recommendationError: '',
        recommendations: createTopicRecommendations(nextBatchIndex),
        selectedTopicId: null,
      },
    }))
  }

  function handleOpenSupplementComposer() {
    updateCurrentSession((current) => ({
      ...current,
      topicSelection: {
        ...current.topicSelection,
        isCustomTopicComposerOpen: false,
        isSupplementComposerOpen: true,
        recommendationError: '',
      },
    }))
  }

  function handleOpenCustomTopicComposer() {
    updateCurrentSession((current) => ({
      ...current,
      topicSelection: {
        ...current.topicSelection,
        isCustomTopicComposerOpen: true,
        isSupplementComposerOpen: false,
        recommendationError: '',
      },
    }))
  }

  async function handleSaveSupplement() {
    if (!currentSessionId || !activeSession) {
      return
    }

    const supplement = activeSession.topicSelection.supplement.trim()

    if (!supplement) {
      updateSession(currentSessionId, (current) => ({
        ...current,
        topicSelection: {
          ...current.topicSelection,
          isSupplementComposerOpen: false,
          recommendationError: '',
        },
      }))
      return
    }

    updateSession(currentSessionId, (current) => ({
      ...current,
      topicSelection: {
        ...current.topicSelection,
        isRefreshingRecommendations: true,
        recommendationError: '',
      },
    }))

    try {
      const result = await requestTopicRecommendations({ supplement })
      const nextRecommendations = normalizeRecommendedTopics(result.recommendations)

      if (nextRecommendations.length < 6) {
        throw new Error('AI 返回的推荐选题数量不足，请重试')
      }

      updateSession(currentSessionId, (current) => ({
        ...current,
        messages: [
          ...current.messages,
          {
            id: createId('user'),
            role: 'user',
            content: `补充要求：${supplement}`,
            createdAt: new Date().toISOString(),
          },
          {
            id: createId('assistant'),
            role: 'assistant',
            content: result.summary || '我已经按你的偏好重新整理了一组新的选题方向。',
            createdAt: new Date().toISOString(),
          },
        ],
        topicSelection: {
          ...current.topicSelection,
          isRefreshingRecommendations: false,
          isSupplementComposerOpen: false,
          recommendationError: '',
          recommendations: nextRecommendations,
          selectedTopicId: null,
        },
      }))
    } catch (error) {
      updateSession(currentSessionId, (current) => ({
        ...current,
        topicSelection: {
          ...current.topicSelection,
          isRefreshingRecommendations: false,
          recommendationError: error.message || '按偏好重推失败了，请稍后重试。',
        },
      }))
    }
  }

  function handleCreateCustomTopic() {
    if (!currentSessionId || !activeSession) {
      return
    }

    const input = activeSession.topicSelection.customTopicInput.trim()

    if (!input) {
      return
    }

    const customTopic = buildCustomTopic(input)

    updateSession(currentSessionId, (current) => ({
      ...current,
      topicSelection: {
        ...current.topicSelection,
        customTopicInput: '',
        isCustomTopicComposerOpen: false,
        recommendationError: '',
        recommendations: [customTopic, ...current.topicSelection.recommendations].slice(0, 6),
      },
    }))

    window.setTimeout(() => {
      handleSelectTopic(customTopic.id, customTopic)
    }, 0)
  }

  function handleSelectWorkbenchTab(tabId) {
    updateCurrentSession((current) => ({
      ...current,
      activeWorkbenchTab: tabId,
      isWorkbenchOpen: true,
    }))
  }

  async function handleConfirmDraft(actionLabel) {
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
          content: actionLabel,
          createdAt: new Date().toISOString(),
        },
      ],
    }))

    await runFlow({
      onComplete: (current) => {
        return {
          activeWorkbenchTab: 'preview',
          messages: [
            ...current.messages,
            {
              id: createId('assistant'),
              role: 'assistant',
              content: '极简排版预览已经准备好了。右侧可以切换 PC / 移动端和字号，确认后这轮内容创作就完成了。',
              createdAt: new Date().toISOString(),
            },
          ],
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
      onComplete: (current, generated) => {
        const currentTopic = getSelectedTopic(current)
        const nextVersion = buildVersionFromGeneratedResult({
          generated,
          note: rewriteInstruction,
          supplement: current.topicSelection.supplement,
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
          messages: [
            ...current.messages,
            {
              id: createId('assistant'),
              role: 'assistant',
              content: '我已经按“整篇重写”的方式重新生成了一版。右侧的正文和校验报告都已更新。',
              createdAt: new Date().toISOString(),
            },
          ],
        }
      },
      onError: (current, error) => ({
        activeWorkbenchTab: 'draft',
        isWorkbenchOpen: true,
        messages: [
          ...current.messages,
          {
            id: createId('assistant'),
            role: 'assistant',
            content: `整篇重写失败了：${error.message}。你可以稍后再试，或改用局部修改。`,
            createdAt: new Date().toISOString(),
          },
        ],
      }),
      resolveResult: () =>
        requestGeneratedDraft({
          action: 'revise',
          deepThinkingEnabled: activeSession.deepThinkingEnabled,
          note: rewriteInstruction,
          supplement: activeSession.topicSelection.supplement,
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
        onComplete: (current, generated) => {
          const currentTopic = getSelectedTopic(current)
          const nextVersion = buildVersionFromGeneratedResult({
            generated,
            note: currentDraft,
            supplement: current.topicSelection.supplement,
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
            messages: [
              ...current.messages,
              {
                id: createId('assistant'),
                role: 'assistant',
                content: '我已经按你的修改意见完成重写。这一版正文和详细校验报告都更新在右侧了。',
                createdAt: new Date().toISOString(),
              },
            ],
          }
        },
        onError: (current, error) => ({
          activeWorkbenchTab: 'draft',
          draft: currentDraft,
          isWorkbenchOpen: true,
          messages: [
            ...current.messages,
            {
              id: createId('assistant'),
              role: 'assistant',
              content: `这轮改稿失败了：${error.message}。修改意见我先帮你保留在输入框里了，处理好后可以直接重试。`,
              createdAt: new Date().toISOString(),
            },
          ],
        }),
        resolveResult: () =>
          requestGeneratedDraft({
            action: 'revise',
            deepThinkingEnabled: activeSession.deepThinkingEnabled,
            note: currentDraft,
            supplement: activeSession.topicSelection.supplement,
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
      onComplete: (current) => ({
        activeWorkbenchTab: 'preview',
        messages: [
          ...current.messages,
          {
            id: createId('assistant'),
            role: 'assistant',
            content: '当前版本已经完成排版确认。你可以继续在右侧查看正文、校验报告和最终预览。',
            createdAt: new Date().toISOString(),
          },
        ],
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

  function handleCloseWorkbench() {
    updateCurrentSession((current) => ({
      ...current,
      isWorkbenchOpen: false,
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
    if (currentStageId === 'topic') {
      return '先在上方确认推荐选题，或点击“按偏好重推 / 我有题目”'
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
              <LibraryModuleCanvas />
            ) : shouldRenderHero ? (
              <div className="benchmark-scroll-hidden min-h-0 flex-1 overflow-y-auto">
                <div className="mx-auto flex w-full max-w-[1240px] flex-col items-center px-6 py-8 sm:px-8 lg:px-12">
                  <div className="max-w-3xl text-center">
                  <h1 className="text-[34px] font-semibold tracking-[-0.03em] text-foreground sm:text-[42px]">
                    开始内容创作
                  </h1>
                  <p className="mx-auto mt-3 max-w-[720px] text-[15px] leading-7 text-muted-foreground">
                    先从下面选一个方向，确认后系统会自动完成首稿生成、校验与排版预览。
                  </p>
                  </div>

                  <div className="mt-8 w-full max-w-[1120px]">
                    <TopicStageCard
                      onChangeSupplement={(value) =>
                        updateCurrentSession((current) => ({
                          ...current,
                          topicSelection: {
                            ...current.topicSelection,
                            supplement: value,
                          },
                        }))
                      }
                      onChangeCustomTopic={(value) =>
                        updateCurrentSession((current) => ({
                          ...current,
                          topicSelection: {
                            ...current.topicSelection,
                            customTopicInput: value,
                          },
                        }))
                      }
                      onCreateCustomTopic={handleCreateCustomTopic}
                      onOpenCustomTopic={handleOpenCustomTopicComposer}
                      onOpenSupplement={handleOpenSupplementComposer}
                      onRefreshTopics={handleRefreshTopics}
                      onSaveSupplement={handleSaveSupplement}
                      customTopicInput={activeSession?.topicSelection?.customTopicInput ?? ''}
                      customTopicOpen={activeSession?.topicSelection?.isCustomTopicComposerOpen ?? false}
                      isRefreshing={activeSession?.topicSelection?.isRefreshingRecommendations ?? false}
                      onSelectTopic={handleSelectTopic}
                      recommendationError={activeSession?.topicSelection?.recommendationError ?? ''}
                      recommendations={activeSession?.topicSelection?.recommendations ?? []}
                      selectedTopicId={activeSession?.topicSelection?.selectedTopicId ?? null}
                      supplement={activeSession?.topicSelection?.supplement ?? ''}
                      supplementOpen={activeSession?.topicSelection?.isSupplementComposerOpen ?? false}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="mx-auto flex min-h-0 w-full max-w-[1240px] flex-1 flex-col px-4 sm:px-6 lg:px-8">
                <div className="shrink-0 py-4">
                  <NodeProgressRail currentStageId={currentStageId} />
                </div>

                <div className="min-h-0 flex-1 overflow-hidden">
                  <div className="benchmark-scroll-hidden h-full overflow-y-auto pb-1">
                    <div className="flex flex-col gap-8 pb-6 pt-2">
                      {(activeSession?.messages ?? []).map((message) => (
                        <MessageBubble
                          copiedMessageId={copiedMessageId}
                          key={message.id}
                          message={message}
                          onCopy={handleCopyMessage}
                        />
                      ))}

                      <WorkflowCard
                        flow={activeSession?.processingFlow ?? activeSession?.lastFlowSummary}
                        onOpenTab={handleSelectWorkbenchTab}
                      />

                      {!isBusy && currentStageId === 'draft' ? (
                        <DraftStageCard
                          activeVersion={activeVersion}
                          onConfirmDraft={handleConfirmDraft}
                          onOpenTab={handleSelectWorkbenchTab}
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
                onClose={handleCloseWorkbench}
                onOpenTab={handleSelectWorkbenchTab}
                onSelectVersion={(versionId) =>
                  updateCurrentSession((current) => ({
                    ...current,
                    activeWorkbenchTab: 'draft',
                    draftReview: {
                      ...current.draftReview,
                      activeVersionId: versionId,
                    },
                  }))
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
