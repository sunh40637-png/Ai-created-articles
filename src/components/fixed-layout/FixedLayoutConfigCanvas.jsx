import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, LoaderCircle, Paperclip, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  createTemplatePreviewPlaceholderSlots,
  renderArticlePreviewDocument,
  resolveRenderableAssetPath,
  stripPreviewHeading,
} from '@/lib/articlePreviewHtml.jsx'
import { cn } from '@/lib/utils'
import {
  areFixedLayoutConfigsEqual,
  cloneFixedLayoutConfig,
  requestFixedLayoutAssetUpload,
  requestFixedLayoutConfigUpdate,
  useFixedLayoutConfigState,
} from '@/lib/fixedLayoutConfigClient.js'
import {
  createEmptyFixedLayoutConfig,
  FIXED_LAYOUT_FILE_ACCEPT,
  FIXED_LAYOUT_IMAGE_SLOT_IDS,
  FIXED_LAYOUT_SPACING_PRESETS,
  getFixedLayoutImageDisplaySlots,
  resolveFixedLayoutSlotAsset,
} from '../../../shared/fixedLayoutConfig.js'
const TEMPLATE_PREVIEW_SAMPLE_TITLE = '聪明的亲家，都懂得这3条边界'
const TEMPLATE_PREVIEW_SAMPLE_PEN_NAME = '明远'
const TEMPLATE_PREVIEW_SAMPLE_MARKDOWN = `# 聪明的亲家，都懂得这3条边界

逢年过节的家庭聚会上，你有没有见过这样的场面：亲家两家人坐在一张桌前，表面和和气气，暗地里却各怀心思。

有人嘴上说着“咱们是一家人”，手却伸得老长；有人看似随意地打听对方家底，话里藏着机锋；还有人理直气壮地提要求，觉得既然成了亲家，对方帮衬自己是天经地义。

结果呢？好好的喜事变成了糟心事，本该互相帮衬的两家人，最后连见面都尴尬。

今天不绕弯子，咱们就聊三件事。

## 一、不越位，各守本分，不插手小家庭

老话说得好：“各扫门前雪，莫管他人瓦上霜。”这话听着冷，其实藏着大智慧。

春秋时期，管仲和鲍叔牙合伙做生意。管仲家里穷，每次分红时总是多拿一些。旁人都替鲍叔牙不平，鲍叔牙却说：“管仲家里困难，多拿点是应该的。”后来管仲辅佐公子纠，鲍叔牙辅佐公子小白。两人各为其主，立场分明，从不因私交而越界干涉对方的决策。等小白继位成了齐桓公，鲍叔牙力荐管仲为相，自己甘居其下。这段关系之所以能传为千古美谈，靠的不是天天腻在一起，而是彼此尊重对方的边界。

我见过真实的反面例子。邻居老李的儿子娶了老张的女儿，两家人住得近，走动频繁。老张有个毛病，总爱管儿子家的事。孩子该上哪个兴趣班要管，儿媳买件衣服要评价，家里怎么装修也要插嘴。一开始老李忍了，觉得毕竟是亲家，不好意思撕破脸。三年下来，矛盾越积越深，最后闹到儿子儿媳差点离婚，两家人见面跟仇人似的。

教训是什么？再近的关系，一旦越位，就会变味。亲家之间，最聪明的做法是各守本分：小两口的事，小两口自己解决；小家庭的选择，双方父母只提建议，不做决定。界限清楚了，关系才能长久。

## 二、不比较，各自有命，不比孩子高低

逢年过节，亲家聚会最常见的场景是什么？炫耀孩子。

“我家儿子今年升了主管，年薪三十万。”
“我闺女刚买了套房子，首付就掏了一百万。”
“我孙子这次考试年级前十，将来肯定能上985。”

好像不把孩子拿出来比一比，这场聚会就白来了。

可问题在于，比来比去，有什么意思？赢了，嘴上痛快几天；输了，心里堵得慌。古语有云：“人比人，气死人。”这话听着糙，道理却一点不糙。

我认识两位老人，老周和老郑。俩人是老同事，又做了亲家。按说知根知底，应该相处融洽。可每次聚会都成了暗中较劲的战场。老周晒儿子买了新车，老郑就提女儿升了职；老周说孙子钢琴过了八级，老郑就讲外孙女奥数拿了奖。表面上笑呵呵，心里都憋着一口气。十年下来，两家人越走越远。明明是可以互相帮衬的亲家，最后成了最熟悉的陌生人。

根子就在这个“比”字上。它让亲情变了味，让本该温暖的相聚成了两个人斗气的擂台。

每个家庭都有自己的难处，也都有自己的福气。不比，才能看得清；不争，才能处得久。亲家之间，最难得的是彼此成全，而不是互相攀比。

## 三、不索取，人情有度，不把亲家当资源

有些人把亲家当成免费的人脉库，觉得结了亲就是一家人了，对方帮自己是理所当然。

“我儿子要出国镀金，你们家有钱，借二十万呗。”
“我闺女要办婚礼，你们家那套空房子借来做婚房呗。”
“我孙子要上重点学校，你们家认识人，帮帮忙呗。”

一次两次还行，次数多了，再好的关系也扛不住。

《中国法院网》曾刊登过一起案例：两家亲家因为借款纠纷对簿公堂，最后闹到连孙子的探视权都成了筹码。法院调解时，承办法官感叹：“本是最亲近的两家人，却因为一笔糊涂账，反目成仇。”这样的案例现实中还有很多。

古人说：“君子之交淡如水。”用在亲家关系上，再贴切不过。

帮，是情分；不帮，是本分。结了亲家，不代表对方欠你的。红包该还就还，借钱该写就写，人情该记就记。不是斤斤计较，而是让关系清清爽爽。清爽的关系才能长久，糊涂账迟早要还。

## 写在最后

亲家之间，说到底是缘分。

能做成亲家，两个家庭本身就合得来。既然合得来，就别让这层关系被越位、被比较、被索取给搅黄了。

守住这三条边界：
- 不越位，让彼此都有空间；
- 不比较，让相处回到本真；
- 不索取，让来往清清爽爽。

做到了，亲家关系就不是什么难题，而是一段真正能互相帮衬、互相温暖的资源。做不到，迟早会从“一家人”变成“最熟悉的陌生人”。

聪明的人，早就看清了这一点。

愿每一对亲家，都能各守边界，各得自在。`

