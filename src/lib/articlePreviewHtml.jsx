import ReactMarkdown from 'react-markdown'
import { renderToStaticMarkup } from 'react-dom/server'
import remarkGfm from 'remark-gfm'
import {
  FIXED_LAYOUT_QR_WIDTH_PX,
  FIXED_LAYOUT_SLOT_META,
  FIXED_LAYOUT_SPACING_PRESETS,
  getFixedLayoutImageDisplaySlots,
} from '../../shared/fixedLayoutConfig.js'

export const ARTICLE_PREVIEW_SECTION_COUNT = 3
export const MISSING_PREVIEW_ASSET_SRC_PREFIX = 'asset-missing://'

const PREVIEW_SOURCE_ACCOUNT_NAME = '煮酒问人生'
const FIXED_TEMPLATE_MAX_WIDTH = 677
const FIXED_TEMPLATE_HORIZONTAL_PADDING = 16
const FIXED_TEMPLATE_INNER_MAX_WIDTH = FIXED_TEMPLATE_MAX_WIDTH - FIXED_TEMPLATE_HORIZONTAL_PADDING * 2
const DEFAULT_ENDING_GUIDE_TEXT = '点亮文末“爱心”，愿你往后有光，心里有暖，脚下有路。转发分享，弘扬中华传统文化！'
const PLACEHOLDER_MARKERS = ['[IMAGE_1]', '[IMAGE_2]', '[IMAGE_3]', '[ENDING]']
const PREVIEW_FONT_PRESETS = {
  small: {
    bodyLineHeight: 2.0,
    bodySize: 15,
    blockquoteSize: 14,
    endingGuideSize: 15,
    endingSymbolSize: 16,
    h2Size: 17,
    h3Size: 16,
    metaSize: 12,
    tableCellSize: 14,
    tableHeadSize: 12,
  },
  medium: {
    bodyLineHeight: 2.1,
    bodySize: 16,
    blockquoteSize: 15,
    endingGuideSize: 16,
    endingSymbolSize: 17,
    h2Size: 18,
    h3Size: 17,
    metaSize: 13,
    tableCellSize: 15,
    tableHeadSize: 13,
  },
  large: {
    bodyLineHeight: 2.2,
    bodySize: 17,
    blockquoteSize: 16,
    endingGuideSize: 17,
    endingSymbolSize: 18,
    h2Size: 19,
    h3Size: 18,
    metaSize: 14,
    tableCellSize: 16,
    tableHeadSize: 14,
  },
}
const TEMPLATE_IMAGE_SPACING_MAP = {
  large: 32,
  medium: 24,
  none: 0,
  small: 16,
}
const TEMPLATE_STRUCTURE_BLOCKS = [
  { id: 'title', label: '文章标题', tint: '#eef2ff', type: 'title' },
  { id: 'intro', label: '开头正文', tint: '#eff6ff', type: 'body' },
  { id: 'section-1-title', label: '正文1标题', tint: '#ecfeff', type: 'heading' },
  { id: 'section-1-body', label: '正文1正文', tint: '#f0fdf4', type: 'body' },
  { id: 'section-1-image', label: '正文插图1', tint: '#dbeafe', type: 'image' },
  { id: 'section-2-title', label: '正文2标题', tint: '#fef3c7', type: 'heading' },
  { id: 'section-2-body', label: '正文2正文', tint: '#fff7ed', type: 'body' },
  { id: 'section-2-image', label: '正文插图2', tint: '#fde68a', type: 'image' },
  { id: 'section-3-title', label: '正文3标题', tint: '#fae8ff', type: 'heading' },
  { id: 'section-3-body', label: '正文3正文', tint: '#fdf2f8', type: 'body' },
  { id: 'section-3-image', label: '正文插图3', tint: '#fbcfe8', type: 'image' },
  { id: 'outro-title', label: '结尾标题', tint: '#ede9fe', type: 'heading' },
  { id: 'outro-body', label: '结尾正文', tint: '#f5f3ff', type: 'body' },
  { id: 'blessing', label: '祝福语', tint: '#fef2f2', type: 'body' },
  { id: 'cta', label: '互动引导语', tint: '#f3f4f6', type: 'cta' },
]

function resolveTemplateImageSpacing(preset = 'medium') {
  return TEMPLATE_IMAGE_SPACING_MAP[preset] ?? TEMPLATE_IMAGE_SPACING_MAP.medium
}

function resolveFixedImageWidthStyle(slotConfig = null) {
  if (slotConfig?.slot !== 'qrImage') {
    return {
      maxWidth: '100%',
      width: '100%',
    }
  }

  const canonicalWidth = Number.isInteger(Number(slotConfig?.widthPx)) && Number(slotConfig?.widthPx) > 0 ? Number(slotConfig.widthPx) : FIXED_LAYOUT_QR_WIDTH_PX

  return {
    maxWidth: `${canonicalWidth}px`,
    width: `${canonicalWidth}px`,
  }
}

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

function resolvePreviewFontPreset(fontSize = 'medium') {
  return PREVIEW_FONT_PRESETS[fontSize] ?? PREVIEW_FONT_PRESETS.medium
}

export function stripPreviewHeading(markdown = '') {
  const lines = String(markdown).replace(/\r/g, '').split('\n')

  if (lines[0]?.trim().startsWith('# ')) {
    return lines.slice(1).join('\n').trim()
  }

  return normalizeMarkdown(markdown)
}

