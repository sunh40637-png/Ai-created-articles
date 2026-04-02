import ReactMarkdown from 'react-markdown'
import { renderToStaticMarkup } from 'react-dom/server'
import remarkGfm from 'remark-gfm'
import {
  ARTICLE_TEMPLATE_BODY_IMAGE_SLOT_COUNT,
  normalizeArticleTemplateConfig,
} from '../../shared/articleTemplateConfig.js'
import { FIXED_LAYOUT_SLOT_META } from '../../shared/fixedLayoutConfig.js'

export const ARTICLE_PREVIEW_SECTION_COUNT = 3
export const MISSING_PREVIEW_ASSET_SRC_PREFIX = 'asset-missing://'
const PREVIEW_SOURCE_ACCOUNT_NAME = '煮酒问人生'
const PREVIEW_TAIL_ACCENT_COLOR = '#556b4f'

function toPx(value) {
  return `${value}px`
}

function buildPlaceholderImageDataUri(label = '图片占位') {
  const safeLabel = String(label || '图片占位').replace(/[<>&]/g, '')
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" width="1600" height="900">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#f1f5f9" />
          <stop offset="100%" stop-color="#e2e8f0" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="1598" height="898" rx="28" ry="28" fill="url(#bg)" stroke="#94a3b8" stroke-width="2" stroke-dasharray="12 10" />
      <text x="800" y="450" text-anchor="middle" dominant-baseline="middle" font-size="54" font-family="PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif" font-weight="600" fill="#475569" letter-spacing="2">${safeLabel}</text>
    </svg>
  `.trim()

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function getDeviceProfile(device = 'mobile', templateConfig) {
  const pageConfig = templateConfig.page

  if (device === 'desktop') {
    return {
      contentMaxWidth: toPx(pageConfig.desktopContentMaxWidth),
      pagePadding: `${pageConfig.desktopPaddingTop}px ${pageConfig.desktopPaddingX}px ${pageConfig.desktopPaddingBottom}px`,
    }
  }

  return {
    contentMaxWidth: '100%',
    pagePadding: `${pageConfig.mobilePaddingTop}px ${pageConfig.mobilePaddingX}px ${pageConfig.mobilePaddingBottom}px`,
  }
}

function getFontProfile(fontSize = 'medium', templateConfig) {
  return templateConfig.fontProfiles[fontSize] ?? templateConfig.fontProfiles.medium
}

function buildImageFrameStyle(bodyImageConfig, extraStyle = {}) {
  const baseStyle = {
    borderRadius: toPx(bodyImageConfig.borderRadius),
    display: 'block',
    marginBottom: toPx(bodyImageConfig.marginBottom),
    marginTop: toPx(bodyImageConfig.marginTop),
    maxWidth: '100%',
    objectFit: 'cover',
    width: `${bodyImageConfig.widthPercent}%`,
  }

  if (bodyImageConfig.align === 'left') {
    baseStyle.marginLeft = '0'
    baseStyle.marginRight = 'auto'
  } else if (bodyImageConfig.align === 'right') {
    baseStyle.marginLeft = 'auto'
    baseStyle.marginRight = '0'
  } else {
    baseStyle.marginLeft = 'auto'
    baseStyle.marginRight = 'auto'
  }

  return {
    ...baseStyle,
    ...extraStyle,
  }
}

function applyAlignedImageFrame(style = {}, align = 'center') {
  const nextStyle = {
    ...style,
    display: 'block',
  }

  if (align === 'left') {
    nextStyle.marginLeft = '0'
    nextStyle.marginRight = 'auto'
  } else if (align === 'right') {
    nextStyle.marginLeft = 'auto'
    nextStyle.marginRight = '0'
  } else {
    nextStyle.marginLeft = 'auto'
    nextStyle.marginRight = 'auto'
  }

  return nextStyle
}

function resolveSlotDividerMode(slot) {
  if (slot?.dividerMode === 'before' || slot?.dividerMode === 'after' || slot?.dividerMode === 'none') {
    return slot.dividerMode
  }

  return 'inherit'
}

export function stripPreviewHeading(markdown = '') {
  const lines = String(markdown).split('\n')

  if (lines[0]?.trim().startsWith('# ')) {
    return lines.slice(1).join('\n').trim()
  }

  return String(markdown).trim()
}

function isPreviewBodyParagraphBlock(block = '') {
  const trimmed = block.trim()

  if (!trimmed) {
    return false
  }

  if (/^#{1,6}\s/.test(trimmed)) {
    return false
  }

  if (/^>\s?/.test(trimmed)) {
    return false
  }

  if (/^\|/.test(trimmed)) {
    return false
  }

  if (/^!\[[^\]]*\]\(([^)]+)\)/.test(trimmed)) {
    return false
  }

  if (/^(\*|-|\+)\s/.test(trimmed)) {
    return false
  }

  if (/^\d+\.\s/.test(trimmed)) {
    return false
  }

  if (/^([-*_]){3,}$/.test(trimmed.replace(/\s/g, ''))) {
    return false
  }

  return true
}

function readFirstSectionHeading(blocks = []) {
  const headingBlock = blocks.find((block) => /^#{2,3}\s/.test(block.trim()))
  return headingBlock ? headingBlock.replace(/^#{2,3}\s*/, '').trim() : ''
}

function isMarkdownDividerBlock(block = '') {
  const trimmed = String(block).trim()
  return /^((\*|-|_)\s*){3,}$/.test(trimmed)
}

function collectPreviewMarkdownBlocks(markdown = '') {
  const normalizedMarkdown = String(markdown).replace(/\r/g, '').trim()
  const blocks = normalizedMarkdown ? normalizedMarkdown.split(/\n{2,}/) : []
  const headingBlockIndices = []
  const paragraphBlockIndices = []

  blocks.forEach((block, index) => {
    const trimmed = block.trim()

    if (/^#{2,3}\s/.test(trimmed)) {
      headingBlockIndices.push(index)
    }

    if (isPreviewBodyParagraphBlock(trimmed)) {
      paragraphBlockIndices.push(index)
    }
  })

  return {
    blocks,
    headingBlockIndices,
    paragraphBlockIndices,
  }
}

function extractPreviewLeadingMarkdown(markdown = '') {
  const { blocks, headingBlockIndices } = collectPreviewMarkdownBlocks(markdown)

  if (headingBlockIndices.length === 0) {
    return ''
  }

  const firstHeadingBlockIndex = headingBlockIndices[0] ?? 0

  if (firstHeadingBlockIndex <= 0) {
    return ''
  }

  return blocks.slice(0, firstHeadingBlockIndex).join('\n\n').trim()
}

function splitSectionMarkdownForImagePlacement(markdown = '') {
  const normalizedMarkdown = String(markdown).replace(/\r/g, '').trim()

  if (!normalizedMarkdown) {
    return {
      bodyMarkdown: '',
      trailingDividerMarkdown: '',
    }
  }

  const blocks = normalizedMarkdown.split(/\n{2,}/)
  const lastBlock = blocks[blocks.length - 1] ?? ''

  if (!isMarkdownDividerBlock(lastBlock)) {
    return {
      bodyMarkdown: normalizedMarkdown,
      trailingDividerMarkdown: '',
    }
  }

  return {
    bodyMarkdown: blocks.slice(0, -1).join('\n\n').trim(),
    trailingDividerMarkdown: lastBlock.trim(),
  }
}

function stripMarkdownToPlainText(markdown = '') {
  return String(markdown)
    .replace(/```[\s\S]*?```/g, '')
    .replace(/!\[[^\]]*\]\(([^)]+)\)/g, '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^([-*_]){3,}$/gm, '')
    .replace(/^\s*[-+*]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/[*_~`]/g, '')
    .replace(/\|/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function isTriangleMarkerBlock(block = '') {
  return String(block).trim() === '▽'
}

function renderPreviewMarkdownBlocks({
  blockKeyPrefix = 'preview-block',
  bodyConfig,
  colors,
  fontProfile,
  markdown = '',
  markdownComponents,
  penName = '',
}) {
  const normalizedMarkdown = String(markdown).replace(/\r/g, '').trim()

  if (!normalizedMarkdown) {
    return null
  }

  const blocks = normalizedMarkdown.split(/\n{2,}/)

  return blocks.map((block, index) => {
    const trimmed = block.trim()
    const previousTrimmed = index > 0 ? blocks[index - 1]?.trim() || '' : ''

    if (isTriangleMarkerBlock(previousTrimmed) && isPreviewBodyParagraphBlock(trimmed)) {
      return (
        <div key={`${blockKeyPrefix}-${index}`}>
          <p
            style={{
              color: colors.textPrimary,
              fontSize: toPx(fontProfile.bodySize),
              fontWeight: 700,
              lineHeight: fontProfile.bodyLineHeight,
              margin: `${bodyConfig.paragraphMarginTop}px 0 0`,
            }}
          >
            {stripMarkdownToPlainText(block)}
          </p>
          <div
            style={{
              color: '#8a8a8a',
              display: 'flex',
              flexWrap: 'wrap',
              fontSize: toPx(Math.max(fontProfile.bodySize - 3, 13)),
              gap: '16px',
              lineHeight: 1.8,
              marginTop: '6px',
            }}
          >
            <span>作者：{penName?.trim() || '未署名'}</span>
            <span>来源：{PREVIEW_SOURCE_ACCOUNT_NAME}</span>
          </div>
        </div>
      )
    }

    return (
      <ReactMarkdown components={markdownComponents} key={`${blockKeyPrefix}-${index}`} remarkPlugins={[remarkGfm]}>
        {block}
      </ReactMarkdown>
    )
  })
}

function QrIdentityHeader() {
  return (
    <div
      style={{
        alignItems: 'center',
        display: 'flex',
        flexDirection: 'column',
        marginBottom: '12px',
      }}
    >
      <div
        style={{
          color: PREVIEW_TAIL_ACCENT_COLOR,
          fontSize: '18px',
          fontWeight: 700,
          letterSpacing: '0.04em',
          lineHeight: 1.4,
        }}
      >
        {PREVIEW_SOURCE_ACCOUNT_NAME}
      </div>
      <div
        style={{
          borderTop: `1.5px solid ${PREVIEW_TAIL_ACCENT_COLOR}`,
          marginTop: '8px',
          width: '8em',
        }}
      />
    </div>
  )
}

function QrFollowBadge() {
  return (
    <div
      style={{
        alignItems: 'center',
        backgroundColor: PREVIEW_TAIL_ACCENT_COLOR,
        borderRadius: '999px',
        color: '#ffffff',
        display: 'inline-flex',
        fontSize: '13px',
        fontWeight: 600,
        gap: '6px',
        lineHeight: 1,
        margin: '14px auto 0',
        padding: '8px 14px',
      }}
    >
      <span style={{ fontSize: '10px', transform: 'translateY(-0.5px)' }}>▲</span>
      <span>长按识别二维码 关注我们</span>
    </div>
  )
}

function buildEmptyPreviewSection(order, fallbackText = '') {
  return {
    blockIndex: 0,
    markdown: fallbackText,
    order,
    positionLabel: `第 ${order} 段后`,
    text: stripMarkdownToPlainText(fallbackText),
    title: '',
  }
}

export function buildPreviewSections(markdown = '', options = {}) {
  const { blocks, headingBlockIndices, paragraphBlockIndices } = collectPreviewMarkdownBlocks(markdown)
  const normalizedMarkdown = String(markdown).trim()
  const fillTrailingSections = options.fillTrailingSections ?? true
  const hasExplicitSectionLimit = Object.prototype.hasOwnProperty.call(options, 'maxSections')
  const parsedSectionLimit = Number(options.maxSections)
  const hasSectionLimit = hasExplicitSectionLimit
    ? Number.isFinite(parsedSectionLimit) && parsedSectionLimit > 0
    : true
  const sectionLimit = hasSectionLimit
    ? Math.max(1, Math.floor(hasExplicitSectionLimit ? parsedSectionLimit : ARTICLE_PREVIEW_SECTION_COUNT))
    : null
  const sections = []

  if (
    headingBlockIndices.length >=
    (hasSectionLimit ? sectionLimit : ARTICLE_PREVIEW_SECTION_COUNT)
  ) {
    const totalHeadingSections = hasSectionLimit ? Math.min(sectionLimit, headingBlockIndices.length) : headingBlockIndices.length

    for (let index = 0; index < totalHeadingSections; index += 1) {
      const startBlockIndex = headingBlockIndices[index]
      const nextHeadingBlockIndex =
        index === headingBlockIndices.length - 1
          ? blocks.length
          : headingBlockIndices[index + 1]
      const sectionBlocks = blocks.slice(startBlockIndex, nextHeadingBlockIndex)
      const sectionMarkdown = sectionBlocks.join('\n\n').trim()

      sections.push({
        blockIndex: Math.max(startBlockIndex, nextHeadingBlockIndex - 1),
        markdown: sectionMarkdown,
        order: index + 1,
        positionLabel: `第 ${index + 1} 段后`,
        text: stripMarkdownToPlainText(sectionMarkdown),
        title: readFirstSectionHeading(sectionBlocks),
      })
    }
  } else if (paragraphBlockIndices.length > 0) {
    const groupCount = hasSectionLimit
      ? Math.min(sectionLimit, paragraphBlockIndices.length)
      : Math.min(ARTICLE_PREVIEW_SECTION_COUNT, paragraphBlockIndices.length)
    const baseGroupSize = Math.floor(paragraphBlockIndices.length / groupCount)
    const extraItems = paragraphBlockIndices.length % groupCount
    let paragraphCursor = 0

    for (let index = 0; index < groupCount; index += 1) {
      const currentGroupSize = baseGroupSize + (index < extraItems ? 1 : 0)
      const startParagraphPointer = paragraphCursor
      const endParagraphPointer =
        index === groupCount - 1 ? paragraphBlockIndices.length - 1 : paragraphCursor + currentGroupSize - 1
      const startBlockIndex = paragraphBlockIndices[startParagraphPointer]
      const endBlockIndex = paragraphBlockIndices[endParagraphPointer]
      const sectionBlocks = blocks.slice(startBlockIndex, endBlockIndex + 1)
      const sectionMarkdown = sectionBlocks.join('\n\n').trim()

      sections.push({
        blockIndex: endBlockIndex,
        markdown: sectionMarkdown,
        order: index + 1,
        positionLabel: `第 ${index + 1} 段后`,
        text: stripMarkdownToPlainText(sectionMarkdown),
        title: readFirstSectionHeading(sectionBlocks),
      })

      paragraphCursor += currentGroupSize
    }
  }

  if (sections.length === 0) {
    const fallbackCount = hasSectionLimit ? sectionLimit : 1

    return Array.from({ length: fallbackCount }, (_, index) =>
      buildEmptyPreviewSection(index + 1, normalizedMarkdown),
    )
  }

  if (fillTrailingSections && hasSectionLimit) {
    while (sections.length < sectionLimit) {
      const previousSection = sections[sections.length - 1]

      sections.push({
        ...previousSection,
        order: sections.length + 1,
        positionLabel: `第 ${sections.length + 1} 段后`,
      })
    }
  }

  return hasSectionLimit ? sections.slice(0, sectionLimit) : sections
}

function getTemplateBodyImageSlots(templateConfig = null) {
  return normalizeArticleTemplateConfig(templateConfig).bodyImageSlots
}

export function resolveImageSlotSectionOrder(slot, fallbackOrder = 1) {
  const directSectionOrder = Number(slot?.sectionOrder)

  if (Number.isFinite(directSectionOrder) && directSectionOrder > 0) {
    return directSectionOrder
  }

  const order = Number(slot?.order)

  if (Number.isFinite(order) && order > 0) {
    return order
  }

  return fallbackOrder
}

export function applyTemplateBodyImageSlotOrders(imageSlots = [], templateConfig = null) {
  const templateSlots = getTemplateBodyImageSlots(templateConfig)

  return (Array.isArray(imageSlots) ? imageSlots : []).map((slot, index) => {
    const templateSlot = templateSlots[index] ?? null

    return {
      ...slot,
      dividerMode: templateSlot?.dividerMode || slot?.dividerMode || 'inherit',
      sectionOrder: templateSlot?.sectionOrder ?? resolveImageSlotSectionOrder(slot, index + 1),
      slotId: slot?.slotId || templateSlot?.slotId || `slot_${index + 1}`,
    }
  })
}

export function buildImageSelectionFromMatchResult({ matchResult, sections = [], templateConfig = null, versionId }) {
  const templateSlots = getTemplateBodyImageSlots(templateConfig)
  const referenceAssets = Array.isArray(matchResult?.referenceAssets)
    ? matchResult.referenceAssets.slice(0, ARTICLE_PREVIEW_SECTION_COUNT)
    : []
  const incomingSlots = Array.isArray(matchResult?.slots) ? matchResult.slots : []

  const slots = referenceAssets.map((asset, index) => {
    const templateSlot = templateSlots[index] ?? null
    const incomingSlot = incomingSlots[index] ?? {}
    const currentSection = sections[index] ?? buildEmptyPreviewSection(templateSlot?.sectionOrder ?? index + 1)
    const sectionOrder = templateSlot?.sectionOrder ?? resolveImageSlotSectionOrder(incomingSlot, index + 1)

    return {
      assetId: asset.id,
      blockIndex: Number.isFinite(currentSection?.blockIndex) ? currentSection.blockIndex : 0,
      dividerMode: templateSlot?.dividerMode || incomingSlot?.dividerMode || 'inherit',
      order: index + 1,
      paragraphIndex: index,
      positionLabel: `第 ${sectionOrder} 段后`,
      sectionOrder,
      slotId: templateSlot?.slotId || incomingSlot.slotId || `slot_${index + 1}`,
      status: 'matched',
    }
  })

  return {
    matchedAt: new Date().toISOString(),
    referenceAssets,
    sourceVersionId: versionId ?? null,
    slots,
  }
}

export function getRenderablePreviewSlots({ imageSelection, liveAssetMap = null, templateConfig = null, versionId } = {}) {
  if (!versionId || imageSelection?.sourceVersionId !== versionId) {
    return []
  }

  const referenceAssets = Array.isArray(imageSelection?.referenceAssets) ? imageSelection.referenceAssets : []
  const slots = Array.isArray(imageSelection?.slots) ? imageSelection.slots : []

  if (referenceAssets.length === 0 || slots.length === 0) {
    return []
  }

  const snapshotAssetMap = new Map(referenceAssets.map((asset) => [asset.id, asset]))
  const hasLiveAssetMap = liveAssetMap instanceof Map
  const normalizedSlots = applyTemplateBodyImageSlotOrders(slots, templateConfig)

  return normalizedSlots
    .sort((left, right) => {
      const leftOrder = resolveImageSlotSectionOrder(left, left?.order ?? 1)
      const rightOrder = resolveImageSlotSectionOrder(right, right?.order ?? 1)
      return leftOrder - rightOrder
    })
    .map((slot, index) => {
      const snapshotAsset = slot?.assetId ? snapshotAssetMap.get(slot.assetId) ?? null : null
      const liveAsset = hasLiveAssetMap && slot?.assetId ? liveAssetMap.get(slot.assetId) ?? null : null
      const missingByDeletion = hasLiveAssetMap && slot?.assetId ? !liveAssetMap.has(slot.assetId) : false
      const asset = liveAsset ?? snapshotAsset

      return {
        ...slot,
        asset,
        sectionOrder: resolveImageSlotSectionOrder(slot, index + 1),
        status: slot?.status === 'missing' || missingByDeletion || !asset?.path ? 'missing' : 'matched',
      }
    })
}

export function resolveAbsoluteAssetPath(src = '', origin = '') {
  if (!src || src.startsWith(MISSING_PREVIEW_ASSET_SRC_PREFIX)) {
    return src
  }

  if (!origin) {
    return src
  }

  try {
    return new URL(src, origin).toString()
  } catch {
    return src
  }
}

export function hasFixedLayoutTailContent(config) {
  return Boolean(config?.qrImage?.path || config?.footerGif?.path)
}

export function extractUsedAssetIds(imageSelection, sourceVersionId = '') {
  if (imageSelection?.sourceVersionId !== sourceVersionId) {
    return []
  }

  return Array.from(
    new Set(
      (Array.isArray(imageSelection?.slots) ? imageSelection.slots : [])
        .map((slot) => (typeof slot?.assetId === 'string' ? slot.assetId.trim() : ''))
        .filter(Boolean),
    ),
  )
}

function PreviewPlaceholderBlock({
  aspectRatio = '',
  label = '图片占位',
  minHeight = 160,
  style = {},
}) {
  return (
    <div
      style={{
        alignItems: 'center',
        background:
          'linear-gradient(135deg, rgba(241,245,249,0.96) 0%, rgba(226,232,240,0.92) 100%)',
        border: '1px dashed rgba(100,116,139,0.45)',
        borderRadius: '14px',
        color: '#475569',
        display: 'flex',
        fontSize: '13px',
        fontWeight: 500,
        justifyContent: 'center',
        letterSpacing: '0.04em',
        padding: '0 16px',
        textAlign: 'center',
        width: '100%',
        ...(aspectRatio
          ? {
              aspectRatio,
              minHeight: '0',
            }
          : {
              minHeight: toPx(minHeight),
            }),
        ...style,
      }}
    >
      {label}
    </div>
  )
}

function FixedLayoutImage({ alt = '', asset, emptyLabel = '图片已移除', origin = '', style = {} }) {
  const src = resolveAbsoluteAssetPath(asset?.path || '', origin)

  if (!src || src.startsWith(MISSING_PREVIEW_ASSET_SRC_PREFIX)) {
    return <PreviewPlaceholderBlock label={emptyLabel} style={style} />
  }

  return <img alt={alt} loading="lazy" src={src} style={style} />
}

function BodyImagePlaceholder({ label = '图片占位', style = {} }) {
  return <img alt={label} loading="lazy" src={buildPlaceholderImageDataUri(label)} style={style} />
}

function MarkdownInlineImage({ alt = '', bodyImageConfig, origin = '', src = '' }) {
  const resolvedSrc = resolveAbsoluteAssetPath(src, origin)
  const imageStyle = buildImageFrameStyle(bodyImageConfig)

  if (!resolvedSrc || resolvedSrc.startsWith(MISSING_PREVIEW_ASSET_SRC_PREFIX)) {
    return <BodyImagePlaceholder label="图片已移除" style={imageStyle} />
  }

  return <img alt={alt} loading="lazy" src={resolvedSrc} style={imageStyle} />
}

function SectionPreviewImage({ bodyImageConfig, origin = '', slot }) {
  if (!slot) {
    return null
  }

  const label =
    slot.status === 'missing'
      ? '图片已移除'
      : slot.placeholderLabel || slot.asset?.scene || `正文配图 ${slot.order || ''}`.trim()

  if (slot.status === 'placeholder') {
    return <BodyImagePlaceholder label={label} style={buildImageFrameStyle(bodyImageConfig)} />
  }

  if (slot.status === 'missing') {
    return <BodyImagePlaceholder label={label} style={buildImageFrameStyle(bodyImageConfig)} />
  }

  return (
    <FixedLayoutImage
      alt={label}
      asset={slot.asset}
      emptyLabel="图片已移除"
      origin={origin}
      style={buildImageFrameStyle(bodyImageConfig)}
    />
  )
}

function DividerLine({ bodyConfig, colors }) {
  return (
    <hr
      style={{
        border: 'none',
        borderTop: `${bodyConfig.hrThickness}px solid ${colors.border}`,
        margin: `${bodyConfig.hrMarginY}px 0`,
      }}
    />
  )
}

function createMarkdownComponents({ fontProfile, origin, templateConfig }) {
  const colors = templateConfig.colors
  const bodyConfig = templateConfig.body
  const bodyImageConfig = templateConfig.bodyImage

  return {
    h1: ({ node, ...props }) => (
      <h2
        style={{
          color: colors.textPrimary,
          fontSize: toPx(bodyConfig.heading2FontSize),
          fontWeight: 600,
          lineHeight: bodyConfig.heading2LineHeight,
          margin: `${bodyConfig.heading2MarginTop}px 0 0`,
        }}
        {...props}
      />
    ),
    h2: ({ node, ...props }) => (
      <h2
        style={{
          color: colors.textPrimary,
          fontSize: toPx(bodyConfig.heading2FontSize),
          fontWeight: 600,
          lineHeight: bodyConfig.heading2LineHeight,
          margin: `${bodyConfig.heading2MarginTop}px 0 0`,
        }}
        {...props}
      />
    ),
    h3: ({ node, ...props }) => (
      <h3
        style={{
          color: colors.textPrimary,
          fontSize: toPx(bodyConfig.heading3FontSize),
          fontWeight: 600,
          lineHeight: bodyConfig.heading3LineHeight,
          margin: `${bodyConfig.heading3MarginTop}px 0 0`,
        }}
        {...props}
      />
    ),
    p: ({ node, ...props }) => (
      <p
        style={{
          color: colors.textPrimary,
          fontSize: toPx(fontProfile.bodySize),
          lineHeight: fontProfile.bodyLineHeight,
          margin: `${bodyConfig.paragraphMarginTop}px 0 0`,
        }}
        {...props}
      />
    ),
    ul: ({ node, ...props }) => (
      <ul
        style={{
          color: colors.textPrimary,
          fontSize: toPx(fontProfile.bodySize),
          lineHeight: fontProfile.bodyLineHeight,
          listStyleType: 'disc',
          margin: `${bodyConfig.listMarginTop}px 0 0`,
          paddingLeft: toPx(bodyConfig.listPaddingLeft),
        }}
        {...props}
      />
    ),
    ol: ({ node, ...props }) => (
      <ol
        style={{
          color: colors.textPrimary,
          fontSize: toPx(fontProfile.bodySize),
          lineHeight: fontProfile.bodyLineHeight,
          listStyleType: 'decimal',
          margin: `${bodyConfig.listMarginTop}px 0 0`,
          paddingLeft: toPx(bodyConfig.listPaddingLeft),
        }}
        {...props}
      />
    ),
    li: ({ node, ...props }) => (
      <li style={{ marginBottom: toPx(bodyConfig.listItemMarginBottom), paddingLeft: toPx(bodyConfig.listItemPaddingLeft) }} {...props} />
    ),
    strong: ({ node, ...props }) => <strong style={{ color: colors.textPrimary, fontWeight: 600 }} {...props} />,
    blockquote: ({ node, ...props }) => (
      <blockquote
        style={{
          borderLeft: `${bodyConfig.blockquoteBorderWidth}px solid ${colors.blockquoteBorder}`,
          color: colors.blockquoteText,
          fontSize: toPx(bodyConfig.blockquoteFontSize),
          lineHeight: bodyConfig.blockquoteLineHeight,
          margin: `${bodyConfig.blockquoteMarginTop}px 0 0`,
          paddingLeft: toPx(bodyConfig.blockquotePaddingLeft),
        }}
        {...props}
      />
    ),
    img: ({ node, alt = '', src = '', ...props }) => (
      <MarkdownInlineImage alt={alt} bodyImageConfig={bodyImageConfig} origin={origin} src={src} {...props} />
    ),
    hr: ({ node, ...props }) => (
      <DividerLine bodyConfig={bodyConfig} colors={colors} {...props} />
    ),
    table: ({ node, ...props }) => (
      <div
        style={{
          border: `1px solid ${colors.border}`,
          borderRadius: toPx(bodyConfig.tableBorderRadius),
          marginTop: toPx(bodyConfig.tableMarginTop),
          overflowX: 'auto',
        }}
      >
        <table
          style={{
            borderCollapse: 'collapse',
            color: colors.textPrimary,
            minWidth: '100%',
            width: '100%',
          }}
          {...props}
        />
      </div>
    ),
    thead: ({ node, ...props }) => <thead style={{ backgroundColor: colors.tableHeaderBackground }} {...props} />,
    tbody: ({ node, ...props }) => <tbody {...props} />,
    tr: ({ node, ...props }) => <tr style={{ borderTop: `1px solid ${colors.border}` }} {...props} />,
    th: ({ node, ...props }) => (
      <th
        style={{
          fontSize: toPx(bodyConfig.tableHeaderFontSize),
          fontWeight: 600,
          lineHeight: bodyConfig.tableHeaderLineHeight,
          minWidth: '120px',
          padding: `${bodyConfig.tableCellPaddingY}px ${bodyConfig.tableCellPaddingX}px`,
          textAlign: 'left',
          verticalAlign: 'top',
          whiteSpace: 'normal',
        }}
        {...props}
      />
    ),
    td: ({ node, ...props }) => (
      <td
        style={{
          color: colors.textPrimary,
          fontSize: toPx(bodyConfig.tableBodyFontSize),
          lineHeight: bodyConfig.tableBodyLineHeight,
          minWidth: '120px',
          padding: `${bodyConfig.tableCellPaddingY}px ${bodyConfig.tableCellPaddingX}px`,
          verticalAlign: 'top',
          whiteSpace: 'normal',
        }}
        {...props}
      />
    ),
  }
}

function ArticlePreviewContent({
  bodyMarkdown = '',
  device = 'mobile',
  fixedLayoutConfig,
  fontSize = 'medium',
  imageSlots = [],
  origin = '',
  penName = '',
  previewMode = 'production',
  templateConfig = null,
}) {
  const normalizedTemplateConfig = normalizeArticleTemplateConfig(templateConfig)
  const deviceProfile = getDeviceProfile(device, normalizedTemplateConfig)
  const fontProfile = getFontProfile(fontSize, normalizedTemplateConfig)
  const markdownComponents = createMarkdownComponents({
    fontProfile,
    origin,
    templateConfig: normalizedTemplateConfig,
  })
  const bodyImageConfig = normalizedTemplateConfig.bodyImage
  const colors = normalizedTemplateConfig.colors
  const leadingMarkdown = extractPreviewLeadingMarkdown(bodyMarkdown)
  const sections = buildPreviewSections(bodyMarkdown, { fillTrailingSections: false, maxSections: null })
  const normalizedImageSlots = applyTemplateBodyImageSlotOrders(imageSlots, normalizedTemplateConfig)
  const sectionImageMap = normalizedImageSlots.reduce((map, slot, index) => {
    const rawSectionOrder = resolveImageSlotSectionOrder(slot, index + 1)
    const effectiveSectionOrder = Math.min(rawSectionOrder, Math.max(sections.length, 1))
    const currentSectionImages = map.get(effectiveSectionOrder) ?? []

    currentSectionImages.push(slot)
    map.set(effectiveSectionOrder, currentSectionImages)
    return map
  }, new Map())
  const showTemplatePlaceholders = previewMode === 'template-editor'
  const hasTailContent = hasFixedLayoutTailContent(fixedLayoutConfig)
  const showBodySectionDivider = normalizedTemplateConfig.body.sectionDividerThickness > 0
  const showTailDivider = normalizedTemplateConfig.tail.dividerThickness > 0

  return (
    <div
      style={{
        backgroundColor: colors.pageBackground,
        boxSizing: 'border-box',
        color: colors.textPrimary,
        fontFamily: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
        margin: '0 auto',
        padding: deviceProfile.pagePadding,
        width: '100%',
      }}
    >
      <article style={{ margin: '0 auto', maxWidth: deviceProfile.contentMaxWidth }}>
        {fixedLayoutConfig?.heroGif?.path ? (
          <div>
            <FixedLayoutImage
              alt={FIXED_LAYOUT_SLOT_META.heroGif.label}
              asset={fixedLayoutConfig.heroGif}
              origin={origin}
              style={applyAlignedImageFrame({
                borderRadius: toPx(normalizedTemplateConfig.heroImage.borderRadius),
                maxHeight: toPx(normalizedTemplateConfig.heroImage.maxHeight),
                objectFit: 'cover',
                width: `${normalizedTemplateConfig.heroImage.widthPercent}%`,
              }, normalizedTemplateConfig.heroImage.align)}
            />
          </div>
        ) : showTemplatePlaceholders ? (
          <PreviewPlaceholderBlock
            label={FIXED_LAYOUT_SLOT_META.heroGif.label}
            minHeight={normalizedTemplateConfig.heroImage.maxHeight}
            style={applyAlignedImageFrame({
              borderRadius: toPx(normalizedTemplateConfig.heroImage.borderRadius),
              maxWidth: `${normalizedTemplateConfig.heroImage.widthPercent}%`,
            }, normalizedTemplateConfig.heroImage.align)}
          />
        ) : null}

        <div
          style={{
            borderTop: showBodySectionDivider
              ? `${normalizedTemplateConfig.body.sectionDividerThickness}px solid ${colors.border}`
              : 'none',
            marginTop: toPx(normalizedTemplateConfig.body.sectionDividerMarginTop),
            paddingTop: toPx(normalizedTemplateConfig.body.sectionDividerPaddingTop),
          }}
        >
          {leadingMarkdown
            ? renderPreviewMarkdownBlocks({
                blockKeyPrefix: 'leading',
                bodyConfig: normalizedTemplateConfig.body,
                colors,
                fontProfile,
                markdown: leadingMarkdown,
                markdownComponents,
                penName,
              })
            : null}

          {sections.map((section) => (
            <section key={`section-${section.order}`}>
              {(() => {
                const sectionImages = sectionImageMap.get(section.order) ?? []
                const { bodyMarkdown: sectionBodyMarkdown, trailingDividerMarkdown } = splitSectionMarkdownForImagePlacement(
                  section.markdown,
                )
                let canUseTrailingDivider = Boolean(trailingDividerMarkdown)

                return (
                  <>
                    {sectionBodyMarkdown
                      ? renderPreviewMarkdownBlocks({
                          blockKeyPrefix: `section-${section.order}-body`,
                          bodyConfig: normalizedTemplateConfig.body,
                          colors,
                          fontProfile,
                          markdown: sectionBodyMarkdown,
                          markdownComponents,
                          penName,
                        })
                      : null}

                    {sectionImages.map((slot, slotIndex) => {
                      const dividerMode = resolveSlotDividerMode(slot)
                      const inheritedPlacement = bodyImageConfig.dividerPlacement === 'before' ? 'before' : 'after'
                      const useInheritedDivider = dividerMode === 'inherit' && canUseTrailingDivider
                      const showDividerBefore = dividerMode === 'before' || (useInheritedDivider && inheritedPlacement === 'before')
                      const showDividerAfter = dividerMode === 'after' || (useInheritedDivider && inheritedPlacement === 'after')

                      if (useInheritedDivider) {
                        canUseTrailingDivider = false
                      }

                      return (
                        <div key={`section-${section.order}-image-${slot.slotId || slotIndex}`}>
                          {showDividerBefore ? <DividerLine bodyConfig={normalizedTemplateConfig.body} colors={colors} /> : null}
                          <SectionPreviewImage bodyImageConfig={bodyImageConfig} origin={origin} slot={slot} />
                          {showDividerAfter ? <DividerLine bodyConfig={normalizedTemplateConfig.body} colors={colors} /> : null}
                        </div>
                      )
                    })}

                    {sectionImages.length === 0 && canUseTrailingDivider ? (
                      <DividerLine bodyConfig={normalizedTemplateConfig.body} colors={colors} />
                    ) : null}
                  </>
                )
              })()}
            </section>
          ))}
        </div>

        {hasTailContent || showTemplatePlaceholders ? (
          <div
            style={{
              borderTop: showTailDivider ? `${normalizedTemplateConfig.tail.dividerThickness}px solid ${colors.border}` : 'none',
              marginTop: toPx(normalizedTemplateConfig.tail.dividerMarginTop),
              paddingTop: toPx(normalizedTemplateConfig.tail.dividerPaddingTop),
            }}
          >
            {fixedLayoutConfig?.qrImage?.path ? (
              <div style={{ marginTop: '0', textAlign: 'center' }}>
                <QrIdentityHeader />
                <FixedLayoutImage
                  alt={FIXED_LAYOUT_SLOT_META.qrImage.label}
                  asset={fixedLayoutConfig.qrImage}
                  origin={origin}
                  style={applyAlignedImageFrame({
                    borderRadius: toPx(normalizedTemplateConfig.qrImage.borderRadius),
                    maxWidth: toPx(normalizedTemplateConfig.qrImage.width),
                    objectFit: 'cover',
                    width: '100%',
                  }, normalizedTemplateConfig.qrImage.align)}
                />
                <QrFollowBadge />
              </div>
            ) : showTemplatePlaceholders ? (
              <div style={{ marginTop: '0', textAlign: 'center' }}>
                <QrIdentityHeader />
                <PreviewPlaceholderBlock
                  label={FIXED_LAYOUT_SLOT_META.qrImage.label}
                  minHeight={normalizedTemplateConfig.qrImage.width}
                  style={applyAlignedImageFrame({
                    borderRadius: toPx(normalizedTemplateConfig.qrImage.borderRadius),
                    marginBottom: '0',
                    marginTop: '0',
                    maxWidth: toPx(normalizedTemplateConfig.qrImage.width),
                  }, normalizedTemplateConfig.qrImage.align)}
                />
                <QrFollowBadge />
              </div>
            ) : null}

            {fixedLayoutConfig?.footerGif?.path ? (
              <div
                style={{
                  marginTop:
                    fixedLayoutConfig?.qrImage?.path
                      ? toPx(normalizedTemplateConfig.footerImage.marginTop)
                      : '0',
                }}
              >
                <FixedLayoutImage
                  alt={FIXED_LAYOUT_SLOT_META.footerGif.label}
                  asset={fixedLayoutConfig.footerGif}
                  origin={origin}
                  style={applyAlignedImageFrame({
                    borderRadius: toPx(normalizedTemplateConfig.footerImage.borderRadius),
                    maxHeight: toPx(normalizedTemplateConfig.footerImage.maxHeight),
                    objectFit: 'cover',
                    width: `${normalizedTemplateConfig.footerImage.widthPercent}%`,
                  }, normalizedTemplateConfig.footerImage.align)}
                />
              </div>
            ) : showTemplatePlaceholders ? (
              <PreviewPlaceholderBlock
                label={FIXED_LAYOUT_SLOT_META.footerGif.label}
                minHeight={normalizedTemplateConfig.footerImage.maxHeight}
                style={applyAlignedImageFrame({
                  borderRadius: toPx(normalizedTemplateConfig.footerImage.borderRadius),
                  marginTop:
                    fixedLayoutConfig?.qrImage?.path ||
                    showTemplatePlaceholders
                      ? toPx(normalizedTemplateConfig.footerImage.marginTop)
                      : '0',
                  maxWidth: `${normalizedTemplateConfig.footerImage.widthPercent}%`,
                }, normalizedTemplateConfig.footerImage.align)}
              />
            ) : null}
          </div>
        ) : null}
      </article>
    </div>
  )
}

function buildPreviewPlainText({ bodyMarkdown = '', fixedLayoutConfig, penName = '' }) {
  const leadingMarkdown = extractPreviewLeadingMarkdown(bodyMarkdown)
  const sections = buildPreviewSections(bodyMarkdown, { fillTrailingSections: false, maxSections: null })
  const parts = [
    stripMarkdownToPlainText(leadingMarkdown),
    ...sections.map((section) => section.text).filter(Boolean),
    `作者：${penName?.trim() || '未署名'}    来源：${PREVIEW_SOURCE_ACCOUNT_NAME}`,
    fixedLayoutConfig?.qrImage?.path ? `${PREVIEW_SOURCE_ACCOUNT_NAME}\n长按识别二维码 关注我们` : '',
  ]

  return parts.filter(Boolean).join('\n\n').trim()
}

export function renderArticlePreviewDocument({
  articleType = '',
  bodyMarkdown = '',
  device = 'mobile',
  displayTitle = '',
  fixedLayoutConfig = null,
  fontSize = 'medium',
  imageSlots = [],
  origin = '',
  penName = '',
  previewMode = 'production',
  templateConfig = null,
  wordCount = 0,
}) {
  const normalizedTemplateConfig = normalizeArticleTemplateConfig(templateConfig)
  const bodyHtml = renderToStaticMarkup(
    <ArticlePreviewContent
      articleType={articleType}
      bodyMarkdown={bodyMarkdown}
      device={device}
      displayTitle={displayTitle}
      fixedLayoutConfig={fixedLayoutConfig}
      fontSize={fontSize}
      imageSlots={imageSlots}
      origin={origin}
      penName={penName}
      previewMode={previewMode}
      templateConfig={normalizedTemplateConfig}
      wordCount={wordCount}
    />,
  )

  return {
    bodyHtml,
    documentHtml: `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/></head><body style="margin:0;background:${normalizedTemplateConfig.colors.pageBackground};">${bodyHtml}</body></html>`,
    plainText: buildPreviewPlainText({
      bodyMarkdown,
      fixedLayoutConfig,
      penName,
    }),
  }
}

export function renderWechatDraftHtml({
  articleType = '',
  bodyMarkdown = '',
  fixedLayoutConfig = null,
  fontSize = 'medium',
  imageSlots = [],
  origin = '',
  penName = '',
  templateConfig = null,
  wordCount = 0,
} = {}) {
  const result = renderArticlePreviewDocument({
    articleType,
    bodyMarkdown,
    device: 'mobile',
    displayTitle: '',
    fixedLayoutConfig,
    fontSize,
    imageSlots,
    origin,
    penName,
    previewMode: 'production',
    templateConfig,
    wordCount,
  })

  return {
    bodyHtml: result.bodyHtml,
    plainText: result.plainText,
  }
}

export function createTemplatePreviewPlaceholderSlots(templateConfig = null) {
  const templateSlots = getTemplateBodyImageSlots(templateConfig)

  return Array.from({ length: ARTICLE_TEMPLATE_BODY_IMAGE_SLOT_COUNT }, (_, index) => {
    const templateSlot = templateSlots[index] ?? null

    return {
      dividerMode: templateSlot?.dividerMode || 'inherit',
      order: index + 1,
      placeholderLabel: `这里是正文第 ${index + 1} 张图`,
      sectionOrder: templateSlot?.sectionOrder ?? index + 1,
      slotId: templateSlot?.slotId || `template-slot-${index + 1}`,
      status: 'placeholder',
    }
  })
}
