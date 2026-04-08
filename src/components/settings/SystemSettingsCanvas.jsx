import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Cloud, Download, LoaderCircle, RefreshCw, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { createPersistableBenchmarkState, useBenchmarkStore } from '@/stores/useBenchmarkStore.js'
import {
  SHORT_CONTENT_STORAGE_KEY,
  SHORT_CONTENT_STORAGE_VERSION,
  createPersistableShortContentState,
  useShortContentStore,
} from '@/stores/useShortContentStore.js'

const CONTENT_SESSION_STORAGE_VERSION = 4

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

async function flushLocalContentMirror() {
  const state = useBenchmarkStore.getState()
  const response = await fetch('/api/content-sessions', {
    body: JSON.stringify({
      item: {
        state: createPersistableBenchmarkState(state),
        version: CONTENT_SESSION_STORAGE_VERSION,
      },
      name: 'content-creation-sessions-v1',
    }),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'PUT',
  })
  const payload = await readJsonResponse(response, '长文本地镜像接口返回异常，请稍后重试。')

  if (!response.ok) {
    throw new Error(payload?.error || '写入长文本地镜像失败')
  }

  return payload
}

async function flushLocalShortContentMirror() {
  const state = useShortContentStore.getState()
  const response = await fetch('/api/short-content-sessions', {
    body: JSON.stringify({
      item: {
        state: createPersistableShortContentState(state),
        version: SHORT_CONTENT_STORAGE_VERSION,
      },
      name: SHORT_CONTENT_STORAGE_KEY,
    }),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'PUT',
  })
  const payload = await readJsonResponse(response, '短文本地镜像接口返回异常，请稍后重试。')

  if (!response.ok) {
    throw new Error(payload?.error || '写入短文本地镜像失败')
  }

  return payload
}

async function requestSystemSyncStatus() {
  const response = await fetch('/api/system-sync-status')
  const payload = await readJsonResponse(response, '同步状态接口返回异常，请稍后重试。')

  if (!response.ok) {
    throw new Error(payload?.error || '读取同步状态失败')
  }

  return payload
}

async function requestSystemSyncAction(target, action) {
  const response = await fetch('/api/system-sync-status', {
    body: JSON.stringify({
      action,
      target,
    }),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })
  const payload = await readJsonResponse(response, '同步操作接口返回异常，请稍后重试。')

  if (!response.ok) {
    throw new Error(payload?.error || '同步操作失败')
  }

  return payload
}

function formatDateTime(value) {
  if (!value) {
    return '暂无记录'
  }

  try {
    return new Intl.DateTimeFormat('zh-CN', {
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(value))
  } catch {
    return value
  }
}

function resolveToneClass(tone = 'neutral') {
  switch (tone) {
    case 'success':
      return 'border-emerald-200/80 bg-emerald-50 text-emerald-700'
    case 'warning':
      return 'border-amber-200/80 bg-amber-50 text-amber-700'
    case 'danger':
      return 'border-red-200/80 bg-red-50 text-red-700'
    default:
      return 'border-border/70 bg-secondary/30 text-muted-foreground'
  }
}

function SyncBadge({ tone, children }) {
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2.5 py-1 text-[12px] font-medium', resolveToneClass(tone))}>
      {children}
    </span>
  )
}

