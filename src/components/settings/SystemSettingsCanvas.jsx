import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  Cloud,
  Download,
  LoaderCircle,
  PencilLine,
  Plus,
  PlugZap,
  RefreshCw,
  Save,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
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
const LLM_PROVIDER_OPTIONS = [
  { label: '智谱', value: 'glm' },
  { label: 'DeepSeek', value: 'deepseek' },
  { label: 'MiniMax', value: 'minimax' },
]

function createProfileId() {
  return `llm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function createEmptyProfile() {
  return {
    apiKey: '',
    baseUrl: '',
    enabled: true,
    id: createProfileId(),
    model: 'glm-5.1',
    name: '新模型配置',
    provider: 'glm',
  }
}

function requiresBaseUrl(provider = '') {
  return provider === 'deepseek' || provider === 'minimax' || provider === 'openai-compatible'
}

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

async function requestCloudVaultData() {
  const response = await fetch('/api/cloud-vault')
  const payload = await readJsonResponse(response, '保险箱接口返回异常。')

  if (!response.ok) {
    throw new Error(payload?.error || '拉取全量云端库失败')
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

async function requestLlmConfig() {
  const response = await fetch('/api/llm-config')
  const payload = await readJsonResponse(response, '模型配置接口返回异常，请稍后重试。')

  if (!response.ok) {
    throw new Error(payload?.error || '读取模型配置失败')
  }

  return payload
}

async function requestLlmConfigSave(config) {
  const response = await fetch('/api/llm-config', {
    body: JSON.stringify({ config }),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'PUT',
  })
  const payload = await readJsonResponse(response, '保存模型配置失败，请稍后重试。')

  if (!response.ok) {
    throw new Error(payload?.error || '保存模型配置失败')
  }

  return payload
}

async function requestLlmConfigTest(profile) {
  const response = await fetch('/api/llm-config/test', {
    body: JSON.stringify({ profile }),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })
  const payload = await readJsonResponse(response, '模型连通性测试失败，请稍后重试。')

  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.error || '模型连通性测试失败')
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

function formatProviderLabel(value = '') {
  if (value === 'openai-compatible') {
    return 'DeepSeek'
  }

  return LLM_PROVIDER_OPTIONS.find((option) => option.value === value)?.label || '未设置'
}

function SyncBadge({ tone, children }) {
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2.5 py-1 text-[12px] font-medium', resolveToneClass(tone))}>
      {children}
    </span>
  )
}

function MetaPill({ children }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border/70 bg-secondary/15 px-2.5 py-1 text-[12px] text-muted-foreground">
      {children}
    </span>
  )
}

function SettingsInput({ className, ...props }) {
  return (
    <input
      className={cn(
        'h-9 w-full rounded-[6px] border border-border/70 bg-white px-3 text-[13px] text-foreground outline-none transition-colors focus:border-primary/40',
        className,
      )}
      {...props}
    />
  )
}

function SettingsSelect({ className, ...props }) {
  return (
    <select
      className={cn(
        'h-9 w-full appearance-none rounded-[6px] border border-border/70 bg-white px-3 pr-9 text-[13px] text-foreground outline-none transition-colors focus:border-primary/40',
        className,
      )}
      {...props}
    />
  )
}

function FieldBlock({ children, label, required = false }) {
  return (
    <label className="block">
      <div className="mb-1.5 flex items-center gap-1 text-[12px] font-medium text-muted-foreground">
        {required ? <span className="text-red-500">*</span> : null}
        <span>{label}</span>
      </div>
      {children}
    </label>
  )
}

function SettingsNavItem({ active, description, icon: Icon, label, onClick }) {
  return (
    <button
      className={cn(
        'flex h-10 w-full items-center gap-1 rounded-[7px] px-2 text-left transition-colors',
        active ? 'bg-[#e9edf3] text-foreground' : 'text-muted-foreground hover:bg-white/65 hover:text-foreground',
      )}
      onClick={onClick}
      type="button"
    >
      <span
        className={cn(
          'inline-flex size-6 shrink-0 items-center justify-center rounded-[6px] transition-colors',
          active ? 'bg-transparent text-foreground' : 'bg-transparent text-muted-foreground',
        )}
      >
        <Icon size={18} strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium">{label}</span>
        {description ? <span className="mt-0.5 block text-[12px] text-muted-foreground">{description}</span> : null}
      </span>
    </button>
  )
}

function ToggleSwitch({ checked, disabled, onToggle }) {
  return (
    <button
      aria-checked={checked}
      className={cn(
        'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors',
        checked ? 'bg-foreground' : 'bg-secondary/70',
        disabled && 'cursor-not-allowed opacity-60',
      )}
      disabled={disabled}
      onClick={onToggle}
      role="switch"
      type="button"
    >
      <span
        className={cn(
          'pointer-events-none absolute top-1 size-5 rounded-full bg-white transition-transform',
          checked ? 'translate-x-6' : 'translate-x-1',
        )}
      />
    </button>
  )
}

function ProfileEditorDialog({
  draft,
  isSubmitting,
  mode,
  onChange,
  onClose,
  onSubmit,
  open,
}) {
  if (!open || typeof document === 'undefined' || !draft) {
    return null
  }

  return createPortal(
    <div
        className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/14 p-5 backdrop-blur-[4px]"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-[500px] rounded-[12px] border border-white/80 bg-white p-5"
        onClick={(event) => event.stopPropagation()}
        role="presentation"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-[18px] font-semibold tracking-[-0.03em] text-foreground">
              {mode === 'edit' ? '编辑模型' : '添加模型'}
            </h3>
            <p className="mt-1 text-[12px] leading-6 text-muted-foreground">
              填好必要信息后添加到当前模型列表。
            </p>
          </div>

          <button
            aria-label="关闭"
            className="inline-flex h-8 w-8 items-center justify-center rounded-[6px] border border-border/70 bg-white text-muted-foreground transition-colors hover:border-foreground/15 hover:text-foreground"
            onClick={onClose}
            type="button"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-5 space-y-3.5">
          <FieldBlock label="服务商" required>
            <div className="relative">
              <SettingsSelect
                onChange={(event) => onChange('provider', event.target.value)}
                value={draft.provider === 'openai-compatible' ? 'deepseek' : draft.provider}
              >
                {LLM_PROVIDER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SettingsSelect>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            </div>
          </FieldBlock>

          <FieldBlock label="模型名称" required>
            <SettingsInput onChange={(event) => onChange('name', event.target.value)} placeholder="例如：GLM 5.1 主账号" value={draft.name} />
          </FieldBlock>

          <FieldBlock label="Model" required>
            <SettingsInput onChange={(event) => onChange('model', event.target.value)} placeholder="例如：glm-5.1" value={draft.model} />
          </FieldBlock>

          <FieldBlock label="API 密钥" required>
            <SettingsInput onChange={(event) => onChange('apiKey', event.target.value)} placeholder="输入 API Key" value={draft.apiKey} />
          </FieldBlock>

          {requiresBaseUrl(draft.provider) ? (
            <FieldBlock label="Base URL" required>
              <SettingsInput
                onChange={(event) => onChange('baseUrl', event.target.value)}
                placeholder="例如 https://your-gateway/v1"
                value={draft.baseUrl}
              />
            </FieldBlock>
          ) : null}
        </div>

        <div className="mt-5">
          <Button
            className="h-10 w-full rounded-[6px] bg-foreground px-5 text-white hover:bg-foreground/92"
            disabled={isSubmitting}
            onClick={onSubmit}
            type="button"
          >
            {isSubmitting ? <LoaderCircle className="animate-spin" size={15} /> : null}
            {mode === 'edit' ? '保存修改' : '添加模型'}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function CloudVaultViewer() {
  const [activeTab, setActiveTab] = useState('content')
  const [data, setData] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function loadVault() {
      try {
        setIsLoading(true)
        const vaultData = await requestCloudVaultData()
        if (active) setData(vaultData)
      } catch (err) {
        if (active) setError(err.message)
      } finally {
        if (active) setIsLoading(false)
      }
    }
    loadVault()
    return () => { active = false }
  }, [])

  if (isLoading) {
    return (
      <div className="flex min-h-[360px] items-center justify-center rounded-[6px] border border-border/70 bg-white">
        <div className="inline-flex items-center gap-2 text-[14px] text-muted-foreground">
          <LoaderCircle className="animate-spin" size={16} />
          正在读取云端全量数据...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-[6px] border border-red-200 bg-red-50 px-4 py-3 text-[13px] leading-6 text-red-700">
        {error}
      </div>
    )
  }

  const listData = activeTab === 'content' ? data?.content || [] : data?.shortContent || []

  // Group by Date
  const groupedTasks = listData.reduce((acc, item) => {
    const timeToUse = item.updatedAt || item.createdAt || 0
    const d = new Date(timeToUse)
    const yyyymmdd = Number.isNaN(d.getTime()) ? '未知日期' : d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
    if (!acc[yyyymmdd]) acc[yyyymmdd] = []
    acc[yyyymmdd].push(item)
    return acc
  }, {})

  const dateKeys = Object.keys(groupedTasks).sort((a, b) => {
    if (a === '未知日期') return 1
    if (b === '未知日期') return -1
    return new Date(b.replace(/\//g, '-')).getTime() - new Date(a.replace(/\//g, '-')).getTime()
  })

  return (
    <div className="flex flex-col h-full space-y-4">
      <div className="flex items-center gap-2 p-1 bg-secondary/30 rounded-[8px] self-start">
        <button
          className={cn('px-4 py-1.5 text-[13px] font-medium rounded-[6px] transition-colors', activeTab === 'content' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}
          onClick={() => setActiveTab('content')}
        >
          长文宝库
        </button>
        <button
          className={cn('px-4 py-1.5 text-[13px] font-medium rounded-[6px] transition-colors', activeTab === 'short' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}
          onClick={() => setActiveTab('short')}
        >
          短文碎片
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pr-2 pb-4 space-y-6">
        {dateKeys.length === 0 ? (
          <div className="py-12 text-center text-[13px] text-muted-foreground">该分类下为空</div>
        ) : (
          dateKeys.map(dateKey => (
            <div key={dateKey} className="space-y-3">
              <div className="flex items-center gap-2 border-b border-border/70 pb-2">
                <span className="text-[13px] font-semibold text-foreground tracking-tight">📅 {dateKey}</span>
                <span className="text-[11px] bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full">
                  共 {groupedTasks[dateKey].length} 篇
                </span>
              </div>
              <div className="grid gap-2">
                {groupedTasks[dateKey].sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime()).map((item, idx) => {
                  const d = new Date(item.updatedAt || item.createdAt || 0)
                  const timeLabel = Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
                  
                  // Derive status
                  let statusBadge = ''
                  let badgeTone = 'default'
                  if (activeTab === 'content') {
                    if (item.publishStatus === 'published') { statusBadge = '已发布'; badgeTone = 'emerald' }
                    else if (item.stageId === 'completed') { statusBadge = '已完成'; badgeTone = 'indigo' }
                    else if (item.stageId === 'preview') { statusBadge = '已排版/定稿'; badgeTone = 'blue' }
                    else if (item.stageId === 'draft') { statusBadge = '初稿阶段'; badgeTone = 'amber' }
                    else { statusBadge = '选题中'; badgeTone = 'neutral' }
                  } else {
                    statusBadge = '短内容'
                    badgeTone = 'fuchsia'
                  }

                  const badgeClass = {
                    emerald: 'bg-emerald-100/80 text-emerald-700 border-emerald-200',
                    indigo: 'bg-indigo-100/80 text-indigo-700 border-indigo-200',
                    blue: 'bg-blue-100/80 text-blue-700 border-blue-200',
                    amber: 'bg-amber-100/80 text-amber-700 border-amber-200',
                    fuchsia: 'bg-fuchsia-100/80 text-fuchsia-700 border-fuchsia-200',
                    neutral: 'bg-secondary text-muted-foreground border-border/70'
                  }[badgeTone]

                  return (
                    <div key={item.id || idx} className="flex items-center justify-between p-3 rounded-[6px] border border-border/70 bg-white hover:border-border transition-colors group">
                      <div className="flex items-center gap-3 min-w-0 pr-4">
                        <span className={cn("shrink-0 text-[11px] px-2 py-0.5 rounded border whitespace-nowrap", badgeClass)}>
                          {statusBadge}
                        </span>
                        <span className="truncate text-[13px] font-medium text-foreground">
                          {item.title || '无标题记录'}
                        </span>
                      </div>
                      <div className="shrink-0 text-[12px] text-muted-foreground font-mono">
                        {timeLabel}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function SyncDiffViewer({ diffs }) {
  if (!diffs || (!diffs.localNews?.length && !diffs.cloudNews?.length)) {
    return null
  }

  const { localNews = [], cloudNews = [] } = diffs

  return (
    <div className="mt-4 rounded-[6px] border border-border/70 text-[13px]">
      <div className="flex border-b border-border/70 bg-secondary/20">
        <div className="w-1/2 p-2.5 font-medium text-foreground border-r border-border/70">
          <div className="flex items-center gap-2">本地新建/更新 <span className="text-[11px] font-normal text-muted-foreground">(近48小时)</span></div>
        </div>
        <div className="w-1/2 p-2.5 font-medium text-foreground">
          <div className="flex items-center gap-2">云端新建/更新 <span className="text-[11px] font-normal text-muted-foreground">(近48小时)</span></div>
        </div>
      </div>
      <div className="flex divide-x divide-border/70 bg-white">
        <div className="w-1/2 p-2.5 space-y-2">
          {localNews.length === 0 ? (
            <div className="text-muted-foreground text-[12px] py-1">暂无差异</div>
          ) : (
            localNews.map(item => (
              <div key={item.id} className="flex flex-col gap-0.5 rounded px-2 py-1.5 hover:bg-secondary/30 transition-colors">
                <span className="truncate text-foreground font-medium">{item.title}</span>
                <span className="text-[11px] text-muted-foreground">{formatDateTime(item.updatedAt)}</span>
              </div>
            ))
          )}
        </div>
        <div className="w-1/2 p-2.5 space-y-2">
          {cloudNews.length === 0 ? (
            <div className="text-muted-foreground text-[12px] py-1">暂无差异</div>
          ) : (
            cloudNews.map(item => (
              <div key={item.id} className="flex flex-col gap-0.5 rounded px-2 py-1.5 hover:bg-secondary/30 transition-colors">
                <span className="truncate text-foreground font-medium">{item.title}</span>
                <span className="text-[11px] text-muted-foreground">{formatDateTime(item.updatedAt)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function SyncCard({ busyTarget, feedback, onAction, status, target }) {
  const isBusy = busyTarget === target
  const countLabel = target === 'content' ? '篇' : target === 'llm' ? '组' : '条'
  const localCount =
    target === 'content'
      ? status?.local?.sessionCount ?? 0
      : target === 'llm'
        ? status?.local?.profileCount ?? 0
        : status?.local?.conversationCount ?? 0
  const cloudCount =
    target === 'content'
      ? status?.cloud?.sessionCount ?? 0
      : target === 'llm'
        ? status?.cloud?.profileCount ?? 0
        : status?.cloud?.conversationCount ?? 0
  const badgeTone = isBusy ? 'neutral' : status?.tone
  const badgeLabel = isBusy ? '同步中' : status?.statusLabel || '暂无记录'
  const localMeta = `本地 ${localCount}${countLabel} · ${formatDateTime(status?.local?.updatedAt)}`
  const cloudMeta = status?.cloud?.enabled
    ? `云端 ${cloudCount}${countLabel} · ${formatDateTime(status?.cloud?.updatedAt)}`
    : '云端未配置'

  return (
    <section className="rounded-[6px] border border-border/70 bg-white px-4 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Cloud className="text-muted-foreground" size={16} />
            <h2 className="text-[14px] font-semibold text-foreground">{status?.label || '同步状态'}</h2>
            <SyncBadge tone={badgeTone}>{badgeLabel}</SyncBadge>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <MetaPill>{localMeta}</MetaPill>
            <MetaPill>{cloudMeta}</MetaPill>
          </div>
          {status?.statusSummary ? <div className="mt-2 text-[12px] text-muted-foreground">{status.statusSummary}</div> : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {Array.isArray(status?.actions) && status.actions.length > 0 ? (
            status.actions.map((action) => {
              const label = action.action === 'pull' ? '安全抓取云端差异 (Pull)' : action.action === 'push' ? '同步本机最新 (Push)' : action.label
              return (
              <Button
                className="rounded-[6px]"
                disabled={isBusy}
                key={action.action}
                onClick={() => onAction(target, action.action)}
                size="sm"
                type="button"
                variant={action.action === 'push' ? 'outline' : 'default'}
              >
                {isBusy ? (
                  <LoaderCircle className="animate-spin" size={14} />
                ) : action.action === 'push' ? (
                  <Upload size={14} />
                ) : (
                  <Download size={14} />
                )}
                {label}
              </Button>
            )})
          ) : (
            <span className="text-[12px] text-muted-foreground">无需操作</span>
          )}
        </div>
      </div>

      <SyncDiffViewer diffs={status?.diffs} />

      {status?.cloud?.error ? (
        <div
          className={cn(
            'mt-3 rounded-[6px] border px-3 py-2 text-[12px] leading-6',
            'border-red-200/80 bg-red-50 text-red-700',
          )}
        >
          {status.cloud.error}
        </div>
      ) : null}

      {feedback?.message ? (
        <div
          className={cn(
            'mt-3 rounded-[6px] border px-3 py-2 text-[12px] leading-6',
            feedback.tone === 'success' && 'border-emerald-200/80 bg-emerald-50 text-emerald-700',
            feedback.tone === 'danger' && 'border-red-200/80 bg-red-50 text-red-700',
            feedback.tone !== 'success' &&
              feedback.tone !== 'danger' &&
              'border-border/70 bg-secondary/15 text-muted-foreground',
          )}
        >
          {feedback.message}
        </div>
      ) : null}
    </section>
  )
}

export default function SystemSettingsCanvas({ onClose, onShowPageToast, open }) {
  const hydrateContentSnapshot = useBenchmarkStore((state) => state.hydrateFromPersistedSnapshot)
  const hydrateShortSnapshot = useShortContentStore((state) => state.hydrateFromPersistedSnapshot)

  const [syncStatus, setSyncStatus] = useState(null)
  const [actionFeedback, setActionFeedback] = useState({})
  const [errorMessage, setErrorMessage] = useState('')
  const [busyTarget, setBusyTarget] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isChecking, setIsChecking] = useState(false)

  const [llmConfig, setLlmConfig] = useState(null)
  const [llmDraft, setLlmDraft] = useState(null)
  const [llmError, setLlmError] = useState('')
  const [llmFeedback, setLlmFeedback] = useState(null)
  const [profileFeedbackMap, setProfileFeedbackMap] = useState({})
  const [isLlmLoading, setIsLlmLoading] = useState(true)
  const [isSavingLlm, setIsSavingLlm] = useState(false)
  const [testingProfileId, setTestingProfileId] = useState('')
  const [activePanel, setActivePanel] = useState('sync')
  const [profileEditorMode, setProfileEditorMode] = useState('create')
  const [profileEditorDraft, setProfileEditorDraft] = useState(null)
  const [isProfileEditorOpen, setIsProfileEditorOpen] = useState(false)

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

  async function loadLlmConfig({ silent = false } = {}) {
    if (!silent) {
      setIsLlmLoading(true)
    }

    try {
      const payload = await requestLlmConfig()
      setLlmConfig(payload?.config ?? null)
      setLlmDraft(payload?.config ?? null)
      setLlmError('')
    } catch (error) {
      setLlmError(error.message || '读取模型配置失败')
    } finally {
      if (!silent) {
        setIsLlmLoading(false)
      }
    }
  }

  function setTargetFeedback(target, feedback) {
    setActionFeedback((current) => ({
      ...current,
      [target]: feedback,
    }))
  }

  function setProfileFeedback(profileId, feedback) {
    setProfileFeedbackMap((current) => ({
      ...current,
      [profileId]: feedback,
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
        } else if (target === 'shortContent') {
          await flushLocalShortContentMirror()
        }
      }

      const result = await requestSystemSyncAction(target, action)

      if (action === 'pull' && result?.item?.state) {
        if (target === 'content') {
          hydrateContentSnapshot(result.item.state)
        } else if (target === 'shortContent') {
          hydrateShortSnapshot(result.item.state)
        } else if (target === 'llm') {
          await loadLlmConfig({ silent: true })
        }
      }

      if (target === 'llm' && action === 'push') {
        await loadLlmConfig({ silent: true })
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

  function handleSetActiveProfile(profileId) {
    setLlmDraft((current) => (current ? { ...current, activeProfileId: profileId } : current))
    setLlmFeedback(null)
  }

  function handleDeleteProfile(profileId) {
    setLlmDraft((current) => {
      if (!current) {
        return current
      }

      if (current.profiles.length <= 1) {
        onShowPageToast?.('至少保留一组模型配置', 'error')
        return current
      }

      if (current.activeProfileId === profileId) {
        onShowPageToast?.('请先把别的模型设为当前，再删除这一项', 'error')
        return current
      }

      return {
        ...current,
        profiles: current.profiles.filter((profile) => profile.id !== profileId),
      }
    })
    setLlmFeedback(null)
    setProfileFeedback(profileId, null)
  }

  function handleOpenCreateProfileDialog() {
    setProfileEditorMode('create')
    setProfileEditorDraft(createEmptyProfile())
    setIsProfileEditorOpen(true)
    setLlmFeedback(null)
  }

  function handleOpenEditProfileDialog(profile) {
    setProfileEditorMode('edit')
    setProfileEditorDraft({ ...profile })
    setIsProfileEditorOpen(true)
    setProfileFeedback(profile.id, null)
  }

  function handleProfileEditorChange(field, value) {
    setProfileEditorDraft((current) => {
      if (!current) {
        return current
      }

      if (field === 'provider') {
        return {
          ...current,
          provider: value,
          model: value === 'glm' && !current.model ? 'glm-5.1' : current.model,
          baseUrl: requiresBaseUrl(value) ? current.baseUrl : '',
        }
      }

      return {
        ...current,
        [field]: value,
      }
    })
  }

  function handleSubmitProfileEditor() {
    if (!profileEditorDraft) {
      return
    }

    if (!profileEditorDraft.name.trim() || !profileEditorDraft.model.trim() || !profileEditorDraft.apiKey.trim()) {
      onShowPageToast?.('请先补全模型名称、Model 和 API Key', 'error')
      return
    }

    if (requiresBaseUrl(profileEditorDraft.provider) && !profileEditorDraft.baseUrl.trim()) {
      onShowPageToast?.('当前服务商需要填写 Base URL', 'error')
      return
    }

    setLlmDraft((current) => {
      const baseConfig = current ?? {
        activeProfileId: '',
        profiles: [],
      }

      if (profileEditorMode === 'edit') {
        return {
          ...baseConfig,
          profiles: baseConfig.profiles.map((profile) => (profile.id === profileEditorDraft.id ? profileEditorDraft : profile)),
        }
      }

      return {
        ...baseConfig,
        activeProfileId: baseConfig.activeProfileId || profileEditorDraft.id,
        profiles: [...baseConfig.profiles, profileEditorDraft],
      }
    })

    setLlmFeedback({
      message: profileEditorMode === 'edit' ? '模型信息已更新，记得点击右上角保存。' : '模型已加入列表，记得点击右上角保存。',
      tone: 'neutral',
    })
    setIsProfileEditorOpen(false)
    setProfileEditorDraft(null)
  }

  async function handleSaveLlmConfig() {
    if (!llmDraft) {
      return
    }

    setIsSavingLlm(true)
    setLlmFeedback({
      message: '正在保存模型配置...',
      tone: 'neutral',
    })

    try {
      const result = await requestLlmConfigSave(llmDraft)
      setLlmConfig(result?.config ?? null)
      setLlmDraft(result?.config ?? null)
      setLlmError('')
      setLlmFeedback({
        message: '模型配置已保存，新的当前模型会立即生效。',
        tone: 'success',
      })
      await loadStatus({ silent: true })
      onShowPageToast?.('模型配置已保存')
    } catch (error) {
      const message = error.message || '保存模型配置失败'
      setLlmError(message)
      setLlmFeedback({
        message,
        tone: 'danger',
      })
      onShowPageToast?.(message, 'error')
    } finally {
      setIsSavingLlm(false)
    }
  }

  async function handleTestProfile(profile) {
    setTestingProfileId(profile.id)
    setProfileFeedback(profile.id, {
      message: '正在测试连通性...',
      tone: 'neutral',
    })

    try {
      const result = await requestLlmConfigTest(profile)
      setProfileFeedback(profile.id, {
        message: `连接成功 · ${formatProviderLabel(result?.provider)} / ${result?.model || profile.model || '当前模型'}`,
        tone: 'success',
      })
      onShowPageToast?.('模型连通性测试成功')
    } catch (error) {
      const message = error.message || '模型连通性测试失败'
      setProfileFeedback(profile.id, {
        message,
        tone: 'danger',
      })
      onShowPageToast?.(message, 'error')
    } finally {
      setTestingProfileId('')
    }
  }

  useEffect(() => {
    if (!open) {
      return
    }

    setActivePanel('sync')
    loadStatus().catch(() => {})
    loadLlmConfig().catch(() => {})
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }

    function handleKeyDown(event) {
      if (event.key !== 'Escape') {
        return
      }

      if (isProfileEditorOpen) {
        setIsProfileEditorOpen(false)
        setProfileEditorDraft(null)
        return
      }

      onClose?.()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isProfileEditorOpen, onClose, open])

  const checkedAtLabel = useMemo(() => formatDateTime(syncStatus?.checkedAt), [syncStatus?.checkedAt])
  const hasUnsavedChanges = useMemo(() => JSON.stringify(llmConfig) !== JSON.stringify(llmDraft), [llmConfig, llmDraft])

  const panelMeta =
    activePanel === 'models'
      ? {
          title: '模型管理',
          description: '管理可用模型，并选择当前默认模型。',
        }
      : {
          title: '云端同步',
          description: '检查本地与云端状态，并执行手动同步。',
        }

  if (!open || typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[85] flex items-center justify-center bg-slate-950/18 p-4 backdrop-blur-[8px]"
        onClick={onClose}
        role="presentation"
      >
        <div
          className="flex h-[min(700px,calc(100vh-56px))] w-full max-w-[980px] overflow-hidden rounded-[10px] border border-white/90 bg-white"
          onClick={(event) => event.stopPropagation()}
          role="presentation"
        >
          <aside className="flex w-[200px] shrink-0 flex-col border-r border-border/70 bg-[#f5f7fa] px-4 py-7">
            <div className="space-y-1">
              <SettingsNavItem
                active={activePanel === 'cloud_vault'}
                icon={Cloud}
                label="云端保险箱"
                onClick={() => setActivePanel('cloud_vault')}
              />
              <SettingsNavItem
                active={activePanel === 'sync'}
                icon={Cloud}
                label="长文云端同步"
                onClick={() => setActivePanel('sync')}
              />
              <SettingsNavItem
                active={activePanel === 'sync_short'}
                icon={Cloud}
                label="短文云端同步"
                onClick={() => setActivePanel('sync_short')}
              />
              <SettingsNavItem
                active={activePanel === 'models'}
                icon={Bot}
                label="模型管理"
                onClick={() => setActivePanel('models')}
              />
            </div>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col bg-white">
            <div className="flex items-start justify-between gap-4 px-7 pb-3 pt-7">
              <div>
                <h2 className="text-[20px] font-semibold tracking-[-0.03em] text-foreground">{panelMeta.title}</h2>
                <p className="mt-1 text-[12px] leading-6 text-muted-foreground">{panelMeta.description}</p>
              </div>

              <div className="flex items-center gap-2">
                {activePanel === 'sync' ? (
                  <Button
                    className="rounded-[6px]"
                    disabled={isLoading || isChecking || Boolean(busyTarget)}
                    onClick={() => loadStatus({ silent: true })}
                    type="button"
                    variant="outline"
                  >
                    {isChecking ? <LoaderCircle className="animate-spin" size={14} /> : <RefreshCw size={14} />}
                    检查同步
                  </Button>
                ) : (
                  <>
                    <Button
                      className="rounded-[6px]"
                      onClick={handleOpenCreateProfileDialog}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <Plus size={14} />
                      添加模型
                    </Button>
                    <Button
                      className="rounded-[6px]"
                      disabled={isLlmLoading || isSavingLlm || !llmDraft || !hasUnsavedChanges}
                      onClick={handleSaveLlmConfig}
                      size="sm"
                      type="button"
                    >
                      {isSavingLlm ? <LoaderCircle className="animate-spin" size={14} /> : <Save size={14} />}
                      保存
                    </Button>
                  </>
                )}

                <button
                  aria-label="关闭系统设置"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-[6px] text-muted-foreground transition-colors hover:bg-secondary/50 hover:text-foreground"
                  onClick={onClose}
                  type="button"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="benchmark-scroll-hidden min-h-0 flex-1 overflow-y-auto px-7 pb-7 pt-2">
              {activePanel === 'cloud_vault' ? (
                <div className="h-full">
                  <div className="mb-4 flex items-center justify-between text-[12px] text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={14} />
                      这里存放着您推送到云端的完整历史账本
                    </div>
                  </div>
                  <CloudVaultViewer />
                </div>
              ) : activePanel === 'sync' || activePanel === 'sync_short' ? (
                <div>
                  <div className="mb-4 flex items-center gap-2 text-[12px] text-muted-foreground">
                    <CheckCircle2 size={14} />
                    最近检查：{checkedAtLabel}
                  </div>

                  {errorMessage ? (
                    <div className="mb-4 rounded-[6px] border border-red-200 bg-red-50 px-4 py-3 text-[13px] leading-6 text-red-700">
                      {errorMessage}
                    </div>
                  ) : null}

                  {isLoading ? (
                    <div className="flex min-h-[360px] items-center justify-center rounded-[6px] border border-border/70 bg-white">
                      <div className="inline-flex items-center gap-2 text-[14px] text-muted-foreground">
                        <LoaderCircle className="animate-spin" size={16} />
                        正在检查同步状态
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {activePanel === 'sync' && (
                        <SyncCard
                          busyTarget={busyTarget}
                          feedback={actionFeedback.content}
                          onAction={handleSyncAction}
                          status={syncStatus?.content}
                          target="content"
                        />
                      )}
                      {activePanel === 'sync_short' && (
                        <SyncCard
                          busyTarget={busyTarget}
                          feedback={actionFeedback.shortContent}
                          onAction={handleSyncAction}
                          status={syncStatus?.shortContent}
                          target="shortContent"
                        />
                      )}
                      <SyncCard
                        busyTarget={busyTarget}
                        feedback={actionFeedback.llm}
                        onAction={handleSyncAction}
                        status={syncStatus?.llm}
                        target="llm"
                      />
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  {llmError ? (
                    <div className="mb-4 rounded-[6px] border border-red-200 bg-red-50 px-4 py-3 text-[13px] leading-6 text-red-700">
                      {llmError}
                    </div>
                  ) : null}

                  {llmFeedback?.message ? (
                    <div
                      className={cn(
                        'mb-4 rounded-[6px] border px-4 py-3 text-[12px] leading-6',
                        llmFeedback.tone === 'success' && 'border-emerald-200/80 bg-emerald-50 text-emerald-700',
                        llmFeedback.tone === 'danger' && 'border-red-200/80 bg-red-50 text-red-700',
                        llmFeedback.tone !== 'success' &&
                          llmFeedback.tone !== 'danger' &&
                          'border-border/70 bg-secondary/15 text-muted-foreground',
                      )}
                    >
                      {llmFeedback.message}
                    </div>
                  ) : null}

                  {isLlmLoading ? (
                    <div className="flex min-h-[360px] items-center justify-center rounded-[6px] border border-border/70 bg-white">
                      <div className="inline-flex items-center gap-2 text-[14px] text-muted-foreground">
                        <LoaderCircle className="animate-spin" size={16} />
                        正在读取模型配置
                      </div>
                    </div>
                  ) : Array.isArray(llmDraft?.profiles) && llmDraft.profiles.length > 0 ? (
                    <div className="space-y-2.5">
                      {llmDraft.profiles.map((profile) => {
                        const isActive = llmDraft.activeProfileId === profile.id
                        const profileFeedback = profileFeedbackMap[profile.id]

                        return (
                          <section className="rounded-[6px] border border-border/70 bg-white px-4 py-3.5" key={profile.id}>
                            <div className="flex flex-wrap items-center justify-between gap-4">
                              <div className="min-w-0">
                                <div className="text-[15px] font-semibold text-foreground">{profile.name || '未命名模型'}</div>
                                <div className="mt-1 text-[13px] text-muted-foreground">
                                  {formatProviderLabel(profile.provider)}
                                </div>
                              </div>

                              <div className="flex items-center gap-3">
                                <span className="text-[13px] text-muted-foreground">启动</span>
                                <ToggleSwitch
                                  checked={isActive}
                                  disabled={isSavingLlm || isLlmLoading}
                                  onToggle={() => handleSetActiveProfile(profile.id)}
                                />
                              </div>
                            </div>

                            <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-border/60 pt-3">
                                <Button
                                  className="rounded-[6px]"
                                  onClick={() => handleOpenEditProfileDialog(profile)}
                                  size="sm"
                                  type="button"
                                  variant="outline"
                                >
                                  <PencilLine size={14} />
                                  编辑
                                </Button>
                                <Button
                                  className="rounded-[6px]"
                                  disabled={testingProfileId === profile.id}
                                  onClick={() => handleTestProfile(profile)}
                                  size="sm"
                                  type="button"
                                  variant="outline"
                                >
                                  {testingProfileId === profile.id ? <LoaderCircle className="animate-spin" size={14} /> : <PlugZap size={14} />}
                                  测试连接
                                </Button>
                                <Button
                                  className="rounded-[6px]"
                                  onClick={() => handleDeleteProfile(profile.id)}
                                  size="sm"
                                  type="button"
                                  variant="outline"
                                >
                                  <Trash2 size={14} />
                                  删除
                                </Button>
                            </div>

                            {profileFeedback?.message ? (
                              <div
                                className={cn(
                                  'mt-3 rounded-[6px] border px-3 py-2 text-[12px] leading-6',
                                  profileFeedback.tone === 'success' && 'border-emerald-200/80 bg-emerald-50 text-emerald-700',
                                  profileFeedback.tone === 'danger' && 'border-red-200/80 bg-red-50 text-red-700',
                                  profileFeedback.tone !== 'success' &&
                                    profileFeedback.tone !== 'danger' &&
                                    'border-border/70 bg-secondary/15 text-muted-foreground',
                                )}
                              >
                                {profileFeedback.message}
                              </div>
                            ) : null}
                          </section>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="rounded-[6px] border border-dashed border-border/70 bg-secondary/10 px-4 py-10 text-center text-[13px] text-muted-foreground">
                      当前还没有模型配置，点击右上角“添加模型”即可开始管理。
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <ProfileEditorDialog
        draft={profileEditorDraft}
        isSubmitting={false}
        mode={profileEditorMode}
        onChange={handleProfileEditorChange}
        onClose={() => {
          setIsProfileEditorOpen(false)
          setProfileEditorDraft(null)
        }}
        onSubmit={handleSubmitProfileEditor}
        open={isProfileEditorOpen}
      />
    </>,
    document.body,
  )
}
