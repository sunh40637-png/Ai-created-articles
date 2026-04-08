import crypto from 'node:crypto'
import { stat } from 'node:fs/promises'
import {
  CONTENT_SESSION_PERSISTENCE_PATH,
  readPersistedContentSessionPayloadFromLocal,
  writePersistedContentSessionPayloadToLocal,
} from './contentSessionPersistence.js'
import {
  getAliyunOssPublicConfig,
  isAliyunOssConfigured,
  readContentSessionPayloadFromOss,
  readShortContentPayloadFromOss,
  writeContentSessionPayloadToOss,
  writeShortContentPayloadToOss,
} from './ossContentStorage.js'
import {
  SHORT_CONTENT_SESSION_PERSISTENCE_PATH,
  readPersistedShortContentPayload,
  writePersistedShortContentPayload,
} from './shortContentSessionPersistence.js'

const MANUAL_SYNC_SUMMARY = '本地会自动保存；云端不同步，只有在这里检查并手动执行后才会更新。'

function toTimestamp(value) {
  const timestamp = new Date(value || 0).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

async function readFileStat(filePath) {
  try {
    const fileStat = await stat(filePath)
    return {
      exists: true,
      mtime: fileStat.mtime.toISOString(),
      size: fileStat.size,
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {
        exists: false,
        mtime: null,
        size: 0,
      }
    }

    throw error
  }
}

function stableSerialize(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(',')}]`
  }

  if (!value || typeof value !== 'object') {
    return JSON.stringify(value)
  }

  const entries = Object.keys(value)
    .sort((left, right) => left.localeCompare(right))
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)

  return `{${entries.join(',')}}`
}

function buildStateHash(payload) {
  const state = payload?.item?.state

  if (!state || typeof state !== 'object') {
    return null
  }

  return crypto.createHash('sha1').update(stableSerialize(state), 'utf8').digest('hex').slice(0, 12)
}

function countLongContentSessions(payload) {
  return Array.isArray(payload?.item?.state?.sessions) ? payload.item.state.sessions.length : 0
}

function countShortContentConversations(payload) {
  if (!Array.isArray(payload?.item?.state?.conversations)) {
    return 0
  }

  return payload.item.state.conversations.filter(
    (conversation) => Array.isArray(conversation?.versions) && conversation.versions.length > 0,
  ).length
}

function resolveStatusMeta(status) {
  switch (status) {
    case 'synced':
      return {
        label: '已同步',
        summary: '本地和云端内容一致。',
        tone: 'success',
      }
    case 'local_only':
      return {
        label: '仅本地',
        summary: '当前只有本地有内容，云端还是空的。',
        tone: 'warning',
      }
    case 'cloud_only':
      return {
        label: '仅云端',
        summary: '当前只有云端有内容，本机还没有恢复。',
        tone: 'warning',
      }
    case 'local_newer':
      return {
        label: '本地较新',
        summary: '你本机改过内容，但还没手动同步到云端。',
        tone: 'warning',
      }
    case 'cloud_newer':
      return {
        label: '云端较新',
        summary: '云端版本更新，可以恢复到这台电脑。',
        tone: 'warning',
      }
    case 'conflict':
      return {
        label: '需要选择',
        summary: '本地和云端内容不同，请选择保留哪一边。',
        tone: 'warning',
      }
    case 'cloud_unavailable':
      return {
        label: '云端不可用',
        summary: '暂时无法读取云端状态，请稍后再检查。',
        tone: 'danger',
      }
    case 'cloud_disabled':
      return {
        label: '未配置云端',
        summary: '当前环境还没有启用阿里云 OSS。',
        tone: 'neutral',
      }
    default:
      return {
        label: '暂无数据',
        summary: '本地和云端都还没有实际内容。',
        tone: 'neutral',
      }
  }
}

function resolveAvailableActions(status) {
  switch (status) {
    case 'local_only':
    case 'local_newer':
      return ['push']
    case 'cloud_only':
    case 'cloud_newer':
      return ['pull']
    case 'conflict':
      return ['push', 'pull']
    default:
      return []
  }
}

function buildActionMeta(action) {
  if (action === 'push') {
    return {
      action,
      label: '同步到云端',
    }
  }

  return {
    action,
    label: '恢复到本机',
  }
}

function resolveSyncStatus({ cloudEnabled, cloudError, cloudHash, cloudUpdatedAt, localHash, localUpdatedAt }) {
  if (!cloudEnabled) {
    return 'cloud_disabled'
  }

  if (cloudError) {
    return 'cloud_unavailable'
  }

  const hasLocal = Boolean(localHash)
  const hasCloud = Boolean(cloudHash)

  if (!hasLocal && !hasCloud) {
    return 'empty'
  }

  if (hasLocal && !hasCloud) {
    return 'local_only'
  }

  if (!hasLocal && hasCloud) {
    return 'cloud_only'
  }

  if (localHash === cloudHash) {
    return 'synced'
  }

  const localTime = toTimestamp(localUpdatedAt)
  const cloudTime = toTimestamp(cloudUpdatedAt)

  if (localTime > cloudTime) {
    return 'local_newer'
  }

  if (cloudTime > localTime) {
    return 'cloud_newer'
  }

  return 'conflict'
}

function buildTargetStatus({
  cloudEnabled,
  cloudError = '',
  cloudPayload,
  countFromPayload,
  localPath,
  localPayload,
  localStat,
  type,
}) {
  const localCount = countFromPayload(localPayload)
  const cloudCount = cloudEnabled ? countFromPayload(cloudPayload) : 0
  const localHash = localCount > 0 ? buildStateHash(localPayload) : null
  const cloudHash = cloudEnabled && cloudCount > 0 ? buildStateHash(cloudPayload) : null
  const localUpdatedAt = localPayload?.updatedAt || localStat?.mtime || null
  const cloudUpdatedAt = cloudEnabled ? cloudPayload?.updatedAt || null : null
  const status = resolveSyncStatus({
    cloudEnabled,
    cloudError,
    cloudHash,
    cloudUpdatedAt,
    localHash,
    localUpdatedAt,
  })
  const statusMeta = resolveStatusMeta(status)
  const countLabel = type === 'content' ? 'sessionCount' : 'conversationCount'

  return {
    actions: resolveAvailableActions(status).map(buildActionMeta),
    cloud: {
      ...getAliyunOssPublicConfig(),
      [countLabel]: cloudCount,
      enabled: cloudEnabled,
      error: cloudError || null,
      exists: Boolean(cloudHash),
      hash: cloudHash,
      updatedAt: cloudUpdatedAt,
    },
    local: {
      [countLabel]: localCount,
      exists: Boolean(localHash),
      hash: localHash,
      localPath,
      size: localStat?.size ?? 0,
      updatedAt: localUpdatedAt,
    },
    status,
    statusLabel: statusMeta.label,
    statusSummary: statusMeta.summary,
    tone: statusMeta.tone,
  }
}

export async function readSystemSyncStatus() {
  const [contentLocalPayload, contentLocalStat, shortLocalPayload, shortLocalStat] = await Promise.all([
    readPersistedContentSessionPayloadFromLocal(),
    readFileStat(CONTENT_SESSION_PERSISTENCE_PATH),
    readPersistedShortContentPayload(),
    readFileStat(SHORT_CONTENT_SESSION_PERSISTENCE_PATH),
  ])

  const cloudEnabled = isAliyunOssConfigured()
  let contentCloudPayload = null
  let shortCloudPayload = null
  let contentCloudError = ''
  let shortCloudError = ''

  if (cloudEnabled) {
    try {
      contentCloudPayload = await readContentSessionPayloadFromOss()
    } catch (error) {
      contentCloudError = error.message || '读取长文云端镜像失败'
    }

    try {
      shortCloudPayload = await readShortContentPayloadFromOss()
    } catch (error) {
      shortCloudError = error.message || '读取短文云端镜像失败'
    }
  }

  return {
    checkedAt: new Date().toISOString(),
    content: {
      ...buildTargetStatus({
        cloudEnabled,
        cloudError: contentCloudError,
        cloudPayload: contentCloudPayload,
        countFromPayload: countLongContentSessions,
        localPath: CONTENT_SESSION_PERSISTENCE_PATH,
        localPayload: contentLocalPayload,
        localStat: contentLocalStat,
        type: 'content',
      }),
      label: '长文创作',
      summary: MANUAL_SYNC_SUMMARY,
    },
    shortContent: {
      ...buildTargetStatus({
        cloudEnabled,
        cloudError: shortCloudError,
        cloudPayload: shortCloudPayload,
        countFromPayload: countShortContentConversations,
        localPath: SHORT_CONTENT_SESSION_PERSISTENCE_PATH,
        localPayload: shortLocalPayload,
        localStat: shortLocalStat,
        type: 'short',
      }),
      label: '短文生成',
      summary: MANUAL_SYNC_SUMMARY,
    },
  }
}

function normalizeSyncTarget(target = '') {
  return target === 'shortContent' ? 'shortContent' : target === 'content' ? 'content' : ''
}

function normalizeSyncAction(action = '') {
  return action === 'pull' ? 'pull' : action === 'push' ? 'push' : ''
}

export async function performSystemSyncAction({ action, target }) {
  const normalizedTarget = normalizeSyncTarget(target)
  const normalizedAction = normalizeSyncAction(action)

  if (!normalizedTarget) {
    const error = new Error('缺少有效的同步对象')
    error.status = 400
    throw error
  }

  if (!normalizedAction) {
    const error = new Error('缺少有效的同步动作')
    error.status = 400
    throw error
  }

  if (!isAliyunOssConfigured()) {
    const error = new Error('当前环境未配置阿里云 OSS，无法执行云端同步')
    error.status = 400
    throw error
  }

  let payload = null

  if (normalizedTarget === 'content') {
    if (normalizedAction === 'push') {
      const localPayload = await readPersistedContentSessionPayloadFromLocal()

      if (!localPayload?.item) {
        const error = new Error('当前没有可同步到云端的长文内容')
        error.status = 400
        throw error
      }

      payload = await writeContentSessionPayloadToOss({
        item: localPayload.item,
        name: localPayload.name,
      })
    } else {
      const cloudPayload = await readContentSessionPayloadFromOss()

      if (!cloudPayload?.item) {
        const error = new Error('云端当前没有可恢复的长文内容')
        error.status = 400
        throw error
      }

      payload = await writePersistedContentSessionPayloadToLocal({
        item: cloudPayload.item,
        name: cloudPayload.name,
      })
    }
  } else if (normalizedAction === 'push') {
    const localPayload = await readPersistedShortContentPayload()

    if (!localPayload?.item) {
      const error = new Error('当前没有可同步到云端的短文内容')
      error.status = 400
      throw error
    }

    payload = await writeShortContentPayloadToOss({
      item: localPayload.item,
      name: localPayload.name,
    })
  } else {
    const cloudPayload = await readShortContentPayloadFromOss()

    if (!cloudPayload?.item) {
      const error = new Error('云端当前没有可恢复的短文内容')
      error.status = 400
      throw error
    }

    payload = await writePersistedShortContentPayload({
      item: cloudPayload.item,
      name: cloudPayload.name,
    })
  }

  return {
    action: normalizedAction,
    item: payload?.item ?? null,
    syncStatus: await readSystemSyncStatus(),
    target: normalizedTarget,
  }
}