function SyncCard({ busyTarget, feedback, onAction, status, target }) {
  const isBusy = busyTarget === target
  const countLabel = target === 'content' ? '篇' : '条'
  const localCount = target === 'content' ? status?.local?.sessionCount ?? 0 : status?.local?.conversationCount ?? 0
  const cloudCount = target === 'content' ? status?.cloud?.sessionCount ?? 0 : status?.cloud?.conversationCount ?? 0
  const badgeTone = isBusy ? 'neutral' : status?.tone
  const badgeLabel = isBusy ? '同步中' : status?.statusLabel || '暂无记录'

  return (
    <section className="rounded-[var(--radius-panel)] border border-border/70 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Cloud className="text-muted-foreground" size={16} />
            <h2 className="text-[17px] font-semibold text-foreground">{status?.label || '同步状态'}</h2>
          </div>
          <p className="mt-2 text-[13px] leading-6 text-muted-foreground">{status?.statusSummary || '暂无同步信息。'}</p>
        </div>

        <SyncBadge tone={badgeTone}>{badgeLabel}</SyncBadge>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-[var(--radius-card)] border border-border/70 bg-secondary/15 px-4 py-3">
          <div className="text-[12px] font-medium text-muted-foreground">本地</div>
          <div className="mt-1 text-[14px] font-medium text-foreground">{localCount} {countLabel}</div>
          <div className="mt-1 text-[12px] text-muted-foreground">{formatDateTime(status?.local?.updatedAt)}</div>
        </div>

        <div className="rounded-[var(--radius-card)] border border-border/70 bg-secondary/15 px-4 py-3">
          <div className="text-[12px] font-medium text-muted-foreground">云端</div>
          <div className="mt-1 text-[14px] font-medium text-foreground">
            {status?.cloud?.enabled ? `${cloudCount} ${countLabel}` : '未配置'}
          </div>
          <div className="mt-1 text-[12px] text-muted-foreground">
            {status?.cloud?.enabled ? formatDateTime(status?.cloud?.updatedAt) : '当前环境未启用 OSS'}
          </div>
        </div>
      </div>

      {status?.cloud?.error ? (
        <div className="mt-4 rounded-[var(--radius-card)] border border-red-200/80 bg-red-50 px-4 py-3 text-[12px] leading-6 text-red-700">
          {status.cloud.error}
        </div>
      ) : null}

      {feedback?.message ? (
        <div
          className={cn(
            'mt-4 rounded-[var(--radius-card)] border px-4 py-3 text-[12px] leading-6',
            feedback.tone === 'success' && 'border-emerald-200/80 bg-emerald-50 text-emerald-700',
            feedback.tone === 'danger' && 'border-red-200/80 bg-red-50 text-red-700',
            feedback.tone !== 'success' && feedback.tone !== 'danger' && 'border-border/70 bg-secondary/15 text-muted-foreground',
          )}
        >
          {feedback.message}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {Array.isArray(status?.actions) && status.actions.length > 0 ? (
          status.actions.map((action) => (
            <Button
              className="rounded-[var(--radius-control)]"
              disabled={isBusy}
              key={action.action}
              onClick={() => onAction(target, action.action)}
              size="sm"
              type="button"
              variant={action.action === 'push' ? 'default' : 'outline'}
            >
              {isBusy ? (
                <LoaderCircle className="animate-spin" size={14} />
              ) : action.action === 'push' ? (
                <Upload size={14} />
              ) : (
                <Download size={14} />
              )}
              {action.label}
            </Button>
          ))
        ) : (
          <div className="text-[12px] text-muted-foreground">当前不需要执行同步操作。</div>
        )}
      </div>
    </section>
  )
}

export default function SystemSettingsCanvas({ onShowPageToast }) {
  const hydrateContentSnapshot = useBenchmarkStore((state) => state.hydrateFromPersistedSnapshot)
  const hydrateShortSnapshot = useShortContentStore((state) => state.hydrateFromPersistedSnapshot)

  const [syncStatus, setSyncStatus] = useState(null)
  const [actionFeedback, setActionFeedback] = useState({})
  const [errorMessage, setErrorMessage] = useState('')
  const [busyTarget, setBusyTarget] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isChecking, setIsChecking] = useState(false)

  async function loadStatus({ silent = false } = {}) {
    if (silent) {
      setIsChecking(true)
    } else {
      setIsLoading(true)
    }

    try {
      await Promise.all([flushLocalContentMirror(), flushLocalShortContentMirror()])
      const payload = await requestSystemSyncStatus()
      setSyncStatus(payload)
      setErrorMessage('')
    } catch (error) {
      setErrorMessage(error.message || '读取同步状态失败')
    } finally {
      if (silent) {
        setIsChecking(false)
      } else {
        setIsLoading(false)
      }
    }
  }

  function setTargetFeedback(target, feedback) {
    setActionFeedback((current) => ({
      ...current,
      [target]: feedback,
    }))
  }

  async function handleSyncAction(target, action) {
    setBusyTarget(target)
    setTargetFeedback(target, {
      message: action === 'push' ? '正在同步到云端...' : '正在恢复到本机...',
      tone: 'neutral',
    })

    try {
      if (action === 'push') {
        if (target === 'content') {
          await flushLocalContentMirror()
        } else {
          await flushLocalShortContentMirror()
        }
      }

      const result = await requestSystemSyncAction(target, action)

      if (action === 'pull' && result?.item?.state) {
        if (target === 'content') {
          hydrateContentSnapshot(result.item.state)
        } else {
          hydrateShortSnapshot(result.item.state)
        }
      }

      setSyncStatus(result?.syncStatus ?? null)
      setErrorMessage('')
      setTargetFeedback(target, {
        message: action === 'push' ? '云端同步完成。' : '已恢复到本机。',
        tone: 'success',
      })
      onShowPageToast?.(action === 'push' ? '已同步到云端' : '已恢复到本机')
    } catch (error) {
      const message = error.message || '同步操作失败'
      setErrorMessage(message)
      setTargetFeedback(target, {
        message,
        tone: 'danger',
      })
      onShowPageToast?.(message, 'error')
    } finally {
      setBusyTarget('')
    }
  }

  useEffect(() => {
    loadStatus().catch(() => {})
  }, [])

  const checkedAtLabel = useMemo(() => formatDateTime(syncStatus?.checkedAt), [syncStatus?.checkedAt])

  return (
    <div className="benchmark-scroll-hidden min-h-0 flex-1 overflow-y-auto bg-white">
      <div className="mx-auto flex h-full w-full max-w-[1100px] flex-col px-4 py-8 sm:px-5 lg:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[30px] font-semibold tracking-[-0.03em] text-foreground sm:text-[34px]">系统设置</h1>
            <p className="mt-2 text-[14px] leading-6 text-muted-foreground">
              先检查本地和云端是否一致，再显示当前真正需要的同步动作。
            </p>
          </div>

          <Button
            className="rounded-[var(--radius-control)]"
            disabled={isLoading || isChecking || Boolean(busyTarget)}
            onClick={() => loadStatus({ silent: true })}
            type="button"
            variant="outline"
          >
            {isChecking ? <LoaderCircle className="animate-spin" size={14} /> : <RefreshCw size={14} />}
            检查同步
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
          <CheckCircle2 size={14} />
          最近检查：{checkedAtLabel}
        </div>

        {errorMessage ? (
          <div className="mt-4 rounded-[var(--radius-card)] border border-red-200 bg-red-50 px-4 py-3 text-[13px] leading-6 text-red-700">
            {errorMessage}
          </div>
        ) : null}

        {isLoading ? (
          <div className="mt-6 flex min-h-[280px] items-center justify-center rounded-[var(--radius-panel)] border border-border/70 bg-white">
            <div className="inline-flex items-center gap-2 text-[14px] text-muted-foreground">
              <LoaderCircle className="animate-spin" size={16} />
              正在检查同步状态
            </div>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <SyncCard
              busyTarget={busyTarget}
              feedback={actionFeedback.content}
              onAction={handleSyncAction}
              status={syncStatus?.content}
              target="content"
            />
            <SyncCard
              busyTarget={busyTarget}
              feedback={actionFeedback.shortContent}
              onAction={handleSyncAction}
              status={syncStatus?.shortContent}
              target="shortContent"
            />
          </div>
        )}
      </div>
    </div>
  )
}
