import path from 'node:path'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import {
  createEmptyFixedLayoutConfig,
  FIXED_LAYOUT_ALLOWED_MIME_TYPES,
  FIXED_LAYOUT_ENDING_TEXT_MAX_LENGTH,
  isValidFixedLayoutImageSlot,
  normalizeFixedLayoutTextContent,
} from '../shared/fixedLayoutConfig.js'

export const FIXED_LAYOUT_ASSETS_DIR = path.resolve(process.cwd(), 'public/assets/fixed-content')
export const FIXED_LAYOUT_CONFIG_PATH = path.join(FIXED_LAYOUT_ASSETS_DIR, 'config.json')

const MIME_EXTENSION_MAP = {
  'image/gif': '.gif',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
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

function normalizeFixedLayoutConfig(config) {
  const fallback = createEmptyFixedLayoutConfig()

  return {
    endingText: {
      content: normalizeFixedLayoutTextContent(config?.endingText?.content ?? fallback.endingText.content),
      updatedAt:
        typeof config?.endingText?.updatedAt === 'string' && config.endingText.updatedAt.trim()
          ? config.endingText.updatedAt.trim()
          : null,
    },
    footerGif: normalizeAssetRecord(config?.footerGif),
    heroGif: normalizeAssetRecord(config?.heroGif),
    qrImage: normalizeAssetRecord(config?.qrImage),
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

  if (['.gif', '.png', '.jpg', '.jpeg', '.webp'].includes(extension)) {
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

export async function updateFixedLayoutText({ endingText } = {}) {
  const content = normalizeFixedLayoutTextContent(endingText)

  if (content.length > FIXED_LAYOUT_ENDING_TEXT_MAX_LENGTH) {
    throw createFixedLayoutConfigError(`固定文案请控制在 ${FIXED_LAYOUT_ENDING_TEXT_MAX_LENGTH} 字以内。`)
  }

  const nextConfig = await readFixedLayoutConfig()
  nextConfig.endingText = {
    content,
    updatedAt: new Date().toISOString(),
  }

  return writeFixedLayoutConfig(nextConfig)
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
    throw createFixedLayoutConfigError('仅支持上传 gif、png、jpg、jpeg、webp 图片。')
  }

  const extension = resolveUploadExtension(file)

  if (!extension) {
    throw createFixedLayoutConfigError('无法识别当前文件格式，请更换图片后重试。')
  }

  await ensureFixedLayoutDir()

  const nextConfig = await readFixedLayoutConfig()
  await removeStoredAsset(nextConfig[slot])

  const uploadedAt = new Date().toISOString()
  const filename = `${slot}-${Date.now()}${extension}`
  const absolutePath = path.join(FIXED_LAYOUT_ASSETS_DIR, filename)
  const relativePath = `/assets/fixed-content/${filename}`
  const fileBuffer = Buffer.from(await file.arrayBuffer())

  await writeFile(absolutePath, fileBuffer)

  nextConfig[slot] = {
    filename: typeof file.name === 'string' && file.name.trim() ? file.name.trim() : filename,
    mimeType,
    path: relativePath,
    uploadedAt,
  }

  return writeFixedLayoutConfig(nextConfig)
}

export async function deleteFixedLayoutAsset(slot) {
  if (!isValidFixedLayoutImageSlot(slot)) {
    throw createFixedLayoutConfigError('无效的固定图片槽位。')
  }

  const nextConfig = await readFixedLayoutConfig()
  await removeStoredAsset(nextConfig[slot])
  nextConfig[slot] = null

  return writeFixedLayoutConfig(nextConfig)
}
