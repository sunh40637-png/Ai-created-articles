import crypto from 'node:crypto'
import { readFileSync } from 'node:fs'

const OSS_ROOT_PREFIX = 'content-system'
const SESSION_INDEX_KEY = `${OSS_ROOT_PREFIX}/index/sessions.json`
const ARTICLE_INDEX_KEY = `${OSS_ROOT_PREFIX}/index/articles.json`
const TOPIC_INDEX_KEY = `${OSS_ROOT_PREFIX}/index/topics.json`
const CONFIG_INDEX_KEY = `${OSS_ROOT_PREFIX}/index/configs.json`
let cachedDotEnvConfig = null

function normalizeTrimmedString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function stripProtocol(value = '') {
  return String(value).replace(/^https?:\/\//i, '').replace(/\/+$/, '')
}

function readDotEnvConfig() {
  if (cachedDotEnvConfig) {
    return cachedDotEnvConfig
  }

  try {
    const content = readFileSync(new URL('../.env', import.meta.url), 'utf8')
    const parsed = {}

    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim()

      if (!line || line.startsWith('#')) {
        continue
      }

      const separatorIndex = line.indexOf('=')

      if (separatorIndex === -1) {
        continue
      }

      const key = line.slice(0, separatorIndex).trim()
      const value = line.slice(separatorIndex + 1).trim()

      if (!key) {
        continue
      }

      parsed[key] = value
    }

    cachedDotEnvConfig = parsed
  } catch {
    cachedDotEnvConfig = {}
  }

  return cachedDotEnvConfig
}

function normalizeIsoTimestamp(value) {
  if (!value || typeof value !== 'string') {
    return null
  }

  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null
}

function buildShortStableId(input = '') {
  const cleaned = String(input).replace(/[^a-zA-Z0-9]/g, '')
  if (cleaned.length >= 8) {
    return cleaned.slice(-8).toLowerCase()
  }

  return crypto.createHash('md5').update(String(input)).digest('hex').slice(0, 8)
}

function buildDateStamp(value) {
  const date = new Date(value || Date.now())

  if (Number.isNaN(date.getTime())) {
    return 'unknown'
  }

  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}${month}${day}`
}

function encodeObjectKey(objectKey = '') {
  return String(objectKey)
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

function resolveAliyunOssConfig() {
  const dotEnvConfig = readDotEnvConfig()
  const bucket = normalizeTrimmedString(process.env.ALIYUN_OSS_BUCKET || dotEnvConfig.ALIYUN_OSS_BUCKET)
  const region = normalizeTrimmedString(process.env.ALIYUN_OSS_REGION || dotEnvConfig.ALIYUN_OSS_REGION)
  const endpoint = stripProtocol(process.env.ALIYUN_OSS_ENDPOINT || dotEnvConfig.ALIYUN_OSS_ENDPOINT)
  const accessKeyId = normalizeTrimmedString(process.env.ALIYUN_OSS_ACCESS_KEY_ID || dotEnvConfig.ALIYUN_OSS_ACCESS_KEY_ID)
  const accessKeySecret = normalizeTrimmedString(
    process.env.ALIYUN_OSS_ACCESS_KEY_SECRET || dotEnvConfig.ALIYUN_OSS_ACCESS_KEY_SECRET,
  )

  return {
    accessKeyId,
    accessKeySecret,
    bucket,
    enabled: Boolean(bucket && endpoint && accessKeyId && accessKeySecret),
    endpoint,
    region,
  }
}

function createOssError(message, status = 500, payload = null) {
  const error = new Error(message)
  error.status = status
  error.payload = payload
  return error
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

async function requestOssJson(objectKey, options = {}) {
  const config = resolveAliyunOssConfig()

  if (!config.enabled) {
    return null
  }

  const method = options.method || 'GET'
  const contentType = options.contentType || ''
  const date = new Date().toUTCString()
  const customHeaders = {
    ...(options.headers ?? {}),
  }
  const authorization = buildAuthorizationHeader({
    accessKeyId: config.accessKeyId,
    accessKeySecret: config.accessKeySecret,
    bucket: config.bucket,
    contentType,
    date,
    headers: customHeaders,
    method,
    objectKey,
  })

  const response = await fetch(`https://${config.bucket}.${config.endpoint}/${encodeObjectKey(objectKey)}`, {
    body: options.body,
    headers: {
      Authorization: authorization,
      Date: date,
      ...(contentType ? { 'Content-Type': contentType } : {}),
      ...customHeaders,
    },
    method,
  })

  if (response.status === 404) {
    return null
  }

  if (!response.ok) {
    const details = await response.text().catch(() => '')
    throw createOssError(`OSS 请求失败：${method} ${objectKey}`, response.status, details)
  }

  if (method === 'DELETE') {
    return { deleted: true }
  }

  const raw = await response.text()
  return raw ? JSON.parse(raw) : null
}

