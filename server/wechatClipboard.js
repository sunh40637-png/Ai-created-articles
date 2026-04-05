import crypto from 'node:crypto'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { resolveAliyunOssConfig } from './runtimeConfig.js'

const CLIPBOARD_OSS_PREFIX = 'content-system/public-assets/wechat-clipboard'
const LOCAL_PREVIEW_HOSTS = new Set(['127.0.0.1', 'localhost'])
const IMAGE_MIME_TYPE_BY_EXTENSION = {
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

function createWechatClipboardError(message, status = 400, payload = null) {
  const error = new Error(message)
  error.status = status
  error.payload = payload
  return error
}

function normalizeTrimmedString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function encodeObjectKey(objectKey = '') {
  return String(objectKey)
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

function buildCanonicalizedHeaders(headers = {}) {
  return Object.entries(headers)
    .map(([key, value]) => [String(key).toLowerCase(), String(value).trim()])
    .filter(([key, value]) => key.startsWith('x-oss-') && value)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, value]) => `${key}:${value}\n`)
    .join('')
}

function buildAuthorizationHeader({
  accessKeyId,
  accessKeySecret,
  bucket,
  contentType = '',
  date,
  headers = {},
  method,
  objectKey,
}) {
  const canonicalizedHeaders = buildCanonicalizedHeaders(headers)
  const stringToSign = `${method}\n\n${contentType}\n${date}\n${canonicalizedHeaders}/${bucket}/${objectKey}`
  const signature = crypto.createHmac('sha1', accessKeySecret).update(stringToSign, 'utf8').digest('base64')
  return `OSS ${accessKeyId}:${signature}`
}

function resolveImageMimeType(filename = '', fallback = 'application/octet-stream') {
  const extension = path.extname(String(filename || '')).toLowerCase()
  return IMAGE_MIME_TYPE_BY_EXTENSION[extension] || fallback
}

function isDataAssetSource(src = '') {
  return /^data:/i.test(src)
}

function isMissingAssetSource(src = '') {
  return /^asset-missing:\/\//i.test(src)
}

function isRemoteAssetSource(src = '') {
  return /^https?:\/\//i.test(src)
}

function normalizeLocalAssetPath(src = '') {
  const normalizedSrc = normalizeTrimmedString(src)

  if (!normalizedSrc) {
    return ''
  }

  if (normalizedSrc.startsWith('/assets/')) {
    return normalizedSrc
  }

  try {
    const url = new URL(normalizedSrc)

    if (!LOCAL_PREVIEW_HOSTS.has(url.hostname.toLowerCase())) {
      return ''
    }

    return url.pathname.startsWith('/assets/') ? url.pathname : ''
  } catch {
    return ''
  }
}

async function readRemoteAssetBinary(src) {
  const response = await fetch(src)

  if (!response.ok) {
    throw createWechatClipboardError('读取远程图片失败。', 502)
  }

  const arrayBuffer = await response.arrayBuffer()
  const url = new URL(src)
  const filename = path.basename(url.pathname || 'image.jpg') || 'image.jpg'

  return {
    buffer: Buffer.from(arrayBuffer),
    filename,
    mimeType: response.headers.get('content-type') || resolveImageMimeType(filename),
    sourcePath: '',
  }
}

