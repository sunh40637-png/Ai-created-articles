import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowDown,
  ArrowUp,
  Check,
  ListFilter,
  LoaderCircle,
  Trash2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  formatLibraryAssetDate,
  requestLibraryAssets,
  requestLibraryAssetDelete,
  requestLibraryAssetUpdate,
} from '@/lib/libraryAssetsClient.js'
import {
  DEFAULT_LIBRARY_ASSET_SORT,
  LIBRARY_ASSET_EMOTIONS,
  LIBRARY_ASSET_FIGURES,
  LIBRARY_ASSET_SCENE_MAX_LENGTH,
  LIBRARY_ASSET_SORT_OPTIONS,
  LIBRARY_ASSET_TOPICS,
} from '../../../shared/libraryAssets.js'

function LibraryAssetThumbnail({ asset, onPreview }) {
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    setHasError(false)
  }, [asset.path])

  if (hasError || !asset.path) {
    return (
      <div className="flex aspect-[16/10] w-full items-center justify-center bg-secondary/45 text-center text-[13px] leading-6 text-muted-foreground">
        图片已移除
      </div>
    )
  }

  return (
    <button className="block w-full cursor-zoom-in overflow-hidden" onClick={() => onPreview?.(asset.id)} type="button">
      <img
        alt={asset.scene}
        className="aspect-[16/10] w-full object-cover transition-transform duration-200 hover:scale-[1.02]"
        onError={() => setHasError(true)}
        src={asset.path}
      />
    </button>
  )
}