async function getJsonObject(objectKey) {
  return requestOssJson(objectKey, { method: 'GET' })
}

async function putJsonObject(objectKey, payload) {
  return requestOssJson(objectKey, {
    body: `${JSON.stringify(payload, null, 2)}\n`,
    contentType: 'application/json; charset=utf-8',
    method: 'PUT',
  })
}

async function deleteObject(objectKey) {
  return requestOssJson(objectKey, { method: 'DELETE' })
}

function getSelectedTopic(session) {
  const selectedTopicId = session?.topicSelection?.selectedTopicId

  return (
    session?.topicSelection?.selectedTopic ??
    session?.topicSelection?.recommendations?.find((topic) => topic?.id === selectedTopicId) ??
    session?.topicSelection?.recommendations?.[0] ??
    null
  )
}

function getActiveVersion(session) {
  const versions = Array.isArray(session?.draftReview?.versions) ? session.draftReview.versions : []

  if (versions.length === 0) {
    return null
  }

  return versions.find((version) => version?.id === session?.draftReview?.activeVersionId) ?? versions[versions.length - 1]
}

function readLooseTitle(value) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim()
  }

  if (!value || typeof value !== 'object') {
    return ''
  }

  if (typeof value.title === 'string' && value.title.trim()) {
    return value.title.trim()
  }

  if (typeof value.text === 'string' && value.text.trim()) {
    return value.text.trim()
  }

  if (typeof value.content === 'string' && value.content.trim()) {
    return value.content.trim()
  }

  return ''
}