async function readLocalPublicAssetBinary(src) {
  const normalizedSrc = normalizeLocalAssetPath(src)

  if (!normalizedSrc) {
    throw createWechatClipboardError('不支持的本地图片路径。')
  }

  const absolutePath = path.resolve(process.cwd(), 'public', normalizedSrc.replace(/^\//, ''))
  const filename = path.basename(normalizedSrc)
  const buffer = await readFile(absolutePath)

  return {
    buffer,
    filename,
    mimeType: resolveImageMimeType(filename),
    sourcePath: normalizedSrc,
  }
}

async function readClipboardAssetBinary(src = '') {
  const normalizedSrc = normalizeTrimmedString(src)

  if (!normalizedSrc) {
    throw createWechatClipboardError('缺少图片地址，无法准备复制内容。')
  }

  if (isDataAssetSource(normalizedSrc) || isMissingAssetSource(normalizedSrc)) {
    return null
  }

  const localAssetPath = normalizeLocalAssetPath(normalizedSrc)

  if (localAssetPath) {
    return readLocalPublicAssetBinary(localAssetPath)
  }

  if (isRemoteAssetSource(normalizedSrc)) {
    return readRemoteAssetBinary(normalizedSrc)
  }

  throw createWechatClipboardError('当前图片地址无法转换为公网链接。')
}

function buildPublicObjectKey({ buffer, filename = '', sourcePath = '' }) {
  const extension = path.extname(filename || sourcePath || '').toLowerCase() || '.jpg'
  const sourceLabel = sourcePath.replace(/^\/+/, '').replace(/[^a-zA-Z0-9/_-]/g, '-')
  const digest = crypto.createHash('sha1').update(buffer).digest('hex').slice(0, 20)
  const sourcePrefix = sourceLabel ? sourceLabel.replace(/^assets\//, '') : 'remote'
  return `${CLIPBOARD_OSS_PREFIX}/${sourcePrefix}-${digest}${extension}`
}

function buildOssPublicUrl(objectKey = '') {
  const config = resolveAliyunOssConfig()
  return `https://${config.bucket}.${config.endpoint}/${encodeObjectKey(objectKey)}`
}

async function putBinaryObject(objectKey, file) {
  const config = resolveAliyunOssConfig()

  if (!config.enabled) {
    throw createWechatClipboardError('OSS 未完成配置，当前无法为复制内容生成公网图片链接。')
  }

  const date = new Date().toUTCString()
  const contentType = normalizeTrimmedString(file?.mimeType) || resolveImageMimeType(file?.filename)
  const customHeaders = {
    'x-oss-object-acl': 'public-read',
  }
  const authorization = buildAuthorizationHeader({
    accessKeyId: config.accessKeyId,
    accessKeySecret: config.accessKeySecret,
    bucket: config.bucket,
    contentType,
    date,
    headers: customHeaders,
    method: 'PUT',
    objectKey,
  })

  const response = await fetch(`https://${config.bucket}.${config.endpoint}/${encodeObjectKey(objectKey)}`, {
    body: file.buffer,
    headers: {
      Authorization: authorization,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Type': contentType,
      Date: date,
      ...customHeaders,
    },
    method: 'PUT',
  })

  if (!response.ok) {
    const details = await response.text().catch(() => '')
    throw createWechatClipboardError('上传图片到 OSS 失败。', response.status || 502, details)
  }

  return buildOssPublicUrl(objectKey)
}

async function ensurePublicClipboardAssetUrl(src = '') {
  const normalizedSrc = normalizeTrimmedString(src)

  if (!normalizedSrc || isDataAssetSource(normalizedSrc) || isMissingAssetSource(normalizedSrc)) {
    return ''
  }

  const config = resolveAliyunOssConfig()
  const currentBucketPrefix = config.enabled ? `https://${config.bucket}.${config.endpoint}/` : ''

  if (currentBucketPrefix && normalizedSrc.startsWith(currentBucketPrefix)) {
    return normalizedSrc
  }

  const file = await readClipboardAssetBinary(normalizedSrc)

  if (!file) {
    return ''
  }

  const objectKey = buildPublicObjectKey(file)
  return putBinaryObject(objectKey, file)
}

function normalizeMarginShorthand(html = '') {
  return html.replace(
    /margin\s*:\s*([^;"'}]+)/gi,
    (match, value) => {
      const parts = value.trim().split(/\s+/)
      if (parts.length === 3) {
        return `margin:${parts[0]} ${parts[1]} ${parts[2]} ${parts[1]}`
      }
      return match
    },
  )
}

function ensureImageWechatCompat(html = '') {
  return html.replace(/<img\b([^>]*)>/gi, (fullMatch, attrs) => {
    let style = ''
    const styleMatch = attrs.match(/style="([^"]*)"/)
    if (styleMatch) {
      style = styleMatch[1]
    }
    const additions = []
    if (!/max-width\s*:/i.test(style)) {
      additions.push('max-width:100%')
    }
    if (!/\bheight\s*:/i.test(style)) {
      additions.push('height:auto')
    }
    if (additions.length === 0) {
      return fullMatch
    }
    if (styleMatch) {
      const newStyle = style.replace(/;?\s*$/, '') + ';' + additions.join(';')
      return `<img${attrs.replace(styleMatch[0], `style="${newStyle}"`)}>`
    }
    return `<img style="${additions.join(';')}"${attrs}>`
  })
}

function stripPlaceholderDataImages(html = '') {
  return html.replace(/<img\b[^>]*\bsrc="data:[^"]*"[^>]*>/gi, '')
}

function postprocessHtmlForWechatClipboard(html = '') {
  let result = String(html || '')
    .replace(/\sloading="lazy"/gi, '')
    .replace(/<section\b/gi, '<div')
    .replace(/<\/section>/gi, '</div>')
    .replace(/<article\b/gi, '<div')
    .replace(/<\/article>/gi, '</div>')

  result = normalizeMarginShorthand(result)
  result = ensureImageWechatCompat(result)
  result = stripPlaceholderDataImages(result)
  return result
}

function extractHtmlImageSources(html = '') {
  return Array.from(String(html || '').matchAll(/<img\b[^>]*\bsrc="([^"]+)"[^>]*>/gi))
    .map((match) => normalizeTrimmedString(match[1]))
    .filter(Boolean)
}

async function replaceClipboardImageSources(html = '') {
  const imageTagPattern = /<img\b[^>]*\bsrc="([^"]+)"[^>]*>/gi
  let nextHtml = ''
  let lastIndex = 0
  let uploadedImageCount = 0

  for (const match of html.matchAll(imageTagPattern)) {
    const matchedTag = match[0]
    const src = normalizeTrimmedString(match[1])
    const startIndex = match.index ?? 0
    const endIndex = startIndex + matchedTag.length

    nextHtml += html.slice(lastIndex, startIndex)

    if (!src || isDataAssetSource(src) || isMissingAssetSource(src)) {
      lastIndex = endIndex
      continue
    }

    const publicSrc = await ensurePublicClipboardAssetUrl(src)

    if (publicSrc) {
      uploadedImageCount += 1
      nextHtml += matchedTag.replace(src, publicSrc)
    } else {
      nextHtml += matchedTag
    }

    lastIndex = endIndex
  }

  nextHtml += html.slice(lastIndex)

  return {
    html: nextHtml,
    uploadedImageCount,
  }
}

export async function prepareWechatClipboardHtml({ bodyHtml = '', plainText = '' } = {}) {
  const normalizedHtml = normalizeTrimmedString(bodyHtml)

  if (!normalizedHtml) {
    throw createWechatClipboardError('缺少文章正文 HTML，无法复制微信样式。')
  }

  const { html: htmlWithPublicImages, uploadedImageCount } = await replaceClipboardImageSources(normalizedHtml)
  const finalHtml = postprocessHtmlForWechatClipboard(htmlWithPublicImages)

  return {
    bodyHtml: finalHtml,
    imageCount: extractHtmlImageSources(finalHtml).length,
    plainText: typeof plainText === 'string' ? plainText.trim() : '',
    uploadedImageCount,
  }
}