function formatFixedLayoutAssetDate(value) {
  if (!value) {
    return ''
  }

  try {
    return new Intl.DateTimeFormat('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return ''
  }
}

function FixedLayoutArticlePreviewFrame({ documentHtml, title = '模板预览' }) {
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
      className=""
      ref={iframeRef}
      scrolling="no"
      srcDoc={documentHtml}
      style={{ border: 0, display: 'block', height: frameHeight > 0 ? `${frameHeight}px` : '1px', width: '100%' }}
      title={title}
    />
  )
}

function FixedLayoutImageLightbox({ asset, onClose }) {
  useEffect(() => {
    if (!asset) {
      return
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [asset, onClose])

  if (!asset || typeof document === 'undefined') {
    return null
  }

  const assetSrc = resolveRenderableAssetPath(asset, typeof window === 'undefined' ? '' : window.location.origin)

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

      <div className="flex h-full w-full items-center justify-center px-8 py-8 sm:px-12 sm:py-10" onClick={(event) => event.stopPropagation()}>
        {assetSrc ? (
          <img
            alt={asset.label}
            className="max-h-full max-w-[calc(100vw-140px)] object-contain"
            src={assetSrc}
          />
        ) : (
          <div className="flex min-h-[320px] w-full max-w-[960px] items-center justify-center rounded-[16px] border border-white/10 bg-white/6 px-6 text-center text-[15px] text-white/68">
            图片已移除
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

function FixedLayoutTemplatePreview({ config }) {
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  const previewRenderResult = useMemo(
    () =>
      renderArticlePreviewDocument({
        bodyMarkdown: stripPreviewHeading(TEMPLATE_PREVIEW_SAMPLE_MARKDOWN),
        fixedLayoutConfig: config,
        fontSize: 'medium',
        imageSlots: createTemplatePreviewPlaceholderSlots(),
        origin,
        penName: TEMPLATE_PREVIEW_SAMPLE_PEN_NAME,
      }),
    [config, origin],
  )

  return (
    <div className="mx-auto w-[375px] max-w-full overflow-hidden border border-[#e8eaef] bg-white shadow-[0_8px_18px_rgba(15,23,42,0.05)]">
      <div className="border-b border-[#eef1f5] px-4 py-4">
        <div className="text-[18px] font-semibold leading-8 text-foreground">{TEMPLATE_PREVIEW_SAMPLE_TITLE}</div>
      </div>
      <div className="w-full bg-white">
        <FixedLayoutArticlePreviewFrame documentHtml={previewRenderResult.documentHtml} title="模板预览" />
      </div>
    </div>
  )
}

function FixedLayoutImageSlotCard({
  isSavingTemplate,
  onDelete,
  onPreview,
  onSelect,
  onSetSpacing,
  onUpload,
  selected,
  slotConfig,
  uploadingSlot,
}) {
  const fileInputRef = useRef(null)
  const slot = slotConfig.slot
  const asset = resolveFixedLayoutSlotAsset(slotConfig)
  const uploadedAtLabel = asset?.uploadedAt ? formatFixedLayoutAssetDate(asset.uploadedAt) : ''
  const isUploading = uploadingSlot === slot
  const hasAsset = Boolean(asset?.path)

  async function handleFileChange(event) {
    const nextFile = event.target.files?.[0]

    if (nextFile) {
      await onUpload(slot, nextFile)
    }

    event.target.value = ''
  }

  return (
    <article
      className={cn(
        'rounded-[18px] border border-border/70 bg-white p-4 transition-all',
        selected ? 'bg-secondary/10 shadow-[0_16px_28px_rgba(15,23,42,0.08)]' : '',
      )}
    >
      <button className="block w-full text-left" onClick={() => onSelect(slot)} type="button">
        <div className="flex min-w-0 items-center gap-3">
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: slotConfig.accent }} />
          <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
            <div className="truncate text-[15px] font-medium text-foreground">{slotConfig.label}</div>
            <div className="shrink-0 text-right text-[12px] text-muted-foreground">{slotConfig.description}</div>
          </div>
        </div>
      </button>

      <div className="mt-4 flex items-start gap-4">
        <button
          className="group relative inline-flex h-[92px] w-[132px] shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-border/70 bg-secondary/20"
          disabled={!hasAsset}
          onClick={() =>
            hasAsset &&
            onPreview({
              ...asset,
              label: slotConfig.label,
            })
          }
          type="button"
        >
          {hasAsset ? (
            <img
              alt={slotConfig.label}
              className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
              src={resolveRenderableAssetPath(asset, typeof window === 'undefined' ? '' : window.location.origin)}
            />
          ) : (
            <div className="h-full w-full" style={{ backgroundColor: slotConfig.accent }} />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="text-[12px] text-muted-foreground">{asset?.filename || '支持 gif、png、jpg、jpeg'}</div>
          {uploadedAtLabel ? <div className="mt-1 text-[12px] text-muted-foreground">更新于 {uploadedAtLabel}</div> : null}

          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="shrink-0 text-[12px] font-medium text-muted-foreground">间距</div>
            <div className="flex flex-nowrap gap-2">
              {FIXED_LAYOUT_SPACING_PRESETS.map((preset) => (
                <button
                  className={cn(
                    'shrink-0 rounded-[10px] border border-border/70 px-3 py-1.5 text-[12px] transition-colors',
                    slotConfig.spacingPreset === preset.id
                      ? 'bg-secondary text-foreground'
                      : 'bg-white text-muted-foreground hover:text-foreground',
                  )}
                  key={preset.id}
                  onClick={() => onSetSpacing(slot, preset.id)}
                  type="button"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {slot === 'qrImage' ? <div className="mt-4 text-[12px] leading-6 text-muted-foreground">二维码宽度已固定为 200px。</div> : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input accept={FIXED_LAYOUT_FILE_ACCEPT} className="hidden" onChange={handleFileChange} ref={fileInputRef} type="file" />
        <Button
          className="rounded-[10px]"
          disabled={isSavingTemplate || isUploading}
          onClick={() => fileInputRef.current?.click()}
          size="sm"
          type="button"
          variant="outline"
        >
          {isUploading ? <LoaderCircle className="animate-spin" size={14} /> : <Paperclip size={14} />}
          {hasAsset ? '替换' : '上传'}
        </Button>
        {hasAsset ? (
          <Button
            className="rounded-[10px]"
            disabled={isSavingTemplate || isUploading}
            onClick={() => onDelete(slot, slotConfig.label)}
            size="sm"
            type="button"
            variant="outline"
          >
            <Trash2 size={14} />
            删除
          </Button>
        ) : null}
      </div>
    </article>
  )
}

export default function FixedLayoutConfigCanvas() {
  const { config, errorMessage, isLoading, setConfig, setErrorMessage } = useFixedLayoutConfigState()
  const [draftConfig, setDraftConfig] = useState(() => createEmptyFixedLayoutConfig())
  const [hasHydratedDraft, setHasHydratedDraft] = useState(false)
  const [isSavingTemplate, setIsSavingTemplate] = useState(false)
  const [savedConfigSnapshot, setSavedConfigSnapshot] = useState(() => createEmptyFixedLayoutConfig())
  const [selectedSlot, setSelectedSlot] = useState(FIXED_LAYOUT_IMAGE_SLOT_IDS[0])
  const [uploadingSlot, setUploadingSlot] = useState('')
  const [previewAsset, setPreviewAsset] = useState(null)
  const draftPreviewUrlMapRef = useRef(new Map())
  const imageSlots = useMemo(() => getFixedLayoutImageDisplaySlots(draftConfig), [draftConfig])
  const isDirty = useMemo(() => !areFixedLayoutConfigsEqual(draftConfig, savedConfigSnapshot), [draftConfig, savedConfigSnapshot])
  const isServerMutationPending = Boolean(uploadingSlot)

  useEffect(() => {
    if (isLoading || hasHydratedDraft) {
      return
    }

    const nextConfig = cloneFixedLayoutConfig(config)
    setSavedConfigSnapshot(nextConfig)
    setDraftConfig(nextConfig)
    setHasHydratedDraft(true)
  }, [config, hasHydratedDraft, isLoading])

  useEffect(() => {
    if (!imageSlots.some((slot) => slot.slot === selectedSlot)) {
      setSelectedSlot(imageSlots[0]?.slot || FIXED_LAYOUT_IMAGE_SLOT_IDS[0])
    }
  }, [imageSlots, selectedSlot])

  function revokeDraftPreviewUrl(slot) {
    const previewUrl = draftPreviewUrlMapRef.current.get(slot)

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
      draftPreviewUrlMapRef.current.delete(slot)
    }
  }

  function revokeAllDraftPreviewUrls() {
    draftPreviewUrlMapRef.current.forEach((previewUrl) => {
      URL.revokeObjectURL(previewUrl)
    })
    draftPreviewUrlMapRef.current.clear()
  }

  useEffect(() => () => revokeAllDraftPreviewUrls(), [])

  async function handleSaveTemplate() {
    const imageSlotsPayload = Object.fromEntries(
      FIXED_LAYOUT_IMAGE_SLOT_IDS.map((slot) => [
        slot,
        {
          asset: resolveFixedLayoutSlotAsset(draftConfig?.[slot]),
          spacingPreset: draftConfig?.[slot]?.spacingPreset,
          widthPx: draftConfig?.[slot]?.widthPx,
        },
      ]),
    )

    setIsSavingTemplate(true)
    setErrorMessage('')

    try {
      const nextConfig = await requestFixedLayoutConfigUpdate({
        imageSlots: imageSlotsPayload,
        metrics: draftConfig?.metrics,
      })
      revokeAllDraftPreviewUrls()
      setConfig(nextConfig)
      setSavedConfigSnapshot(cloneFixedLayoutConfig(nextConfig))
      setDraftConfig(cloneFixedLayoutConfig(nextConfig))
    } catch (error) {
      setErrorMessage(error.message || '保存模板配置失败')
    } finally {
      setIsSavingTemplate(false)
    }
  }

  function handleRestoreSaved() {
    revokeAllDraftPreviewUrls()
    setDraftConfig(cloneFixedLayoutConfig(savedConfigSnapshot))
    setErrorMessage('')
  }

  async function handleUpload(slot, file) {
    setUploadingSlot(slot)
    setErrorMessage('')

    try {
      const nextAsset = await requestFixedLayoutAssetUpload({
        file,
        slot,
      })
      const previewUrl =
        typeof window !== 'undefined' && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : ''

      revokeDraftPreviewUrl(slot)
      if (previewUrl) {
        draftPreviewUrlMapRef.current.set(slot, previewUrl)
      }
      setSelectedSlot(slot)

      setDraftConfig((current) => ({
        ...current,
        [slot]: {
          ...current?.[slot],
          asset: nextAsset
            ? {
                ...nextAsset,
                ...(previewUrl ? { previewUrl } : null),
              }
            : null,
        },
      }))
    } catch (error) {
      setErrorMessage(error.message || '上传模板图片失败')
    } finally {
      setUploadingSlot('')
    }
  }

  function handleDelete(slot, label) {
    const confirmed = window.confirm(`确认清空“${label}”吗？当前只会清空模板草稿，点击“保存模板”后才会正式生效。`)

    if (!confirmed) {
      return
    }

    setErrorMessage('')
    revokeDraftPreviewUrl(slot)
    setDraftConfig((current) => ({
      ...current,
      [slot]: {
        ...current?.[slot],
        asset: null,
      },
    }))
  }

  function handleSetSpacing(slot, spacingPreset) {
    setDraftConfig((current) => ({
      ...current,
      [slot]: {
        ...current?.[slot],
        spacingPreset,
      },
    }))
  }

  return (
    <div className="benchmark-scroll-hidden min-h-0 flex-1 overflow-y-auto bg-white">
      <div className="mx-auto w-full max-w-[1320px] px-4 py-8 sm:px-5 lg:px-6">
        <div className="mb-6">
          <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-foreground sm:text-[32px]">模板配置</h1>
        </div>

        {errorMessage ? (
          <div className="mb-5 rounded-[14px] border border-red-200 bg-red-50 px-4 py-3 text-[13px] leading-6 text-red-700">
            {errorMessage}
          </div>
        ) : null}

        {isLoading ? (
          <div className="py-16 text-center text-[14px] text-muted-foreground">
            <div className="inline-flex items-center gap-2">
              <LoaderCircle className="animate-spin" size={16} />
              正在读取模板配置
            </div>
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,520px)_minmax(0,1fr)]">
            <section className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[15px] font-medium text-foreground">移动端模板预览 · 375 宽度</div>
              </div>

              <FixedLayoutTemplatePreview config={draftConfig} />
            </section>

            <section className="space-y-5">
              <div className="rounded-[18px] border border-border/70 bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-[15px] font-medium text-foreground">图片顺序与图片设置</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        'rounded-full px-3 py-1.5 text-[12px]',
                        isDirty ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700',
                      )}
                    >
                      {isDirty ? '有未保存更改' : '当前已保存'}
                    </span>
                    <Button
                      className="rounded-full"
                      disabled={!isDirty || isSavingTemplate || isServerMutationPending}
                      onClick={handleRestoreSaved}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      恢复已保存
                    </Button>
                    <Button
                      className="rounded-full"
                      disabled={!isDirty || isSavingTemplate || isServerMutationPending}
                      onClick={handleSaveTemplate}
                      size="sm"
                      type="button"
                    >
                      {isSavingTemplate ? <LoaderCircle className="animate-spin" size={14} /> : <Check size={14} />}
                      保存模板
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                {imageSlots.map((slotConfig) => (
                  <FixedLayoutImageSlotCard
                    isSavingTemplate={isSavingTemplate}
                    key={slotConfig.slot}
                    onDelete={handleDelete}
                    onPreview={setPreviewAsset}
                    onSelect={setSelectedSlot}
                    onSetSpacing={handleSetSpacing}
                    onUpload={handleUpload}
                    selected={selectedSlot === slotConfig.slot}
                    slotConfig={slotConfig}
                    uploadingSlot={uploadingSlot}
                  />
                ))}
              </div>

              <div className="rounded-[18px] border border-dashed border-border/70 bg-secondary/10 p-4 text-[12px] leading-6 text-muted-foreground">
                非二维码图片固定按 100% 宽显示。上传格式支持 jpg、png、gif；webp 不再作为模板图片格式。
              </div>
            </section>
          </div>
        )}
      </div>

      <FixedLayoutImageLightbox asset={previewAsset} onClose={() => setPreviewAsset(null)} />
    </div>
  )
}