function stripPreviewHeading(markdown = '') {
  return String(markdown).replace(/^#\s+.+?\n+/, '')
}

function resolveVersionGeneratedTitle(version) {
  const directTitle = readLooseTitle(version?.generatedTitle)

  if (directTitle) {
    return directTitle
  }

  const legacyCandidate = Array.isArray(version?.titleCandidates) ? version.titleCandidates[0] : null
  return readLooseTitle(legacyCandidate)
}

function resolveVersionDisplayTitle(session, version) {
  return resolveVersionGeneratedTitle(version) || getSelectedTopic(session)?.title || session?.title || ''
}

function countReadableLength(value = '') {
  return String(value)
    .replace(/[#>*`~\-_[\]()]/g, ' ')
    .replace(/\s+/g, '')
    .length
}

function hasSessionHistory(session) {
  if (!session) {
    return false
  }

  const messages = Array.isArray(session.messages) ? session.messages : []
  const hasUserMessage = messages.some((message) => message?.role === 'user')
  const hasSelectedTopic = Boolean(session?.topicSelection?.selectedTopicId)
  const hasGeneratedVersions = (session?.draftReview?.versions?.length ?? 0) > 0
  const hasAdvancedStage = typeof session?.stageId === 'string' && session.stageId !== 'topic'
  const hasFlow = Boolean(session?.processingFlow || session?.lastFlowSummary)

  return hasUserMessage || hasSelectedTopic || hasGeneratedVersions || hasAdvancedStage || hasFlow
}

function buildSessionStorageIds(session) {
  const dateStamp = buildDateStamp(session?.createdAt || session?.updatedAt)
  const shortId = buildShortStableId(session?.id || dateStamp)
  const sessionStorageId = `session-${dateStamp}-${shortId}`
  const articleStorageId = `article-${dateStamp}-${shortId}`

  return {
    articleId: articleStorageId,
    articleKey: `${OSS_ROOT_PREFIX}/articles/${articleStorageId}.json`,
    sessionId: sessionStorageId,
    sessionKey: `${OSS_ROOT_PREFIX}/sessions/${sessionStorageId}.json`,
  }
}

function buildSessionFilePayload(session) {
  const ids = buildSessionStorageIds(session)
  const topic = getSelectedTopic(session)

  return {
    activeWorkbenchTab: session?.activeWorkbenchTab ?? 'draft',
    articleId: ids.articleId,
    createdAt: normalizeIsoTimestamp(session?.createdAt) || new Date().toISOString(),
    deepThinkingEnabled: Boolean(session?.deepThinkingEnabled),
    draftReview: session?.draftReview ?? {
      activeVersionId: null,
      latestNote: '',
      versions: [],
    },
    isWorkbenchOpen: Boolean(session?.isWorkbenchOpen),
    lastFlowSummary: session?.lastFlowSummary ?? null,
    layoutReview: session?.layoutReview ?? {
      device: 'mobile',
      fontSize: 'medium',
    },
    messages: Array.isArray(session?.messages) ? session.messages : [],
    processingFlow: session?.processingFlow ?? null,
    runLogs: Array.isArray(session?.runLogs) ? session.runLogs : [],
    schemaVersion: 1,
    sessionId: session?.id ?? '',
    stageId: session?.stageId ?? 'topic',
    title: typeof session?.title === 'string' ? session.title : '',
    topicSelection: {
      filterTypes: Array.isArray(session?.topicSelection?.filterTypes) ? session.topicSelection.filterTypes : [],
      pageIndex: Number.isFinite(session?.topicSelection?.pageIndex) ? session.topicSelection.pageIndex : 0,
      selectedTopic: topic,
      selectedTopicId: session?.topicSelection?.selectedTopicId ?? topic?.id ?? null,
      source: session?.topicSelection?.source ?? 'preset',
    },
    updatedAt: normalizeIsoTimestamp(session?.updatedAt) || normalizeIsoTimestamp(session?.createdAt) || new Date().toISOString(),
  }
}

function buildArticleFilePayload(session) {
  const ids = buildSessionStorageIds(session)
  const topic = getSelectedTopic(session)
  const version = getActiveVersion(session)
  const draftMarkdown = version?.draftMarkdown?.trim() || ''

  if (!topic || !version || !draftMarkdown) {
    return null
  }

  const stageId = session?.stageId === 'completed' ? 'completed' : 'preview'

  return {
    articleId: ids.articleId,
    assets: {
      fixedLayoutConfigVersion: 1,
      imageIds: [],
    },
    content: {
      activeVersionId: session?.draftReview?.activeVersionId ?? version?.id ?? null,
      auditMarkdown: version?.reportMarkdown?.trim() || '',
      draftMarkdown,
      readableLength: countReadableLength(stripPreviewHeading(draftMarkdown)),
      versionNumber: Number(version?.versionNumber) || Number(version?.label?.replace(/^V/i, '')) || 1,
    },
    createdAt: normalizeIsoTimestamp(session?.createdAt) || new Date().toISOString(),
    layoutReview: session?.layoutReview ?? {
      device: 'mobile',
      fontSize: 'medium',
    },
    penName: topic?.penName || '未设置',
    schemaVersion: 1,
    sessionId: session?.id ?? '',
    stageId,
    statusLabel: stageId === 'completed' ? '已排版' : '已确认文字稿',
    theme: topic?.theme || '未设置母题',
    title: resolveVersionDisplayTitle(session, version) || session?.title || '未命名文章',
    topic: {
      id: topic?.id ?? null,
      penName: topic?.penName || '未设置',
      source: session?.topicSelection?.source ?? 'preset',
      theme: topic?.theme || '未设置母题',
      title: topic?.title || '',
      type: topic?.type || '未设置',
    },
    type: topic?.type || '未设置',
    updatedAt: normalizeIsoTimestamp(session?.updatedAt) || normalizeIsoTimestamp(session?.createdAt) || new Date().toISOString(),
  }
}

function buildSessionIndexPayload(state) {
  const sessions = Array.isArray(state?.sessions) ? state.sessions : []
  const items = sessions
    .map((session) => {
      const ids = buildSessionStorageIds(session)
      return {
        articleId: ids.articleId,
        hasHistory: hasSessionHistory(session),
        lastMessageAt:
          Array.isArray(session?.messages) && session.messages.length > 0
            ? session.messages[session.messages.length - 1]?.createdAt ?? null
            : null,
        path: ids.sessionKey,
        sessionId: session?.id ?? '',
        stageId: session?.stageId ?? 'topic',
        title: typeof session?.title === 'string' ? session.title : '',
        updatedAt: normalizeIsoTimestamp(session?.updatedAt) || normalizeIsoTimestamp(session?.createdAt) || new Date().toISOString(),
      }
    })
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())

  return {
    activeSessionId: state?.activeSessionId ?? null,
    isSidebarCollapsed: Boolean(state?.isSidebarCollapsed),
    items,
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
  }
}

function buildArticleIndexPayload(state) {
  const sessions = Array.isArray(state?.sessions) ? state.sessions : []
  const items = sessions
    .filter((session) => session?.stageId === 'preview' || session?.stageId === 'completed')
    .map((session) => {
      const ids = buildSessionStorageIds(session)
      const topic = getSelectedTopic(session)
      const version = getActiveVersion(session)
      const stageId = session?.stageId === 'completed' ? 'completed' : 'preview'

      return {
        articleId: ids.articleId,
        createdAt: normalizeIsoTimestamp(session?.createdAt) || new Date().toISOString(),
        path: ids.articleKey,
        penName: topic?.penName || '未设置',
        sessionId: session?.id ?? '',
        stageId,
        statusLabel: stageId === 'completed' ? '已排版' : '已确认文字稿',
        theme: topic?.theme || '未设置母题',
        title: resolveVersionDisplayTitle(session, version) || session?.title || '未命名文章',
        type: topic?.type || '未设置',
        updatedAt: normalizeIsoTimestamp(session?.updatedAt) || normalizeIsoTimestamp(session?.createdAt) || new Date().toISOString(),
      }
    })
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())

  return {
    items,
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
  }
}

async function writeDerivedObjectsToOss(state) {
  const sessions = Array.isArray(state?.sessions) ? state.sessions : []

  await Promise.all(
    sessions.map(async (session) => {
      const ids = buildSessionStorageIds(session)
      await putJsonObject(ids.sessionKey, buildSessionFilePayload(session))

      const articlePayload = buildArticleFilePayload(session)

      if (articlePayload) {
        await putJsonObject(ids.articleKey, articlePayload)
      }
    }),
  )

  await Promise.all([
    putJsonObject(SESSION_INDEX_KEY, buildSessionIndexPayload(state)),
    putJsonObject(ARTICLE_INDEX_KEY, buildArticleIndexPayload(state)),
  ])
}

async function readStateFromOssIndexes() {
  const sessionIndex = await getJsonObject(SESSION_INDEX_KEY)

  if (!sessionIndex || !Array.isArray(sessionIndex.items) || sessionIndex.items.length === 0) {
    return null
  }

  const sessionPayloads = await Promise.all(
    sessionIndex.items.map((item) => getJsonObject(item?.path || '')),
  )
  const sessions = sessionPayloads.filter(Boolean)

  if (sessions.length === 0) {
    return null
  }

  return {
    activeSessionId:
      typeof sessionIndex.activeSessionId === 'string' && sessions.some((session) => session.sessionId === sessionIndex.activeSessionId)
        ? sessionIndex.activeSessionId
        : sessions[0].sessionId,
    isSidebarCollapsed: Boolean(sessionIndex.isSidebarCollapsed),
    sessions: sessions
      .map((payload) => ({
        ...payload,
        id: payload.sessionId,
      }))
      .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()),
  }
}

