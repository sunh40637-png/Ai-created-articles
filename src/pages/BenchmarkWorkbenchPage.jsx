import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  History,
  LoaderCircle,
  MessageSquareText,
  PanelRightClose,
  PanelRightOpen,
  Paperclip,
  Pause,
  Play,
  Plus,
  Trash2,
  Video,
  X,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useBenchmarkStore } from '@/stores/useBenchmarkStore.js'

const reasoningModel = 'MiniMax-M2.7'
const highspeedModel = 'MiniMax-M2.7-highspeed'
const displayModelName = 'MiniMax-M2.7'
const LEFT_PANE_MIN_WIDTH = 540
const RIGHT_PANE_MIN_WIDTH = 500
const quickMessageItems = [
  {
    id: 'video-script',
    label: '帮我拆解这个视频的话术',
    disabled: false,
  },
  {
    id: 'coming-soon',
    label: '更多消息 开发中',
    disabled: true,
  },
]

const rightWorkbenchTabs = [
  { id: 'audio-recognition', label: '音频识别' },
  { id: 'files', label: '文件' },
]

const emptyWorkbenchState = {
  activeWorkbenchItemId: null,
  audioRecognitionSegments: [],
  files: [],
  views: {},
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

function formatFileSize(size) {
  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function createInitialWorkbenchState() {
  return emptyWorkbenchState
}

function sanitizeMessageAttachments(attachments = []) {
  return attachments.map((attachment) => ({
    id: attachment.id,
    kind: attachment.kind,
    name: attachment.name,
    sizeLabel: attachment.sizeLabel,
  }))
}

function deriveSessionTitle({ attachments = [], content = '' }) {
  const normalizedContent = content.replace(/\s+/g, ' ').trim()

  if (normalizedContent) {
    return normalizedContent.slice(0, 22)
  }

  const firstAttachment = attachments[0]

  if (firstAttachment?.kind === 'video') {
    return '视频话术拆解'
  }

  if (firstAttachment?.kind === 'audio') {
    return '音频话术拆解'
  }

  return '新的拆解对话'
}

function createPendingWorkflowMessage({ attachmentKind, messageId }) {
  return {
    createdAt: new Date().toISOString(),
    id: messageId,
    role: 'workflow',
    steps: [
      {
        id: `${messageId}-received`,
        label: '已接收素材',
        status: 'done',
      },
      {
        id: `${messageId}-audio`,
        label: attachmentKind === 'video' ? '正在提取 MP3' : '正在整理音频',
        previewId: 'audio',
        status: 'running',
      },
      {
        id: `${messageId}-asr`,
        label: '等待豆包识别',
        previewId: 'transcript',
        status: 'pending',
      },
      {
        id: `${messageId}-analysis`,
        label: '等待 MiniMax 拆解',
        previewId: 'analysis',
        status: 'pending',
      },
    ],
    title: '这轮素材已经进入标准流程：上传 -> 抽音频 -> 豆包识别 -> MiniMax 拆解。',
  }
}

function mergeWorkbenchState(currentState, nextState) {
  if (!nextState) {
    return currentState
  }

  return {
    activeWorkbenchItemId: nextState.activeWorkbenchItemId ?? currentState.activeWorkbenchItemId,
    audioRecognitionSegments: nextState.audioRecognitionSegments ?? currentState.audioRecognitionSegments,
    files: nextState.files ?? currentState.files,
    views: {
      ...currentState.views,
      ...(nextState.views || {}),
    },
  }
}

function replaceMessageById(messages, messageId, nextMessage) {
  return messages.map((message) => {
    if (message.id !== messageId) {
      return message
    }

    return nextMessage
  })
}

const markdownComponents = {
  h1: ({ node, ...props }) => <h1 className="mb-4 text-[22px] font-semibold leading-[1.45]" {...props} />,
  h2: ({ node, ...props }) => <h2 className="mb-3 text-[19px] font-semibold leading-[1.45]" {...props} />,
  h3: ({ node, ...props }) => <h3 className="mb-2 text-[17px] font-semibold leading-[1.45]" {...props} />,
  p: ({ node, ...props }) => <p className="mb-4 last:mb-0 leading-[1.55]" {...props} />,
  ul: ({ node, ...props }) => <ul className="mb-4 list-disc pl-5 leading-[1.55]" {...props} />,
  ol: ({ node, ...props }) => <ol className="mb-4 list-decimal pl-5 leading-[1.55]" {...props} />,
  li: ({ node, ...props }) => <li className="mb-1.5" {...props} />,
  strong: ({ node, ...props }) => <strong className="font-semibold" {...props} />,
  table: ({ node, ...props }) => (
    <div className="mb-4 overflow-x-auto rounded-2xl border border-border/70">
      <table className="min-w-full border-collapse text-left text-[14px]" {...props} />
    </div>
  ),
  thead: ({ node, ...props }) => <thead className="bg-secondary/55" {...props} />,
  th: ({ node, ...props }) => <th className="border-b border-border/70 px-3 py-2 font-medium" {...props} />,
  td: ({ node, ...props }) => <td className="border-b border-border/60 px-3 py-2 align-top last:border-b-0" {...props} />,
  hr: ({ node, ...props }) => <hr className="my-5 border-border/70" {...props} />,
}

function renderMarkdownBlock(content) {
  return (
    <ReactMarkdown components={markdownComponents} remarkPlugins={[remarkGfm]}>
      {content}
    </ReactMarkdown>
  )
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
          className="max-w-[280px] items-start rounded-xl bg-[#171b22] px-3 py-2 text-[12px] leading-5 text-white"
          side="top"
          sideOffset={8}
        >
          <span>
            开启时后台使用 `MiniMax-M2.7`。
            <br />
            关闭时后台切到 `MiniMax-M2.7-highspeed`。
            <br />
            官方明确列出了这两个模型；`highspeed` 更快这点，我是参考 MiniMax 对 `M2.5-highspeed / M2.1-highspeed`
            的官方描述做的同系列推断。
          </span>
        </TooltipContent>
      </Tooltip>
    </div>
  )
}

function QuickMessageItem({ disabled = false, label, onSelect }) {
  const viewportRef = useRef(null)
  const textRef = useRef(null)
  const [overflowShift, setOverflowShift] = useState(0)

  useLayoutEffect(() => {
    function measure() {
      if (!viewportRef.current || !textRef.current) {
        return
      }

      const nextShift = Math.max(0, textRef.current.scrollWidth - viewportRef.current.clientWidth)
      setOverflowShift(nextShift)
    }

    measure()
    window.addEventListener('resize', measure)

    return () => {
      window.removeEventListener('resize', measure)
    }
  }, [label])

  const isOverflowing = overflowShift > 4

  return (
    <button
      className={cn(
        'group/quick-item flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px] transition-colors',
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
      <div className="min-w-0 flex-1 overflow-hidden" ref={viewportRef}>
        <span
          className="quick-message-marquee block whitespace-nowrap"
          data-overflow={isOverflowing ? 'true' : 'false'}
          ref={textRef}
          style={
            isOverflowing
              ? {
                  '--quick-message-shift': `${overflowShift + 12}px`,
                  '--quick-message-duration': `${Math.max(3.6, overflowShift / 22)}s`,
                }
              : undefined
          }
        >
          {label}
        </span>
      </div>
    </button>
  )
}

function QuickMessageMenu({ align = 'left', onSelect, placement = 'side' }) {
  const popoverClassName =
    placement === 'top-end'
      ? 'bottom-full right-0 mb-2'
      : 'left-full top-1/2 ml-2 -translate-y-1/2'

  return (
    <div className={cn('group/quick relative', align === 'center' && 'mx-auto')}>
      <button
        className="inline-flex items-center gap-2 rounded-full border border-border/75 bg-white px-3.5 py-2 text-[13px] text-foreground transition-colors hover:border-foreground/15"
        type="button"
      >
        <MessageSquareText size={14} />
        <span>快捷消息</span>
        <ChevronRight
          className="text-muted-foreground transition-transform duration-150 group-hover/quick:translate-x-0.5"
          size={14}
        />
      </button>

      <div
        className={cn(
          'pointer-events-none absolute z-30 w-[296px] opacity-0 transition-all duration-150 group-hover/quick:pointer-events-auto group-hover/quick:opacity-100',
          popoverClassName,
        )}
      >
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
    </div>
  )
}

function BenchmarkSessionSidebar({
  activeSessionId,
  isCollapsed,
  onCreateSession,
  onDeleteSession,
  onSelectSession,
  sessions,
  onToggleCollapsed,
}) {
  return (
    <aside
      className={cn(
        'flex h-full shrink-0 flex-col overflow-hidden border-r border-border/70 bg-white',
        isCollapsed ? 'w-[88px]' : 'w-[248px]',
      )}
    >
      <div className={cn('border-b border-border/70 py-4', isCollapsed ? 'px-3' : 'px-4')}>
        <div
          className={cn(
            'flex items-center',
            isCollapsed ? 'justify-center' : 'gap-3 px-1',
          )}
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <MessageSquareText size={18} />
          </div>
          {!isCollapsed ? (
            <div className="min-w-0">
              <div className="text-[15px] font-semibold text-foreground">话术拆解台</div>
              <div className="text-[12px] text-muted-foreground">音频 / 视频 / 对话工作区</div>
            </div>
          ) : null}
        </div>

        <button
          className={cn(
            'mt-3 inline-flex w-full rounded-2xl border border-border/75 bg-white text-left text-[14px] text-foreground transition-colors hover:border-foreground/15 hover:bg-secondary/45',
            isCollapsed ? 'justify-center px-0 py-2.5' : 'items-center gap-2 px-3 py-2.5',
          )}
          onClick={onCreateSession}
          title="新建对话"
          type="button"
        >
          <Plus size={16} />
          {!isCollapsed ? <span>新建对话</span> : null}
        </button>
      </div>

      {isCollapsed ? <div className="min-h-0 flex-1" /> : (
        <div className="benchmark-scroll-hidden min-h-0 flex-1 overflow-y-auto px-3 py-4">
          <div className="space-y-1.5">
            {sessions.map((session) => (
              <div
                key={session.id}
                className={cn(
                  'group/session flex items-center gap-2 rounded-2xl transition-colors',
                  session.id === activeSessionId
                    ? 'bg-secondary'
                    : 'hover:bg-secondary/45',
                )}
              >
                <button
                  className={cn(
                    'min-w-0 flex-1 rounded-2xl px-3 py-3 text-left text-[13px] transition-colors',
                    session.id === activeSessionId
                      ? 'text-foreground'
                      : 'text-muted-foreground group-hover/session:text-foreground',
                  )}
                  onClick={() => onSelectSession(session.id)}
                  title={session.title}
                  type="button"
                >
                  <span className="block truncate">{session.title}</span>
                </button>

                <button
                  aria-label={`删除 ${session.title}`}
                  className="mr-2 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-all hover:bg-white hover:text-foreground group-hover/session:opacity-100"
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
        </div>
      )}

      <div className={cn('border-t border-border/70 py-3', isCollapsed ? 'px-2' : 'px-3')}>
        <button
          className={cn(
            'inline-flex w-full rounded-2xl px-3 py-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-secondary/45 hover:text-foreground',
            isCollapsed ? 'justify-center' : 'items-center gap-2',
          )}
          onClick={onToggleCollapsed}
          title={isCollapsed ? '展开侧栏' : '收起侧栏'}
          type="button"
        >
          {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          {!isCollapsed ? <span>收起侧栏</span> : null}
        </button>
      </div>
    </aside>
  )
}

function BenchmarkDeleteSessionDialog({ onClose, onConfirm, open, sessionTitle }) {
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
              删除这条对话？
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

function clampRightPaneWidth(width, containerWidth) {
  const maxWidth = Math.max(RIGHT_PANE_MIN_WIDTH, containerWidth - LEFT_PANE_MIN_WIDTH)
  return Math.min(Math.max(width, RIGHT_PANE_MIN_WIDTH), maxWidth)
}

function formatDurationLabel(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(safeSeconds / 60)
  const seconds = safeSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function renderWorkbenchPreviewContent(view) {
  if (!view) {
    return null
  }

  if (view.body === 'audio') {
    return (
      <div className="mx-auto flex w-full max-w-[520px] flex-col gap-6">
        <div className="rounded-[24px] border border-border/70 bg-white p-5">
          <audio autoPlay={false} className="w-full" controls preload="none" src={view.assetUrl}>
            你的浏览器暂不支持音频播放。
          </audio>
        </div>
      </div>
    )
  }

  if (view.body === 'video') {
    return (
      <div className="mx-auto flex w-full max-w-[620px] flex-col gap-4">
        <div className="overflow-hidden rounded-[24px] border border-border/70 bg-black">
          <video autoPlay={false} className="aspect-video w-full" controls playsInline preload="none" src={view.assetUrl} />
        </div>
      </div>
    )
  }

  if (view.body === 'image') {
    return (
      <div className="mx-auto flex w-full max-w-[520px] flex-col gap-4">
        <div className="overflow-hidden rounded-[24px] border border-border/70 bg-white p-4">
          <img alt={view.title} className="h-auto w-full rounded-[18px]" src={view.assetUrl} />
        </div>
      </div>
    )
  }

  if (view.body === 'transcript') {
    return (
      <div className="mx-auto w-full max-w-[620px] rounded-[24px] border border-border/70 bg-white p-5">
        {renderMarkdownBlock(view.content)}
      </div>
    )
  }

  if (view.body === 'analysis' || view.body === 'template') {
    return (
      <div className="mx-auto w-full max-w-[620px] rounded-[24px] border border-border/70 bg-white p-6">
        {renderMarkdownBlock(view.content)}
      </div>
    )
  }

  return null
}

function WorkbenchResourceList({ activeWorkbenchItemId, files, onSelectWorkbenchItem }) {
  return (
    <div className="flex min-h-0 flex-col border-r border-border/70">
      <div className="border-b border-border/70 px-5 py-4">
        <div className="text-[14px] font-medium text-foreground">文件</div>
      </div>

      <div className="benchmark-scroll-hidden min-h-0 flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-1.5">
          {files.map((item) => {
            if (item.type === 'folder') {
              return (
                <div
                  key={item.id}
                  className="px-2 py-2 text-[13px] font-medium text-foreground"
                >
                  {item.label}
                </div>
              )
            }

            return (
              <button
                key={item.id}
                onClick={() => item.previewId && onSelectWorkbenchItem(item.previewId)}
                type="button"
                className={cn(
                  'flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-[13px] transition-colors',
                  item.previewId === activeWorkbenchItemId
                    ? 'bg-secondary text-foreground'
                    : 'text-foreground hover:bg-secondary/55',
                )}
              >
                <span className="min-w-0 truncate">{item.label}</span>
                <span className="ml-3 shrink-0 text-[12px] text-muted-foreground">{item.meta}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function FilesWorkbenchPanel({
  activeWorkbenchItemId,
  onSelectWorkbenchItem,
  files,
  views,
}) {
  const fallbackView = Object.values(views)[0] ?? null
  const activeView =
    (activeWorkbenchItemId ? views[activeWorkbenchItemId] : null) ?? fallbackView

  if (!activeView) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-[14px] text-muted-foreground">
        当前还没有文件产物。
      </div>
    )
  }

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[268px_minmax(0,1fr)]">
      <WorkbenchResourceList
        activeWorkbenchItemId={activeWorkbenchItemId}
        files={files}
        onSelectWorkbenchItem={onSelectWorkbenchItem}
      />

      <div className="benchmark-scroll-hidden min-h-0 overflow-y-auto bg-white px-6 py-6">
        <div className="mx-auto flex w-full max-w-[640px] flex-col">
          {renderWorkbenchPreviewContent(activeView)}
        </div>
      </div>
    </div>
  )
}

function WorkflowStatusCard({ activePreviewId, message, onOpenPreview }) {
  return (
    <div>
      <div className="text-[14px] leading-6 text-foreground">{message.title}</div>
      <div className="mt-3 space-y-2">
        {message.steps.map((step) => {
          const isRunning = step.status === 'running'
          const isDone = step.status === 'done'
          const isActionable = Boolean(step.previewId)
          const statusLabel = isRunning ? '进行中' : isDone ? '已完成' : '等待中'
          const displayLabel = isDone ? step.label.replace(/^已/, '') : step.label

          return (
            <div className="flex items-center gap-2.5" key={step.id}>
              <button
                className={cn(
                  'inline-flex max-w-full items-center gap-1.5 rounded-full border border-border/65 bg-white px-3 py-1.5 text-[12px] text-muted-foreground transition-colors',
                  isActionable && 'hover:border-foreground/15 hover:text-foreground',
                  !isActionable && 'cursor-default',
                )}
                disabled={!isActionable}
                onClick={() => onOpenPreview?.(step.previewId)}
                type="button"
              >
                {isRunning ? (
                  <LoaderCircle className="animate-spin" size={11} />
                ) : isDone ? (
                  <Check size={11} />
                ) : (
                  <History size={11} />
                )}
                <span>{statusLabel}</span>
                <span className="truncate text-foreground">{displayLabel}</span>
              </button>
              {step.durationLabel ? (
                <span className="shrink-0 text-[12px] text-muted-foreground/85">{step.durationLabel}</span>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function flattenTimedSpeechCharacters(words = []) {
  return words.flatMap((word) => {
    const characters = Array.from(word.text || '')

    if (characters.length === 0) {
      return []
    }

    const wordDuration = Math.max(0, (word.end || 0) - (word.start || 0))

    return characters.map((char, index) => ({
      char,
      end:
        wordDuration > 0
          ? (word.start || 0) + (wordDuration * (index + 1)) / characters.length
          : word.end || word.start || 0,
      start:
        wordDuration > 0
          ? (word.start || 0) + (wordDuration * index) / characters.length
          : word.start || 0,
      type: 'speech',
    }))
  })
}

function buildTimedTranscriptTokens(segment) {
  const speechCharacters = flattenTimedSpeechCharacters(segment.words || [])
  const displayCharacters = Array.from(segment.text || '')
  const tokens = []
  let speechIndex = 0
  let lastSpeechToken = null

  displayCharacters.forEach((char, index) => {
    const nextSpeechToken = speechCharacters[speechIndex]

    if (nextSpeechToken && nextSpeechToken.char === char) {
      tokens.push({
        ...nextSpeechToken,
        id: `${segment.id}-token-${index}`,
      })
      lastSpeechToken = nextSpeechToken
      speechIndex += 1
      return
    }

    tokens.push({
      char,
      end: nextSpeechToken?.start ?? lastSpeechToken?.end ?? segment.end,
      id: `${segment.id}-token-${index}`,
      start: lastSpeechToken?.end ?? nextSpeechToken?.start ?? segment.start,
      type: 'context',
    })
  })

  return tokens
}

function AudioRecognitionPanel({ audioView, isHydrating = false, segments = [] }) {
  const transcriptDuration = segments[segments.length - 1]?.end ?? 0
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [audioDuration, setAudioDuration] = useState(0)
  const [hasInitializedAudio, setHasInitializedAudio] = useState(false)
  const transcriptContainerRef = useRef(null)
  const activeSegmentIdRef = useRef(null)
  const audioRef = useRef(null)
  const isSeekingRef = useRef(false)

  const totalDuration = audioDuration > 0 ? audioDuration : transcriptDuration

  useEffect(() => {
    setIsPlaying(false)
    setCurrentTime(0)
    setAudioDuration(0)
    setHasInitializedAudio(false)

    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
  }, [audioView?.assetUrl])

  useEffect(() => {
    const audio = audioRef.current

    if (!audio || !hasInitializedAudio) {
      return
    }

    if (!isPlaying) {
      audio.pause()
      return
    }

    audio.play().catch(() => {
      setIsPlaying(false)
    })
  }, [hasInitializedAudio, isPlaying])

  const activeSegment =
    segments.find(
      (segment) => currentTime >= segment.start && currentTime < segment.end,
    ) ??
    (segments.length === 0
      ? null
      : currentTime <= segments[0].start
        ? segments[0]
        : [...segments].reverse().find((segment) => currentTime >= segment.start) ?? segments[0])

  useEffect(() => {
    if (!activeSegment?.id || activeSegmentIdRef.current === activeSegment.id) {
      return
    }

    activeSegmentIdRef.current = activeSegment.id

    const container = transcriptContainerRef.current
    const node = container?.querySelector(`[data-segment-id="${activeSegment.id}"]`)

    if (!container || !node) {
      return
    }

    const containerRect = container.getBoundingClientRect()
    const nodeRect = node.getBoundingClientRect()
    const topBuffer = 84
    const bottomBuffer = 56
    const isAboveViewport = nodeRect.top < containerRect.top + topBuffer
    const isBelowViewport = nodeRect.bottom > containerRect.bottom - bottomBuffer

    if (isAboveViewport || isBelowViewport) {
      const targetScrollTop =
        node.offsetTop - Math.max(16, (container.clientHeight - node.offsetHeight) * 0.28)

      container.scrollTo({
        top: Math.max(0, targetScrollTop),
        behavior: 'smooth',
      })
    }
  }, [activeSegment])

  function handleSeek(nextTime) {
    const safeTime = Math.max(0, Math.min(nextTime, totalDuration))
    setCurrentTime(safeTime)

    if (audioRef.current && hasInitializedAudio) {
      isSeekingRef.current = true
      audioRef.current.currentTime = safeTime
    }
  }

  function handleProgressClick(event) {
    if (totalDuration <= 0) {
      return
    }

    const { currentTarget } = event
    const rect = currentTarget.getBoundingClientRect()
    const ratio = (event.clientX - rect.left) / rect.width
    handleSeek(totalDuration * ratio)
  }

  async function handlePlaybackToggle() {
    if (!audioView?.assetUrl) {
      return
    }

    if (!hasInitializedAudio) {
      setHasInitializedAudio(true)
      setIsPlaying(true)
      return
    }

    setIsPlaying((current) => !current)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white">
      <div
        className="benchmark-scroll-hidden min-h-0 flex-1 overflow-y-auto px-8 py-7"
        ref={transcriptContainerRef}
      >
        <div className="mx-auto flex w-full max-w-[760px] flex-col gap-4">
          {isHydrating ? (
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-border/70 bg-white px-3 py-1.5 text-[12px] text-muted-foreground">
              <LoaderCircle className="animate-spin" size={12} />
              <span>正在整理识别时间轴…</span>
            </div>
          ) : null}

          <div className="space-y-3">
            {segments.length === 0 ? (
              <div className="text-[14px] text-muted-foreground">当前还没有逐句识别稿。</div>
            ) : null}

            {segments.map((segment) => {
              const isActive = segment.id === activeSegment?.id
              const timedTokens = buildTimedTranscriptTokens(segment)
              const segmentMeta = [segment.speaker].filter(Boolean)

              return (
                <button
                  className={cn(
                    'relative w-full rounded-[20px] border border-transparent bg-transparent px-4 py-3 text-left transition-all duration-200',
                  )}
                  data-segment-id={segment.id}
                  key={segment.id}
                  onClick={() => handleSeek(segment.start)}
                  type="button"
                >
                  <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                    <span className="rounded-full bg-secondary px-2 py-0.5">
                      {formatDurationLabel(segment.start)}
                    </span>
                    {segmentMeta.map((item) => (
                      <span key={`${segment.id}-${item}`}>{item}</span>
                    ))}
                  </div>
                  <div className="relative mt-2">
                    <p className="text-[15px] leading-8 text-foreground">
                      {timedTokens.map((token) => (
                        <span
                          className={cn(
                            'transition-colors duration-75',
                            isActive && currentTime >= token.start && 'bg-[#6B5CFF] text-white',
                          )}
                          key={token.id}
                        >
                          {token.char}
                        </span>
                      ))}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="bg-white px-8 pb-5 pt-1">
        <div className="mx-auto flex w-full max-w-[760px] items-center gap-3 rounded-[22px] border border-border/75 bg-[#FCFCFD] px-4 py-3">
          {audioView?.assetUrl && hasInitializedAudio ? (
            <audio
              className="hidden"
              onEnded={() => {
                setCurrentTime(totalDuration)
                setIsPlaying(false)
              }}
              onLoadedMetadata={(event) => {
                const duration = Number.isFinite(event.currentTarget.duration)
                  ? event.currentTarget.duration
                  : 0
                setAudioDuration(duration)
                if (currentTime > 0) {
                  event.currentTarget.currentTime = currentTime
                }
              }}
              onPause={() => setIsPlaying(false)}
              onPlay={() => setIsPlaying(true)}
              onSeeked={(event) => {
                isSeekingRef.current = false
                setCurrentTime(event.currentTarget.currentTime)
              }}
              onTimeUpdate={(event) => {
                if (isSeekingRef.current) {
                  return
                }

                setCurrentTime(event.currentTarget.currentTime)
              }}
              preload="none"
              ref={audioRef}
              src={audioView.assetUrl}
            />
          ) : null}

          <button
            className={cn(
              'inline-flex size-10 shrink-0 items-center justify-center rounded-full border transition-all duration-200',
              isPlaying
                ? 'border-[#6B5CFF]/35 bg-[#6B5CFF] text-white shadow-[0_10px_22px_rgba(107,92,255,0.28)] hover:bg-[#5E50E8] hover:shadow-[0_12px_26px_rgba(107,92,255,0.34)]'
                : 'border-border/80 bg-white text-muted-foreground hover:border-[#6B5CFF]/30 hover:bg-[#F5F2FF] hover:text-[#6B5CFF] hover:shadow-[0_8px_20px_rgba(107,92,255,0.14)]',
            )}
            onClick={handlePlaybackToggle}
            type="button"
          >
            {isPlaying ? <Pause size={15} /> : <Play className="translate-x-[1px]" size={15} />}
          </button>

          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium text-foreground">
              {audioView?.title || '识别音频'}
            </div>
            <div className="mt-1.5 flex items-center gap-2.5">
              <span className="shrink-0 text-[12px] text-muted-foreground">
                {formatDurationLabel(currentTime)}
              </span>
              <button
                className="group relative h-1.5 flex-1 rounded-full bg-secondary/85 transition-colors hover:bg-secondary"
                disabled={totalDuration <= 0}
                onClick={handleProgressClick}
                type="button"
              >
                <span className="absolute inset-x-0 top-1/2 h-5 -translate-y-1/2" />
                <div
                  className="h-full rounded-full bg-[#6B5CFF] transition-all duration-150 group-hover:bg-[#5E50E8]"
                  style={{ width: `${totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0}%` }}
                >
                  <span className="absolute right-0 top-1/2 size-3 -translate-y-1/2 translate-x-1/2 rounded-full border-2 border-white bg-[#6B5CFF] transition-all duration-150 group-hover:size-3.5 group-hover:bg-[#5E50E8] group-hover:shadow-[0_0_0_4px_rgba(107,92,255,0.16)]" />
                </div>
              </button>
              <span className="shrink-0 text-[12px] text-muted-foreground">
                {formatDurationLabel(totalDuration)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function RightWorkbenchShell({
  activeRightTab,
  activeWorkbenchItemId,
  isAudioRecognitionHydrating,
  onClose,
  onSelectWorkbenchItem,
  onSelectRightTab,
  segments,
  files,
  views,
}) {
  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-tl-[30px] border-l border-t border-border/70 bg-white">
      <div className="border-b border-border/70 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="inline-flex rounded-[22px] bg-secondary/65 p-1">
            {rightWorkbenchTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSelectRightTab(tab.id)}
                className={cn(
                  'rounded-[18px] px-4 py-2 text-[13px] transition-colors',
                  activeRightTab === tab.id ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground',
                )}
              >
                {tab.label}
              </button>
            ))}
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

      {activeRightTab === 'audio-recognition' ? (
        <AudioRecognitionPanel
          audioView={views.audio}
          isHydrating={isAudioRecognitionHydrating}
          segments={segments}
        />
      ) : (
        <FilesWorkbenchPanel
          activeWorkbenchItemId={activeWorkbenchItemId}
          files={files}
          onSelectWorkbenchItem={onSelectWorkbenchItem}
          views={views}
        />
      )}
    </aside>
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
  const [pendingAttachmentsBySession, setPendingAttachmentsBySession] = useState({})
  const [sessionUiState, setSessionUiState] = useState({})
  const [sessionPendingDelete, setSessionPendingDelete] = useState(null)
  const [copiedMessageId, setCopiedMessageId] = useState(null)
  const [isResizingSplit, setIsResizingSplit] = useState(false)
  const [rightPaneWidth, setRightPaneWidth] = useState(560)
  const conversationRef = useRef(null)
  const composerRef = useRef(null)
  const audioInputRef = useRef(null)
  const videoInputRef = useRef(null)
  const splitContainerRef = useRef(null)
  const messageRefs = useRef(new Map())
  const pinnedMessageIdRef = useRef(null)
  const orderedSessions = useMemo(
    () =>
      [...sessions].sort(
        (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
      ),
    [sessions],
  )
  const activeSession =
    sessions.find((session) => session.id === activeSessionId) ?? orderedSessions[0] ?? null
  const currentSessionId = activeSession?.id ?? null
  const messages = activeSession?.messages ?? []
  const draft = activeSession?.draft ?? ''
  const deepThinkingEnabled = activeSession?.deepThinkingEnabled ?? true
  const workbenchState = activeSession?.workbenchState ?? createInitialWorkbenchState()
  const activeWorkbenchItemId =
    activeSession?.activeWorkbenchItemId ?? createInitialWorkbenchState().activeWorkbenchItemId
  const activeRightTab = activeSession?.activeRightTab ?? 'audio-recognition'
  const isWorkbenchOpen = activeSession?.isWorkbenchOpen ?? false
  const pendingAttachments = currentSessionId ? pendingAttachmentsBySession[currentSessionId] ?? [] : []
  const currentSessionUi = currentSessionId ? sessionUiState[currentSessionId] ?? {} : {}
  const isSending = Boolean(currentSessionUi.isSending)
  const isAudioRecognitionHydrating = Boolean(currentSessionUi.isAudioRecognitionHydrating)
  const hasConversation = messages.length > 0
  const requestedModel = deepThinkingEnabled ? reasoningModel : highspeedModel
  const pendingStatusLabel =
    currentSessionUi.pendingStatusLabel ||
    (pendingAttachments.length > 0
      ? '正在处理素材…'
      : deepThinkingEnabled
        ? '思考中…'
        : '快速回复中…')
  const canSend = !isSending && draft.trim().length > 0
  const hasWorkbenchOutputs = workbenchState.files.length > 0

  useEffect(() => {
    setCopiedMessageId(null)

    if (audioInputRef.current) {
      audioInputRef.current.value = ''
    }

    if (videoInputRef.current) {
      videoInputRef.current.value = ''
    }
  }, [currentSessionId])

  useEffect(() => {
    if (!currentSessionId && orderedSessions[0]) {
      setActiveSessionId(orderedSessions[0].id)
    }
  }, [currentSessionId, orderedSessions, setActiveSessionId])

  function updateCurrentSession(updater) {
    if (!currentSessionId) {
      return
    }

    updateSession(currentSessionId, updater)
  }

  function setSessionUi(sessionId, patch) {
    setSessionUiState((current) => ({
      ...current,
      [sessionId]: {
        ...(current[sessionId] ?? {}),
        ...patch,
      },
    }))
  }

  function clearSessionUi(sessionId) {
    setSessionUiState((current) => {
      const next = { ...current }
      delete next[sessionId]
      return next
    })
  }

  function setPendingAttachmentsForSession(sessionId, updater) {
    setPendingAttachmentsBySession((current) => {
      const nextAttachments =
        typeof updater === 'function' ? updater(current[sessionId] ?? []) : updater

      return {
        ...current,
        [sessionId]: nextAttachments,
      }
    })
  }

  useEffect(() => {
    const pinnedMessageId = pinnedMessageIdRef.current

    if (!hasConversation || !pinnedMessageId) {
      return
    }

    const container = conversationRef.current
    const target = messageRefs.current.get(pinnedMessageId)

    if (!container || !target) {
      return
    }

    const frameId = window.requestAnimationFrame(() => {
      const latestMessage = messages[messages.length - 1]
      let nextScrollTop = target.offsetTop

      if (!isSending && latestMessage?.role === 'assistant') {
        const latestNode = messageRefs.current.get(latestMessage.id)

        if (latestNode) {
          const projectedLatestBottom =
            latestNode.offsetTop + latestNode.offsetHeight - target.offsetTop
          const maxBlankBelow = Math.min(156, Math.round(container.clientHeight * 0.24))
          const blankBelow = container.clientHeight - projectedLatestBottom

          if (blankBelow > maxBlankBelow) {
            nextScrollTop -= blankBelow - maxBlankBelow
          }
        }
      }

      container.scrollTo({
        top: Math.max(0, nextScrollTop),
        behavior: 'smooth',
      })
    })

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [hasConversation, isSending, messages])

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

  function resetPendingAttachments(sessionId = currentSessionId) {
    if (sessionId) {
      setPendingAttachmentsForSession(sessionId, [])
    }

    if (audioInputRef.current) {
      audioInputRef.current.value = ''
    }

    if (videoInputRef.current) {
      videoInputRef.current.value = ''
    }
  }

  async function appendConversation(prompt, attachments = pendingAttachments) {
    const trimmedPrompt = prompt.trim()
    const sessionId = currentSessionId

    if (!trimmedPrompt || !sessionId || !activeSession) {
      return
    }

    const messageAttachments = sanitizeMessageAttachments(attachments)
    const nextUserMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmedPrompt,
      attachments: messageAttachments,
      createdAt: new Date().toISOString(),
    }
    const hasMediaAttachment = attachments.some((attachment) => attachment.file)
    const workflowMessageId = `workflow-${Date.now() + 1}`
    const pendingWorkflowMessage = hasMediaAttachment
      ? createPendingWorkflowMessage({
          attachmentKind: attachments.some((attachment) => attachment.kind === 'video') ? 'video' : 'audio',
          messageId: workflowMessageId,
        })
      : null
    const nextMessages = pendingWorkflowMessage
      ? [...activeSession.messages, nextUserMessage, pendingWorkflowMessage]
      : [...activeSession.messages, nextUserMessage]
    const nextSessionTitle =
      activeSession.messages.some((message) => message.role === 'user')
        ? activeSession.title
        : deriveSessionTitle({
            attachments: messageAttachments,
            content: trimmedPrompt,
          })

    pinnedMessageIdRef.current = nextUserMessage.id
    updateSession(sessionId, {
      draft: '',
      messages: nextMessages,
      title: nextSessionTitle,
    })
    resetPendingAttachments(sessionId)
    setSessionUi(sessionId, {
      isAudioRecognitionHydrating: hasMediaAttachment,
      isSending: true,
      pendingStatusLabel: hasMediaAttachment
        ? '正在处理素材…'
        : deepThinkingEnabled
          ? '思考中…'
          : '快速回复中…',
    })

    try {
      if (hasMediaAttachment) {
        const transcriptionResponse = await submitBenchmarkTranscription({
          attachments,
        })
        const transcriptionData = await transcriptionResponse.json()

        if (!transcriptionResponse.ok) {
          throw new Error(transcriptionData?.error || '豆包识别失败')
        }

        updateSession(sessionId, (current) => ({
          ...current,
          activeRightTab: 'audio-recognition',
          activeWorkbenchItemId: transcriptionData.workbench?.activeWorkbenchItemId || 'transcript',
          isWorkbenchOpen: true,
          messages: replaceMessageById(
            current.messages,
            workflowMessageId,
            transcriptionData.workflowMessage
              ? { ...transcriptionData.workflowMessage, id: workflowMessageId }
              : pendingWorkflowMessage,
          ),
          workbenchState: mergeWorkbenchState(current.workbenchState, transcriptionData.workbench),
        }))
        setSessionUi(sessionId, {
          isAudioRecognitionHydrating: false,
          isSending: true,
          pendingStatusLabel: deepThinkingEnabled ? '思考中…' : '快速回复中…',
        })

        const analysisResponse = await submitBenchmarkAnalysis({
          jobId: transcriptionData.jobId,
          model: requestedModel,
          prompt: trimmedPrompt,
        })
        const analysisData = await analysisResponse.json()

        if (!analysisResponse.ok) {
          throw new Error(analysisData?.error || 'MiniMax 分析失败')
        }

        updateSession(sessionId, (current) => ({
          ...current,
          activeWorkbenchItemId: analysisData.workbench?.activeWorkbenchItemId || 'analysis',
          messages: replaceMessageById(
            current.messages,
            workflowMessageId,
            analysisData.workflowMessage
              ? { ...analysisData.workflowMessage, id: workflowMessageId }
              : transcriptionData.workflowMessage
                ? { ...transcriptionData.workflowMessage, id: workflowMessageId }
                : pendingWorkflowMessage,
          ).concat({
            id: `assistant-${Date.now() + 1}`,
            role: 'assistant',
            content: analysisData?.analysisMarkdown || '模型没有返回内容。',
            createdAt: new Date().toISOString(),
          }),
          workbenchState: mergeWorkbenchState(current.workbenchState, analysisData.workbench),
        }))
      } else {
        const response = await fetch('/api/benchmark-chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: requestedModel,
            messages: nextMessages,
          }),
        })
        const data = await response.json()

        if (!response.ok) {
          throw new Error(data?.error || '聊天请求失败')
        }

        updateSession(sessionId, (current) => ({
          ...current,
          messages: [
            ...current.messages,
            {
              id: `assistant-${Date.now() + 1}`,
              role: 'assistant',
              content: data?.content || '模型没有返回内容。',
              createdAt: new Date().toISOString(),
            },
          ],
        }))
      }
    } catch (error) {
      updateSession(sessionId, (current) => {
        const nextCurrent = pendingWorkflowMessage
          ? current.messages.map((message) => {
              if (message.id !== workflowMessageId) {
                return message
              }

              return {
                ...message,
                steps: message.steps.map((step, index) => ({
                  ...step,
                  label:
                    index === message.steps.length - 1
                      ? `处理失败：${error.message || '未知错误'}`
                      : step.label,
                  status: index === message.steps.length - 1 ? 'running' : step.status,
                })),
                title: '这轮素材处理没有完成，可以先看一下错误原因。',
              }
            })
          : current.messages

        return {
          ...current,
          messages: nextCurrent.concat({
            id: `assistant-error-${Date.now() + 1}`,
            role: 'assistant',
            content: error.message || '聊天请求失败',
            createdAt: new Date().toISOString(),
          }),
        }
      })
    } finally {
      clearSessionUi(sessionId)
    }
  }

  async function submitBenchmarkTranscription({ attachments }) {
    const formData = new FormData()

    attachments.forEach((attachment) => {
      if (attachment.file) {
        formData.append('files', attachment.file, attachment.file.name)
      }
    })

    return fetch('/api/benchmark-transcribe', {
      method: 'POST',
      body: formData,
    })
  }

  async function submitBenchmarkAnalysis({ jobId, model, prompt }) {
    return fetch('/api/benchmark-analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jobId,
        model,
        prompt,
      }),
    })
  }

  function handleSubmit(event) {
    event.preventDefault()
    appendConversation(draft)
  }

  function handleComposerKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      appendConversation(draft)
    }
  }

  function createAttachmentItems(files, kind) {
    return files.map((file) => ({
      file,
      id: `${kind}-${file.name}-${file.size}-${file.lastModified}`,
      kind,
      name: file.name,
      sizeLabel: formatFileSize(file.size),
    }))
  }

  function handleAudioUploadChange(event) {
    const nextFiles = Array.from(event.target.files ?? [])

    if (nextFiles.length === 0 || !currentSessionId) {
      return
    }

    setPendingAttachmentsForSession(currentSessionId, (current) => [
      ...current,
      ...createAttachmentItems(nextFiles, 'audio'),
    ])
    event.target.value = ''
  }

  function handleVideoUploadChange(event) {
    const nextFiles = Array.from(event.target.files ?? [])

    if (nextFiles.length === 0 || !currentSessionId) {
      return
    }

    setPendingAttachmentsForSession(currentSessionId, (current) => [
      ...current,
      ...createAttachmentItems(nextFiles, 'video'),
    ])
    event.target.value = ''
  }

  function handleRemoveAttachment(attachmentId) {
    if (!currentSessionId) {
      return
    }

    setPendingAttachmentsForSession(currentSessionId, (current) =>
      current.filter((attachment) => attachment.id !== attachmentId),
    )
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

  function handleQuickMessageInsert(label) {
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

  function handleOpenWorkbenchPreview(previewId) {
    if (!previewId) {
      return
    }

    if (previewId === 'audio' || previewId === 'transcript') {
      updateCurrentSession((current) => ({
        ...current,
        activeRightTab: 'audio-recognition',
        isWorkbenchOpen: true,
      }))
      if (currentSessionId) {
        setSessionUi(currentSessionId, {
          isAudioRecognitionHydrating: false,
        })
      }
      return
    }

    updateCurrentSession((current) => ({
      ...current,
      activeWorkbenchItemId: previewId,
      activeRightTab: 'files',
      isWorkbenchOpen: true,
    }))
    if (currentSessionId) {
      setSessionUi(currentSessionId, {
        isAudioRecognitionHydrating: false,
      })
    }
  }

  function handleCreateSession() {
    const nextSessionId = createSession()
    setCopiedMessageId(null)

    if (nextSessionId) {
      window.requestAnimationFrame(() => {
        composerRef.current?.focus()
      })
    }
  }

  function handleSelectSession(sessionId) {
    setActiveSessionId(sessionId)
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

    const deletingSessionId = sessionPendingDelete.id

    setPendingAttachmentsBySession((current) => {
      const next = { ...current }
      delete next[deletingSessionId]
      return next
    })
    setSessionUiState((current) => {
      const next = { ...current }
      delete next[deletingSessionId]
      return next
    })
    deleteSession(deletingSessionId)
    setSessionPendingDelete(null)
    setCopiedMessageId(null)
  }

  function handleToggleSidebarCollapsed() {
    setSidebarCollapsed(!isSidebarCollapsed)
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

  function handleSelectWorkbenchItem(previewId) {
    updateCurrentSession((current) => ({
      ...current,
      activeWorkbenchItemId: previewId,
    }))
  }

  function handleSelectRightTab(tabId) {
    updateCurrentSession((current) => ({
      ...current,
      activeRightTab: tabId,
    }))
  }

  function renderUploadMenu(sizeClassName, iconSize) {
    return (
      <div className="group/upload relative">
        <input
          accept="audio/*,.mp3,.wav,.m4a,.ogg,.opus"
          className="hidden"
          multiple
          onChange={handleAudioUploadChange}
          ref={audioInputRef}
          type="file"
        />
        <input
          accept="video/*"
          className="hidden"
          multiple
          onChange={handleVideoUploadChange}
          ref={videoInputRef}
          type="file"
        />

        <Button
          className={cn(
            sizeClassName,
            'rounded-full border-border/80 bg-white text-muted-foreground hover:border-foreground/15 hover:bg-white hover:text-foreground',
          )}
          size="icon-lg"
          type="button"
          variant="outline"
        >
          <Paperclip size={iconSize} />
        </Button>

        <div className="pointer-events-none absolute bottom-full left-0 z-20 flex min-w-[136px] flex-col gap-1 rounded-2xl border border-border/80 bg-white p-2 opacity-0 shadow-[0_10px_24px_rgba(15,23,42,0.06)] transition-all duration-150 group-hover/upload:pointer-events-auto group-hover/upload:opacity-100">
          <button
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px] text-foreground transition-colors hover:bg-secondary"
            onClick={() => audioInputRef.current?.click()}
            type="button"
          >
            <Play size={14} />
            上传音频
          </button>
          <button
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px] text-foreground transition-colors hover:bg-secondary"
            onClick={() => videoInputRef.current?.click()}
            type="button"
          >
            <Video size={14} />
            上传视频
          </button>
        </div>
      </div>
    )
  }

  return (
    <section className="flex h-full min-h-0 overflow-hidden bg-white">
      <BenchmarkSessionSidebar
        activeSessionId={currentSessionId}
        isCollapsed={isSidebarCollapsed}
        onCreateSession={handleCreateSession}
        onDeleteSession={handleRequestDeleteSession}
        onSelectSession={handleSelectSession}
        onToggleCollapsed={handleToggleSidebarCollapsed}
        sessions={orderedSessions}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white">
        <div className="flex h-[76px] shrink-0 items-center justify-end bg-white px-6">
          <button
            aria-label={isWorkbenchOpen ? '收起右侧工作区' : '展开右侧工作区'}
            className="inline-flex h-11 min-w-11 items-center justify-center rounded-2xl border border-border/80 bg-white px-3 text-muted-foreground transition-colors hover:text-foreground"
            disabled={!hasWorkbenchOutputs}
            onClick={handleToggleWorkbench}
            type="button"
          >
            {isWorkbenchOpen ? (
              <PanelRightClose
                className={cn(!hasWorkbenchOutputs && 'opacity-35')}
                size={18}
                strokeWidth={1.9}
              />
            ) : (
              <PanelRightOpen
                className={cn(!hasWorkbenchOutputs && 'opacity-35')}
                size={18}
                strokeWidth={1.9}
              />
            )}
          </button>
        </div>

        <div ref={splitContainerRef} className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <div
            className="flex min-h-0 min-w-0 flex-1 flex-col bg-white"
            style={{
              minWidth: `${LEFT_PANE_MIN_WIDTH}px`,
              width: isWorkbenchOpen ? `calc(100% - ${rightPaneWidth}px)` : '100%',
            }}
          >
            {!hasConversation ? (
              <div className="mx-auto flex h-full w-full max-w-6xl flex-col items-center justify-start px-4 pb-10 pt-[6vh] sm:px-6 sm:pt-[7vh] lg:pt-[8vh]">
                <div className="max-w-3xl text-center">
                  <h1 className="mt-5 text-[28px] font-semibold tracking-[-0.03em] text-foreground sm:text-[34px] lg:text-[40px]">
                    开始对标拆解
                  </h1>
                  <p className="mx-auto mt-3 max-w-lg text-[14px] leading-6 text-muted-foreground sm:text-[15px]">
                    先发一个问题，或者直接丢一份材料进来。
                  </p>
                </div>

                <form className="mt-7 w-full max-w-[920px]" onSubmit={handleSubmit}>
                  <div className="rounded-[28px] border border-border/80 bg-white p-3">
                    <AttachmentPills attachments={pendingAttachments} onRemove={handleRemoveAttachment} />

                    <Textarea
                      className={cn(
                        'resize-none border-0 bg-transparent px-2 py-2 text-[15px] leading-6 shadow-none focus-visible:border-0 focus-visible:ring-0 sm:text-[16px]',
                        pendingAttachments.length > 0 ? 'mt-3 min-h-[104px] sm:min-h-[112px]' : 'min-h-[116px] sm:min-h-[124px]',
                      )}
                      onChange={(event) => handleDraftChange(event.target.value)}
                      onKeyDown={handleComposerKeyDown}
                      placeholder="输入你想拆的账号、片段、表达问题，或者先告诉我你现在最卡的地方…"
                      ref={composerRef}
                      rows={1}
                      value={draft}
                    />

                    <div className="mt-2 flex items-center justify-between border-t border-border/70 px-1 pt-3">
                      <div className="flex items-center gap-2">
                        {renderUploadMenu('size-10', 16)}
                        <ThinkingToggle checked={deepThinkingEnabled} onChange={handleToggleDeepThinking} />
                      </div>

                      <div className="flex items-center gap-2">
                        <QuickMessageMenu onSelect={handleQuickMessageInsert} placement="top-end" />
                        <div className="rounded-full px-2.5 py-1 text-[13px] text-foreground">
                          {displayModelName}
                        </div>
                        <Button
                          className="size-10 rounded-full bg-[#171b22] text-white shadow-none hover:bg-black"
                          disabled={!canSend}
                          size="icon-lg"
                          type="submit"
                        >
                          {isSending ? <LoaderCircle className="animate-spin" size={16} /> : <ArrowUp size={16} />}
                        </Button>
                      </div>
                    </div>
                  </div>
                </form>
              </div>
            ) : (
              <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col px-3 sm:px-5">
                <div className="min-h-0 flex-1 overflow-hidden">
                  <div ref={conversationRef} className="benchmark-scroll-hidden h-full overflow-y-auto pb-1 pt-4">
                    <div className="flex flex-col gap-10">
                      {messages.map((message) => {
                        const isAssistant = message.role === 'assistant'
                        const isWorkflow = message.role === 'workflow'
                        const isUser = message.role === 'user'

                        return (
                          <div
                            className={cn(
                              'group/message relative',
                              isWorkflow
                                ? 'max-w-3xl'
                                : isAssistant
                                  ? 'max-w-3xl'
                                  : 'ml-auto max-w-2xl text-right',
                            )}
                            key={message.id}
                            ref={(node) => {
                              if (node) {
                                messageRefs.current.set(message.id, node)
                              } else {
                                messageRefs.current.delete(message.id)
                              }
                            }}
                          >
                            {message.attachments?.length ? (
                              <div className={cn('mb-4', !isAssistant && 'flex justify-end')}>
                                <AttachmentPills
                                  align={isAssistant ? 'left' : 'right'}
                                  attachments={message.attachments}
                                />
                              </div>
                            ) : null}

                            {isWorkflow ? (
                              <WorkflowStatusCard
                                activePreviewId={activeWorkbenchItemId}
                                message={message}
                                onOpenPreview={handleOpenWorkbenchPreview}
                              />
                            ) : (
                              <div>
                                <div
                                  className={cn(
                                    'text-[15px] leading-[1.55] text-foreground sm:text-[16px]',
                                    isUser && 'ml-auto w-fit max-w-full rounded-[24px] bg-secondary/65 px-6 py-5 text-left font-medium',
                                    !isAssistant && !isUser && 'font-medium',
                                  )}
                                >
                                  {isAssistant ? renderMarkdownBlock(message.content) : message.content}
                                </div>

                                {message.content ? (
                                  <div
                                    className={cn(
                                      'mt-3 flex items-center gap-2 text-[12px] text-muted-foreground opacity-0 transition-opacity duration-150 group-hover/message:opacity-100',
                                      isAssistant && 'justify-start',
                                      isUser && 'justify-end',
                                    )}
                                  >
                                    <span>{formatMessageTime(message.createdAt)}</span>
                                    <CopyButton
                                      copied={copiedMessageId === message.id}
                                      onClick={() => handleCopyMessage(message.id, message.content)}
                                    />
                                  </div>
                                ) : null}
                              </div>
                            )}
                          </div>
                        )
                      })}

                      {isSending ? (
                        <div className="max-w-3xl">
                          <div className="flex items-center gap-2 text-[14px] text-muted-foreground">
                            <LoaderCircle className="animate-spin" size={15} />
                            <span>{pendingStatusLabel}</span>
                          </div>
                        </div>
                      ) : null}

                      {isSending ? (
                        <div aria-hidden="true" className="h-[18vh] max-h-[120px] min-h-[72px] shrink-0" />
                      ) : null}
                    </div>
                  </div>
                </div>

                <footer className="shrink-0 bg-white pb-3 pt-1 sm:pb-5">
                  <form className="mx-auto w-full max-w-[1020px]" onSubmit={handleSubmit}>
                    <div className="rounded-[24px] border border-border/80 bg-white px-4 py-3">
                      <AttachmentPills attachments={pendingAttachments} onRemove={handleRemoveAttachment} />

                      <div className={cn(pendingAttachments.length > 0 && 'mt-3')}>
                        <Textarea
                          className="benchmark-scroll-hidden max-h-[52px] min-h-[52px] resize-none border-0 bg-transparent px-1 py-2 text-[15px] leading-[1.5] shadow-none focus-visible:border-0 focus-visible:ring-0 sm:text-[15px]"
                          onChange={(event) => handleDraftChange(event.target.value)}
                          onKeyDown={handleComposerKeyDown}
                          placeholder="继续输入你想拆的问题，按 Enter 发送"
                          ref={composerRef}
                          rows={1}
                          value={draft}
                        />
                      </div>

                      <div className="mt-2 flex items-center justify-between border-t border-border/70 px-1 pt-3">
                        <div className="flex items-center gap-2">
                          {renderUploadMenu('size-10', 16)}
                          <ThinkingToggle checked={deepThinkingEnabled} onChange={handleToggleDeepThinking} />
                        </div>

                        <div className="flex items-center gap-2">
                          <QuickMessageMenu onSelect={handleQuickMessageInsert} placement="top-end" />
                          <div className="rounded-full px-2.5 py-1 text-[13px] text-foreground">
                            {displayModelName}
                          </div>
                          <Button
                            className="size-10 rounded-full bg-[#171b22] text-white shadow-none hover:bg-black"
                            disabled={!canSend}
                            size="icon-lg"
                            type="submit"
                          >
                            {isSending ? <LoaderCircle className="animate-spin" size={16} /> : <ArrowUp size={16} />}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </form>
                </footer>
              </div>
            )}
          </div>

          {isWorkbenchOpen ? (
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
                activeRightTab={activeRightTab}
                activeWorkbenchItemId={activeWorkbenchItemId}
                isAudioRecognitionHydrating={isAudioRecognitionHydrating}
                onClose={handleCloseWorkbench}
                onSelectWorkbenchItem={handleSelectWorkbenchItem}
                onSelectRightTab={handleSelectRightTab}
                files={workbenchState.files}
                segments={workbenchState.audioRecognitionSegments}
                views={workbenchState.views}
              />
            </div>
          ) : null}
        </div>
      </div>

      <BenchmarkDeleteSessionDialog
        onClose={handleCancelDeleteSession}
        onConfirm={handleConfirmDeleteSession}
        open={Boolean(sessionPendingDelete)}
        sessionTitle={sessionPendingDelete?.title ?? ''}
      />
    </section>
  )
}
