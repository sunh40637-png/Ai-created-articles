import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  CheckCircle2,
  Copy,
  History,
  LoaderCircle,
  MessageSquareText,
  Monitor,
  Smartphone,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  analyzeStructuredPreviewDraft,
  getRenderablePreviewSlots,
  renderArticlePreviewDocument,
  stripPreviewHeading,
} from '@/lib/articlePreviewHtml.jsx'
import {
  formatMessageTime,
  getActiveVersion,
  getSelectedTopic,
  normalizePreviewFontSize,
  previewFontSizeOptions,
  resolveVersionDisplayTitle,
} from '@/lib/benchmarkWorkbenchClient.js'
import { useFixedLayoutConfigState } from '@/lib/fixedLayoutConfigClient.js'
import { requestLibraryAssets } from '@/lib/libraryAssetsClient.js'
import { cn } from '@/lib/utils'
import { getFixedLayoutImageDisplaySlots } from '../../../shared/fixedLayoutConfig.js'

function readJsonResponse(response, fallbackMessage) {
  return response
    .json()
    .catch(() => null)
    .then((payload) => {
      const contentType = response.headers.get('content-type') || ''

      if (!contentType.includes('application/json')) {
        throw new Error(fallbackMessage)
      }

      return payload
    })
}

async function requestWechatDraftStatus(sessionId) {
  const searchParams = new URLSearchParams()

  if (sessionId) {
    searchParams.set('sessionId', sessionId)
  }

  const query = searchParams.toString()
  const response = await fetch(query ? `/api/wechat/draft/status?${query}` : '/api/wechat/draft/status')
  const payload = await readJsonResponse(response, '微信草稿状态接口返回异常，请稍后重试。')

  if (!response.ok) {
    throw new Error(payload?.error || '读取微信草稿状态失败')
  }

  return payload ?? {}
}

async function requestWechatDraftSync({ article, sessionId }) {
  const response = await fetch('/api/wechat/draft/sync', {
    body: JSON.stringify({
      article,
      sessionId,
    }),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })
  const payload = await readJsonResponse(response, '微信草稿同步接口返回异常，请稍后重试。')

  if (!response.ok) {
    throw new Error(payload?.error || '同步微信草稿失败')
  }

  return payload ?? {}
}

