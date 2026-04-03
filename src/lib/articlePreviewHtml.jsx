import ReactMarkdown from 'react-markdown'
import { renderToStaticMarkup } from 'react-dom/server'
import remarkGfm from 'remark-gfm'
import { FIXED_LAYOUT_SLOT_META } from '../../shared/fixedLayoutConfig.js'

export const ARTICLE_PREVIEW_SECTION_COUNT = 3
export const MISSING_PREVIEW_ASSET_SRC_PREFIX = 'asset-missing://'

const PREVIEW_SOURCE_ACCOUNT_NAME = '煮酒问人生'
const FIXED_TEMPLATE_MAX_WIDTH = 677
const DEFAULT_ENDING_GUIDE_TEXT = '点亮文末“爱心”，愿你往后有光，心里有暖，脚下有路。转发分享，弘扬中华传统文化！'
const PLACEHOLDER_MARKERS = ['[IMAGE_1]', '[IMAGE_2]', '[IMAGE_3]', '[ENDING]']

function buildPlaceholderImageDataUri(label = '图片占位', { background = '#f3f4f6', foreground = '#9ca3af' } = {}) {
  const safeLabel = String(label || '图片占位').replace(/[<>&]/g, '')
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 675" width="1200" height="675">
      <rect width="1200" height="675" rx="24" ry="24" fill="${background}" />
      <rect x="16" y="16" width="1168" height="643" rx="18" ry="18" fill="none" stroke="${foreground}" stroke-width="2" stroke-dasharray="10 8" />
      <text x="600" y="338" text-anchor="middle" dominant-baseline="middle" font-size="44" font-family="PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif" font-weight="600" fill="${foreground}">
        ${safeLabel}
      </text>
    </svg>
  `.trim()

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function normalizeMarkdown(markdown = '') {
  return String(markdown).replace(/\r/g, '').trim()
}

export function stripPreviewHeading(markdown = '') {
  const lines = String(markdown).replace(/\r/g, '').split('\n')

  if (lines[0]?.trim().startsWith('# ')) {
    return lines.slice(1).join('\n').trim()
  }

  return normalizeMarkdown(markdown)
}

function stripTemplateMarkers(markdown = '') {
  return normalizeMarkdown(markdown).replace(/\[IMAGE_[123]\]|\[ENDING\]/g, '').trim()
}

function markerCount(markdown = '', marker = '') {
  if (!marker) {
    return 0
  }

  return String(markdown).split(marker).length - 1
}

function parsePlaceholderDraft(markdown = '') {
  const normalized = stripPreviewHeading(markdown)
  const markerPositions = PLACEHOLDER_MARKERS.map((marker) => ({
    marker,
    count: markerCount(normalized, marker),
    index: normalized.indexOf(marker),
  }))

  const allPresentExactlyOnce = markerPositions.every((item) => item.count === 1 && item.index >= 0)
  const inCorrectOrder = markerPositions.every((item, index) => index === 0 || item.index > markerPositions[index - 1].index)

  if (!allPresentExactlyOnce || !inCorrectOrder) {
    return null
  }

  const [image1, image2, image3, ending] = markerPositions

  return {
    beforeImage1: normalized.slice(0, image1.index).trim(),
    betweenImage1And2: normalized.slice(image1.index + image1.marker.length, image2.index).trim(),
    betweenImage2And3: normalized.slice(image2.index + image2.marker.length, image3.index).trim(),
    afterImage3BeforeEnding: normalized.slice(image3.index + image3.marker.length, ending.index).trim(),
    endingMarkdown: normalized.slice(ending.index + ending.marker.length).trim(),
    hasExplicitPlaceholders: true,
    normalizedMarkdown: normalized,
  }
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

  if (PLACEHOLDER_MARKERS.includes(trimmed)) {
    return false
  }

  return true
}

function collectPreviewMarkdownBlocks(markdown = '') {
  const normalizedMarkdown = stripTemplateMarkers(markdown)
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

function readFirstSectionHeading(blocks = []) {
  const headingBlock = blocks.find((block) => /^#{2,3}\s/.test(block.trim()))
  return headingBlock ? headingBlock.replace(/^#{2,3}\s*/, '').trim() : ''
}

function stripMarkdownToPlainText(markdown = '') {
  return stripTemplateMarkers(markdown)
    .replace(/```[\s\S]*?```/g, '')
    .replace(/!\[[^\]]*\]\(([^)]+)\)/g, '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^([-*_]){3,}$/gm, '')
    .replace(/^\s*[-+*]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/[*_~`|]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function buildEmptyPreviewSection(order, fallbackText = '') {
  return {
    blockIndex: 0,
    markdown: stripTemplateMarkers(fallbackText),
    order,
    positionLabel: `第 ${order} 段后`,
    text: stripMarkdownToPlainText(fallbackText),
    title: '',
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

function splitIntroAndFirstSection(markdown = '') {
  const { blocks, headingBlockIndices } = collectPreviewMarkdownBlocks(markdown)

  if (headingBlockIndices.length === 0) {
    return {
      introMarkdown: '',
      sectionMarkdown: stripTemplateMarkers(markdown),
    }
  }

  const firstHeadingBlockIndex = headingBlockIndices[0] ?? 0

  if (firstHeadingBlockIndex <= 0) {
    return {
      introMarkdown: '',
      sectionMarkdown: stripTemplateMarkers(markdown),
    }
  }

  return {
    introMarkdown: blocks.slice(0, firstHeadingBlockIndex).join('\n\n').trim(),
    sectionMarkdown: blocks.slice(firstHeadingBlockIndex).join('\n\n').trim(),
  }
}

function buildPlaceholderSections(markdown = '', options = {}) {
  const parsed = parsePlaceholderDraft(markdown)

  if (!parsed) {
    return null
  }

  const fillTrailingSections = options.fillTrailingSections ?? true
  const sectionLimit = Math.max(1, Number(options.maxSections ?? ARTICLE_PREVIEW_SECTION_COUNT))
  const { introMarkdown, sectionMarkdown: firstSectionMarkdown } = splitIntroAndFirstSection(parsed.beforeImage1)
  const sections = [
    firstSectionMarkdown || stripTemplateMarkers(parsed.beforeImage1),
    stripTemplateMarkers(parsed.betweenImage1And2),
    stripTemplateMarkers([parsed.betweenImage2And3, parsed.afterImage3BeforeEnding].filter(Boolean).join('\n\n')),
  ]
    .slice(0, sectionLimit)
    .map((sectionMarkdown, index) => {
      const { blocks } = collectPreviewMarkdownBlocks(sectionMarkdown)

      return {
        blockIndex: Math.max(blocks.length - 1, 0),
        markdown: sectionMarkdown,
        order: index + 1,
        positionLabel: `第 ${index + 1} 段后`,
        text: stripMarkdownToPlainText(sectionMarkdown),
        title: readFirstSectionHeading(blocks),
      }
    })

  if (fillTrailingSections) {
    while (sections.length < sectionLimit) {
      const fallbackText = sections[sections.length - 1]?.markdown ?? ''
      sections.push(buildEmptyPreviewSection(sections.length + 1, fallbackText))
    }
  }

  return {
    introMarkdown,
    endingMarkdown: stripTemplateMarkers(parsed.endingMarkdown),
    sections,
  }
}

export function buildPreviewSections(markdown = '', options = {}) {
  const placeholderSections = buildPlaceholderSections(markdown, options)

  if (placeholderSections) {
    return placeholderSections.sections
  }

  const { blocks, headingBlockIndices, paragraphBlockIndices } = collectPreviewMarkdownBlocks(markdown)
  const normalizedMarkdown = stripTemplateMarkers(markdown)
  const fillTrailingSections = options.fillTrailingSections ?? true
  const maxSections = Number(options.maxSections ?? ARTICLE_PREVIEW_SECTION_COUNT)
  const sectionLimit = Number.isFinite(maxSections) && maxSections > 0 ? Math.floor(maxSections) : ARTICLE_PREVIEW_SECTION_COUNT
  const sections = []

  if (headingBlockIndices.length >= sectionLimit) {
    for (let index = 0; index < sectionLimit; index += 1) {
      const startBlockIndex = headingBlockIndices[index]
      const nextHeadingBlockIndex = index === headingBlockIndices.length - 1 ? blocks.length : headingBlockIndices[index + 1]
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
    const groupCount = Math.min(sectionLimit, paragraphBlockIndices.length)
    const baseGroupSize = Math.floor(paragraphBlockIndices.length / groupCount)
    const extraItems = paragraphBlockIndices.length % groupCount
    let paragraphCursor = 0

    for (let index = 0; index < groupCount; index += 1) {
      const currentGroupSize = baseGroupSize + (index < extraItems ? 1 : 0)
      const startParagraphPointer = paragraphCursor
      const endParagraphPointer = index === groupCount - 1 ? paragraphBlockIndices.length - 1 : paragraphCursor + currentGroupSize - 1
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
    return Array.from({ length: sectionLimit }, (_, index) => buildEmptyPreviewSection(index + 1, normalizedMarkdown))
  }

  if (fillTrailingSections) {
    while (sections.length < sectionLimit) {
      const fallbackText = sections[sections.length - 1]?.markdown ?? normalizedMarkdown
      sections.push(buildEmptyPreviewSection(sections.length + 1, fallbackText))
    }
  }

  return sections.slice(0, sectionLimit)
}

export function buildImageSelectionFromMatchResult({ matchResult, sections = [], versionId } = {}) {
  const referenceAssets = Array.isArray(matchResult?.referenceAssets)
    ? matchResult.referenceAssets.slice(0, ARTICLE_PREVIEW_SECTION_COUNT)
    : []

  const slots = Array.from({ length: ARTICLE_PREVIEW_SECTION_COUNT }, (_, index) => {
    const asset = referenceAssets[index] ?? null
    const currentSection = sections[index] ?? buildEmptyPreviewSection(index + 1)

    return {
      assetId: asset?.id ?? '',
      blockIndex: Number.isFinite(currentSection?.blockIndex) ? currentSection.blockIndex : 0,
      order: index + 1,
      paragraphIndex: index,
      positionLabel: `第 ${index + 1} 段后`,
      sectionOrder: index + 1,
      slotId: `image-${index + 1}`,
      status: asset?.path ? 'matched' : 'missing',
    }
  })

  return {
    matchedAt: new Date().toISOString(),
    referenceAssets,
    sourceVersionId: versionId ?? null,
    slots,
  }
}

export function getRenderablePreviewSlots({ imageSelection, liveAssetMap = null, versionId } = {}) {
  if (!versionId || imageSelection?.sourceVersionId !== versionId) {
    return []
  }

  const referenceAssets = Array.isArray(imageSelection?.referenceAssets) ? imageSelection.referenceAssets : []
  const slots = Array.isArray(imageSelection?.slots) ? imageSelection.slots : []
  const snapshotAssetMap = new Map(referenceAssets.map((asset) => [asset.id, asset]))
  const hasLiveAssetMap = liveAssetMap instanceof Map

  return Array.from({ length: ARTICLE_PREVIEW_SECTION_COUNT }, (_, index) => {
    const slot = slots.find((item) => Number(item?.sectionOrder || item?.order) === index + 1) ?? null
    const snapshotAsset = slot?.assetId ? snapshotAssetMap.get(slot.assetId) ?? null : referenceAssets[index] ?? null
    const liveAsset = hasLiveAssetMap && slot?.assetId ? liveAssetMap.get(slot.assetId) ?? null : null
    const asset = liveAsset ?? snapshotAsset

    return {
      ...slot,
      asset,
      order: index + 1,
      placeholderLabel: `正文配图 ${index + 1}`,
      positionLabel: `第 ${index + 1} 段后`,
      sectionOrder: index + 1,
      slotId: slot?.slotId || `image-${index + 1}`,
      status: asset?.path ? 'matched' : 'missing',
    }
  })
}

export function resolveAbsoluteAssetPath(src = '', origin = '') {
  if (!src || src.startsWith(MISSING_PREVIEW_ASSET_SRC_PREFIX) || src.startsWith('data:')) {
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

function FixedOrPlaceholderImage({
  alt = '',
  asset = null,
  label = '图片占位',
  origin = '',
  style = {},
  placeholderStyle = {},
}) {
  const resolvedSrc = resolveAbsoluteAssetPath(asset?.path || '', origin)
  const src = resolvedSrc || buildPlaceholderImageDataUri(label)

  return (
    <img
      alt={alt || label}
      loading="lazy"
      src={src}
      style={{
        display: 'block',
        width: '100%',
        ...style,
        ...(!resolvedSrc ? placeholderStyle : null),
      }}
    />
  )
}

function createMarkdownComponents() {
  return {
    h1: ({ node, ...props }) => (
      <h2
        style={{
          color: '#111111',
          fontSize: '18px',
          fontWeight: 700,
          lineHeight: 1.7,
          margin: '32px 0 16px',
        }}
        {...props}
      />
    ),
    h2: ({ node, ...props }) => (
      <h2
        style={{
          color: '#111111',
          fontSize: '18px',
          fontWeight: 700,
          lineHeight: 1.7,
          margin: '32px 0 16px',
        }}
        {...props}
      />
    ),
    h3: ({ node, ...props }) => (
      <h3
        style={{
          color: '#111111',
          fontSize: '17px',
          fontWeight: 700,
          lineHeight: 1.8,
          margin: '28px 0 12px',
        }}
        {...props}
      />
    ),
    p: ({ node, ...props }) => (
      <p
        style={{
          color: '#000000',
          fontSize: '17px',
          lineHeight: 1.9,
          margin: '16px 0 0',
        }}
        {...props}
      />
    ),
    ul: ({ node, ...props }) => (
      <ul
        style={{
          color: '#000000',
          fontSize: '17px',
          lineHeight: 1.9,
          listStyleType: 'disc',
          margin: '16px 0 0',
          paddingLeft: '24px',
        }}
        {...props}
      />
    ),
    ol: ({ node, ...props }) => (
      <ol
        style={{
          color: '#000000',
          fontSize: '17px',
          lineHeight: 1.9,
          listStyleType: 'decimal',
          margin: '16px 0 0',
          paddingLeft: '24px',
        }}
        {...props}
      />
    ),
    li: ({ node, ...props }) => <li style={{ marginBottom: '8px', paddingLeft: '4px' }} {...props} />,
    strong: ({ node, ...props }) => <strong style={{ color: '#000000', fontWeight: 700 }} {...props} />,
    blockquote: ({ node, ...props }) => (
      <blockquote
        style={{
          borderLeft: '2px solid rgba(0,0,0,0.15)',
          color: 'rgba(0,0,0,0.72)',
          fontSize: '15px',
          lineHeight: 1.9,
          margin: '20px 0 0',
          paddingLeft: '16px',
        }}
        {...props}
      />
    ),
    img: ({ node, alt = '', src = '', ...props }) => (
      <img
        alt={alt}
        loading="lazy"
        src={src}
        style={{
          borderRadius: '8px',
          display: 'block',
          margin: '24px 0',
          width: '100%',
        }}
        {...props}
      />
    ),
    hr: ({ node, ...props }) => (
      <hr
        style={{
          border: 'none',
          borderTop: '1px solid rgba(0,0,0,0.08)',
          margin: '28px 0',
        }}
        {...props}
      />
    ),
    table: ({ node, ...props }) => (
      <div
        style={{
          border: '1px solid rgba(0,0,0,0.08)',
          borderRadius: '8px',
          marginTop: '20px',
          overflowX: 'auto',
        }}
      >
        <table style={{ borderCollapse: 'collapse', width: '100%' }} {...props} />
      </div>
    ),
    thead: ({ node, ...props }) => <thead style={{ backgroundColor: '#f5f5f5' }} {...props} />,
    tr: ({ node, ...props }) => <tr style={{ borderTop: '1px solid rgba(0,0,0,0.08)' }} {...props} />,
    th: ({ node, ...props }) => (
      <th
        style={{
          fontSize: '13px',
          fontWeight: 600,
          lineHeight: 1.7,
          padding: '12px 14px',
          textAlign: 'left',
          verticalAlign: 'top',
        }}
        {...props}
      />
    ),
    td: ({ node, ...props }) => (
      <td
        style={{
          color: '#000000',
          fontSize: '15px',
          lineHeight: 1.85,
          padding: '12px 14px',
          verticalAlign: 'top',
        }}
        {...props}
      />
    ),
  }
}

function renderMarkdown(markdown = '', components) {
  const normalized = stripTemplateMarkers(markdown)

  if (!normalized) {
    return null
  }

  return (
    <ReactMarkdown components={components} remarkPlugins={[remarkGfm]}>
      {normalized}
    </ReactMarkdown>
  )
}

function buildPreviewContentParts(bodyMarkdown = '') {
  const placeholderSections = buildPlaceholderSections(bodyMarkdown, {
    fillTrailingSections: true,
    maxSections: ARTICLE_PREVIEW_SECTION_COUNT,
  })

  if (placeholderSections) {
    return {
      endingMarkdown: placeholderSections.endingMarkdown,
      introMarkdown: placeholderSections.introMarkdown,
      sections: placeholderSections.sections,
    }
  }

  return {
    endingMarkdown: '',
    introMarkdown: extractPreviewLeadingMarkdown(bodyMarkdown),
    sections: buildPreviewSections(bodyMarkdown, {
      fillTrailingSections: true,
      maxSections: ARTICLE_PREVIEW_SECTION_COUNT,
    }),
  }
}

function buildPreviewPlainText({ bodyMarkdown = '', fixedLayoutConfig = null, penName = '' }) {
  const { introMarkdown, sections, endingMarkdown } = buildPreviewContentParts(bodyMarkdown)
  const guideText = fixedLayoutConfig?.endingText?.content?.trim() || DEFAULT_ENDING_GUIDE_TEXT
  const parts = [
    stripMarkdownToPlainText(introMarkdown),
    ...sections.map((section) => stripMarkdownToPlainText(section.markdown)),
    stripMarkdownToPlainText(endingMarkdown),
    '▽',
    guideText,
    `作者：${penName?.trim() || '未署名'}`,
    `来源：${PREVIEW_SOURCE_ACCOUNT_NAME}`,
    PREVIEW_SOURCE_ACCOUNT_NAME,
    '▲ 长按识别二维码 关注我们',
  ]

  return parts.filter(Boolean).join('\n\n').trim()
}

function FixedTemplateArticle({
  bodyMarkdown = '',
  fixedLayoutConfig = null,
  imageSlots = [],
  origin = '',
  penName = '',
}) {
  const markdownComponents = createMarkdownComponents()
  const { introMarkdown, sections, endingMarkdown } = buildPreviewContentParts(bodyMarkdown)
  const previewSlots = Array.from({ length: ARTICLE_PREVIEW_SECTION_COUNT }, (_, index) => {
    const matchedSlot =
      (Array.isArray(imageSlots) ? imageSlots : []).find((slot) => Number(slot?.sectionOrder || slot?.order) === index + 1) ?? null

    return (
      matchedSlot ?? {
        order: index + 1,
        sectionOrder: index + 1,
        status: 'placeholder',
      }
    )
  })
  const endingGuideText = fixedLayoutConfig?.endingText?.content?.trim() || DEFAULT_ENDING_GUIDE_TEXT

  return (
    <div
      style={{
        backgroundColor: '#ffffff',
        boxSizing: 'border-box',
        color: '#000000',
        fontFamily: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
        width: '100%',
      }}
    >
      <article
        style={{
          boxSizing: 'border-box',
          margin: '0 auto',
          maxWidth: `${FIXED_TEMPLATE_MAX_WIDTH}px`,
          padding: '0 16px 48px',
          width: '100%',
        }}
      >
        <FixedOrPlaceholderImage
          alt={FIXED_LAYOUT_SLOT_META.heroGif.label}
          asset={fixedLayoutConfig?.heroGif}
          label={FIXED_LAYOUT_SLOT_META.heroGif.label}
          origin={origin}
          placeholderStyle={{ backgroundColor: '#eef2ff' }}
          style={{
            borderRadius: '8px',
            margin: '0 0 24px',
            objectFit: 'cover',
          }}
        />

        <FixedOrPlaceholderImage
          alt={FIXED_LAYOUT_SLOT_META.guideFollow.label}
          asset={fixedLayoutConfig?.guideFollow}
          label={FIXED_LAYOUT_SLOT_META.guideFollow.label}
          origin={origin}
          placeholderStyle={{ backgroundColor: '#eef6ff' }}
          style={{
            borderRadius: '8px',
            margin: '0 0 28px',
            objectFit: 'cover',
          }}
        />

        {renderMarkdown(introMarkdown, markdownComponents)}

        {sections.map((section, index) => (
          <section key={`section-${section.order}`}>
            {renderMarkdown(section.markdown, markdownComponents)}
            <FixedOrPlaceholderImage
              alt={`正文配图 ${index + 1}`}
              asset={previewSlots[index]?.asset}
              label={previewSlots[index]?.placeholderLabel || `正文配图 ${index + 1}`}
              origin={origin}
              style={{
                borderRadius: '8px',
                margin: '24px 0 0',
                objectFit: 'cover',
              }}
            />
          </section>
        ))}

        {renderMarkdown(endingMarkdown, markdownComponents)}

        <div
          style={{
            color: '#111111',
            fontSize: '17px',
            fontWeight: 700,
            lineHeight: 1.9,
            marginTop: '28px',
            textAlign: 'center',
          }}
        >
          ▽
        </div>

        <p
          style={{
            color: '#000000',
            fontSize: '17px',
            fontWeight: 700,
            lineHeight: 1.9,
            margin: '16px 0 0',
          }}
        >
          {endingGuideText}
        </p>

        <div
          style={{
            color: '#8a8a8a',
            fontSize: '13px',
            lineHeight: 1.8,
            marginTop: '20px',
          }}
        >
          <div>作者：{penName?.trim() || '未署名'}</div>
          <div>来源：{PREVIEW_SOURCE_ACCOUNT_NAME}</div>
        </div>

        <div
          style={{
            color: '#556b4f',
            fontSize: '18px',
            fontWeight: 700,
            lineHeight: 1.4,
            marginTop: '18px',
            textAlign: 'center',
          }}
        >
          {PREVIEW_SOURCE_ACCOUNT_NAME}
        </div>

        <div
          style={{
            borderTop: '1px solid rgba(0,0,0,0.12)',
            margin: '12px auto 0',
            width: '120px',
          }}
        />

        <div style={{ marginTop: '24px', textAlign: 'center' }}>
          <FixedOrPlaceholderImage
            alt={FIXED_LAYOUT_SLOT_META.qrImage.label}
            asset={fixedLayoutConfig?.qrImage}
            label={FIXED_LAYOUT_SLOT_META.qrImage.label}
            origin={origin}
            style={{
              borderRadius: '8px',
              margin: '0 auto',
              maxWidth: '160px',
              width: '160px',
            }}
          />
        </div>

        <div
          style={{
            color: '#666666',
            fontSize: '13px',
            lineHeight: 1.8,
            marginTop: '12px',
            textAlign: 'center',
          }}
        >
          ▲ 长按识别二维码 关注我们
        </div>

        <FixedOrPlaceholderImage
          alt={FIXED_LAYOUT_SLOT_META.footerGif.label}
          asset={fixedLayoutConfig?.footerGif}
          label={FIXED_LAYOUT_SLOT_META.footerGif.label}
          origin={origin}
          placeholderStyle={{ backgroundColor: '#f5f5f5' }}
          style={{
            borderRadius: '8px',
            margin: '24px 0 0',
            objectFit: 'cover',
          }}
        />
      </article>
    </div>
  )
}

export function renderArticlePreviewDocument({
  bodyMarkdown = '',
  fixedLayoutConfig = null,
  imageSlots = [],
  origin = '',
  penName = '',
} = {}) {
  const bodyHtml = renderToStaticMarkup(
    <FixedTemplateArticle
      bodyMarkdown={bodyMarkdown}
      fixedLayoutConfig={fixedLayoutConfig}
      imageSlots={imageSlots}
      origin={origin}
      penName={penName}
    />,
  )

  return {
    bodyHtml,
    documentHtml: `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/></head><body style="margin:0;background:#ffffff;">${bodyHtml}</body></html>`,
    plainText: buildPreviewPlainText({
      bodyMarkdown,
      fixedLayoutConfig,
      penName,
    }),
  }
}

export function renderWechatDraftHtml({
  bodyMarkdown = '',
  fixedLayoutConfig = null,
  imageSlots = [],
  origin = '',
  penName = '',
} = {}) {
  const result = renderArticlePreviewDocument({
    bodyMarkdown,
    fixedLayoutConfig,
    imageSlots,
    origin,
    penName,
  })

  return {
    bodyHtml: result.bodyHtml,
    plainText: result.plainText,
  }
}

export function createTemplatePreviewPlaceholderSlots() {
  return Array.from({ length: ARTICLE_PREVIEW_SECTION_COUNT }, (_, index) => ({
    order: index + 1,
    placeholderLabel: `正文配图 ${index + 1}`,
    sectionOrder: index + 1,
    slotId: `image-${index + 1}`,
    status: 'placeholder',
  }))
}
