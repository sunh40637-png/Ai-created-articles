import crypto from 'node:crypto'
import {
  CONTENT_TOPIC_LIBRARY,
  MAX_ARTICLE_SESSIONS,
  TOPIC_PAGE_SIZE,
  getTopicStatusMap,
} from '../src/stores/useBenchmarkStore.js'
import {
  CONTENT_RULE_PROFILES,
  DEFAULT_CONTENT_RULE_PROFILE_ID,
  resolveLiveContentRuleProfileId,
} from './contentRuleProfiles.js'
import { resolveAliyunOssConfig } from './runtimeConfig.js'
import { countReadableLength } from '../shared/readableLength.js'

const OSS_ROOT_PREFIX = 'content-system'
const SESSION_INDEX_KEY = `${OSS_ROOT_PREFIX}/index/sessions.json`
const ARTICLE_INDEX_KEY = `${OSS_ROOT_PREFIX}/index/articles.json`
const TOPIC_INDEX_KEY = `${OSS_ROOT_PREFIX}/index/topics.json`
const CONFIG_INDEX_KEY = `${OSS_ROOT_PREFIX}/index/configs.json`
const TOPIC_LIBRARY_KEY = `${OSS_ROOT_PREFIX}/topic-library/topic-library.json`
const WRITING_CONFIG_KEY = `${OSS_ROOT_PREFIX}/configs/writing-config.json`
const SYSTEM_CONFIG_KEY = `${OSS_ROOT_PREFIX}/configs/system-config.json`
const CONTENT_SESSION_SNAPSHOT_KEY = `${OSS_ROOT_PREFIX}/sync/content-creation-sessions.json`
const SHORT_CONTENT_SNAPSHOT_KEY = `${OSS_ROOT_PREFIX}/sync/short-content-conversations.json`
const TOPIC_STATUS_PRIORITY = {
  pending: 0,
  'in-progress': 1,
  completed: 2,
}
const STATIC_RESOURCE_CREATED_AT = '2026-04-02T00:00:00.000Z'

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

function buildTopicLinkMap(state) {
  const sessions = Array.isArray(state?.sessions) ? state.sessions : []

  return sessions.reduce((topicLinkMap, session) => {
    const topicId =
      typeof session?.topicSelection?.selectedTopicId === 'string'
        ? session.topicSelection.selectedTopicId
        : typeof session?.topicSelection?.selectedTopic?.id === 'string'
          ? session.topicSelection.selectedTopic.id
          : ''

    if (!topicId) {
      return topicLinkMap
    }

    const ids = buildSessionStorageIds(session)
    const nextStatus = session?.stageId === 'completed' ? 'completed' : 'in-progress'
    const nextUpdatedAt =
      normalizeIsoTimestamp(session?.updatedAt) || normalizeIsoTimestamp(session?.createdAt) || new Date().toISOString()
    const current = topicLinkMap[topicId]
    const shouldReplace =
      !current ||
      TOPIC_STATUS_PRIORITY[nextStatus] > TOPIC_STATUS_PRIORITY[current.status] ||
      (TOPIC_STATUS_PRIORITY[nextStatus] === TOPIC_STATUS_PRIORITY[current.status] &&
        new Date(nextUpdatedAt).getTime() > new Date(current.updatedAt).getTime())

    if (shouldReplace) {
      topicLinkMap[topicId] = {
        articleId: session?.stageId === 'preview' || session?.stageId === 'completed' ? ids.articleId : null,
        sessionId: session?.id ?? '',
        status: nextStatus,
        updatedAt: nextUpdatedAt,
      }
    }

    return topicLinkMap
  }, {})
}

function buildTopicLibraryPayload(state) {
  const topicStatusMap = getTopicStatusMap(Array.isArray(state?.sessions) ? state.sessions : [])
  const topicLinkMap = buildTopicLinkMap(state)
  const updatedAt = new Date().toISOString()

  return {
    items: CONTENT_TOPIC_LIBRARY.map((topic) => {
      const status = topicStatusMap[topic.id] ?? 'pending'
      const linkMeta = topicLinkMap[topic.id] ?? null

      return {
        createdAt: STATIC_RESOURCE_CREATED_AT,
        id: topic.id,
        linkedArticleId: linkMeta?.articleId ?? null,
        penName: topic.penName,
        reason: topic.reason,
        status,
        theme: topic.theme,
        title: topic.title,
        type: topic.type,
        updatedAt: linkMeta?.updatedAt ?? updatedAt,
      }
    }),
    schemaVersion: 1,
    updatedAt,
  }
}

function buildTopicIndexPayload(state) {
  const topicLibraryPayload = buildTopicLibraryPayload(state)

  return {
    items: topicLibraryPayload.items
      .map((topic) => ({
        linkedArticleId: topic.linkedArticleId,
        status: topic.status,
        theme: topic.theme,
        title: topic.title,
        topicId: topic.id,
        type: topic.type,
        updatedAt: topic.updatedAt,
      }))
      .sort((left, right) => {
        const statusGap = TOPIC_STATUS_PRIORITY[right.status] - TOPIC_STATUS_PRIORITY[left.status]

        if (statusGap !== 0) {
          return statusGap
        }

        return left.title.localeCompare(right.title, 'zh-CN')
      }),
    schemaVersion: 1,
    updatedAt: topicLibraryPayload.updatedAt,
  }
}

