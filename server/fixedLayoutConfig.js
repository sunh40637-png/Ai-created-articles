import path from 'node:path'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import {
  createEmptyFixedLayoutImageSlotConfig,
  createEmptyFixedLayoutConfig,
  FIXED_LAYOUT_ALLOWED_MIME_TYPES,
  FIXED_LAYOUT_IMAGE_SLOT_IDS,
  isValidFixedLayoutImageSlot,
  normalizeFixedLayoutMetrics,
  normalizeFixedLayoutQrWidthPx,
  normalizeFixedLayoutSpacingPreset,
} from '../shared/fixedLayoutConfig.js'

export const FIXED_LAYOUT_ASSETS_DIR = path.resolve(process.cwd(), 'public/assets/fixed-content')
export const FIXED_LAYOUT_CONFIG_PATH = path.join(FIXED_LAYOUT_ASSETS_DIR, 'config.json')

const MIME_EXTENSION_MAP = {
  'image/gif': '.gif',
  'image/jpeg': '.jpg',
  'image/png': '.png',
}

function createFixedLayoutConfigError(message, status = 400) {
  const error = new Error(message)
  error.status = status
  return error
}

function normalizeAssetRecord(asset) {
  if (!asset || typeof asset !== 'object') {
    return null
  }

  const pathValue = typeof asset.path === 'string' ? asset.path.trim() : ''

  if (!pathValue.startsWith('/assets/fixed-content/')) {
    return null
  }

  return {
    filename: typeof asset.filename === 'string' ? asset.filename.trim() : '',
    mimeType: typeof asset.mimeType === 'string' ? asset.mimeType.trim() : '',
    path: pathValue,
    uploadedAt: typeof asset.uploadedAt === 'string' && asset.uploadedAt.trim() ? asset.uploadedAt.trim() : null,
  }
}

function cloneConfig(value) {
  return JSON.parse(JSON.stringify(value))
}

function normalizeImageSlotConfig(slot, value) {
  const fallback = createEmptyFixedLayoutImageSlotConfig(slot)
  const legacyAsset = normalizeAssetRecord(value)

  if (legacyAsset) {
    return {
      ...fallback,
      asset: legacyAsset,
    }
  }

  if (!value || typeof value !== 'object') {
    return fallback
  }

  return {
    ...fallback,
    asset: normalizeAssetRecord(value?.asset),
    spacingPreset: normalizeFixedLayoutSpacingPreset(value?.spacingPreset),
    widthPx: slot === 'qrImage' ? normalizeFixedLayoutQrWidthPx(value?.widthPx) : null,
  }
}

function normalizeFixedLayoutConfig(config) {
  return {
    footerGif: normalizeImageSlotConfig('footerGif', config?.footerGif),
    guideFollow: normalizeImageSlotConfig('guideFollow', config?.guideFollow),
    heroGif: normalizeImageSlotConfig('heroGif', config?.heroGif),
    metrics: normalizeFixedLayoutMetrics(config?.metrics),
    qrImage: normalizeImageSlotConfig('qrImage', config?.qrImage),
    sectionAvatar: normalizeImageSlotConfig('sectionAvatar', config?.sectionAvatar),
  }
}

async function ensureFixedLayoutDir() {
  await mkdir(FIXED_LAYOUT_ASSETS_DIR, { recursive: true })
}

