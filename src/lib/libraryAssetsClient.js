import { DEFAULT_LIBRARY_ASSET_SORT } from '../../shared/libraryAssets.js'

async function readJsonResponse(response, fallbackMessage) {
  const contentType = response.headers.get('content-type') || ''
  const payload = await response.json().catch(() => null)

  if (!contentType.includes('application/json')) {
    throw new Error(fallbackMessage)
  }

  return payload
}

export function formatLibraryAssetDate(value) {
  if (!value) {
    return '未知时间'
  }

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '未知时间'
  }

  return date.toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  })
}

export async function requestLibraryAssets({ emotion = '', figures = '', sort = DEFAULT_LIBRARY_ASSET_SORT, topic = '' } = {}) {
  const searchParams = new URLSearchParams()

  if (emotion) {
    searchParams.set('emotion', emotion)
  }

  if (topic) {
    searchParams.set('topic', topic)
  }

  if (figures) {
    searchParams.set('figures', figures)
  }

  if (sort) {
    searchParams.set('sort', sort)
  }

  const query = searchParams.toString()
  const response = await fetch(query ? `/api/library-assets?${query}` : '/api/library-assets')
  const payload = await readJsonResponse(response, '素材库接口返回异常，请刷新页面后重试。')

  if (!response.ok) {
    throw new Error(payload?.error || '读取素材库失败')
  }

  return Array.isArray(payload?.items) ? payload.items : []
}

export async function requestLibraryAssetUpdate(assetId, patch) {
  const response = await fetch(`/api/library-assets/${assetId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(patch),
  })
  const payload = await readJsonResponse(response, '素材库更新接口返回异常，请稍后重试。')

  if (!response.ok) {
    throw new Error(payload?.error || '更新素材失败')
  }

  return payload
}

export async function requestLibraryAssetDelete(assetId) {
  const response = await fetch(`/api/library-assets/${assetId}`, {
    method: 'DELETE',
  })
  const payload = await readJsonResponse(response, '素材库删除接口返回异常，请稍后重试。')

  if (!response.ok) {
    throw new Error(payload?.error || '删除素材失败')
  }

  return payload
}