function stripFixedTemplateArtifacts(markdown = '') {
  let normalized = normalizeMarkdown(markdown)

  if (!normalized) {
    return ''
  }

  normalized = normalized
    .replace(/\n*\s*▽\s*(?=\n|$)/g, '\n\n')
    .replace(/\n*\s*点亮文末["“]爱心["”][\s\S]*?弘扬中华传统文化！?/g, '')
    .replace(/(?:^|\n)\s*作者：.*?来源：.*?(?=\n|$)/g, '\n')
    .replace(/\n*\s*[▲△]?\s*长按识别二维码\s*关注我们\s*(?=\n|$)/g, '\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return normalized
}

function stripTemplateMarkers(markdown = '') {
  return stripFixedTemplateArtifacts(normalizeMarkdown(markdown)).replace(/\[IMAGE_[123]\]|\[ENDING\]/g, '').trim()
}

export function getReadableDraftBodyMarkdown(markdown = '') {
  return stripTemplateMarkers(stripPreviewHeading(markdown))
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

function readPreviewSectionHeading(markdown = '') {
  const normalized = stripTemplateMarkers(markdown)
  const match = normalized.match(/^##\s+(.+?)(?:\n|$)/)

  if (!match) {
    return null
  }

  return {
    bodyMarkdown: normalized.slice(match[0].length).trim(),
    title: match[1].trim(),
  }
}

function isPreviewOutroHeadingTitle(title = '') {
  return /(写在最后|写到最后|最后|结尾|结语|尾声|收尾)/.test(String(title).trim())
}

function splitPreviewMarkdownBlocks(markdown = '') {
  return stripTemplateMarkers(markdown)
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
}

function isPreviewDividerBlock(block = '') {
  return /^([-*_]){3,}$/.test(String(block).replace(/\s/g, ''))
}

function buildStructuredSection(order, title = '', bodyMarkdown = '') {
  const markdown = [`## ${title}`, bodyMarkdown].filter(Boolean).join('\n\n').trim()
  const { blocks } = collectPreviewMarkdownBlocks(markdown)

  return {
    blockIndex: Math.max(blocks.length - 1, 0),
    bodyMarkdown,
    markdown,
    order,
    positionLabel: `第 ${order} 段后`,
    text: stripMarkdownToPlainText(markdown),
    title,
  }
}

function splitRawPreviewBlocks(markdown = '') {
  return normalizeMarkdown(markdown)
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
}

function isPreviewTemplateMarkerBlock(block = '') {
  return PLACEHOLDER_MARKERS.includes(String(block).trim())
}

function buildPreviewBlockMeta(markdown = '') {
  return splitRawPreviewBlocks(markdown).map((rawBlock, index) => {
    const cleanBlock = stripTemplateMarkers(rawBlock)

    return {
      clean: cleanBlock,
      index,
      isDivider: isPreviewDividerBlock(rawBlock),
      isEndingMarker: rawBlock.trim() === '[ENDING]',
      isHeading: /^##\s+/.test(cleanBlock),
      isTemplateMarker: isPreviewTemplateMarkerBlock(rawBlock),
      raw: rawBlock,
    }
  })
}

function collectRenderablePreviewBlockContents(blockMeta = [], startIndex = 0, endIndex = blockMeta.length) {
  return blockMeta
    .slice(startIndex, endIndex)
    .filter((block) => !block.isDivider && !block.isTemplateMarker && block.clean)
    .map((block) => block.clean)
}

export function analyzeStructuredPreviewDraft(markdown = '', options = {}) {
  const requireTitle = options.requireTitle ?? false
  const normalizedDraft = normalizeMarkdown(markdown)
  const titleMatch = normalizedDraft.match(/^#\s+(.+?)(?:\n|$)/)
  const articleTitle = titleMatch?.[1]?.trim() || ''
  const bodyMarkdown = titleMatch ? normalizedDraft.slice(titleMatch[0].length).trim() : normalizedDraft
  const issues = []

  if (requireTitle && !articleTitle) {
    issues.push('缺少一级标题')
  }

  const blockMeta = buildPreviewBlockMeta(bodyMarkdown)
  const headingIndices = blockMeta.filter((block) => block.isHeading).map((block) => block.index)
  const endingMarkerIndex = blockMeta.findIndex((block) => block.isEndingMarker)
  let outroHeadingIndex = -1
  let sectionHeadingIndices = []

  if (endingMarkerIndex >= 0) {
    const headingsAfterEnding = headingIndices.filter((index) => index > endingMarkerIndex)

    if (headingsAfterEnding.length !== 1) {
      issues.push('结尾结构无法稳定识别')
    }

    outroHeadingIndex = headingsAfterEnding[0] ?? -1
    sectionHeadingIndices = headingIndices.filter((index) => index < endingMarkerIndex)
  } else if (headingIndices.length >= 2) {
    const trailingHeading = readPreviewSectionHeading(blockMeta[headingIndices[headingIndices.length - 1]]?.clean || '')

    if (isPreviewOutroHeadingTitle(trailingHeading?.title || '')) {
      outroHeadingIndex = headingIndices[headingIndices.length - 1]
      sectionHeadingIndices = headingIndices.slice(0, -1)
    } else {
      issues.push('结尾结构无法稳定识别')
      sectionHeadingIndices = headingIndices
    }
  } else {
    if (headingIndices.length === 0) {
      issues.push('主体标题无法稳定识别')
    }

    issues.push('结尾结构无法稳定识别')
  }

  if (sectionHeadingIndices.length === 0) {
    issues.push('主体标题无法稳定识别')
  }

  const introBoundaryIndex = sectionHeadingIndices[0] ?? outroHeadingIndex
  const introMarkdown =
    introBoundaryIndex > 0 ? collectRenderablePreviewBlockContents(blockMeta, 0, introBoundaryIndex).join('\n\n').trim() : ''

  const sections = sectionHeadingIndices.map((headingIndex, index) => {
    const nextHeadingIndex = sectionHeadingIndices[index + 1] ?? outroHeadingIndex
    const heading = readPreviewSectionHeading(blockMeta[headingIndex]?.clean || '')

    if (!heading?.title) {
      issues.push(`正文${index + 1}标题无法稳定识别`)
      return null
    }

    const bodyBlocks = collectRenderablePreviewBlockContents(
      blockMeta,
      headingIndex + 1,
      nextHeadingIndex > -1 ? nextHeadingIndex : blockMeta.length,
    )

    return buildStructuredSection(index + 1, heading.title, bodyBlocks.join('\n\n').trim())
  })

  const outroHeading = outroHeadingIndex > -1 ? readPreviewSectionHeading(blockMeta[outroHeadingIndex]?.clean || '') : null

  if (!outroHeading?.title) {
    issues.push('结尾标题无法稳定识别')
  }

  const outroBlocks =
    outroHeadingIndex > -1 ? collectRenderablePreviewBlockContents(blockMeta, outroHeadingIndex + 1, blockMeta.length) : []
  const blessingMarkdown = outroBlocks.length > 1 ? outroBlocks[outroBlocks.length - 1] : ''
  const outroBodyMarkdown = (outroBlocks.length > 1 ? outroBlocks.slice(0, -1) : outroBlocks).join('\n\n').trim()
  const endingMarkdown = outroHeading?.title ? [`## ${outroHeading.title}`, outroBodyMarkdown].filter(Boolean).join('\n\n').trim() : ''

  if (!outroBodyMarkdown) {
    issues.push('结尾正文无法稳定识别')
  }

  return {
    articleTitle,
    blessingMarkdown,
    bodyMarkdown,
    canPreview: issues.length === 0 && sections.filter(Boolean).length > 0 && Boolean(endingMarkdown),
    endingMarkdown,
    introMarkdown,
    issues: Array.from(new Set(issues)),
    sections: sections.filter(Boolean),
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
  const structuredDraft = analyzeStructuredPreviewDraft(markdown)

  if (structuredDraft.canPreview) {
    const sectionLimit = Math.max(1, Number(options.maxSections ?? ARTICLE_PREVIEW_SECTION_COUNT))
    const sections = structuredDraft.sections.slice(0, sectionLimit)

    if (options.fillTrailingSections ?? true) {
      while (sections.length < sectionLimit) {
        const fallbackText = sections[sections.length - 1]?.markdown ?? ''
        sections.push(buildEmptyPreviewSection(sections.length + 1, fallbackText))
      }
    }

    return sections
  }

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

export function resolveRenderableAssetPath(asset = null, origin = '') {
  const previewUrl = typeof asset?.previewUrl === 'string' ? asset.previewUrl.trim() : ''

  if (previewUrl) {
    return previewUrl
  }

  return resolveAbsoluteAssetPath(asset?.path || '', origin)
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
  const resolvedSrc = resolveRenderableAssetPath(asset, origin)
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

function createMarkdownComponents(fontSize = 'medium') {
  const preset = resolvePreviewFontPreset(fontSize)

  return {
    h1: ({ node, ...props }) => (
      <h2
        style={{
          color: '#111111',
          fontSize: `${preset.h2Size}px`,
          fontWeight: 700,
          lineHeight: 1.7,
          margin: '72px 0 18px',
        }}
        {...props}
      />
    ),
    h2: ({ node, ...props }) => (
      <h2
        style={{
          color: '#111111',
          fontSize: `${preset.h2Size}px`,
          fontWeight: 700,
          lineHeight: 1.7,
          margin: '72px 0 18px',
        }}
        {...props}
      />
    ),
    h3: ({ node, ...props }) => (
      <h3
        style={{
          color: '#111111',
          fontSize: `${preset.h3Size}px`,
          fontWeight: 700,
          lineHeight: 1.8,
          margin: '64px 0 14px',
        }}
        {...props}
      />
    ),
    p: ({ node, ...props }) => (
      <p
        style={{
          color: '#000000',
          fontSize: `${preset.bodySize}px`,
          lineHeight: preset.bodyLineHeight,
          margin: '16px 0 0',
        }}
        {...props}
      />
    ),
    ul: ({ node, ...props }) => (
      <ul
        style={{
          color: '#000000',
          fontSize: `${preset.bodySize}px`,
          lineHeight: preset.bodyLineHeight,
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
          fontSize: `${preset.bodySize}px`,
          lineHeight: preset.bodyLineHeight,
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
          fontSize: `${preset.blockquoteSize}px`,
          lineHeight: preset.bodyLineHeight,
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
    hr: () => null,
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
          fontSize: `${preset.tableHeadSize}px`,
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
          fontSize: `${preset.tableCellSize}px`,
          lineHeight: Math.max(1.85, preset.bodyLineHeight - 0.1),
          padding: '12px 14px',
          verticalAlign: 'top',
        }}
        {...props}
      />
    ),
  }
}

function createWechatClipboardMarkdownComponents(fontSize = 'medium') {
  const preset = resolvePreviewFontPreset(fontSize)

  return {
    h1: ({ node, ...props }) => (
      <h2
        style={{
          color: '#111111',
          fontSize: `${preset.h2Size}px`,
          fontWeight: 700,
          letterSpacing: '0.2px',
          lineHeight: 1.7,
          margin: '72px 0 18px 0',
          textAlign: 'left',
          wordBreak: 'break-word',
        }}
        {...props}
      />
    ),
    h2: ({ node, ...props }) => (
      <h2
        style={{
          color: '#111111',
          fontSize: `${preset.h2Size}px`,
          fontWeight: 700,
          letterSpacing: '0.2px',
          lineHeight: 1.7,
          margin: '72px 0 18px 0',
          textAlign: 'left',
          wordBreak: 'break-word',
        }}
        {...props}
      />
    ),
    h3: ({ node, ...props }) => (
      <h3
        style={{
          color: '#111111',
          fontSize: `${preset.h3Size}px`,
          fontWeight: 700,
          letterSpacing: '0.2px',
          lineHeight: 1.8,
          margin: '64px 0 14px 0',
          textAlign: 'left',
          wordBreak: 'break-word',
        }}
        {...props}
      />
    ),
    p: ({ node, ...props }) => (
      <p
        style={{
          color: '#000000',
          fontSize: `${preset.bodySize}px`,
          letterSpacing: '0.2px',
          lineHeight: preset.bodyLineHeight,
          margin: '0 0 28px 0',
          textAlign: 'left',
          wordBreak: 'break-word',
        }}
        {...props}
      />
    ),
    ul: ({ node, ...props }) => (
      <ul
        style={{
          color: '#000000',
          fontSize: `${preset.bodySize}px`,
          letterSpacing: '0.2px',
          lineHeight: preset.bodyLineHeight,
          listStyleType: 'disc',
          margin: '0 0 28px 0',
          paddingLeft: '24px',
          textAlign: 'left',
          wordBreak: 'break-word',
        }}
        {...props}
      />
    ),
    ol: ({ node, ...props }) => (
      <ol
        style={{
          color: '#000000',
          fontSize: `${preset.bodySize}px`,
          letterSpacing: '0.2px',
          lineHeight: preset.bodyLineHeight,
          listStyleType: 'decimal',
          margin: '0 0 28px 0',
          paddingLeft: '24px',
          textAlign: 'left',
          wordBreak: 'break-word',
        }}
        {...props}
      />
    ),
    li: ({ node, ...props }) => (
      <li
        style={{
          marginBottom: '10px',
          paddingLeft: '4px',
          textAlign: 'left',
          wordBreak: 'break-word',
        }}
        {...props}
      />
    ),
    strong: ({ node, ...props }) => <strong style={{ color: '#000000', fontWeight: 700 }} {...props} />,
    blockquote: ({ node, ...props }) => (
      <blockquote
        style={{
          borderLeft: '2px solid rgba(0,0,0,0.15)',
          color: 'rgba(0,0,0,0.72)',
          fontSize: `${preset.blockquoteSize}px`,
          lineHeight: preset.bodyLineHeight,
          margin: '0 0 28px 0',
          paddingLeft: '16px',
          textAlign: 'left',
          wordBreak: 'break-word',
        }}
        {...props}
      />
    ),
    img: ({ node, alt = '', src = '', ...props }) => (
      <img
        alt={alt}
        src={src}
        style={{
          borderRadius: '8px',
          display: 'block',
          height: 'auto',
          margin: '24px 0 28px 0',
          maxWidth: '100%',
          width: '100%',
        }}
        {...props}
      />
    ),
    hr: () => null,
    table: ({ node, ...props }) => (
      <div
        style={{
          border: '1px solid rgba(0,0,0,0.08)',
          borderRadius: '8px',
          margin: '0 0 28px 0',
          overflowX: 'auto',
          width: '100%',
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
          fontSize: `${preset.tableHeadSize}px`,
          fontWeight: 600,
          lineHeight: 1.7,
          padding: '12px 14px',
          textAlign: 'left',
          verticalAlign: 'top',
          wordBreak: 'break-word',
        }}
        {...props}
      />
    ),
    td: ({ node, ...props }) => (
      <td
        style={{
          color: '#000000',
          fontSize: `${preset.tableCellSize}px`,
          lineHeight: Math.max(1.85, preset.bodyLineHeight - 0.1),
          padding: '12px 14px',
          textAlign: 'left',
          verticalAlign: 'top',
          wordBreak: 'break-word',
        }}
        {...props}
      />
    ),
    code: ({ inline, node, ...props }) => (
      <code
        style={{
          backgroundColor: inline ? 'rgba(15,23,42,0.06)' : '#0f172a',
          borderRadius: inline ? '4px' : '10px',
          color: inline ? '#111111' : '#f8fafc',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          fontSize: inline ? '0.92em' : `${Math.max(12, preset.bodySize - 1)}px`,
          padding: inline ? '2px 5px' : '0',
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
  const structuredDraft = analyzeStructuredPreviewDraft(bodyMarkdown)

  if (structuredDraft.canPreview) {
    return {
      blessingMarkdown: structuredDraft.blessingMarkdown,
      endingMarkdown: structuredDraft.endingMarkdown,
      introMarkdown: structuredDraft.introMarkdown,
      sections: structuredDraft.sections,
    }
  }

  const placeholderSections = buildPlaceholderSections(bodyMarkdown, {
    fillTrailingSections: true,
    maxSections: ARTICLE_PREVIEW_SECTION_COUNT,
  })

  if (placeholderSections) {
    return {
      blessingMarkdown: '',
      endingMarkdown: placeholderSections.endingMarkdown,
      introMarkdown: placeholderSections.introMarkdown,
      sections: placeholderSections.sections,
    }
  }

  return {
    blessingMarkdown: '',
    endingMarkdown: '',
    introMarkdown: extractPreviewLeadingMarkdown(bodyMarkdown),
    sections: buildPreviewSections(bodyMarkdown, {
      fillTrailingSections: true,
      maxSections: ARTICLE_PREVIEW_SECTION_COUNT,
    }),
  }
}

function buildPreviewPlainText({ bodyMarkdown = '', fixedLayoutConfig = null, penName = '' }) {
  const { introMarkdown, sections, endingMarkdown, blessingMarkdown } = buildPreviewContentParts(bodyMarkdown)
  const guideText = fixedLayoutConfig?.endingText?.content?.trim() || DEFAULT_ENDING_GUIDE_TEXT
  const parts = [
    stripMarkdownToPlainText(introMarkdown),
    ...sections.map((section) => stripMarkdownToPlainText(section.markdown)),
    stripMarkdownToPlainText(endingMarkdown),
    stripMarkdownToPlainText(blessingMarkdown),
    '▽',
    guideText,
    `作者：${penName?.trim() || '未署名'}`,
    `来源：${PREVIEW_SOURCE_ACCOUNT_NAME}`,
    '▲ 长按识别二维码 关注我们',
  ]

  return parts.filter(Boolean).join('\n\n').trim()
}

function buildOrderedFixedImageAnchors(fixedLayoutConfig = null) {
  const orderedSlots = getFixedLayoutImageDisplaySlots(fixedLayoutConfig)

  return {
    footerSlot: orderedSlots[3] ?? null,
    qrSlot: orderedSlots[2] ?? null,
    topPrimarySlot: orderedSlots[0] ?? null,
    topSecondarySlot: orderedSlots[1] ?? null,
  }
}

function TemplatePreviewTextBlock({ label = '', tint = '#f3f4f6', type = 'body' }) {
  const isTitle = type === 'title'
  const isHeading = type === 'heading'
  const isCta = type === 'cta'
  const isImage = type === 'image'
  const lines = isTitle ? [80, 62] : isHeading ? [46] : isCta ? [54, 40] : [100, 94, 88, 68]

  return (
    <div
      style={{
        backgroundColor: tint,
        borderRadius: isCta ? '14px' : isImage ? '14px' : '16px',
        padding: isImage ? '12px 14px 14px' : isTitle ? '18px 16px' : isHeading ? '14px 14px' : isCta ? '14px 16px' : '18px 16px',
      }}
    >
      {label ? (
        <div
          style={{
            color: 'rgba(15,23,42,0.56)',
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.02em',
            marginBottom: isImage ? '10px' : '8px',
          }}
        >
          {label}
        </div>
      ) : null}

      {isImage ? (
        <div
          style={{
            backgroundColor: 'rgba(15,23,42,0.12)',
            borderRadius: '12px',
            height: '96px',
            width: '100%',
          }}
        />
      ) : (
        <div style={{ display: 'grid', gap: isTitle ? '10px' : '8px' }}>
          {lines.map((width, index) => (
            <div
              key={`${type}-${index}`}
              style={{
                backgroundColor: 'rgba(15,23,42,0.12)',
                borderRadius: '999px',
                height: isTitle ? '12px' : isHeading ? '10px' : isCta ? '9px' : '8px',
                width: `${width}%`,
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function TemplatePreviewImageBlock({ slotConfig = null, origin = '', selected = false }) {
  const asset = slotConfig?.asset ?? null
  const accent = slotConfig?.accent || '#e5e7eb'
  const spacing = resolveTemplateImageSpacing(slotConfig?.spacingPreset)
  const isQrSlot = slotConfig?.slot === 'qrImage'
  const widthStyle = resolveFixedImageWidthStyle(slotConfig)

  return (
    <div
      style={{
        marginTop: `${spacing}px`,
        textAlign: isQrSlot ? 'center' : 'left',
      }}
    >
      <div
        style={{
          display: 'inline-block',
          ...widthStyle,
        }}
      >
        <FixedOrPlaceholderImage
          alt={slotConfig?.label || '模板图片'}
          asset={asset}
          label=""
          origin={origin}
          placeholderStyle={{ backgroundColor: accent }}
          style={{
            boxSizing: 'border-box',
            display: 'block',
            height: 'auto',
            minHeight: asset?.path ? undefined : isQrSlot ? '180px' : '192px',
            objectFit: 'cover',
            width: '100%',
          }}
        />
      </div>
    </div>
  )
}

function GuideFollowMarker({
  color = '#111111',
  fontSize = '18px',
  marginTop = '12px',
  textAlign = 'center',
}) {
  return (
    <div
      style={{
        color,
        fontSize,
        fontWeight: 700,
        lineHeight: 1.2,
        marginTop,
        textAlign,
      }}
    >
      ▽
    </div>
  )
}

function TemplatePreviewFixedImageSlot({ origin = '', selected = false, slotConfig = null }) {
  if (!slotConfig) {
    return null
  }

  return (
    <>
      <TemplatePreviewImageBlock origin={origin} selected={selected} slotConfig={slotConfig} />
      {slotConfig?.slot === 'guideFollow' ? <GuideFollowMarker /> : null}
    </>
  )
}

export function TemplateStructurePreviewArticle({ fixedLayoutConfig = null, origin = '', selectedSlot = '' }) {
  const { footerSlot, qrSlot, topPrimarySlot, topSecondarySlot } = buildOrderedFixedImageAnchors(fixedLayoutConfig)
  const articleStructureBlocks = TEMPLATE_STRUCTURE_BLOCKS.filter((block) => block.id !== 'cta')

  return (
    <div
      style={{
        backgroundColor: '#ffffff',
        boxSizing: 'border-box',
        color: '#0f172a',
        fontFamily: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
        minHeight: '100%',
        padding: '16px 16px 40px',
        width: '100%',
      }}
    >
      <div style={{ margin: '0 auto', maxWidth: `${FIXED_TEMPLATE_MAX_WIDTH}px` }}>
        <TemplatePreviewFixedImageSlot origin={origin} selected={selectedSlot === topPrimarySlot?.slot} slotConfig={topPrimarySlot} />
        <TemplatePreviewFixedImageSlot origin={origin} selected={selectedSlot === topSecondarySlot?.slot} slotConfig={topSecondarySlot} />

        <div style={{ display: 'grid', gap: '14px', marginTop: '20px' }}>
          {articleStructureBlocks.map((block) => (
            <TemplatePreviewTextBlock key={block.id} label={block.label} tint={block.tint} type={block.type} />
          ))}
        </div>

        <div
          style={{
            color: '#111111',
            fontSize: '18px',
            fontWeight: 700,
            lineHeight: 1.4,
            marginTop: '28px',
            textAlign: 'center',
          }}
        >
          ▽
        </div>

        <div style={{ marginTop: '16px' }}>
          <TemplatePreviewTextBlock label="互动引导语" tint="#f8fafc" type="cta" />
        </div>

        <div style={{ marginTop: '20px' }}>
          <TemplatePreviewFixedImageSlot origin={origin} selected={selectedSlot === qrSlot?.slot} slotConfig={qrSlot} />
        </div>

        <div style={{ marginTop: '12px' }}>
          <TemplatePreviewTextBlock label="二维码提示语" tint="#dcfce7" type="cta" />
        </div>

        <TemplatePreviewFixedImageSlot origin={origin} selected={selectedSlot === footerSlot?.slot} slotConfig={footerSlot} />
      </div>
    </div>
  )
}

function FixedTemplateImageBlock({
  applyDefaultSpacing = true,
  fallbackLabel = '模板图片',
  markerFontSize = '18px',
  origin = '',
  placeholderColor = '#f3f4f6',
  slotConfig = null,
  wrapperStyle = {},
}) {
  if (!slotConfig) {
    return null
  }

  const spacing = resolveTemplateImageSpacing(slotConfig?.spacingPreset)
  const isQrSlot = slotConfig?.slot === 'qrImage'
  const widthStyle = resolveFixedImageWidthStyle(slotConfig)
  const baseWrapperStyle = applyDefaultSpacing
    ? {
        margin: isQrSlot ? `0 auto ${spacing}px` : `0 0 ${spacing}px`,
        textAlign: isQrSlot ? 'center' : 'left',
      }
    : {
        textAlign: isQrSlot ? 'center' : 'left',
      }

  return (
    <div
      style={{
        ...baseWrapperStyle,
        ...wrapperStyle,
      }}
    >
      <FixedOrPlaceholderImage
        alt={slotConfig?.label || fallbackLabel}
        asset={slotConfig?.asset}
        label={slotConfig?.label || fallbackLabel}
        origin={origin}
        placeholderStyle={{ backgroundColor: placeholderColor }}
        style={{
          display: 'block',
          margin: isQrSlot ? '0 auto' : undefined,
          objectFit: 'cover',
          ...widthStyle,
          width: isQrSlot ? widthStyle.width : '100%',
        }}
      />

      {slotConfig?.slot === 'guideFollow' ? <GuideFollowMarker fontSize={markerFontSize} /> : null}
    </div>
  )
}

function WechatClipboardImageBlock({
  applyDefaultSpacing = true,
  fallbackLabel = '模板图片',
  markerFontSize = '18px',
  origin = '',
  placeholderColor = '#f3f4f6',
  slotConfig = null,
  wrapperStyle = {},
}) {
  if (!slotConfig) {
    return null
  }

  const spacing = resolveTemplateImageSpacing(slotConfig?.spacingPreset)
  const isQrSlot = slotConfig?.slot === 'qrImage'
  const widthStyle = resolveFixedImageWidthStyle(slotConfig)
  const baseMargin = applyDefaultSpacing ? `0 0 ${spacing}px 0` : '0'
  const imageStyle = isQrSlot
    ? {
        display: 'block',
        height: 'auto',
        margin: '0 auto',
        objectFit: 'cover',
        verticalAlign: 'top',
        ...widthStyle,
      }
    : {
        display: 'block',
        height: 'auto',
        maxWidth: '100%',
        objectFit: 'cover',
        verticalAlign: 'top',
        width: '100%',
      }

  return (
    <section
      style={{
        fontSize: isQrSlot ? 0 : undefined,
        lineHeight: isQrSlot ? 0 : undefined,
        margin: baseMargin,
        textAlign: isQrSlot ? 'center' : 'left',
        width: '100%',
        ...wrapperStyle,
      }}
    >
      {isQrSlot ? (
        <span
          style={{
            display: 'inline-block',
            verticalAlign: 'top',
            ...widthStyle,
          }}
        >
          <FixedOrPlaceholderImage
            alt={slotConfig?.label || fallbackLabel}
            asset={slotConfig?.asset}
            label={slotConfig?.label || fallbackLabel}
            origin={origin}
            placeholderStyle={{ backgroundColor: placeholderColor }}
            style={imageStyle}
          />
        </span>
      ) : (
        <FixedOrPlaceholderImage
          alt={slotConfig?.label || fallbackLabel}
          asset={slotConfig?.asset}
          label={slotConfig?.label || fallbackLabel}
          origin={origin}
          placeholderStyle={{ backgroundColor: placeholderColor }}
          style={imageStyle}
        />
      )}

      {slotConfig?.slot === 'guideFollow' ? (
        <p
          style={{
            textAlign: 'center',
            margin: '12px 0 0 0',
          }}
        >
          <span
            style={{
              color: '#111111',
              display: 'inline-block',
              fontSize: markerFontSize,
              fontWeight: 700,
              lineHeight: 1.2,
              verticalAlign: 'top',
            }}
          >
            ▽
          </span>
        </p>
      ) : null}
    </section>
  )
}

function FixedTemplateArticle({
  bodyMarkdown = '',
  fontSize = 'medium',
  fixedLayoutConfig = null,
  imageSlots = [],
  origin = '',
  penName = '',
  structuredContent = null,
}) {
  const markdownComponents = createMarkdownComponents(fontSize)
  const fontPreset = resolvePreviewFontPreset(fontSize)
  const { introMarkdown, sections, endingMarkdown, blessingMarkdown } = structuredContent ?? buildPreviewContentParts(bodyMarkdown)
  const { footerSlot, qrSlot, topPrimarySlot, topSecondarySlot } = buildOrderedFixedImageAnchors(fixedLayoutConfig)
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
  const qrGap = Math.max(8, Math.round(resolveTemplateImageSpacing(qrSlot?.spacingPreset) / 3))

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
        <FixedTemplateImageBlock
          fallbackLabel={FIXED_LAYOUT_SLOT_META.heroGif.label}
          origin={origin}
          placeholderColor={topPrimarySlot?.accent || '#eef2ff'}
          slotConfig={topPrimarySlot}
        />

        <FixedTemplateImageBlock
          fallbackLabel={FIXED_LAYOUT_SLOT_META.guideFollow.label}
          origin={origin}
          placeholderColor={topSecondarySlot?.accent || '#eef6ff'}
          slotConfig={topSecondarySlot}
          markerFontSize={`${fontPreset.endingSymbolSize}px`}
        />

        {renderMarkdown(introMarkdown, markdownComponents)}

        {sections.map((section, index) => (
          <section key={`section-${section.order}`}>
            {renderMarkdown(section.markdown, markdownComponents)}
            {index < ARTICLE_PREVIEW_SECTION_COUNT ? (
              <FixedOrPlaceholderImage
                alt={`正文配图 ${index + 1}`}
                asset={previewSlots[index]?.asset}
                label={previewSlots[index]?.placeholderLabel || `正文配图 ${index + 1}`}
                origin={origin}
                style={{
                  borderRadius: '8px',
                  margin: '24px 0 72px',
                  objectFit: 'cover',
                }}
              />
            ) : null}
          </section>
        ))}

        {renderMarkdown(endingMarkdown, markdownComponents)}
        {renderMarkdown(blessingMarkdown, markdownComponents)}

        <div
          style={{
            color: '#111111',
            fontSize: `${fontPreset.endingSymbolSize}px`,
            fontWeight: 700,
            lineHeight: fontPreset.bodyLineHeight,
            marginTop: '28px',
            textAlign: 'center',
          }}
        >
          ▽
        </div>

        <p
          style={{
            color: '#000000',
            fontSize: `${fontPreset.endingGuideSize}px`,
            fontWeight: 700,
            lineHeight: 1.7,
            margin: '16px 0 0',
          }}
        >
          {endingGuideText}
        </p>

        <div
          style={{
            color: '#8a8a8a',
            fontSize: `${fontPreset.metaSize}px`,
            lineHeight: 1.8,
            marginTop: '12px',
            whiteSpace: 'pre-wrap',
          }}
        >
          {`作者：${penName?.trim() || '未署名'}    来源：${PREVIEW_SOURCE_ACCOUNT_NAME}`}
        </div>

        <section
          style={{
            marginTop: `${qrGap}px`,
            textAlign: 'center',
            width: '100%',
          }}
        >
          <FixedTemplateImageBlock
            applyDefaultSpacing={false}
            fallbackLabel={FIXED_LAYOUT_SLOT_META.qrImage.label}
            origin={origin}
            placeholderColor={qrSlot?.accent || '#ede9fe'}
            slotConfig={qrSlot}
            markerFontSize={`${fontPreset.endingSymbolSize}px`}
          />

          <div style={{ marginTop: '4px', textAlign: 'center' }}>
            <div
              style={{
                backgroundColor: '#556b4f',
                borderRadius: '10px',
                color: '#ffffff',
                display: 'inline-block',
                fontSize: '13px',
                lineHeight: 1.4,
                padding: '6px 12px',
              }}
            >
              ▲ 长按识别二维码 关注我们
            </div>
          </div>
        </section>

        <FixedTemplateImageBlock
          applyDefaultSpacing={false}
          fallbackLabel={FIXED_LAYOUT_SLOT_META.footerGif.label}
          origin={origin}
          placeholderColor={footerSlot?.accent || '#f5f5f5'}
          slotConfig={footerSlot}
          markerFontSize={`${fontPreset.endingSymbolSize}px`}
          wrapperStyle={{
            marginTop: `${resolveTemplateImageSpacing(footerSlot?.spacingPreset)}px`,
          }}
        />
      </article>
    </div>
  )
}

function WechatClipboardArticle({
  bodyMarkdown = '',
  fontSize = 'medium',
  fixedLayoutConfig = null,
  imageSlots = [],
  origin = '',
  penName = '',
  structuredContent = null,
}) {
  const markdownComponents = createWechatClipboardMarkdownComponents(fontSize)
  const fontPreset = resolvePreviewFontPreset(fontSize)
  const { introMarkdown, sections, endingMarkdown, blessingMarkdown } = structuredContent ?? buildPreviewContentParts(bodyMarkdown)
  const { footerSlot, qrSlot, topPrimarySlot, topSecondarySlot } = buildOrderedFixedImageAnchors(fixedLayoutConfig)
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
  const qrGap = Math.max(8, Math.round(resolveTemplateImageSpacing(qrSlot?.spacingPreset) / 3))
  const qrImageSrc = resolveRenderableAssetPath(qrSlot?.asset, origin) || buildPlaceholderImageDataUri(FIXED_LAYOUT_SLOT_META.qrImage.label)

  return (
    <article
      style={{
        boxSizing: 'border-box',
        color: '#000000',
        fontFamily: '"PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
        margin: '0',
        padding: '0',
        width: '100%',
      }}
    >
      <WechatClipboardImageBlock
        fallbackLabel={FIXED_LAYOUT_SLOT_META.heroGif.label}
        origin={origin}
        placeholderColor={topPrimarySlot?.accent || '#eef2ff'}
        slotConfig={topPrimarySlot}
      />

      <WechatClipboardImageBlock
        fallbackLabel={FIXED_LAYOUT_SLOT_META.guideFollow.label}
        origin={origin}
        placeholderColor={topSecondarySlot?.accent || '#eef6ff'}
        slotConfig={topSecondarySlot}
        markerFontSize={`${fontPreset.endingSymbolSize}px`}
      />

      {renderMarkdown(introMarkdown, markdownComponents)}

      {sections.map((section, index) => (
        <section key={`wechat-section-${section.order}`} style={{ margin: '0', padding: '0' }}>
          {renderMarkdown(section.markdown, markdownComponents)}
          {index < ARTICLE_PREVIEW_SECTION_COUNT ? (
            <img
              alt={`正文配图 ${index + 1}`}
              src={resolveRenderableAssetPath(previewSlots[index]?.asset, origin) || buildPlaceholderImageDataUri(`正文配图 ${index + 1}`)}
              style={{
                borderRadius: '8px',
                display: 'block',
                height: 'auto',
                margin: '24px 0 72px 0',
                maxWidth: '100%',
                objectFit: 'cover',
                width: '100%',
              }}
            />
          ) : null}
        </section>
      ))}

      {renderMarkdown(endingMarkdown, markdownComponents)}
      {renderMarkdown(blessingMarkdown, markdownComponents)}

      <p
        style={{
          textAlign: 'center',
          margin: '28px 0 0 0',
        }}
      >
        <span
          style={{
            color: '#111111',
            display: 'inline-block',
            fontSize: `${fontPreset.endingSymbolSize}px`,
            fontWeight: 700,
            lineHeight: 1.4,
            verticalAlign: 'top',
          }}
        >
          ▽
        </span>
      </p>

      <p
        style={{
          color: '#000000',
          fontSize: `${fontPreset.endingGuideSize}px`,
          fontWeight: 700,
          lineHeight: 1.7,
          margin: '16px 0 0 0',
          textAlign: 'left',
          wordBreak: 'break-word',
        }}
      >
        {endingGuideText}
      </p>

      <p
        style={{
          color: '#8a8a8a',
          fontSize: `${fontPreset.metaSize}px`,
          lineHeight: 1.8,
          margin: '12px 0 0 0',
          textAlign: 'left',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {`作者：${penName?.trim() || '未署名'}    来源：${PREVIEW_SOURCE_ACCOUNT_NAME}`}
      </p>

      <section
        style={{
          marginTop: `${qrGap}px`,
          width: '100%',
        }}
      >
        <p style={{ lineHeight: 0, margin: '0' }}>
          <img
            alt={FIXED_LAYOUT_SLOT_META.qrImage.label}
            src={qrImageSrc}
            style={{
              display: 'block',
              height: 'auto',
              margin: '0 auto',
              maxWidth: `${FIXED_LAYOUT_QR_WIDTH_PX}px`,
              objectFit: 'cover',
              verticalAlign: 'top',
              width: `${FIXED_LAYOUT_QR_WIDTH_PX}px`,
            }}
          />
        </p>

        <p style={{ margin: '4px 0 0 0', textAlign: 'center', width: '100%' }}>
          <span
            style={{
              backgroundColor: '#556b4f',
              borderRadius: '10px',
              color: '#ffffff',
              display: 'inline-block',
              fontSize: '13px',
              lineHeight: 1.4,
              padding: '6px 12px',
              whiteSpace: 'nowrap',
            }}
          >
            ▲ 长按识别二维码 关注我们
          </span>
        </p>
      </section>

      <WechatClipboardImageBlock
        applyDefaultSpacing={false}
        fallbackLabel={FIXED_LAYOUT_SLOT_META.footerGif.label}
        origin={origin}
        placeholderColor={footerSlot?.accent || '#f5f5f5'}
        slotConfig={footerSlot}
        wrapperStyle={{
          marginTop: `${resolveTemplateImageSpacing(footerSlot?.spacingPreset)}px`,
        }}
      />
    </article>
  )
}

function resolveStructuredRenderContent(structuredContent = null) {
  if (!structuredContent?.canPreview) {
    return null
  }

  return {
    blessingMarkdown: structuredContent.blessingMarkdown,
    endingMarkdown: structuredContent.endingMarkdown,
    introMarkdown: structuredContent.introMarkdown,
    sections: structuredContent.sections,
  }
}

export function renderArticlePreviewDocument({
  bodyMarkdown = '',
  fontSize = 'medium',
  fixedLayoutConfig = null,
  imageSlots = [],
  origin = '',
  penName = '',
  structuredContent = null,
} = {}) {
  if (structuredContent && !structuredContent.canPreview) {
    return {
      bodyHtml: '',
      documentHtml: '',
      plainText: '',
      valid: false,
    }
  }

  const bodyHtml = renderToStaticMarkup(
    <FixedTemplateArticle
      bodyMarkdown={bodyMarkdown}
      fontSize={fontSize}
      fixedLayoutConfig={fixedLayoutConfig}
      imageSlots={imageSlots}
      origin={origin}
      penName={penName}
      structuredContent={resolveStructuredRenderContent(structuredContent)}
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
    valid: true,
  }
}

export function renderWechatClipboardHtml({
  bodyMarkdown = '',
  fontSize = 'medium',
  fixedLayoutConfig = null,
  imageSlots = [],
  origin = '',
  penName = '',
  structuredContent = null,
} = {}) {
  if (structuredContent && !structuredContent.canPreview) {
    return {
      bodyHtml: '',
      plainText: '',
      valid: false,
    }
  }

  const bodyHtml = renderToStaticMarkup(
    <WechatClipboardArticle
      bodyMarkdown={bodyMarkdown}
      fixedLayoutConfig={fixedLayoutConfig}
      fontSize={fontSize}
      imageSlots={imageSlots}
      origin={origin}
      penName={penName}
      structuredContent={resolveStructuredRenderContent(structuredContent)}
    />,
  )

  return {
    bodyHtml,
    plainText: buildPreviewPlainText({
      bodyMarkdown,
      fixedLayoutConfig,
      penName,
    }),
    valid: true,
  }
}

export function renderWechatDraftHtml({
  bodyMarkdown = '',
  fontSize = 'medium',
  fixedLayoutConfig = null,
  imageSlots = [],
  origin = '',
  penName = '',
  structuredContent = null,
} = {}) {
  const result = renderArticlePreviewDocument({
    bodyMarkdown,
    fontSize,
    fixedLayoutConfig,
    imageSlots,
    origin,
    penName,
    structuredContent,
  })

  return {
    bodyHtml: result.bodyHtml,
    plainText: result.plainText,
    valid: result.valid,
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
