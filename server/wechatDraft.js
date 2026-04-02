import path from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { CONTENT_SESSION_PERSISTENCE_PATH } from './contentSessionPersistence.js'
import { resolveWeChatOfficialAccountConfig } from './runtimeConfig.js'

const WECHAT_API_BASE_URL = 'https://api.weixin.qq.com'
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000

const IMAGE_MIME_TYPE_BY_EXTENSION = {
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

let cachedTokenState = {
  accessToken: '',
  appId: '',
  appSecret: '',
  expiresAt: 0,
}

function createWeChatDraftError(message, status = 400, payload = null) {
  const error = new Error(message)
  error.status = status
  error.payload = payload
  return error
}

function normalizeTrimmedString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function maskAppId(value = '') {
  const normalizedValue = normalizeTrimmedString(value)

  if (normalizedValue.length <= 8) {
    return normalizedValue
  }

  return `${normalizedValue.slice(0, 4)}***${normalizedValue.slice(-4)}`
}

function extractPersistedSessions(payload) {
  return Array.isArray(payload?.item?.state?.sessions) ? payload.item.state.sessions : []
}

async function readLocalContentSessionPayload() {
  try {
    const raw = await readFile(CONTENT_SESSION_PERSISTENCE_PATH, 'utf8')
    return JSON.parse(raw)
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null
    }

    throw error
  }
}

