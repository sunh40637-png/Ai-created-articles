import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  LoaderCircle,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  SHORT_CONTENT_STORAGE_KEY,
  SHORT_CONTENT_STORAGE_VERSION,
  createPersistableShortContentState,
  getShortContentLatestTimestamp,
  useShortContentStore,
} from '@/stores/useShortContentStore.js'

async function readJsonResponse(response, fallbackMessage) {
  let payload = null

  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!payload && !response.ok) {
    throw new Error(fallbackMessage)
  }

  return payload
}

async function requestPersistedShortContentSessions() {
  const response = await fetch('/api/short-content-sessions')
  const payload = await readJsonResponse(response, '短文历史记录接口返回异常，请稍后重试。')

  if (!response.ok) {
    throw new Error(payload?.error || '读取短文历史记录失败')
  }

  return payload?.item ?? null
}

async function requestPersistedShortContentSessionsUpdate(item) {
  const response = await fetch('/api/short-content-sessions', {
    body: JSON.stringify({
      item,
      name: SHORT_CONTENT_STORAGE_KEY,
    }),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'PUT',
  })
  const payload = await readJsonResponse(response, '写入短文历史记录接口返回异常，请稍后重试。')

  if (!response.ok) {
    throw new Error(payload?.error || '写入短文历史记录失败')
  }

  return payload
}

async function requestShortContentGeneration(existingContents = []) {
  const response = await fetch('/api/short-content/generate', {
    body: JSON.stringify({
      existingContents,
    }),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })
  const payload = await readJsonResponse(response, '短文生成接口返回异常，请稍后重试。')

  if (!response.ok) {
    throw new Error(payload?.error || '短文生成失败')
  }

  return payload
}

function buildPersistedShortContentItem(state) {
  return {
    state: createPersistableShortContentState(state),
    version: SHORT_CONTENT_STORAGE_VERSION,
  }
}

function splitContentParagraphs(content = '') {
  return String(content)
    .replace(/\r\n?/g, '\n')
    .replace(/\n(?=\s*\d+、)/gu, '\n\n')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
}

