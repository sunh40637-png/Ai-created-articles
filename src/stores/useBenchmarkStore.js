import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

const MAX_BENCHMARK_SESSIONS = 12

const emptyWorkbenchState = {
  activeWorkbenchItemId: null,
  audioRecognitionSegments: [],
  files: [],
  views: {},
}

function compactViewsForStorage(views = {}) {
  return Object.fromEntries(
    Object.entries(views).map(([viewId, view]) => {
      if (!view || typeof view !== 'object') {
        return [viewId, view]
      }

      if (view.body === 'transcript') {
        return [
          viewId,
          {
            body: view.body,
            title: view.title,
            subtitle: view.subtitle,
            content: '',
            assetUrl: view.assetUrl,
          },
        ]
      }

      return [
        viewId,
        {
          body: view.body,
          title: view.title,
          subtitle: view.subtitle,
          content: view.content ?? '',
          assetUrl: view.assetUrl,
        },
      ]
    }),
  )
}

function compactWorkbenchStateForStorage(workbenchState = emptyWorkbenchState) {
  return {
    activeWorkbenchItemId: workbenchState.activeWorkbenchItemId ?? null,
    audioRecognitionSegments: Array.isArray(workbenchState.audioRecognitionSegments)
      ? workbenchState.audioRecognitionSegments.map((segment) => ({
          id: segment.id,
          start: segment.start,
          end: segment.end,
          text: segment.text,
          speaker: segment.speaker ?? null,
          words: Array.isArray(segment.words)
            ? segment.words.map((word) => ({
                id: word.id,
                start: word.start,
                end: word.end,
                text: word.text,
              }))
            : [],
        }))
      : [],
    files: Array.isArray(workbenchState.files) ? workbenchState.files : [],
    views: compactViewsForStorage(workbenchState.views),
  }
}

function compactMessagesForStorage(messages = []) {
  return messages.map((message) => {
    if (message.role === 'workflow') {
      return {
        id: message.id,
        role: message.role,
        title: message.title,
        createdAt: message.createdAt,
        steps: Array.isArray(message.steps)
          ? message.steps.map((step) => ({
              id: step.id,
              label: step.label,
              status: step.status,
              previewId: step.previewId,
              durationLabel: step.durationLabel,
            }))
          : [],
      }
    }

    return {
      id: message.id,
      role: message.role,
      content: typeof message.content === 'string' ? message.content : '',
      createdAt: message.createdAt,
      attachments: Array.isArray(message.attachments) ? message.attachments : [],
    }
  })
}

function compactSessionsForStorage(sessions = []) {
  return sessions.map((session) => ({
    ...session,
    messages: compactMessagesForStorage(session.messages),
    workbenchState: compactWorkbenchStateForStorage(session.workbenchState),
  }))
}

function createSessionTitle(index = 1) {
  return `新的拆解对话 ${index}`
}

function createSession(index = 1) {
  const now = new Date().toISOString()

  return {
    id: `benchmark-session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: createSessionTitle(index),
    createdAt: now,
    updatedAt: now,
    draft: '',
    deepThinkingEnabled: true,
    messages: [],
    workbenchState: emptyWorkbenchState,
    activeWorkbenchItemId: null,
    activeRightTab: 'audio-recognition',
    isWorkbenchOpen: false,
  }
}

function ensureSessionsShape(state) {
  const sessions = Array.isArray(state?.sessions) ? state.sessions : []

  if (sessions.length === 0) {
    const initialSession = createSession(1)

    return {
      activeSessionId: initialSession.id,
      sessions: [initialSession],
    }
  }

  const normalizedSessions = sessions.map((session, index) => ({
    activeRightTab: 'audio-recognition',
    activeWorkbenchItemId: null,
    createdAt: session?.createdAt ?? new Date().toISOString(),
    deepThinkingEnabled: session?.deepThinkingEnabled ?? true,
    draft: typeof session?.draft === 'string' ? session.draft : '',
    id: session?.id ?? `benchmark-session-restored-${index + 1}`,
    isWorkbenchOpen: Boolean(session?.isWorkbenchOpen),
    messages: compactMessagesForStorage(Array.isArray(session?.messages) ? session.messages : []),
    title:
      typeof session?.title === 'string' && session.title.trim().length > 0
        ? session.title
        : createSessionTitle(index + 1),
    updatedAt: session?.updatedAt ?? session?.createdAt ?? new Date().toISOString(),
    workbenchState: compactWorkbenchStateForStorage({
      ...emptyWorkbenchState,
      ...(session?.workbenchState ?? {}),
    }),
  }))

  const sessionIds = new Set(normalizedSessions.map((session) => session.id))
  const activeSessionId =
    typeof state?.activeSessionId === 'string' && sessionIds.has(state.activeSessionId)
      ? state.activeSessionId
      : normalizedSessions[0].id

  return {
    activeSessionId,
    isSidebarCollapsed: Boolean(state?.isSidebarCollapsed),
    sessions: normalizedSessions.slice(0, MAX_BENCHMARK_SESSIONS),
  }
}

export const useBenchmarkStore = create(
  persist(
    (set, get) => {
      const initialSession = createSession(1)

      return {
        activeSessionId: initialSession.id,
        isSidebarCollapsed: false,
        sessions: [initialSession],
        createSession: () => {
          const nextSession = createSession(get().sessions.length + 1)

          set((state) => ({
            activeSessionId: nextSession.id,
            sessions: [nextSession, ...state.sessions].slice(0, MAX_BENCHMARK_SESSIONS),
          }))

          return nextSession.id
        },
        deleteSession: (sessionId) => {
          let nextActiveSessionId = null

          set((state) => {
            const nextSessions = state.sessions.filter((session) => session.id !== sessionId)

            if (nextSessions.length === 0) {
              const replacementSession = createSession(1)
              nextActiveSessionId = replacementSession.id

              return {
                activeSessionId: replacementSession.id,
                sessions: [replacementSession],
              }
            }

            const fallbackActiveSessionId =
              state.activeSessionId === sessionId
                ? nextSessions[0].id
                : state.activeSessionId

            nextActiveSessionId = fallbackActiveSessionId

            return {
              activeSessionId: fallbackActiveSessionId,
              sessions: nextSessions,
            }
          })

          return nextActiveSessionId
        },
        setActiveSessionId: (sessionId) =>
          set((state) => {
            if (!state.sessions.some((session) => session.id === sessionId)) {
              return state
            }

            return { activeSessionId: sessionId }
          }),
        setSidebarCollapsed: (nextValue) =>
          set(() => ({
            isSidebarCollapsed: Boolean(nextValue),
          })),
        updateSession: (sessionId, updater) =>
          set((state) => ({
            sessions: state.sessions.map((session) => {
              if (session.id !== sessionId) {
                return session
              }

              const nextSession =
                typeof updater === 'function' ? updater(session) : { ...session, ...updater }

              return {
                ...session,
                ...nextSession,
                updatedAt: new Date().toISOString(),
              }
            }),
          })),
      }
    },
    {
      name: 'benchmark-workbench-sessions-v1',
      version: 3,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        activeSessionId: state.activeSessionId,
        isSidebarCollapsed: state.isSidebarCollapsed,
        sessions: compactSessionsForStorage(state.sessions),
      }),
      migrate: (persistedState) => ensureSessionsShape(persistedState),
    },
  ),
)