function resolveProfileMode(profileId) {
  return profileId === 'B' ? 'candidate' : 'stable'
}

function buildWritingConfigPayload() {
  const updatedAt = new Date().toISOString()
  const liveRuleProfileIdMap = {
    A型: resolveLiveContentRuleProfileId({ type: 'A型' }),
    B型: resolveLiveContentRuleProfileId({ type: 'B型' }),
    C型: resolveLiveContentRuleProfileId({ type: 'C型' }),
  }

  return {
    activeRuleProfile: {
      A型: resolveProfileMode(liveRuleProfileIdMap.A型),
      B型: resolveProfileMode(liveRuleProfileIdMap.B型),
      C型: resolveProfileMode(liveRuleProfileIdMap.C型),
    },
    availableProfiles: Object.values(CONTENT_RULE_PROFILES).map((profile) => ({
      description: profile.description,
      key: resolveProfileMode(profile.id),
      label: profile.label,
      profileId: profile.id,
    })),
    configId: 'writing-config',
    createdAt: STATIC_RESOURCE_CREATED_AT,
    defaultRuleProfileId: DEFAULT_CONTENT_RULE_PROFILE_ID,
    liveRuleProfileIdMap,
    penNames: ['明远', '芷若'],
    schemaVersion: 1,
    updatedAt,
  }
}

function buildSystemConfigPayload() {
  return {
    configId: 'system-config',
    contentSessionStorageKey: 'content-creation-sessions-v1',
    createdAt: STATIC_RESOURCE_CREATED_AT,
    maxArticleSessions: MAX_ARTICLE_SESSIONS,
    persistenceTargets: ['local', 'aliyun-oss'],
    schemaVersion: 1,
    topicLibraryTotal: CONTENT_TOPIC_LIBRARY.length,
    topicPageSize: TOPIC_PAGE_SIZE,
    updatedAt: new Date().toISOString(),
  }
}

function buildConfigIndexPayload() {
  const writingConfig = buildWritingConfigPayload()
  const systemConfig = buildSystemConfigPayload()

  return {
    items: [
      {
        configId: writingConfig.configId,
        name: '文案创作配置',
        path: WRITING_CONFIG_KEY,
        updatedAt: writingConfig.updatedAt,
        version: writingConfig.schemaVersion,
      },
      {
        configId: systemConfig.configId,
        name: '系统配置',
        path: SYSTEM_CONFIG_KEY,
        updatedAt: systemConfig.updatedAt,
        version: systemConfig.schemaVersion,
      },
    ],
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
    putJsonObject(TOPIC_LIBRARY_KEY, buildTopicLibraryPayload(state)),
    putJsonObject(TOPIC_INDEX_KEY, buildTopicIndexPayload(state)),
    putJsonObject(WRITING_CONFIG_KEY, buildWritingConfigPayload()),
    putJsonObject(SYSTEM_CONFIG_KEY, buildSystemConfigPayload()),
    putJsonObject(CONFIG_INDEX_KEY, buildConfigIndexPayload()),
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

  const snapshotPayload = normalizePersistedSnapshotPayload(await getJsonObject(CONTENT_SESSION_SNAPSHOT_KEY), name)

  if (snapshotPayload?.item?.state) {
    return snapshotPayload
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

  const payload = {
    item,
    name,
    updatedAt: new Date().toISOString(),
  }

  await putJsonObject(CONTENT_SESSION_SNAPSHOT_KEY, payload)

  return payload
}

export async function deleteContentSessionPayloadFromOss() {
  if (!isAliyunOssConfigured()) {
    return null
  }

  await Promise.allSettled([
    deleteObject(CONTENT_SESSION_SNAPSHOT_KEY),
    deleteObject(SESSION_INDEX_KEY),
    deleteObject(ARTICLE_INDEX_KEY),
    deleteObject(TOPIC_INDEX_KEY),
    deleteObject(CONFIG_INDEX_KEY),
    deleteObject(TOPIC_LIBRARY_KEY),
    deleteObject(WRITING_CONFIG_KEY),
    deleteObject(SYSTEM_CONFIG_KEY),
  ])

  return { deleted: true }
}

function normalizePersistedSnapshotPayload(payload, fallbackName) {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  return {
    item: payload.item && typeof payload.item === 'object' ? payload.item : null,
    name: typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : fallbackName,
    updatedAt: normalizeIsoTimestamp(payload.updatedAt) || null,
  }
}

export async function readShortContentPayloadFromOss({ name = 'short-content-conversations-v1' } = {}) {
  if (!isAliyunOssConfigured()) {
    return null
  }

  const payload = await getJsonObject(SHORT_CONTENT_SNAPSHOT_KEY)
  return normalizePersistedSnapshotPayload(payload, name)
}

export async function writeShortContentPayloadToOss({ item, name = 'short-content-conversations-v1' } = {}) {
  if (!item || typeof item !== 'object') {
    throw createOssError('缺少可写入 OSS 的短文会话数据', 400)
  }

  if (!isAliyunOssConfigured()) {
    return null
  }

  const payload = {
    item,
    name,
    updatedAt: new Date().toISOString(),
  }

  await putJsonObject(SHORT_CONTENT_SNAPSHOT_KEY, payload)
  return payload
}

export async function deleteShortContentPayloadFromOss() {
  if (!isAliyunOssConfigured()) {
    return null
  }

  await deleteObject(SHORT_CONTENT_SNAPSHOT_KEY).catch(() => null)
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