export function isAliyunOssConfigured() {
  return resolveAliyunOssConfig().enabled
}

export function getAliyunOssPublicConfig() {
  const config = resolveAliyunOssConfig()
  return {
    bucket: config.bucket,
    enabled: config.enabled,
    endpoint: config.endpoint,
    region: config.region,
  }
}

export async function readContentSessionPayloadFromOss({ name = 'content-creation-sessions-v1' } = {}) {
  if (!isAliyunOssConfigured()) {
    return null
  }

  const state = await readStateFromOssIndexes()

  if (!state) {
    return null
  }

  const latestUpdatedAt = Array.isArray(state.sessions)
    ? state.sessions.reduce((latest, session) => {
        const nextTime = new Date(session?.updatedAt || session?.createdAt || 0).getTime()
        return Number.isFinite(nextTime) && nextTime > latest ? nextTime : latest
      }, 0)
    : 0

  return {
    item: {
      state,
      version: 4,
    },
    name,
    updatedAt: latestUpdatedAt > 0 ? new Date(latestUpdatedAt).toISOString() : new Date().toISOString(),
  }
}

export async function writeContentSessionPayloadToOss({ item, name = 'content-creation-sessions-v1' } = {}) {
  if (!item || typeof item !== 'object') {
    throw createOssError('缺少可写入 OSS 的会话数据', 400)
  }

  if (!isAliyunOssConfigured()) {
    return null
  }

  const state = item?.state

  if (!state || typeof state !== 'object') {
    throw createOssError('OSS 会话数据缺少 state', 400)
  }

  await writeDerivedObjectsToOss(state)

  return {
    item,
    name,
    updatedAt: new Date().toISOString(),
  }
}

export async function deleteContentSessionPayloadFromOss() {
  if (!isAliyunOssConfigured()) {
    return null
  }

  await Promise.allSettled([
    deleteObject(SESSION_INDEX_KEY),
    deleteObject(ARTICLE_INDEX_KEY),
    deleteObject(TOPIC_INDEX_KEY),
    deleteObject(CONFIG_INDEX_KEY),
  ])

  return { deleted: true }
}

export async function runAliyunOssHealthcheck() {
  if (!isAliyunOssConfigured()) {
    throw createOssError('OSS 未完成配置', 400)
  }

  const objectKey = `${OSS_ROOT_PREFIX}/index/_healthcheck.json`
  const payload = {
    checkedAt: new Date().toISOString(),
    ok: true,
  }

  await putJsonObject(objectKey, payload)
  const readBack = await getJsonObject(objectKey)
  await deleteObject(objectKey)

  return {
    objectKey,
    readBack,
    success: Boolean(readBack?.ok),
  }
}