async function writeLocalContentSessionPayload(payload) {
  await mkdir(path.dirname(CONTENT_SESSION_PERSISTENCE_PATH), { recursive: true })
  await writeFile(CONTENT_SESSION_PERSISTENCE_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  return payload
}

function findPersistedSession(payload, sessionId = '') {
  const normalizedSessionId = normalizeTrimmedString(sessionId)

  if (!normalizedSessionId) {
    return null
  }

  return extractPersistedSessions(payload).find((session) => session?.id === normalizedSessionId) ?? null
}

function buildDigest(plainText = '', maxLength = 120) {
  const normalized = String(plainText || '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!normalized) {
    return ''
  }

  return Array.from(normalized).slice(0, maxLength).join('')
}

function resolveImageMimeType(filename = '') {
  const extension = path.extname(String(filename || '')).toLowerCase()
  return IMAGE_MIME_TYPE_BY_EXTENSION[extension] || 'application/octet-stream'
}

function isRemoteAssetSource(src = '') {
  return /^https?:\/\//i.test(src)
}

function isDataAssetSource(src = '') {
  return /^data:/i.test(src)
}

function extractHtmlImageSources(html = '') {
  return Array.from(String(html || '').matchAll(/<img\b[^>]*\bsrc="([^"]+)"[^>]*>/gi))
    .map((match) => normalizeTrimmedString(match[1]))
    .filter(Boolean)
}

async function readRemoteAssetBinary(src) {
  const response = await fetch(src)

  if (!response.ok) {
    throw createWeChatDraftError('读取远程图片失败。', 502)
  }

  const arrayBuffer = await response.arrayBuffer()
  const url = new URL(src)
  const filename = path.basename(url.pathname || 'image.jpg') || 'image.jpg'

  return {
    buffer: Buffer.from(arrayBuffer),
    filename,
    mimeType: response.headers.get('content-type') || resolveImageMimeType(filename),
  }
}

async function readLocalPublicAssetBinary(src) {
  const normalizedSrc = normalizeTrimmedString(src)

  if (!normalizedSrc.startsWith('/assets/')) {
    throw createWeChatDraftError('不支持的本地图片路径。')
  }

  const relativePublicPath = normalizedSrc.replace(/^\//, '')
  const absolutePath = path.resolve(process.cwd(), 'public', relativePublicPath.replace(/^assets\//, 'assets/'))
  const filename = path.basename(relativePublicPath)
  const buffer = await readFile(absolutePath)

  return {
    buffer,
    filename,
    mimeType: resolveImageMimeType(filename),
  }
}

async function readAssetBinary(src = '') {
  const normalizedSrc = normalizeTrimmedString(src)

  if (!normalizedSrc) {
    throw createWeChatDraftError('缺少图片地址，无法同步到微信。')
  }

  if (isDataAssetSource(normalizedSrc)) {
    throw createWeChatDraftError('当前图片仍是占位图，无法同步到微信。')
  }

  if (isRemoteAssetSource(normalizedSrc)) {
    return readRemoteAssetBinary(normalizedSrc)
  }

  return readLocalPublicAssetBinary(normalizedSrc)
}

async function readJsonResponse(response) {
  const text = await response.text()

  try {
    return text ? JSON.parse(text) : {}
  } catch {
    return { raw: text }
  }
}

function getWechatApiErrorMessage(payload, fallbackMessage) {
  const errorCode = Number(payload?.errcode ?? 0)
  const rawMessage = normalizeTrimmedString(payload?.errmsg)

  switch (errorCode) {
    case 40013:
      return '微信 AppID 无效，请检查公众号配置。'
    case 40125:
      return '微信 AppSecret 无效，请检查公众号配置。'
    case 40164:
      return `当前服务器出口 IP 未加入微信白名单：${rawMessage || '请到微信后台补充 IP 白名单。'}`
    case 41001:
      return '微信 access_token 缺失，请稍后重试。'
    default:
      return rawMessage || fallbackMessage
  }
}

function assertWechatApiSuccess(payload, fallbackMessage) {
  if (Number(payload?.errcode ?? 0) !== 0) {
    throw createWeChatDraftError(getWechatApiErrorMessage(payload, fallbackMessage), 502, payload)
  }
}

async function getWechatAccessToken() {
  const config = resolveWeChatOfficialAccountConfig()

  if (!config.configured) {
    throw createWeChatDraftError('微信公众号 AppID 或 AppSecret 未配置。')
  }

  const now = Date.now()

  if (
    cachedTokenState.accessToken &&
    cachedTokenState.appId === config.appId &&
    cachedTokenState.appSecret === config.appSecret &&
    cachedTokenState.expiresAt > now + TOKEN_REFRESH_BUFFER_MS
  ) {
    return cachedTokenState.accessToken
  }

  const tokenUrl = new URL('/cgi-bin/token', WECHAT_API_BASE_URL)
  tokenUrl.searchParams.set('grant_type', 'client_credential')
  tokenUrl.searchParams.set('appid', config.appId)
  tokenUrl.searchParams.set('secret', config.appSecret)

  const response = await fetch(tokenUrl)
  const payload = await readJsonResponse(response)

  if (!response.ok) {
    throw createWeChatDraftError(getWechatApiErrorMessage(payload, '获取微信 access_token 失败。'), response.status || 502, payload)
  }

  assertWechatApiSuccess(payload, '获取微信 access_token 失败。')

  const accessToken = normalizeTrimmedString(payload?.access_token)

  if (!accessToken) {
    throw createWeChatDraftError('微信 access_token 返回异常。', 502, payload)
  }

  const expiresInSeconds = Number(payload?.expires_in)

  cachedTokenState = {
    accessToken,
    appId: config.appId,
    appSecret: config.appSecret,
    expiresAt: now + (Number.isFinite(expiresInSeconds) ? expiresInSeconds : 7200) * 1000,
  }

  return accessToken
}

async function uploadWechatContentImage(accessToken, src) {
  const file = await readAssetBinary(src)
  const formData = new FormData()
  formData.append('media', new Blob([file.buffer], { type: file.mimeType }), file.filename)

  const uploadUrl = new URL('/cgi-bin/media/uploadimg', WECHAT_API_BASE_URL)
  uploadUrl.searchParams.set('access_token', accessToken)

  const response = await fetch(uploadUrl, {
    body: formData,
    method: 'POST',
  })
  const payload = await readJsonResponse(response)

  if (!response.ok) {
    throw createWeChatDraftError(getWechatApiErrorMessage(payload, '上传正文图片到微信失败。'), response.status || 502, payload)
  }

  assertWechatApiSuccess(payload, '上传正文图片到微信失败。')

  const url = normalizeTrimmedString(payload?.url)

  if (!url) {
    throw createWeChatDraftError('微信正文图片上传返回异常。', 502, payload)
  }

  return url
}

async function uploadWechatCoverMaterial(accessToken, src) {
  const file = await readAssetBinary(src)
  const formData = new FormData()
  formData.append('media', new Blob([file.buffer], { type: file.mimeType }), file.filename)

  const uploadUrl = new URL('/cgi-bin/material/add_material', WECHAT_API_BASE_URL)
  uploadUrl.searchParams.set('access_token', accessToken)
  uploadUrl.searchParams.set('type', 'image')

  const response = await fetch(uploadUrl, {
    body: formData,
    method: 'POST',
  })
  const payload = await readJsonResponse(response)

  if (!response.ok) {
    throw createWeChatDraftError(getWechatApiErrorMessage(payload, '上传微信封面图失败。'), response.status || 502, payload)
  }

  assertWechatApiSuccess(payload, '上传微信封面图失败。')

  const mediaId = normalizeTrimmedString(payload?.media_id)

  if (!mediaId) {
    throw createWeChatDraftError('微信封面图上传返回异常。', 502, payload)
  }

  return mediaId
}

async function replaceWechatImageSourcesInHtml(html = '', accessToken) {
  const imageTagPattern = /<img\b[^>]*\bsrc="([^"]+)"[^>]*>/gi
  let nextHtml = ''
  let lastIndex = 0

  for (const match of html.matchAll(imageTagPattern)) {
    const matchedTag = match[0]
    const src = normalizeTrimmedString(match[1])
    const startIndex = match.index ?? 0
    const endIndex = startIndex + matchedTag.length

    nextHtml += html.slice(lastIndex, startIndex)

    if (!src || isDataAssetSource(src)) {
      lastIndex = endIndex
      continue
    }

    const uploadedSrc = await uploadWechatContentImage(accessToken, src)
    nextHtml += matchedTag.replace(src, uploadedSrc)
    lastIndex = endIndex
  }

  nextHtml += html.slice(lastIndex)
  return nextHtml
}

async function addWechatDraft(accessToken, article) {
  const requestUrl = new URL('/cgi-bin/draft/add', WECHAT_API_BASE_URL)
  requestUrl.searchParams.set('access_token', accessToken)

  const response = await fetch(requestUrl, {
    body: JSON.stringify({ articles: [article] }),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })
  const payload = await readJsonResponse(response)

  if (!response.ok) {
    throw createWeChatDraftError(getWechatApiErrorMessage(payload, '创建微信草稿失败。'), response.status || 502, payload)
  }

  assertWechatApiSuccess(payload, '创建微信草稿失败。')

  const mediaId = normalizeTrimmedString(payload?.media_id)

  if (!mediaId) {
    throw createWeChatDraftError('微信草稿创建返回异常。', 502, payload)
  }

  return mediaId
}

async function updateWechatDraft(accessToken, mediaId, article) {
  const requestUrl = new URL('/cgi-bin/draft/update', WECHAT_API_BASE_URL)
  requestUrl.searchParams.set('access_token', accessToken)

  const response = await fetch(requestUrl, {
    body: JSON.stringify({
      articles: article,
      index: 0,
      media_id: mediaId,
    }),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })
  const payload = await readJsonResponse(response)

  if (!response.ok) {
    throw createWeChatDraftError(getWechatApiErrorMessage(payload, '更新微信草稿失败。'), response.status || 502, payload)
  }

  assertWechatApiSuccess(payload, '更新微信草稿失败。')
}

function patchSessionDraftSyncInItem(item, sessionId, draftSync) {
  const normalizedSessionId = normalizeTrimmedString(sessionId)
  const sessions = Array.isArray(item?.state?.sessions) ? item.state.sessions : []

  return {
    ...item,
    state: {
      ...(item?.state ?? {}),
      sessions: sessions.map((session) => {
        if (session?.id !== normalizedSessionId) {
          return session
        }

        return {
          ...session,
          draftSync,
          updatedAt: new Date().toISOString(),
        }
      }),
    },
  }
}

function buildDraftSyncPayload(session, patch = {}) {
  const currentDraftSync = session?.draftSync ?? {}
  const baseAttemptCount = Number.isFinite(Number(currentDraftSync.attemptCount))
    ? Number(currentDraftSync.attemptCount)
    : 0
  const attemptCount = currentDraftSync.status === 'syncing' ? baseAttemptCount : baseAttemptCount + 1

  return {
    attemptCount,
    error: '',
    lastSyncedAt: null,
    mediaId: '',
    provider: 'wechat',
    status: 'idle',
    summary: null,
    ...currentDraftSync,
    ...patch,
    attemptCount: patch.attemptCount ?? attemptCount,
    provider: 'wechat',
  }
}

function normalizeArticlePayload(article = {}) {
  return {
    author: normalizeTrimmedString(article?.author),
    bodyHtml: typeof article?.bodyHtml === 'string' ? article.bodyHtml.trim() : '',
    contentSourceUrl: normalizeTrimmedString(article?.contentSourceUrl),
    coverImageSrc: normalizeTrimmedString(article?.coverImageSrc),
    mediaId: normalizeTrimmedString(article?.mediaId),
    plainText: typeof article?.plainText === 'string' ? article.plainText.trim() : '',
    title: normalizeTrimmedString(article?.title),
  }
}

export async function readWechatDraftStatus({ sessionId } = {}) {
  const config = resolveWeChatOfficialAccountConfig()
  const persistedPayload = await readLocalContentSessionPayload()
  const session = sessionId ? findPersistedSession(persistedPayload, sessionId) : null

  return {
    appId: maskAppId(config.appId),
    configured: config.configured,
    draftSync: session?.draftSync ?? null,
    provider: 'wechat',
  }
}

export async function syncSessionToWechatDraft({ article, sessionId } = {}) {
  const normalizedSessionId = normalizeTrimmedString(sessionId)

  if (!normalizedSessionId) {
    throw createWeChatDraftError('缺少会话 ID，无法同步微信草稿。')
  }

  const normalizedArticle = normalizeArticlePayload(article)

  if (!normalizedArticle.title) {
    throw createWeChatDraftError('缺少文章标题，无法同步微信草稿。')
  }

  if (!normalizedArticle.bodyHtml) {
    throw createWeChatDraftError('缺少文章正文 HTML，无法同步微信草稿。')
  }

  if (!normalizedArticle.coverImageSrc) {
    throw createWeChatDraftError('缺少封面图，请先上传开头固定图片或确认正文首图可用。')
  }

  const persistedPayload = await readLocalContentSessionPayload()
  const persistedItem = persistedPayload?.item ?? null
  const persistedName = persistedPayload?.name ?? 'content-creation-sessions-v1'
  const session = findPersistedSession(persistedPayload, normalizedSessionId)

  if (!session) {
    throw createWeChatDraftError('当前文章会话不存在，请刷新后重试。', 404)
  }

  try {
    const accessToken = await getWechatAccessToken()
    const contentHtml = await replaceWechatImageSourcesInHtml(normalizedArticle.bodyHtml, accessToken)
    const thumbMediaId = await uploadWechatCoverMaterial(accessToken, normalizedArticle.coverImageSrc)
    const existingMediaId =
      normalizedArticle.mediaId ||
      (session?.draftSync?.provider === 'wechat' ? normalizeTrimmedString(session?.draftSync?.mediaId) : '')
    const articlePayload = {
      author: normalizedArticle.author,
      content: contentHtml,
      content_source_url: normalizedArticle.contentSourceUrl,
      digest: buildDigest(normalizedArticle.plainText),
      need_open_comment: 0,
      only_fans_can_comment: 0,
      thumb_media_id: thumbMediaId,
      title: normalizedArticle.title,
    }

    let action = 'created'
    let mediaId = existingMediaId

    if (existingMediaId) {
      await updateWechatDraft(accessToken, existingMediaId, articlePayload)
      action = 'updated'
    } else {
      mediaId = await addWechatDraft(accessToken, articlePayload)
    }

    const syncedAt = new Date().toISOString()
    const nextDraftSync = buildDraftSyncPayload(session, {
      error: '',
      lastSyncedAt: syncedAt,
      mediaId,
      status: 'success',
      summary: {
        action,
        imageCount: extractHtmlImageSources(normalizedArticle.bodyHtml).length,
        mediaId,
        syncedAt,
        title: normalizedArticle.title,
      },
    })

    if (persistedItem) {
      await writeLocalContentSessionPayload({
        item: patchSessionDraftSyncInItem(persistedItem, normalizedSessionId, nextDraftSync),
        name: persistedName,
        updatedAt: new Date().toISOString(),
      })
    }

    return {
      action,
      configured: true,
      draftSync: nextDraftSync,
      mediaId,
      provider: 'wechat',
      title: normalizedArticle.title,
    }
  } catch (error) {
    const failedDraftSync = buildDraftSyncPayload(session, {
      error: error.message || '同步微信草稿失败。',
      status: 'error',
      summary: null,
    })

    if (persistedItem) {
      await writeLocalContentSessionPayload({
        item: patchSessionDraftSyncInItem(persistedItem, normalizedSessionId, failedDraftSync),
        name: persistedName,
        updatedAt: new Date().toISOString(),
      }).catch(() => null)
    }

    throw error
  }
}
