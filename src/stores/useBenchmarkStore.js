import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

const MAX_ARTICLE_SESSIONS = 16

export const CONTENT_TOPIC_BATCHES = [
  [
    {
      title: '真正有分寸的人，往往守住了这3条处世边界',
      type: 'A型',
      penName: '芷若',
      reason: '适合从普通人的处境切入，写出细腻但有后劲的人情道理。',
      theme: '做人处世智慧',
    },
    {
      title: '婚姻走到后半程，女人最该守住的3件事',
      type: 'B型',
      penName: '明远',
      reason: '适合落到家庭关系里的现实处境，清单式表达更有执行感。',
      theme: '家庭关系',
    },
    {
      title: '人到晚年才明白，日子过稳了，靠的是这3种心态',
      type: 'A型',
      penName: '芷若',
      reason: '适合讲晚年自处的清醒和温柔，读者容易读出余味。',
      theme: '晚年自处',
    },
    {
      title: '父母慢慢老去后，子女最不能忽视的3件事',
      type: 'B型',
      penName: '明远',
      reason: '切中孝道与父母这个母题，适合做明确的提醒型内容。',
      theme: '孝道与父母',
    },
    {
      title: '一个人到了这个年纪，最该放在心上的3条养生道理',
      type: 'B型',
      penName: '明远',
      reason: '健康与生命类内容适合用清单结构，读者容易收藏转发。',
      theme: '健康与生命',
    },
    {
      title: '真正聪明的人，到了一定年纪都会慢慢收住这3种脾气',
      type: 'B型',
      penName: '明远',
      reason: '适合落到处世分寸和情绪管理，容易写出有现实感的提醒。',
      theme: '做人处世智慧',
    },
  ],
  [
    {
      title: '真正靠谱的人，往往在这3件小事上看得出分寸',
      type: 'B型',
      penName: '明远',
      reason: '做人处世智慧类母题，适合写成有力度的三点式文章。',
      theme: '做人处世智慧',
    },
    {
      title: '一个家能不能走长久，多半要看这3个地方有没有守住',
      type: 'B型',
      penName: '明远',
      reason: '家庭关系母题下，清单型更适合给出明确抓手。',
      theme: '家庭关系',
    },
    {
      title: '人老了以后，最难得的不是热闹，而是守住这份清静',
      type: 'A型',
      penName: '芷若',
      reason: '晚年自处适合芷若的温柔叙述，容易写出安静的回味。',
      theme: '晚年自处',
    },
    {
      title: '等父母老了以后，真正见孝心的，往往是这3件小事',
      type: 'B型',
      penName: '明远',
      reason: '孝道母题下，清单结构清楚，适合落到具体行动。',
      theme: '孝道与父母',
    },
    {
      title: '一个人下半生最值钱的，不是存款，而是这3样东西',
      type: 'B型',
      penName: '明远',
      reason: '健康与生命母题可以延展到身心状态和生命质量，适合实用表达。',
      theme: '健康与生命',
    },
    {
      title: '到了晚年以后，最能护住一个人的，往往是这3份清醒',
      type: 'A型',
      penName: '芷若',
      reason: '适合写晚年自处的安静和通透，文字更容易沉下来。',
      theme: '晚年自处',
    },
  ],
  [
    {
      title: '人情走到最后才懂，真正有格局的人守的是这3件事',
      type: 'B型',
      penName: '明远',
      reason: '做人处世类内容，明远的力度和清单结构更容易讲透。',
      theme: '做人处世智慧',
    },
    {
      title: '一个家想过得安稳，夫妻之间最好别丢了这3样东西',
      type: 'B型',
      penName: '明远',
      reason: '家庭关系里适合写清单式提醒，现实感更强。',
      theme: '家庭关系',
    },
    {
      title: '到了晚年以后，人最该看开的，不是得失，而是这件事',
      type: 'A型',
      penName: '芷若',
      reason: '晚年自处适合以故事和余味收束，芷若更贴近这个母题。',
      theme: '晚年自处',
    },
    {
      title: '对父母最深的亏欠，往往不是没钱，而是晚了这3步',
      type: 'B型',
      penName: '明远',
      reason: '孝道题适合写成明确的三点提醒，便于直达读者心里。',
      theme: '孝道与父母',
    },
    {
      title: '人过五十后才知道，真正保命的，是这3个生活习惯',
      type: 'B型',
      penName: '明远',
      reason: '健康与生命母题适合做收藏型内容，结构清楚，传播性更好。',
      theme: '健康与生命',
    },
    {
      title: '一个家庭真正的福气，不是热闹，而是把这3件事过顺了',
      type: 'B型',
      penName: '明远',
      reason: '适合家庭关系主题，表达上能兼顾温度和明确的现实抓手。',
      theme: '家庭关系',
    },
  ],
]

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function createTopicRecommendations(batchIndex = 0) {
  const batch = CONTENT_TOPIC_BATCHES[batchIndex % CONTENT_TOPIC_BATCHES.length] ?? CONTENT_TOPIC_BATCHES[0]

  return batch.map((topic, index) => ({
    ...topic,
    id: `topic-${batchIndex + 1}-${index + 1}`,
  }))
}

function createInitialMessages() {
  return [
    {
      id: createId('assistant'),
      role: 'assistant',
      content:
        '我先根据账号调性准备了 6 个推荐选题。你可以直接选择，也可以按偏好重推，或者直接输入自己的题目。',
      createdAt: new Date().toISOString(),
    },
  ]
}

function createSessionTitle(index = 1) {
  return `新的文章 ${index}`
}

