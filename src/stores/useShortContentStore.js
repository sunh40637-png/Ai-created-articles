import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export const SHORT_CONTENT_STORAGE_KEY = 'short-content-conversations-v1'
export const SHORT_CONTENT_STORAGE_VERSION = 1
const DEFAULT_CONVERSATION_TITLE = '新对话'
const TITLE_SLICE_LENGTH = 14

function createId(prefix = 'short-content') {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`
}

function normalizeTrimmedString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function stripNumericPrefix(line = '') {
  return String(line).replace(/^\s*\d+[、.．]\s*/u, '').trim()
}

function stripEndingLine(content = '') {
  return String(content)
    .replace(/\n{2,}(认同的点亮文末"爱心"，转发分享，弘扬中华传统文化！|同意请点亮文末"爱心"，转发分享，弘扬中华传统文化！)\s*$/u, '')
    .trim()
}

export function resolveShortConversationTitle(content = '') {
  const body = stripEndingLine(content)
  const firstMeaningfulLine = body
    .split(/\n+/)
    .map((line) => stripNumericPrefix(line))
    .find(Boolean)

  if (!firstMeaningfulLine) {
    return DEFAULT_CONVERSATION_TITLE
  }

  if (firstMeaningfulLine.length <= TITLE_SLICE_LENGTH) {
    return firstMeaningfulLine
  }

  return `${firstMeaningfulLine.slice(0, TITLE_SLICE_LENGTH)}...`
}

function createConversation() {
  const now = new Date().toISOString()

  return {
    activeVersionId: null,
    createdAt: now,
    generationError: '',
    generationStatus: 'idle',
    id: createId('short-conversation'),
    publishStatus: 'default',
    title: DEFAULT_CONVERSATION_TITLE,
    updatedAt: now,
    versions: [],
  }
}

function createInitialState() {
  const initialConversation = createConversation()

  return {
    activeConversationId: initialConversation.id,
    conversations: [initialConversation],
    isConversationPaneCollapsed: false,
  }
}

function normalizeVersion(version) {
  const content = normalizeTrimmedString(version?.content)
  const createdAt = normalizeTrimmedString(version?.createdAt) || new Date().toISOString()
  const endingVariant = version?.endingVariant === 'agree' ? 'agree' : 'identify'

  if (!content) {
    return null
  }

  return {
    content,
    createdAt,
    endingVariant,
    id: normalizeTrimmedString(version?.id) || createId('short-version'),
  }
}

function normalizeConversation(conversation) {
  const fallbackConversation = createConversation()
  const versions = Array.isArray(conversation?.versions)
    ? conversation.versions.map(normalizeVersion).filter(Boolean)
    : []
  const latestVersion = versions[versions.length - 1] ?? null
  const activeVersionId =
    typeof conversation?.activeVersionId === 'string' && versions.some((version) => version.id === conversation.activeVersionId)
      ? conversation.activeVersionId
      : latestVersion?.id ?? null

  return {
    ...fallbackConversation,
    ...conversation,
    activeVersionId,
    createdAt: normalizeTrimmedString(conversation?.createdAt) || fallbackConversation.createdAt,
    generationError: typeof conversation?.generationError === 'string' ? conversation.generationError : '',
    generationStatus:
      conversation?.generationStatus === 'generating' || conversation?.generationStatus === 'error'
        ? conversation.generationStatus
        : 'idle',
    id: normalizeTrimmedString(conversation?.id) || fallbackConversation.id,
    publishStatus: conversation?.publishStatus === 'published' ? 'published' : 'default',
    title:
      normalizeTrimmedString(conversation?.title) ||
      resolveShortConversationTitle(latestVersion?.content || '') ||
      DEFAULT_CONVERSATION_TITLE,
    updatedAt: normalizeTrimmedString(conversation?.updatedAt) || fallbackConversation.updatedAt,
    versions,
  }
}

function ensureShortContentStateShape(state) {
  const conversations = Array.isArray(state?.conversations) ? state.conversations.map(normalizeConversation) : []
  const normalizedConversations = conversations.length > 0 ? conversations : [createConversation()]
  const activeConversationId =
    typeof state?.activeConversationId === 'string' &&
    normalizedConversations.some((conversation) => conversation.id === state.activeConversationId)
      ? state.activeConversationId
      : normalizedConversations[0].id

  return {
    activeConversationId,
    conversations: normalizedConversations,
    isConversationPaneCollapsed: Boolean(state?.isConversationPaneCollapsed),
  }
}

export function createPersistableShortContentState(state) {
  return {
    activeConversationId: state.activeConversationId,
    conversations: state.conversations,
    isConversationPaneCollapsed: state.isConversationPaneCollapsed,
  }
}

export function getShortContentLatestTimestamp(state) {
  const conversations = Array.isArray(state?.conversations) ? state.conversations : []

  return conversations.reduce((latest, conversation) => {
    const timestamp = new Date(conversation?.updatedAt || conversation?.createdAt || 0).getTime()
    return Number.isFinite(timestamp) && timestamp > latest ? timestamp : latest
  }, 0)
}

export const useShortContentStore = create(
  persist(
    (set) => {
      const initialState = createInitialState()

      return {
        ...initialState,
        appendGeneratedVersion: (conversationId, { content, endingVariant }) =>
          set((state) => ({
            conversations: state.conversations.map((conversation) => {
              if (conversation.id !== conversationId) {
                return conversation
              }

              const normalizedContent = normalizeTrimmedString(content)

              if (!normalizedContent) {
                return conversation
              }

              const now = new Date().toISOString()
              const nextVersion = {
                content: normalizedContent,
                createdAt: now,
                endingVariant: endingVariant === 'agree' ? 'agree' : 'identify',
                id: createId('short-version'),
              }
              const nextVersions = [...conversation.versions, nextVersion]

              return {
                ...conversation,
                activeVersionId: nextVersion.id,
                generationError: '',
                generationStatus: 'idle',
                publishStatus: 'default',
                title: resolveShortConversationTitle(nextVersion.content),
                updatedAt: now,
                versions: nextVersions,
              }
            }),
          })),
        createConversation: () => {
          const nextConversation = createConversation()

          set((state) => ({
            activeConversationId: nextConversation.id,
            conversations: [nextConversation, ...state.conversations],
          }))

          return nextConversation.id
        },
        hydrateFromPersistedSnapshot: (snapshot) =>
          set(() => ({
            ...ensureShortContentStateShape(snapshot),
          })),
        setActiveConversationId: (conversationId) =>
          set((state) => {
            if (!state.conversations.some((conversation) => conversation.id === conversationId)) {
              return state
            }

            return { activeConversationId: conversationId }
          }),
        setActiveVersionId: (conversationId, versionId) =>
          set((state) => ({
            conversations: state.conversations.map((conversation) => {
              if (conversation.id !== conversationId) {
                return conversation
              }

              if (!conversation.versions.some((version) => version.id === versionId)) {
                return conversation
              }

              return {
                ...conversation,
                activeVersionId: versionId,
              }
            }),
          })),
        setConversationGenerationState: (conversationId, nextState) =>
          set((state) => ({
            conversations: state.conversations.map((conversation) => {
              if (conversation.id !== conversationId) {
                return conversation
              }

              const nextStatus =
                nextState?.generationStatus === 'generating' || nextState?.generationStatus === 'error'
                  ? nextState.generationStatus
                  : 'idle'

              return {
                ...conversation,
                generationError: typeof nextState?.generationError === 'string' ? nextState.generationError : '',
                generationStatus: nextStatus,
                updatedAt: nextStatus === 'error' ? new Date().toISOString() : conversation.updatedAt,
              }
            }),
          })),
        setConversationPaneCollapsed: (nextValue) =>
          set(() => ({
            isConversationPaneCollapsed: Boolean(nextValue),
          })),
        setConversationPublishStatus: (conversationId, publishStatus) =>
          set((state) => ({
            conversations: state.conversations.map((conversation) => {
              if (conversation.id !== conversationId) {
                return conversation
              }

              return {
                ...conversation,
                publishStatus: publishStatus === 'published' ? 'published' : 'default',
                updatedAt: new Date().toISOString(),
              }
            }),
          })),
      }
    },
    {
      name: SHORT_CONTENT_STORAGE_KEY,
      version: SHORT_CONTENT_STORAGE_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => createPersistableShortContentState(state),
      migrate: (persistedState) => ensureShortContentStateShape(persistedState),
    },
  ),
)