function LibraryAssetCard({ asset, deletingId, onDelete, onPreview, onSave, savingId }) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState({
    emotion: asset.emotion,
    figures: asset.figures,
    scene: asset.scene,
    topic: asset.topic,
  })

  useEffect(() => {
    setDraft({
      emotion: asset.emotion,
      figures: asset.figures,
      scene: asset.scene,
      topic: asset.topic,
    })
    setIsEditing(false)
  }, [asset])

  async function handleSave() {
    await onSave(asset.id, draft)
    setIsEditing(false)
  }

  function handleCancel() {
    setDraft({
      emotion: asset.emotion,
      figures: asset.figures,
      scene: asset.scene,
      topic: asset.topic,
    })
    setIsEditing(false)
  }

  return (
    <article className="overflow-hidden rounded-[26px] border border-border/70 bg-white shadow-[0_16px_36px_rgba(15,23,42,0.05)]">
      <LibraryAssetThumbnail asset={asset} onPreview={onPreview} />

      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-[15px] font-medium text-foreground">{asset.scene}</div>
            <div className="mt-1 truncate text-[12px] text-muted-foreground">{asset.filename}</div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {isEditing ? null : (
              <Button className="rounded-full" onClick={() => setIsEditing(true)} size="sm" type="button" variant="outline">
                编辑标签
              </Button>
            )}
            <Button
              className="rounded-full"
              disabled={deletingId === asset.id || savingId === asset.id}
              onClick={() => onDelete(asset)}
              size="icon-sm"
              type="button"
              variant="outline"
            >
              {deletingId === asset.id ? <LoaderCircle className="animate-spin" size={14} /> : <Trash2 size={14} />}
            </Button>
          </div>
        </div>

        {!isEditing ? (
          <>
            <div className="mt-4 flex flex-wrap gap-2">
              {[asset.emotion, asset.topic, asset.figures].map((label) => (
                <span
                  className="rounded-full border border-border/70 bg-secondary/55 px-2.5 py-1 text-[11px] text-muted-foreground"
                  key={label}
                >
                  {label}
                </span>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
              <span className="rounded-full border border-border/70 px-2.5 py-1">使用 {asset.usedCount} 次</span>
              <span className="rounded-full border border-border/70 px-2.5 py-1">入库于 {formatLibraryAssetDate(asset.createdAt)}</span>
            </div>
          </>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5">
                <div className="text-[12px] font-medium text-muted-foreground">情绪标签</div>
                <select
                  className="h-10 w-full rounded-2xl border border-border/70 bg-white px-3 text-[14px] outline-none"
                  onChange={(event) => setDraft((current) => ({ ...current, emotion: event.target.value }))}
                  value={draft.emotion}
                >
                  {LIBRARY_ASSET_EMOTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1.5">
                <div className="text-[12px] font-medium text-muted-foreground">母题标签</div>
                <select
                  className="h-10 w-full rounded-2xl border border-border/70 bg-white px-3 text-[14px] outline-none"
                  onChange={(event) => setDraft((current) => ({ ...current, topic: event.target.value }))}
                  value={draft.topic}
                >
                  {LIBRARY_ASSET_TOPICS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1.5">
                <div className="text-[12px] font-medium text-muted-foreground">人物构成</div>
                <select
                  className="h-10 w-full rounded-2xl border border-border/70 bg-white px-3 text-[14px] outline-none"
                  onChange={(event) => setDraft((current) => ({ ...current, figures: event.target.value }))}
                  value={draft.figures}
                >
                  {LIBRARY_ASSET_FIGURES.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1.5">
                <div className="text-[12px] font-medium text-muted-foreground">场景描述</div>
                <input
                  className="h-10 w-full rounded-2xl border border-border/70 bg-white px-3 text-[14px] outline-none"
                  maxLength={LIBRARY_ASSET_SCENE_MAX_LENGTH}
                  onChange={(event) => setDraft((current) => ({ ...current, scene: event.target.value }))}
                  value={draft.scene}
                />
              </label>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="text-[12px] text-muted-foreground">场景描述建议控制在 {LIBRARY_ASSET_SCENE_MAX_LENGTH} 字以内</div>
              <div className="flex items-center gap-2">
                <Button className="rounded-full" onClick={handleCancel} size="sm" type="button" variant="outline">
                  取消
                </Button>
                <Button
                  className="rounded-full"
                  disabled={savingId === asset.id || deletingId === asset.id || !draft.scene.trim()}
                  onClick={handleSave}
                  size="sm"
                  type="button"
                >
                  {savingId === asset.id ? <LoaderCircle className="animate-spin" size={14} /> : <Check size={14} />}
                  保存
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </article>
  )
}

function LibraryAssetLightbox({ activeAssetId, assets, onClose, onSelectAssetId }) {
  const activeIndex = Array.isArray(assets) ? assets.findIndex((asset) => asset.id === activeAssetId) : -1
  const activeAsset = activeIndex >= 0 ? assets[activeIndex] : null

  useEffect(() => {
    if (activeAssetId && !activeAsset) {
      onClose()
    }
  }, [activeAsset, activeAssetId, onClose])

  useEffect(() => {
    if (!activeAsset) {
      return
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onClose()
        return
      }

      if (assets.length < 2) {
        return
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault()
        const previousIndex = (activeIndex - 1 + assets.length) % assets.length
        onSelectAssetId(assets[previousIndex].id)
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        const nextIndex = (activeIndex + 1) % assets.length
        onSelectAssetId(assets[nextIndex].id)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [activeAsset, activeIndex, assets, onClose, onSelectAssetId])

  if (!activeAsset || typeof document === 'undefined') {
    return null
  }

  const canNavigate = assets.length > 1
  const previousIndex = canNavigate ? (activeIndex - 1 + assets.length) % assets.length : activeIndex
  const nextIndex = canNavigate ? (activeIndex + 1) % assets.length : activeIndex

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-black/88" onClick={onClose} role="presentation">
      <button
        aria-label="关闭大图预览"
        className="absolute right-5 top-5 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/12 bg-white/8 text-white transition-colors hover:bg-white/14"
        onClick={onClose}
        type="button"
      >
        <X size={18} />
      </button>

      <div className="absolute right-5 top-1/2 flex -translate-y-1/2 flex-col gap-3">
        <button
          aria-label="上一张"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/12 bg-white/8 text-white transition-colors hover:bg-white/14 disabled:cursor-not-allowed disabled:opacity-45"
          disabled={!canNavigate}
          onClick={(event) => {
            event.stopPropagation()
            onSelectAssetId(assets[previousIndex].id)
          }}
          type="button"
        >
          <ArrowUp size={18} />
        </button>
        <button
          aria-label="下一张"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/12 bg-white/8 text-white transition-colors hover:bg-white/14 disabled:cursor-not-allowed disabled:opacity-45"
          disabled={!canNavigate}
          onClick={(event) => {
            event.stopPropagation()
            onSelectAssetId(assets[nextIndex].id)
          }}
          type="button"
        >
          <ArrowDown size={18} />
        </button>
      </div>

      <div className="flex h-full w-full items-center justify-center px-8 py-8 sm:px-12 sm:py-10" onClick={(event) => event.stopPropagation()}>
        {activeAsset.path ? (
          <img
            alt={activeAsset.scene}
            className="max-h-full max-w-[calc(100vw-140px)] rounded-[18px] object-contain"
            src={activeAsset.path}
          />
        ) : (
          <div className="flex min-h-[320px] w-full max-w-[960px] items-center justify-center rounded-[18px] border border-white/10 bg-white/6 px-6 text-center text-[15px] text-white/68">
            图片已移除
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

export default function AssetsModuleCanvas() {
  const [emotionFilter, setEmotionFilter] = useState('')
  const [topicFilter, setTopicFilter] = useState('')
  const [figuresFilter, setFiguresFilter] = useState('')
  const [sort, setSort] = useState(DEFAULT_LIBRARY_ASSET_SORT)
  const [items, setItems] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [previewAssetId, setPreviewAssetId] = useState('')
  const [savingId, setSavingId] = useState('')
  const [deletingId, setDeletingId] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadAssets() {
      setIsLoading(true)
      setErrorMessage('')

      try {
        const nextItems = await requestLibraryAssets({
          emotion: emotionFilter,
          figures: figuresFilter,
          sort,
          topic: topicFilter,
        })

        if (!cancelled) {
          setItems(nextItems)
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error.message || '读取素材库失败')
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    loadAssets()

    return () => {
      cancelled = true
    }
  }, [emotionFilter, figuresFilter, sort, topicFilter])

  useEffect(() => {
    if (previewAssetId && !items.some((asset) => asset.id === previewAssetId)) {
      setPreviewAssetId('')
    }
  }, [items, previewAssetId])

  async function handleSave(assetId, draft) {
    setSavingId(assetId)
    setErrorMessage('')

    try {
      await requestLibraryAssetUpdate(assetId, draft)
      const nextItems = await requestLibraryAssets({
        emotion: emotionFilter,
        figures: figuresFilter,
        sort,
        topic: topicFilter,
      })
      setItems(nextItems)
    } catch (error) {
      setErrorMessage(error.message || '更新素材失败')
      throw error
    } finally {
      setSavingId('')
    }
  }

  async function handleDelete(asset) {
    const confirmed = window.confirm(`确认删除素材记录“${asset.scene}”吗？这不会删除本地图片文件。`)

    if (!confirmed) {
      return
    }

    setDeletingId(asset.id)
    setErrorMessage('')

    try {
      await requestLibraryAssetDelete(asset.id)
      const nextItems = await requestLibraryAssets({
        emotion: emotionFilter,
        figures: figuresFilter,
        sort,
        topic: topicFilter,
      })
      setItems(nextItems)
    } catch (error) {
      setErrorMessage(error.message || '删除素材失败')
    } finally {
      setDeletingId('')
    }
  }

  function clearFilters() {
    setEmotionFilter('')
    setTopicFilter('')
    setFiguresFilter('')
    setSort(DEFAULT_LIBRARY_ASSET_SORT)
  }

  const hasActiveFilters = Boolean(emotionFilter || topicFilter || figuresFilter || sort !== DEFAULT_LIBRARY_ASSET_SORT)

  return (
    <div className="benchmark-scroll-hidden min-h-0 flex-1 overflow-y-auto bg-white">
      <div className="mx-auto flex h-full w-full max-w-[1320px] flex-col px-4 py-8 sm:px-5 lg:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[30px] font-semibold tracking-[-0.03em] text-foreground sm:text-[34px]">素材库</h1>
            <p className="mt-2 text-[14px] leading-6 text-muted-foreground">
              当前素材会统一从本地目录导入到仓库，并在这里做筛选、查看和标签编辑。
            </p>
          </div>

          <div className="rounded-full border border-border/70 bg-secondary/45 px-4 py-2 text-[13px] text-muted-foreground">
            当前共 {items.length} 张素材
          </div>
        </div>

        <div className="mt-6 rounded-[26px] border border-border/70 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.04)] sm:p-5">
          <div className="flex items-center gap-2 text-[13px] font-medium text-foreground">
            <ListFilter size={16} />
            筛选与排序
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <select
              className="h-11 rounded-2xl border border-border/70 bg-white px-3 text-[14px] outline-none"
              onChange={(event) => setEmotionFilter(event.target.value)}
              value={emotionFilter}
            >
              <option value="">全部情绪</option>
              {LIBRARY_ASSET_EMOTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            <select
              className="h-11 rounded-2xl border border-border/70 bg-white px-3 text-[14px] outline-none"
              onChange={(event) => setTopicFilter(event.target.value)}
              value={topicFilter}
            >
              <option value="">全部母题</option>
              {LIBRARY_ASSET_TOPICS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            <select
              className="h-11 rounded-2xl border border-border/70 bg-white px-3 text-[14px] outline-none"
              onChange={(event) => setFiguresFilter(event.target.value)}
              value={figuresFilter}
            >
              <option value="">全部人物构成</option>
              {LIBRARY_ASSET_FIGURES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            <select
              className="h-11 rounded-2xl border border-border/70 bg-white px-3 text-[14px] outline-none"
              onChange={(event) => setSort(event.target.value)}
              value={sort}
            >
              {LIBRARY_ASSET_SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <Button className="h-11 rounded-2xl" onClick={clearFilters} type="button" variant="outline">
              清空筛选
            </Button>
          </div>
        </div>

        {errorMessage ? (
          <div className="mt-4 rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-[13px] leading-6 text-red-700">
            {errorMessage}
          </div>
        ) : null}

        <div className="mt-6 flex-1">
          {isLoading ? (
            <div className="flex min-h-[360px] items-center justify-center rounded-[28px] border border-border/70 bg-white">
              <div className="flex items-center gap-2 text-[14px] text-muted-foreground">
                <LoaderCircle className="animate-spin" size={16} />
                正在读取素材库
              </div>
            </div>
          ) : items.length === 0 ? (
            <div className="flex min-h-[360px] items-center justify-center rounded-[28px] border border-dashed border-border/80 bg-secondary/20">
              <div className="max-w-[420px] text-center">
                <div className="text-[16px] font-medium text-foreground">{hasActiveFilters ? '当前筛选下暂无素材' : '暂无素材'}</div>
                <p className="mt-2 text-[14px] leading-6 text-muted-foreground">
                  {hasActiveFilters ? '可以调整筛选条件后再看，或继续补充新的素材。' : '导入完成后，这里会显示图片、标签和场景描述。'}
                </p>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {items.map((asset) => (
                <LibraryAssetCard
                  asset={asset}
                  deletingId={deletingId}
                  key={asset.id}
                  onDelete={handleDelete}
                  onPreview={setPreviewAssetId}
                  onSave={handleSave}
                  savingId={savingId}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <LibraryAssetLightbox
        activeAssetId={previewAssetId}
        assets={items}
        onClose={() => setPreviewAssetId('')}
        onSelectAssetId={setPreviewAssetId}
      />
    </div>
  )
}