function createSession(index = 1) {
  const now = new Date().toISOString()
  const batchIndex = (index - 1) % CONTENT_TOPIC_BATCHES.length

  return {
    id: createId('content-session'),
    title: createSessionTitle(index),
    createdAt: now,
    updatedAt: now,
    draft: '',
    deepThinkingEnabled: true,
    stageId: 'topic',
    isWorkbenchOpen: false,
    activeWorkbenchTab: 'draft',
    messages: createInitialMessages(),
    topicSelection: {
      batchIndex,
      isSupplementComposerOpen: false,
      isCustomTopicComposerOpen: false,
      isRefreshingRecommendations: false,
      customTopicInput: '',
      recommendationError: '',
      recommendations: createTopicRecommendations(batchIndex),
      selectedTopicId: null,
      supplement: '',
    },
    draftReview: {
      activeVersionId: null,
      latestNote: '',
      versions: [],
    },
    imageSelection: {
      referenceAssets: [],
      slots: [],
    },
    layoutReview: {
      device: 'mobile',
      fontSize: 'medium',
    },
    draftSync: {
      attemptCount: 0,
      error: '',
      status: 'idle',
      summary: null,
    },
    runLogs: [],
    processingFlow: null,
    lastFlowSummary: null,
  }
}

function ensureSessionsShape(state) {
  const sessions = Array.isArray(state?.sessions) ? state.sessions : []

  if (sessions.length === 0) {
    const initialSession = createSession(1)

    return {
      activeSessionId: initialSession.id,
      isSidebarCollapsed: false,
      sessions: [initialSession],
    }
  }

  const normalizedSessions = sessions.map((session, index) => {
    const fallbackSession = createSession(index + 1)
    const fallbackRecommendations = fallbackSession.topicSelection.recommendations
    const currentRecommendations = Array.isArray(session?.topicSelection?.recommendations)
      ? session.topicSelection.recommendations
      : []
    const normalizedRecommendations =
      currentRecommendations.length >= 6
        ? currentRecommendations
        : [
            ...currentRecommendations,
            ...fallbackRecommendations.filter(
              (fallbackTopic) =>
                !currentRecommendations.some((currentTopic) => currentTopic.title === fallbackTopic.title),
            ),
          ].slice(0, 6)
    const normalizedStageId =
      session?.stageId === 'images'
        ? 'preview'
        : session?.stageId === 'sync'
          ? 'completed'
          : typeof session?.stageId === 'string'
            ? session.stageId
            : 'topic'
    const normalizedWorkbenchTab =
      session?.activeWorkbenchTab === 'images' || session?.activeWorkbenchTab === 'sync'
        ? 'preview'
        : session?.activeWorkbenchTab === 'logs'
          ? 'draft'
          : typeof session?.activeWorkbenchTab === 'string'
            ? session.activeWorkbenchTab
            : 'draft'

    return {
      ...fallbackSession,
      ...session,
      title:
        typeof session?.title === 'string' && session.title.trim().length > 0
          ? session.title
          : fallbackSession.title,
      draft: typeof session?.draft === 'string' ? session.draft : '',
      deepThinkingEnabled: session?.deepThinkingEnabled ?? true,
      isWorkbenchOpen: Boolean(session?.isWorkbenchOpen),
      activeWorkbenchTab: normalizedWorkbenchTab,
      stageId: normalizedStageId,
      messages: Array.isArray(session?.messages) && session.messages.length > 0 ? session.messages : fallbackSession.messages,
      topicSelection: {
        ...fallbackSession.topicSelection,
        ...(session?.topicSelection ?? {}),
        recommendations: normalizedRecommendations.length > 0 ? normalizedRecommendations : fallbackRecommendations,
        customTopicInput:
          typeof session?.topicSelection?.customTopicInput === 'string' ? session.topicSelection.customTopicInput : '',
        recommendationError:
          typeof session?.topicSelection?.recommendationError === 'string' ? session.topicSelection.recommendationError : '',
      },
      draftReview: {
        ...fallbackSession.draftReview,
        ...(session?.draftReview ?? {}),
        versions:
          Array.isArray(session?.draftReview?.versions) ? session.draftReview.versions : fallbackSession.draftReview.versions,
      },
      imageSelection: {
        ...fallbackSession.imageSelection,
        ...(session?.imageSelection ?? {}),
        referenceAssets:
          Array.isArray(session?.imageSelection?.referenceAssets) ? session.imageSelection.referenceAssets : [],
        slots: Array.isArray(session?.imageSelection?.slots) ? session.imageSelection.slots : [],
      },
      layoutReview: {
        ...fallbackSession.layoutReview,
        ...(session?.layoutReview ?? {}),
      },
      draftSync: {
        ...fallbackSession.draftSync,
        ...(session?.draftSync ?? {}),
      },
      runLogs: Array.isArray(session?.runLogs) ? session.runLogs : [],
    }
  })

  const sessionIds = new Set(normalizedSessions.map((session) => session.id))
  const activeSessionId =
    typeof state?.activeSessionId === 'string' && sessionIds.has(state.activeSessionId)
      ? state.activeSessionId
      : normalizedSessions[0].id

  return {
    activeSessionId,
    isSidebarCollapsed: Boolean(state?.isSidebarCollapsed),
    sessions: normalizedSessions.slice(0, MAX_ARTICLE_SESSIONS),
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
            sessions: [nextSession, ...state.sessions].slice(0, MAX_ARTICLE_SESSIONS),
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
      name: 'content-creation-sessions-v1',
      version: 3,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        activeSessionId: state.activeSessionId,
        isSidebarCollapsed: state.isSidebarCollapsed,
        sessions: state.sessions,
      }),
      migrate: (persistedState) => ensureSessionsShape(persistedState),
    },
  ),
)