async function requestWechatClipboardPreparation({ bodyHtml, plainText }) {
  const response = await fetch('/api/wechat/clipboard/prepare', {
    body: JSON.stringify({
      bodyHtml,
      plainText,
    }),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })
  const payload = await readJsonResponse(response, '微信复制预处理接口返回异常，请稍后重试。')

  if (!response.ok) {
    throw new Error(payload?.error || '准备复制微信样式失败')
  }

  return payload ?? {}
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

function ArticlePreviewFrame({ className = '', documentHtml, title = '排版预览' }) {
  const iframeRef = useRef(null)
  const [frameHeight, setFrameHeight] = useState(0)

  useEffect(() => {
    const iframe = iframeRef.current

    if (!iframe) {
      return undefined
    }

    let cleanupAttachedResources = () => {}

    function attachFrameObserver() {
      cleanupAttachedResources()

      const frameDocument = iframe.contentDocument

      if (!frameDocument) {
        return
      }

      const updateHeight = () => {
        const nextHeight = Math.max(
          frameDocument.body?.scrollHeight ?? 0,
          frameDocument.documentElement?.scrollHeight ?? 0,
          frameDocument.body?.offsetHeight ?? 0,
          frameDocument.documentElement?.offsetHeight ?? 0,
          0,
        )

        setFrameHeight(nextHeight)
      }

      updateHeight()

      const resizeObserver =
        typeof ResizeObserver === 'function'
          ? new ResizeObserver(() => {
              updateHeight()
            })
          : null

      if (resizeObserver) {
        if (frameDocument.body) {
          resizeObserver.observe(frameDocument.body)
        }

        if (frameDocument.documentElement) {
          resizeObserver.observe(frameDocument.documentElement)
        }
      }

      const frameImages = Array.from(frameDocument.images ?? [])
      frameImages.forEach((image) => {
        image.addEventListener('error', updateHeight)
        image.addEventListener('load', updateHeight)
      })

      const timerId = window.setTimeout(() => {
        updateHeight()
      }, 60)

      cleanupAttachedResources = () => {
        resizeObserver?.disconnect()
        window.clearTimeout(timerId)

        frameImages.forEach((image) => {
          image.removeEventListener('error', updateHeight)
          image.removeEventListener('load', updateHeight)
        })
      }
    }

    iframe.addEventListener('load', attachFrameObserver)

    if (iframe.contentDocument?.readyState === 'complete') {
      attachFrameObserver()
    }

    return () => {
      iframe.removeEventListener('load', attachFrameObserver)
      cleanupAttachedResources()
    }
  }, [documentHtml])

  return (
    <iframe
      className={className}
      ref={iframeRef}
      scrolling="no"
      srcDoc={documentHtml}
      style={{ border: 0, display: 'block', height: frameHeight > 0 ? `${frameHeight}px` : '1px', width: '100%' }}
      title={title}
    />
  )
}

function useRenderablePreviewSlots(session, version) {
  const [liveAssetMap, setLiveAssetMap] = useState(null)
  const imageSelection = session?.imageSelection
  const sourceVersionId = imageSelection?.sourceVersionId ?? ''
  const hasMatchedAssets =
    Boolean(version?.id) &&
    sourceVersionId === version?.id &&
    Array.isArray(imageSelection?.referenceAssets) &&
    imageSelection.referenceAssets.length > 0 &&
    Array.isArray(imageSelection?.slots) &&
    imageSelection.slots.length > 0

  useEffect(() => {
    if (!hasMatchedAssets) {
      setLiveAssetMap(null)
      return
    }

    let cancelled = false

    requestLibraryAssets()
      .then((items) => {
        if (!cancelled) {
          setLiveAssetMap(new Map(items.map((item) => [item.id, item])))
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLiveAssetMap(null)
        }
      })

    return () => {
      cancelled = true
    }
  }, [hasMatchedAssets, imageSelection?.matchedAt, sourceVersionId, version?.id])

  return useMemo(
    () =>
      getRenderablePreviewSlots({
        imageSelection,
        liveAssetMap,
        versionId: version?.id ?? '',
      }),
    [imageSelection, liveAssetMap, version?.id],
  )
}

function resolveWechatSyncIndicatorMeta({ hasCoverImage, isWechatSyncing, wechatDraftSync, wechatStatus }) {
  if (isWechatSyncing) {
    return {
      description: '正在同步到微信草稿箱，正文图片会自动上传到微信素材。',
      icon: LoaderCircle,
      iconClassName: 'animate-spin text-muted-foreground',
      title: '同步中',
      toneClassName: 'border-border/70 bg-secondary/55 text-muted-foreground',
    }
  }

  if (wechatDraftSync?.status === 'success' && wechatDraftSync?.lastSyncedAt) {
    const actionLabel = wechatDraftSync?.summary?.action === 'updated' ? '已更新微信草稿' : '已保存到微信草稿'

    return {
      description: `${actionLabel} · ${formatMessageTime(wechatDraftSync.lastSyncedAt)}`,
      icon: CheckCircle2,
      iconClassName: 'text-emerald-600',
      title: '同步成功',
      toneClassName: 'border-emerald-200/80 bg-emerald-50 text-emerald-600',
    }
  }

  if (wechatDraftSync?.status === 'error' && wechatDraftSync?.error) {
    return {
      description: wechatDraftSync.error,
      icon: X,
      iconClassName: 'text-rose-600',
      title: '同步失败',
      toneClassName: 'border-rose-200/80 bg-rose-50 text-rose-600',
    }
  }

  if (wechatStatus?.error) {
    return {
      description: wechatStatus.error,
      icon: X,
      iconClassName: 'text-rose-600',
      title: '状态异常',
      toneClassName: 'border-rose-200/80 bg-rose-50 text-rose-600',
    }
  }

  if (!wechatStatus?.configured) {
    return {
      description: '当前未配置微信公众号凭证，暂时不能保存草稿。',
      icon: History,
      iconClassName: 'text-muted-foreground',
      title: '待同步',
      toneClassName: 'border-border/70 bg-secondary/55 text-muted-foreground',
    }
  }

  if (!hasCoverImage) {
    return {
      description: '当前没有可用封面图，请先补齐头图或确认正文首图可用。',
      icon: History,
      iconClassName: 'text-muted-foreground',
      title: '待同步',
      toneClassName: 'border-border/70 bg-secondary/55 text-muted-foreground',
    }
  }

  return {
    description: '点击同步按钮后，会保存或更新公众号草稿箱，不会自动发布。',
    icon: History,
    iconClassName: 'text-muted-foreground',
    title: '待同步',
    toneClassName: 'border-border/70 bg-secondary/55 text-muted-foreground',
  }
}

export default function PreviewWorkbench({
  onCopyTitleSuccess,
  onShowPageToast,
  onSetPreviewDevice,
  onSetPreviewFontSize,
  onUpdateDraftSync,
  previewFontSize = 'medium',
  session,
}) {
  const [copyStatus, setCopyStatus] = useState('idle')
  const [isWechatSyncing, setIsWechatSyncing] = useState(false)
  const [wechatStatus, setWechatStatus] = useState({
    appId: '',
    configured: false,
    error: '',
    isLoading: true,
  })
  const topic = getSelectedTopic(session)
  const version = getActiveVersion(session)
  const { config: fixedLayoutConfig } = useFixedLayoutConfigState()
  const previewSlots = useRenderablePreviewSlots(session, version)
  const previewDevice = session?.layoutReview?.device === 'desktop' || session?.layoutReview?.device === 'pc' ? 'desktop' : 'mobile'
  const normalizedPreviewFontSize = normalizePreviewFontSize(previewFontSize)
  const draftStructureState = useMemo(
    () => analyzeStructuredPreviewDraft(version?.draftMarkdown ?? '', { requireTitle: true }),
    [version?.draftMarkdown],
  )
  const canRenderStructuredPreview = draftStructureState.canPreview
  const bodyMarkdown = stripPreviewHeading(version?.draftMarkdown ?? '')
  const displayTitle = resolveVersionDisplayTitle(session, version)
  const previewRenderResult = useMemo(() => {
    if (!canRenderStructuredPreview) {
      return {
        bodyHtml: '',
        documentHtml: '',
        plainText: '',
        valid: false,
      }
    }

    return renderArticlePreviewDocument({
      articleType: topic?.type || '',
      bodyMarkdown,
      displayTitle,
      fixedLayoutConfig,
      fontSize: normalizedPreviewFontSize,
      imageSlots: previewSlots,
      origin: typeof window === 'undefined' ? '' : window.location.origin,
      penName: topic?.penName || '',
      structuredContent: draftStructureState,
      wordCount: version?.wordCount ?? 0,
    })
  }, [bodyMarkdown, canRenderStructuredPreview, displayTitle, draftStructureState, fixedLayoutConfig, normalizedPreviewFontSize, previewSlots, topic?.penName, topic?.type, version?.wordCount])

  function buildWechatDraftRenderResult() {
    return {
      bodyHtml: previewRenderResult.bodyHtml,
      plainText: previewRenderResult.plainText,
      valid: previewRenderResult.valid,
    }
  }

  const wechatCoverImageSrc =
    getFixedLayoutImageDisplaySlots(fixedLayoutConfig)
      .map((slot) => slot?.asset?.path || '')
      .find(Boolean) ||
    previewSlots.map((slot) => slot?.asset?.path || '').find(Boolean) ||
    ''
  const wechatDraftSync = session?.draftSync?.provider === 'wechat' ? session.draftSync : session?.draftSync ?? null
  const syncIndicatorMeta = resolveWechatSyncIndicatorMeta({
    hasCoverImage: Boolean(wechatCoverImageSrc),
    isWechatSyncing,
    wechatDraftSync,
    wechatStatus,
  })
  const previewViewportClassName = previewDevice === 'mobile' ? 'w-[375px] max-w-full' : 'w-[760px] max-w-full'

  useEffect(() => {
    if (!session?.id) {
      setWechatStatus({
        appId: '',
        configured: false,
        error: '',
        isLoading: false,
      })
      return
    }

    let cancelled = false

    setWechatStatus((current) => ({
      ...current,
      error: '',
      isLoading: true,
    }))

    requestWechatDraftStatus(session.id)
      .then((payload) => {
        if (cancelled) {
          return
        }

        setWechatStatus({
          appId: payload?.appId || '',
          configured: Boolean(payload?.configured),
          error: '',
          isLoading: false,
        })

        if (payload?.draftSync && onUpdateDraftSync) {
          onUpdateDraftSync(payload.draftSync)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setWechatStatus({
            appId: '',
            configured: false,
            error: error.message || '读取微信草稿状态失败',
            isLoading: false,
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [onUpdateDraftSync, session?.id])

  async function handleCopyWechat() {
    if (copyStatus === 'copying') {
      return
    }
    const clipboardRenderResult = {
      bodyHtml: previewRenderResult.bodyHtml,
      plainText: previewRenderResult.plainText,
      valid: previewRenderResult.valid,
    }

    if (!clipboardRenderResult.bodyHtml) {
      return
    }

    try {
      setCopyStatus('copying')
      const preparedPayload = await requestWechatClipboardPreparation({
        bodyHtml: clipboardRenderResult.bodyHtml,
        plainText: clipboardRenderResult.plainText,
      })

      await copyHtmlToClipboard(
        preparedPayload.bodyHtml || clipboardRenderResult.bodyHtml,
        preparedPayload.plainText || clipboardRenderResult.plainText,
      )

      setCopyStatus('copied')
      onShowPageToast?.(
        preparedPayload?.uploadedImageCount > 0
          ? `已复制微信样式，并处理 ${preparedPayload.uploadedImageCount} 张图片链接`
          : '已复制微信样式',
        'success',
      )
      window.setTimeout(() => {
        setCopyStatus('idle')
      }, 2000)
    } catch (error) {
      const errorMessage = error.message || '复制微信样式失败'
      setCopyStatus('error')
      onShowPageToast?.(`复制失败，未更新剪贴板：${errorMessage}`, 'error')
      window.setTimeout(() => {
        setCopyStatus('idle')
      }, 2000)
    }
  }

  async function handleCopyTitle() {
    try {
      await navigator.clipboard.writeText(displayTitle || '未命名标题')
      onCopyTitleSuccess?.()
    } catch {}
  }

  async function handleSyncWechatDraft() {
    if (!session?.id || isWechatSyncing) {
      return
    }

    const wechatRenderResult = buildWechatDraftRenderResult()

    if (!wechatRenderResult.bodyHtml) {
      return
    }

    const nextDraftSync = {
      ...(session?.draftSync ?? {}),
      attemptCount: Math.max(1, Number(session?.draftSync?.attemptCount || 0) + 1),
      error: '',
      lastSyncedAt: session?.draftSync?.lastSyncedAt ?? null,
      mediaId: session?.draftSync?.mediaId ?? '',
      provider: 'wechat',
      status: 'syncing',
      summary: null,
    }

    setIsWechatSyncing(true)
    onUpdateDraftSync?.(nextDraftSync)

    try {
      const payload = await requestWechatDraftSync({
        article: {
          author: topic?.penName || '',
          bodyHtml: wechatRenderResult.bodyHtml,
          contentSourceUrl: '',
          coverImageSrc: wechatCoverImageSrc,
          mediaId: session?.draftSync?.mediaId || '',
          plainText: wechatRenderResult.plainText,
          title: displayTitle || '未命名文章',
        },
        sessionId: session.id,
      })

      if (payload?.draftSync) {
        onUpdateDraftSync?.(payload.draftSync)
      }

      setWechatStatus((current) => ({
        ...current,
        error: '',
      }))
    } catch (error) {
      onUpdateDraftSync?.({
        ...nextDraftSync,
        error: error.message || '同步微信草稿失败',
        status: 'error',
      })
      setWechatStatus((current) => ({
        ...current,
        error: error.message || '同步微信草稿失败',
      }))
    } finally {
      setIsWechatSyncing(false)
    }
  }

  const syncActionLabel = isWechatSyncing ? '同步中...' : wechatDraftSync?.mediaId ? '更新微信草稿' : '保存到微信草稿'
  const copyActionLabel =
    copyStatus === 'copying'
      ? '准备复制...'
      : copyStatus === 'copied'
        ? '已复制'
        : copyStatus === 'error'
          ? '复制失败'
          : '复制微信样式'
  const CopyWechatIcon =
    copyStatus === 'copying' ? LoaderCircle : copyStatus === 'copied' ? Check : copyStatus === 'error' ? X : Copy
  const SyncIndicatorIcon = syncIndicatorMeta.icon

  return (
    <div className="benchmark-scroll-hidden h-full min-h-0 overflow-y-auto px-6 py-6">
      <div className="mx-auto flex w-full max-w-[980px] flex-col gap-5">
        <div className="flex items-center justify-between gap-3 px-1 py-1">
          <div className="benchmark-scroll-hidden flex min-w-0 items-center gap-2 overflow-x-auto">
            <div className="inline-flex shrink-0 rounded-full bg-secondary/55 p-1">
              {[
                { id: 'mobile', label: '移动端', icon: Smartphone },
                { id: 'desktop', label: 'PC端', icon: Monitor },
              ].map((item) => (
                <button
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] transition-colors',
                    previewDevice === item.id ? 'bg-white text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                  key={item.id}
                  onClick={() => onSetPreviewDevice?.(item.id)}
                  type="button"
                >
                  <item.icon size={14} />
                  {item.label}
                </button>
              ))}
            </div>

            <div className="inline-flex shrink-0 rounded-full bg-secondary/55 p-1">
              {previewFontSizeOptions.map((item) => (
                <button
                  className={cn(
                    'inline-flex items-center rounded-full px-4 py-2 text-[13px] transition-colors',
                    normalizedPreviewFontSize === item.id ? 'bg-white text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                  key={item.id}
                  onClick={() => onSetPreviewFontSize?.(item.id)}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    aria-label={syncActionLabel}
                    className="rounded-full"
                    disabled={!canRenderStructuredPreview || !wechatStatus.configured || !wechatCoverImageSrc || !version?.id || isWechatSyncing}
                    onClick={handleSyncWechatDraft}
                    size="icon-lg"
                    type="button"
                  >
                    {isWechatSyncing ? <LoaderCircle className="animate-spin" size={16} /> : <MessageSquareText size={16} />}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent sideOffset={10}>{syncActionLabel}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className={cn(
                    'inline-flex size-10 items-center justify-center rounded-full border',
                    syncIndicatorMeta.toneClassName,
                  )}
                >
                  <SyncIndicatorIcon className={syncIndicatorMeta.iconClassName} size={17} />
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-[280px] flex-col items-start gap-1.5 px-3 py-2 text-left" sideOffset={10}>
                <div className="text-[12px] font-medium">{syncIndicatorMeta.title}</div>
                <div className="text-[12px] leading-5 text-background/80">{syncIndicatorMeta.description}</div>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    aria-label={copyActionLabel}
                    className="rounded-full"
                    disabled={!canRenderStructuredPreview || copyStatus === 'copying'}
                    onClick={handleCopyWechat}
                    size="icon-lg"
                    type="button"
                    variant="outline"
                  >
                    <CopyWechatIcon className={copyStatus === 'copying' ? 'animate-spin' : undefined} size={16} />
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-[280px] text-left" sideOffset={10}>
                {copyActionLabel}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        <div className="rounded-[var(--radius-card)] border border-border/60 bg-white px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 text-[18px] font-semibold leading-[1.55] text-foreground">{displayTitle || '未命名标题'}</div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button aria-label="复制标题" className="rounded-full" onClick={handleCopyTitle} size="icon-sm" type="button" variant="ghost">
                  <Copy size={15} />
                </Button>
              </TooltipTrigger>
              <TooltipContent sideOffset={10}>复制标题</TooltipContent>
            </Tooltip>
          </div>
        </div>

        <div className="flex justify-center">
          <div className={cn('w-full transition-all', previewViewportClassName)}>
            {canRenderStructuredPreview ? (
              <div className="overflow-hidden rounded-none border border-border/60 bg-white">
                <ArticlePreviewFrame documentHtml={previewRenderResult.documentHtml} />
              </div>
            ) : (
              <div className="rounded-[var(--radius-panel)] border border-red-200 bg-red-50 px-5 py-4 text-red-700">
                <div className="text-[14px] font-semibold">格式有问题，无法进入排版</div>
                <div className="mt-2 text-[13px] leading-6 text-red-700/90">
                  {draftStructureState.issues.length > 0
                    ? draftStructureState.issues.join('；')
                    : '当前文字稿的标题层级或结尾结构无法稳定识别，请先修改或重新生成。'}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
