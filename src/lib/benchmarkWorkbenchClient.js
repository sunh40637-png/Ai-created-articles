import { getReadableDraftBodyMarkdown } from '@/lib/articlePreviewHtml.jsx'
import { getTopicById } from '@/stores/useBenchmarkStore.js'

export const workbenchTabs = [
  { id: 'draft', label: '文字稿', icon: 'draft' },
  { id: 'report', label: '校验报告', icon: 'report' },
  { id: 'preview', label: '排版预览', icon: 'preview' },
  { id: 'versions', label: '版本记录', icon: 'versions' },
]

export const previewFontSizeOptions = [
  { id: 'small', label: '小' },
  { id: 'medium', label: '推荐' },
  { id: 'large', label: '大' },
]

export const ARTICLE_LIST_STATUS_META = {
  preview: {
    label: '已确认文字稿',
    className: 'border border-amber-200/80 bg-amber-50 text-amber-700',
  },
  completed: {
    label: '已排版',
    className: 'border border-emerald-200/80 bg-emerald-50 text-emerald-700',
  },
}

export function formatMessageTime(value) {
  if (!value) {
    return ''
  }

  try {
    return new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      month: 'numeric',
      day: 'numeric',
    }).format(new Date(value))
  } catch {
    return ''
  }
}

export function normalizePreviewFontSize(value) {
  if (value === 'small' || value === 'large') {
    return value
  }

  return 'medium'
}

export function getSelectedTopic(session) {
  const selectedTopicId = session?.topicSelection?.selectedTopicId

  return (
    session?.topicSelection?.selectedTopic ??
    session?.topicSelection?.recommendations?.find((topic) => topic.id === selectedTopicId) ??
    getTopicById(selectedTopicId) ??
    session?.topicSelection?.recommendations?.[0] ??
    null
  )
}

export function getActiveVersion(session) {
  const versions = session?.draftReview?.versions ?? []

  if (versions.length === 0) {
    return null
  }

  return versions.find((version) => version.id === session?.draftReview?.activeVersionId) ?? versions[versions.length - 1]
}

function readLooseTitle(value) {
  if (typeof value === 'string') {
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

export function resolveVersionGeneratedTitle(version) {
  const directTitle = readLooseTitle(version?.generatedTitle)

  if (directTitle) {
    return directTitle
  }

  const legacyCandidate = Array.isArray(version?.titleCandidates) ? version.titleCandidates[0] : null
  return readLooseTitle(legacyCandidate)
}

export function resolveVersionDisplayTitle(session, version) {
  return resolveVersionGeneratedTitle(version) || getSelectedTopic(session)?.title || session?.title || ''
}

export function getDraftBodyMarkdown(version) {
  return getReadableDraftBodyMarkdown(version?.draftMarkdown ?? '')
}

export function getArticleListStatusMeta(stageId = 'preview') {
  return ARTICLE_LIST_STATUS_META[stageId] ?? ARTICLE_LIST_STATUS_META.preview
}

export function getAvailableTabs(session) {
  const tabs = []
  const hasDraft = Boolean(getActiveVersion(session)?.draftMarkdown)
  const hasPreview = session?.stageId === 'preview' || session?.stageId === 'completed'

  if (hasDraft) {
    tabs.push('draft', 'report')
  }

  if (hasPreview) {
    tabs.push('preview', 'versions')
  }

  return tabs.length > 0 ? tabs : ['draft']
}