async function copyPlainText(text = '') {
  const normalizedText = String(text)

  if (!normalizedText) {
    return
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(normalizedText)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = normalizedText
  textarea.setAttribute('readonly', 'readonly')
  textarea.style.position = 'absolute'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
}

function ConversationGroup({ activeConversationId, items, label, onSelectConversation }) {
  return (
    <section>
      <div className="mb-2 px-2 text-[11px] font-medium tracking-[0.08em] text-muted-foreground">{label}</div>

      {items.length === 0 ? (
        <div className="rounded-[16px] border border-dashed border-border/80 bg-white/70 px-4 py-4 text-[13px] text-muted-foreground">
          暂无{label}
        </div>
      ) : (
        <div className="space-y-1.5">
          {items.map((conversation) => {
            const isPublished = conversation.publishStatus === 'published'
            const isActive = conversation.id === activeConversationId

            return (
              <button
                className={cn(
                  'w-full rounded-[16px] border px-4 py-3 text-left transition-colors',
                  isActive
                    ? 'border-border bg-white'
                    : 'border-transparent bg-white/70 hover:border-border/80 hover:bg-white',
                )}
                key={conversation.id}
                onClick={() => onSelectConversation(conversation.id)}
                type="button"
              >
                <div
                  className={cn(
                    'truncate text-[14px] font-medium text-foreground',
                    isPublished && 'text-muted-foreground line-through decoration-muted-foreground/60',
                  )}
                >
                  {conversation.title}
                </div>
                <div className="mt-1 text-[12px] text-muted-foreground">
                  {new Date(conversation.updatedAt).toLocaleString('zh-CN', {
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    month: '2-digit',
                  })}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}

export default function ShortContentWorkspace({ onShowPageToast }) {
  const activeConversationId = useShortContentStore((state) => state.activeConversationId)
  const appendGeneratedVersion = useShortContentStore((state) => state.appendGeneratedVersion)
  const conversations = useShortContentStore((state) => state.conversations)
  const createConversation = useShortContentStore((state) => state.createConversation)
  const hydrateFromPersistedSnapshot = useShortContentStore((state) => state.hydrateFromPersistedSnapshot)
  const isConversationPaneCollapsed = useShortContentStore((state) => state.isConversationPaneCollapsed)
  const setActiveConversationId = useShortContentStore((state) => state.setActiveConversationId)
  const setActiveVersionId = useShortContentStore((state) => state.setActiveVersionId)
  const setConversationGenerationState = useShortContentStore((state) => state.setConversationGenerationState)
  const setConversationPaneCollapsed = useShortContentStore((state) => state.setConversationPaneCollapsed)
  const setConversationPublishStatus = useShortContentStore((state) => state.setConversationPublishStatus)

  const [copiedVersionId, setCopiedVersionId] = useState(null)

  const hasInitializedMirrorRef = useRef(false)

  const orderedConversations = useMemo(
    () =>
      [...conversations].sort(
        (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
      ),
    [conversations],
  )

  const defaultConversations = useMemo(
    () => orderedConversations.filter((conversation) => conversation.publishStatus !== 'published'),
    [orderedConversations],
  )
  const publishedConversations = useMemo(
    () => orderedConversations.filter((conversation) => conversation.publishStatus === 'published'),
    [orderedConversations],
  )

  const activeConversation =
    conversations.find((conversation) => conversation.id === activeConversationId) ?? conversations[0] ?? null
  const activeVersion =
    activeConversation?.versions.find((version) => version.id === activeConversation.activeVersionId) ??
    activeConversation?.versions[activeConversation?.versions.length - 1] ??
    null
  const paragraphs = useMemo(() => splitContentParagraphs(activeVersion?.content ?? ''), [activeVersion?.content])

  useEffect(() => {
    let cancelled = false
    let debounceId = null
    let unsubscribe = () => {}

    async function initializeShortContentMirror() {
      const currentState = useShortContentStore.getState()
      const currentPersistedState = createPersistableShortContentState(currentState)
      const currentLatestTimestamp = getShortContentLatestTimestamp(currentPersistedState)

      try {
        const persistedItem = await requestPersistedShortContentSessions()

        if (!cancelled && persistedItem?.state) {
          const persistedState = persistedItem.state
          const persistedLatestTimestamp = getShortContentLatestTimestamp(persistedState)

          if (persistedLatestTimestamp > currentLatestTimestamp) {
            hydrateFromPersistedSnapshot(persistedState)
          }
        }
      } catch {
        // 服务端镜像不可用时继续使用浏览器本地持久化数据
      }

      if (cancelled) {
        return
      }

      hasInitializedMirrorRef.current = true

      const persistSnapshot = (state) => {
        if (!hasInitializedMirrorRef.current) {
          return
        }

        const nextItem = buildPersistedShortContentItem(state)

        window.clearTimeout(debounceId)
        debounceId = window.setTimeout(() => {
          requestPersistedShortContentSessionsUpdate(nextItem).catch(() => {})
        }, 280)
      }

      unsubscribe = useShortContentStore.subscribe((state) => {
        persistSnapshot(state)
      })

      persistSnapshot(useShortContentStore.getState())
    }

    initializeShortContentMirror()

    return () => {
      cancelled = true
      hasInitializedMirrorRef.current = false
      window.clearTimeout(debounceId)
      unsubscribe()
    }
  }, [hydrateFromPersistedSnapshot])

  useEffect(() => {
    if (!copiedVersionId) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setCopiedVersionId((current) => (current === copiedVersionId ? null : current))
    }, 1600)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [copiedVersionId])

  async function handleGenerateConversation() {
    if (!activeConversation || activeConversation.generationStatus === 'generating') {
      return
    }

    const existingContents = activeConversation.versions.map((version) => version.content)

    setConversationGenerationState(activeConversation.id, {
      generationError: '',
      generationStatus: 'generating',
    })

    try {
      const payload = await requestShortContentGeneration(existingContents)
      appendGeneratedVersion(activeConversation.id, {
        content: payload?.content ?? '',
        endingVariant: payload?.endingVariant ?? 'identify',
      })
      onShowPageToast?.('短文生成完成')
    } catch (error) {
      setConversationGenerationState(activeConversation.id, {
        generationError: error.message || '短文生成失败',
        generationStatus: 'error',
      })
    }
  }

  async function handleCopy() {
    if (!activeVersion?.content) {
      return
    }

    try {
      await copyPlainText(activeVersion.content)
      setCopiedVersionId(activeVersion.id)
      onShowPageToast?.('短文已复制')
    } catch {
      onShowPageToast?.('复制失败，请稍后重试', 'error')
    }
  }

  function handleCreateConversation() {
    const nextConversationId = createConversation()
    setActiveConversationId(nextConversationId)
    setConversationPaneCollapsed(false)
  }

  const copyLabel = copiedVersionId === activeVersion?.id ? '已复制' : '复制'
  const isGenerating = activeConversation?.generationStatus === 'generating'

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#ededed] lg:flex-row">
      {isConversationPaneCollapsed ? (
        <aside className="flex w-full shrink-0 flex-row items-center gap-3 border-b border-border/70 bg-[#f5f5f5] px-3 py-4 lg:w-[84px] lg:flex-col lg:border-b-0 lg:border-r">
          <button
            aria-label="展开对话列表"
            className="inline-flex h-11 w-11 items-center justify-center rounded-[14px] border border-border/70 bg-white text-muted-foreground transition-colors hover:border-foreground/15 hover:bg-secondary/45 hover:text-foreground"
            onClick={() => setConversationPaneCollapsed(false)}
            type="button"
          >
            <PanelLeftOpen size={18} strokeWidth={1.9} />
          </button>
          <button
            aria-label="新建短文对话"
            className="inline-flex h-11 w-11 items-center justify-center rounded-[14px] border border-border/70 bg-[#07c160] text-white transition-transform hover:scale-[1.02] hover:bg-[#06ad56]"
            onClick={handleCreateConversation}
            type="button"
          >
            <Plus size={18} strokeWidth={2} />
          </button>
        </aside>
      ) : (
        <aside className="flex w-full shrink-0 flex-col border-b border-border/70 bg-[#f5f5f5] px-4 py-4 lg:w-[320px] lg:border-b-0 lg:border-r">
          <div className="flex items-center gap-3">
            <button
              aria-label="收起对话列表"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-border/70 bg-white text-muted-foreground transition-colors hover:border-foreground/15 hover:bg-secondary/45 hover:text-foreground"
              onClick={() => setConversationPaneCollapsed(true)}
              type="button"
            >
              <PanelLeftClose size={18} strokeWidth={1.9} />
            </button>

            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-semibold text-foreground">短文生成</div>
              <div className="text-[12px] text-muted-foreground">D 型纯文字短合集</div>
            </div>

            <button
              aria-label="新建短文对话"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-[#07c160]/25 bg-[#07c160] text-white transition-transform hover:scale-[1.02] hover:bg-[#06ad56]"
              onClick={handleCreateConversation}
              type="button"
            >
              <Plus size={18} strokeWidth={2} />
            </button>
          </div>

          <div className="mt-6 min-h-0 flex-1 space-y-5 overflow-y-auto pb-2">
            <ConversationGroup
              activeConversationId={activeConversationId}
              items={defaultConversations}
              label="默认"
              onSelectConversation={setActiveConversationId}
            />
            <ConversationGroup
              activeConversationId={activeConversationId}
              items={publishedConversations}
              label="已发布"
              onSelectConversation={setActiveConversationId}
            />
          </div>
        </aside>
      )}

      <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#ededed]">
        <div className="mx-auto flex min-h-0 w-full max-w-[1120px] flex-1 flex-col px-4 py-4 sm:px-6">
          <div className="flex min-h-0 flex-1 flex-col rounded-[28px] border border-border/70 bg-white">
            {activeConversation?.versions.length > 0 ? (
              <div className="border-b border-border/70 px-4 py-4 sm:px-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 items-center gap-2 overflow-x-auto pb-1">
                    {activeConversation.versions.map((version, index) => {
                      const isActive = version.id === activeVersion?.id

                      return (
                        <button
                          className={cn(
                            'inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors',
                            isActive
                              ? 'border-[#07c160]/30 bg-[#07c160]/10 text-[#0b7a43]'
                              : 'border-border/80 bg-white text-muted-foreground hover:text-foreground',
                          )}
                          key={version.id}
                          onClick={() => setActiveVersionId(activeConversation.id, version.id)}
                          type="button"
                        >
                          版本 {index + 1}
                        </button>
                      )
                    })}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-secondary/55 p-1 pl-3">
                      <span className="text-[12px] font-medium text-muted-foreground">是否已发布</span>
                      <button
                        className={cn(
                          'rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors',
                          activeConversation.publishStatus === 'default'
                            ? 'bg-white text-foreground'
                            : 'text-muted-foreground',
                        )}
                        onClick={() => setConversationPublishStatus(activeConversation.id, 'default')}
                        type="button"
                      >
                        默认
                      </button>
                      <button
                        className={cn(
                          'rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors',
                          activeConversation.publishStatus === 'published'
                            ? 'bg-white text-foreground'
                            : 'text-muted-foreground',
                        )}
                        onClick={() => setConversationPublishStatus(activeConversation.id, 'published')}
                        type="button"
                      >
                        已发布
                      </button>
                    </div>

                    <Button onClick={handleCopy} size="sm" type="button" variant="outline">
                      {copiedVersionId === activeVersion?.id ? <Check size={14} /> : <Copy size={14} />}
                      {copyLabel}
                    </Button>

                    <Button onClick={handleGenerateConversation} size="sm" type="button" variant="secondary">
                      {isGenerating ? <LoaderCircle className="animate-spin" size={14} /> : <Sparkles size={14} />}
                      重新生成
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="min-h-0 flex-1 overflow-y-auto">
              {activeConversation?.versions.length === 0 ? (
                <div className="flex h-full min-h-[480px] flex-col items-center justify-center px-6 text-center">
                  <div className="inline-flex h-16 w-16 items-center justify-center rounded-[22px] bg-[#07c160]/10 text-[#07c160]">
                    {isGenerating ? <LoaderCircle className="animate-spin" size={30} /> : <MessageSquareText size={30} />}
                  </div>

                  <h2 className="mt-6 text-[28px] font-semibold tracking-[-0.03em] text-foreground">生成纯文字内容</h2>
                  <p className="mt-3 max-w-[520px] text-[15px] leading-7 text-muted-foreground">
                    按 D 型纯文字短合集规则一键生成，适合直接复制发布。新建会话后，这里会保持空白，直到你点击生成。
                  </p>

                  <Button
                    className="mt-8 h-12 rounded-full px-6 text-[14px]"
                    onClick={handleGenerateConversation}
                    type="button"
                  >
                    {isGenerating ? <LoaderCircle className="animate-spin" size={16} /> : <Sparkles size={16} />}
                    {isGenerating ? '生成中...' : '生成纯文字内容'}
                  </Button>

                  {activeConversation?.generationStatus === 'error' && activeConversation.generationError ? (
                    <div className="mt-4 max-w-[560px] rounded-[18px] border border-red-200/80 bg-red-50 px-4 py-3 text-[13px] leading-6 text-red-700">
                      {activeConversation.generationError}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="mx-auto flex w-full max-w-[760px] flex-col px-5 py-6 sm:px-8 sm:py-8">
                  {activeConversation?.generationStatus === 'error' && activeConversation.generationError ? (
                    <div className="mb-5 rounded-[18px] border border-red-200/80 bg-red-50 px-4 py-3 text-[13px] leading-6 text-red-700">
                      {activeConversation.generationError}
                    </div>
                  ) : null}

                  <div className="mb-6 flex items-center justify-between text-[13px] text-muted-foreground">
                    <div>
                      {activeConversation.publishStatus === 'published' ? '当前会话已标记为已发布' : '当前会话处于默认状态'}
                    </div>
                    <div className="inline-flex items-center gap-2">
                      {activeConversation.versions.length > 1 ? (
                        <>
                          <ChevronLeft size={14} />
                          <span>{activeConversation.versions.findIndex((version) => version.id === activeVersion?.id) + 1}</span>
                          <ChevronRight size={14} />
                        </>
                      ) : (
                        <span>第 1 版</span>
                      )}
                    </div>
                  </div>

                  <article className="rounded-[28px] border border-border/70 bg-[#fffdf9] px-5 py-6 sm:px-8 sm:py-8">
                    {paragraphs.map((paragraph, index) => (
                      <p
                        className="mt-6 text-[16px] leading-[2.1] tracking-[0.01em] text-foreground first:mt-0 sm:text-[17px]"
                        key={`${activeVersion?.id ?? 'content'}-${index}`}
                      >
                        {paragraph}
                      </p>
                    ))}
                  </article>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