async function removeStoredAsset(asset) {
  const assetPath = typeof asset?.path === 'string' ? asset.path.trim() : ''

  if (!assetPath.startsWith('/assets/fixed-content/')) {
    return
  }

  const absolutePath = path.join(process.cwd(), 'public', assetPath.replace(/^\/assets\//, 'assets/'))

  try {
    await unlink(absolutePath)
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error
    }
  }
}

function resolveUploadExtension(file) {
  const mimeType = typeof file?.type === 'string' ? file.type.trim().toLowerCase() : ''

  if (mimeType && MIME_EXTENSION_MAP[mimeType]) {
    return MIME_EXTENSION_MAP[mimeType]
  }

  const originalName = typeof file?.name === 'string' ? file.name.trim() : ''
  const extension = path.extname(originalName).toLowerCase()

  if (['.gif', '.png', '.jpg', '.jpeg'].includes(extension)) {
    return extension === '.jpeg' ? '.jpg' : extension
  }

  return ''
}

export async function readFixedLayoutConfig() {
  await ensureFixedLayoutDir()

  try {
    const raw = await readFile(FIXED_LAYOUT_CONFIG_PATH, 'utf8')
    return normalizeFixedLayoutConfig(JSON.parse(raw))
  } catch (error) {
    if (error.code === 'ENOENT') {
      return createEmptyFixedLayoutConfig()
    }

    throw error
  }
}

export async function writeFixedLayoutConfig(config) {
  await ensureFixedLayoutDir()
  const normalizedConfig = normalizeFixedLayoutConfig(config)
  await writeFile(FIXED_LAYOUT_CONFIG_PATH, `${JSON.stringify(normalizedConfig, null, 2)}\n`, 'utf8')
  return normalizedConfig
}

export async function updateFixedLayoutConfig({ imageSlots, metrics } = {}) {
  const previousConfig = await readFixedLayoutConfig()
  const nextConfig = cloneConfig(previousConfig)

  if (imageSlots && typeof imageSlots === 'object') {
    FIXED_LAYOUT_IMAGE_SLOT_IDS.forEach((slot) => {
      if (!(slot in imageSlots)) {
        return
      }

      const currentSlotConfig = nextConfig?.[slot] ?? createEmptyFixedLayoutImageSlotConfig(slot)
      const slotPatch = imageSlots?.[slot] ?? {}

      nextConfig[slot] = {
        ...createEmptyFixedLayoutImageSlotConfig(slot),
        ...currentSlotConfig,
        asset:
          Object.prototype.hasOwnProperty.call(slotPatch, 'asset')
            ? normalizeAssetRecord(slotPatch?.asset)
            : currentSlotConfig?.asset ?? null,
        spacingPreset: normalizeFixedLayoutSpacingPreset(slotPatch?.spacingPreset ?? currentSlotConfig?.spacingPreset),
        widthPx:
          slot === 'qrImage'
            ? normalizeFixedLayoutQrWidthPx(slotPatch?.widthPx ?? currentSlotConfig?.widthPx)
            : null,
      }
    })
  }

  if (metrics && typeof metrics === 'object') {
    nextConfig.metrics = normalizeFixedLayoutMetrics(metrics)
  }

  const normalizedNextConfig = await writeFixedLayoutConfig(nextConfig)

  await Promise.all(
    FIXED_LAYOUT_IMAGE_SLOT_IDS.map(async (slot) => {
      const previousAsset = previousConfig?.[slot]?.asset ?? null
      const nextAsset = normalizedNextConfig?.[slot]?.asset ?? null

      if (!previousAsset?.path) {
        return
      }

      if (previousAsset.path === nextAsset?.path) {
        return
      }

      await removeStoredAsset(previousAsset)
    }),
  )

  return normalizedNextConfig
}

export async function uploadFixedLayoutAsset({ file, slot } = {}) {
  if (!isValidFixedLayoutImageSlot(slot)) {
    throw createFixedLayoutConfigError('无效的固定图片槽位。')
  }

  if (!file || typeof file.arrayBuffer !== 'function') {
    throw createFixedLayoutConfigError('请先选择要上传的图片。')
  }

  const mimeType = typeof file.type === 'string' ? file.type.trim().toLowerCase() : ''

  if (!FIXED_LAYOUT_ALLOWED_MIME_TYPES.includes(mimeType)) {
    throw createFixedLayoutConfigError('仅支持上传 gif、png、jpg、jpeg 图片。')
  }

  const extension = resolveUploadExtension(file)

  if (!extension) {
    throw createFixedLayoutConfigError('无法识别当前文件格式，请更换图片后重试。')
  }

  await ensureFixedLayoutDir()

  const uploadedAt = new Date().toISOString()
  const filename = `${slot}-${Date.now()}${extension}`
  const absolutePath = path.join(FIXED_LAYOUT_ASSETS_DIR, filename)
  const relativePath = `/assets/fixed-content/${filename}`
  const fileBuffer = Buffer.from(await file.arrayBuffer())

  await writeFile(absolutePath, fileBuffer)

  return {
    filename: typeof file.name === 'string' && file.name.trim() ? file.name.trim() : filename,
    mimeType,
    path: relativePath,
    uploadedAt,
  }
}

export async function deleteFixedLayoutAsset(slot) {
  if (!isValidFixedLayoutImageSlot(slot)) {
    throw createFixedLayoutConfigError('无效的固定图片槽位。')
  }

  const nextConfig = await readFixedLayoutConfig()
  await removeStoredAsset(nextConfig?.[slot]?.asset)
  nextConfig[slot] = {
    ...createEmptyFixedLayoutImageSlotConfig(slot),
    ...(nextConfig?.[slot] ?? {}),
    asset: null,
  }

  return writeFixedLayoutConfig(nextConfig)
}
