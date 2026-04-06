import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileText,
  History,
  ImageIcon,
  ImageUp,
  LibraryBig,
  LayoutTemplate,
  ListFilter,
  LoaderCircle,
  Maximize2,
  MessageSquareText,
  Minimize2,
  Monitor,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Paperclip,
  Plus,
  ScrollText,
  Search,
  Smartphone,
  Trash2,
  X,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  analyzeStructuredPreviewDraft,
  createTemplatePreviewPlaceholderSlots,
  buildImageSelectionFromMatchResult,
  buildPreviewSections,
  extractUsedAssetIds,
  getReadableDraftBodyMarkdown,
  getRenderablePreviewSlots,
  renderArticlePreviewDocument,
  resolveRenderableAssetPath,
  renderWechatClipboardHtml,
  renderWechatDraftHtml,
  stripPreviewHeading,
} from '@/lib/articlePreviewHtml.jsx'
import { cn } from '@/lib/utils'
import {
  CONTENT_TOPIC_LIBRARY,
  createPersistableBenchmarkState,
  createTopicRecommendations,
  getTopicById,
  getTopicStatusMap,
  getTopicRecommendationPageCount,
  TOPIC_LIBRARY_TYPES,
  useBenchmarkStore,
} from '@/stores/useBenchmarkStore.js'
import {
  DEFAULT_LIBRARY_ASSET_SORT,
  LIBRARY_ASSET_EMOTIONS,
  LIBRARY_ASSET_FIGURES,
  LIBRARY_ASSET_SCENE_MAX_LENGTH,
  LIBRARY_ASSET_SORT_OPTIONS,
  LIBRARY_ASSET_TOPICS,
} from '../../shared/libraryAssets.js'
import {
  createEmptyFixedLayoutConfig,
  FIXED_LAYOUT_FILE_ACCEPT,
  FIXED_LAYOUT_IMAGE_SLOT_IDS,
  FIXED_LAYOUT_SPACING_PRESETS,
  FIXED_LAYOUT_SLOT_META,
  getFixedLayoutImageDisplaySlots,
  normalizeFixedLayoutTextContent,
  resolveFixedLayoutSlotAsset,
} from '../../shared/fixedLayoutConfig.js'

const reasoningModel = 'MiniMax-M2.7 深度模式'
const highspeedModel = 'MiniMax-M2.7 标准模式'
const LEFT_PANE_MIN_WIDTH = 640
const RIGHT_PANE_MIN_WIDTH = 540
const FLOW_STEP_MIN_MS = 420
const FLOW_STEP_MAX_MS = 1100
const FLOW_STEP_RATIO_MS = 160
const CONTENT_FLOW_UI_PREVIEW = false
const INITIAL_DRAFT_FLOW_TITLE = '正在准备首版稿件'
const INITIAL_DRAFT_FLOW_SUMMARY = '正在完成从接收选题到首版稿件准备的处理流程。'
const INITIAL_DRAFT_FLOW_INTRO_MESSAGE =
  '已接收这个选题，正在生成首版稿件。系统会依次完成正文起草、内容审核和自动修订，处理完成后再把正文和校验报告展示在右侧。'
const INITIAL_DRAFT_FLOW_STEPS = [
  { label: '接收选题', seconds: 1 },
  { label: '整理写作要求', seconds: 2 },
  { label: '生成正文初稿', seconds: 16 },
  { label: '开始内容审核', seconds: 8 },
  { label: '输出审核结果', seconds: 10 },
  { label: '判定修改方式', seconds: 2 },
  { label: '自动修订内容', seconds: 6 },
  { label: '呈现首版稿件', seconds: 1 },
]
const CONTENT_SESSION_STORAGE_KEY = 'content-creation-sessions-v1'
const CONTENT_SESSION_STORAGE_VERSION = 4
const FIXED_LAYOUT_CONFIG_UPDATED_EVENT = 'fixed-layout-config-updated'

const quickMessageItems = [
  {
    id: 'tighten-title',
    label: '标题再收紧一点',
    disabled: false,
  },
  {
    id: 'stronger-opening',
    label: '开头再拉高情绪密度',
    disabled: false,
  },
  {
    id: 'less-preachy',
    label: '结尾别太说教，克制一点',
    disabled: false,
  },
  {
    id: 'story-detail',
    label: '把人物细节和转折写具体',
    disabled: false,
  },
]

const stageOrder = [
  { id: 'topic', label: '选题确认' },
  { id: 'draft', label: '文字稿确认' },
  { id: 'preview', label: '排版效果确认' },
]

const workbenchTabs = [
  { id: 'draft', label: '文字稿', icon: FileText },
  { id: 'report', label: '校验报告', icon: ScrollText },
  { id: 'preview', label: '排版预览', icon: LayoutTemplate },
  { id: 'versions', label: '版本记录', icon: History },
]

const sidebarModules = [
  { id: 'library', label: '选题库', icon: LibraryBig },
  { id: 'articles', label: '文章列表', icon: FileText },
  { id: 'assets', label: '素材库', icon: ImageIcon },
  { id: 'fixed-layout', label: '模板配置', icon: ImageUp },
]

const previewFontSizeOptions = [
  { id: 'small', label: '小' },
  { id: 'medium', label: '推荐' },
  { id: 'large', label: '大' },
]

const previewSurfaceModeOptions = [
  { id: 'preview', label: '当前预览' },
  { id: 'wechat', label: '微信粘贴' },
]

const TEMPLATE_PREVIEW_SAMPLE_TITLE = '聪明的亲家，都懂得这3条边界'
const TEMPLATE_PREVIEW_SAMPLE_PEN_NAME = '明远'
const TEMPLATE_PREVIEW_SAMPLE_MARKDOWN = `# 聪明的亲家，都懂得这3条边界

逢年过节的家庭聚会上，你有没有见过这样的场面：亲家两家人坐在一张桌前，表面和和气气，暗地里却各怀心思。

有人嘴上说着“咱们是一家人”，手却伸得老长；有人看似随意地打听对方家底，话里藏着机锋；还有人理直气壮地提要求，觉得既然成了亲家，对方帮衬自己是天经地义。

结果呢？好好的喜事变成了糟心事，本该互相帮衬的两家人，最后连见面都尴尬。

今天不绕弯子，咱们就聊三件事。

## 一、不越位，各守本分，不插手小家庭

老话说得好：“各扫门前雪，莫管他人瓦上霜。”这话听着冷，其实藏着大智慧。

春秋时期，管仲和鲍叔牙合伙做生意。管仲家里穷，每次分红时总是多拿一些。旁人都替鲍叔牙不平，鲍叔牙却说：“管仲家里困难，多拿点是应该的。”后来管仲辅佐公子纠，鲍叔牙辅佐公子小白。两人各为其主，立场分明，从不因私交而越界干涉对方的决策。等小白继位成了齐桓公，鲍叔牙力荐管仲为相，自己甘居其下。这段关系之所以能传为千古美谈，靠的不是天天腻在一起，而是彼此尊重对方的边界。

我见过真实的反面例子。邻居老李的儿子娶了老张的女儿，两家人住得近，走动频繁。老张有个毛病，总爱管儿子家的事。孩子该上哪个兴趣班要管，儿媳买件衣服要评价，家里怎么装修也要插嘴。一开始老李忍了，觉得毕竟是亲家，不好意思撕破脸。三年下来，矛盾越积越深，最后闹到儿子儿媳差点离婚，两家人见面跟仇人似的。

教训是什么？再近的关系，一旦越位，就会变味。亲家之间，最聪明的做法是各守本分：小两口的事，小两口自己解决；小家庭的选择，双方父母只提建议，不做决定。界限清楚了，关系才能长久。

## 二、不比较，各自有命，不比孩子高低

逢年过节，亲家聚会最常见的场景是什么？炫耀孩子。

“我家儿子今年升了主管，年薪三十万。”
“我闺女刚买了套房子，首付就掏了一百万。”
“我孙子这次考试年级前十，将来肯定能上985。”

好像不把孩子拿出来比一比，这场聚会就白来了。

可问题在于，比来比去，有什么意思？赢了，嘴上痛快几天；输了，心里堵得慌。古语有云：“人比人，气死人。”这话听着糙，道理却一点不糙。

我认识两位老人，老周和老郑。俩人是老同事，又做了亲家。按说知根知底，应该相处融洽。可每次聚会都成了暗中较劲的战场。老周晒儿子买了新车，老郑就提女儿升了职；老周说孙子钢琴过了八级，老郑就讲外孙女奥数拿了奖。表面上笑呵呵，心里都憋着一口气。十年下来，两家人越走越远。明明是可以互相帮衬的亲家，最后成了最熟悉的陌生人。

根子就在这个“比”字上。它让亲情变了味，让本该温暖的相聚成了两个人斗气的擂台。

每个家庭都有自己的难处，也都有自己的福气。不比，才能看得清；不争，才能处得久。亲家之间，最难得的是彼此成全，而不是互相攀比。

## 三、不索取，人情有度，不把亲家当资源

有些人把亲家当成免费的人脉库，觉得结了亲就是一家人了，对方帮自己是理所当然。

“我儿子要出国镀金，你们家有钱，借二十万呗。”
“我闺女要办婚礼，你们家那套空房子借来做婚房呗。”
“我孙子要上重点学校，你们家认识人，帮帮忙呗。”

一次两次还行，次数多了，再好的关系也扛不住。

《中国法院网》曾刊登过一起案例：两家亲家因为借款纠纷对簿公堂，最后闹到连孙子的探视权都成了筹码。法院调解时，承办法官感叹：“本是最亲近的两家人，却因为一笔糊涂账，反目成仇。”这样的案例现实中还有很多。

古人说：“君子之交淡如水。”用在亲家关系上，再贴切不过。

帮，是情分；不帮，是本分。结了亲家，不代表对方欠你的。红包该还就还，借钱该写就写，人情该记就记。不是斤斤计较，而是让关系清清爽爽。清爽的关系才能长久，糊涂账迟早要还。

## 写在最后

亲家之间，说到底是缘分。

能做成亲家，两个家庭本身就合得来。既然合得来，就别让这层关系被越位、被比较、被索取给搅黄了。

守住这三条边界：
- 不越位，让彼此都有空间；
- 不比较，让相处回到本真；
- 不索取，让来往清清爽爽。

做到了，亲家关系就不是什么难题，而是一段真正能互相帮衬、互相温暖的资源。做不到，迟早会从“一家人”变成“最熟悉的陌生人”。

聪明的人，早就看清了这一点。

愿每一对亲家，都能各守边界，各得自在。`

const topicLibraryItems = CONTENT_TOPIC_LIBRARY

const TOPIC_STATUS_META = {
  completed: {
    label: '已创作',
    className: 'border border-emerald-200/80 bg-emerald-50 text-emerald-700',
  },
  'in-progress': {
    label: '创作中',
    className: 'border border-amber-200/80 bg-amber-50 text-amber-700',
  },
  pending: {
    label: '待创作',
    className: 'bg-secondary text-muted-foreground',
  },
}

const ARTICLE_LIST_STATUS_META = {
  preview: {
    label: '已确认文字稿',
    className: 'border border-amber-200/80 bg-amber-50 text-amber-700',
  },
  completed: {
    label: '已排版',
    className: 'border border-emerald-200/80 bg-emerald-50 text-emerald-700',
  },
}

const markdownComponents = {
  h1: ({ node, ...props }) => <h1 className="mb-4 text-[22px] font-semibold leading-[1.45]" {...props} />,
  h2: ({ node, ...props }) => <h2 className="mb-3 text-[19px] font-semibold leading-[1.45]" {...props} />,
  h3: ({ node, ...props }) => <h3 className="mb-2 text-[17px] font-semibold leading-[1.45]" {...props} />,
  p: ({ node, ...props }) => <p className="mb-4 leading-[1.8] text-[15px] last:mb-0" {...props} />,
  ul: ({ node, ...props }) => <ul className="mb-4 list-disc pl-5 leading-[1.8]" {...props} />,
  ol: ({ node, ...props }) => <ol className="mb-4 list-decimal pl-5 leading-[1.8]" {...props} />,
  li: ({ node, ...props }) => <li className="mb-1.5" {...props} />,
  strong: ({ node, ...props }) => <strong className="font-semibold" {...props} />,
  blockquote: ({ node, ...props }) => (
    <blockquote className="mb-4 rounded-r-2xl border-l-2 border-primary/35 bg-primary/5 px-4 py-3 text-[14px]" {...props} />
  ),
}

const draftMarkdownComponents = {
  h1: ({ node, ...props }) => (
    <h1 className="mb-7 text-[24px] font-semibold leading-[1.42] tracking-[-0.035em] text-foreground" {...props} />
  ),
  h2: ({ node, ...props }) => (
    <h2
      className="mt-12 text-[21px] font-semibold leading-[1.55] tracking-[-0.03em] text-foreground first:mt-0 sm:text-[22px]"
      {...props}
    />
  ),
  h3: ({ node, ...props }) => (
    <h3 className="mt-9 text-[17px] font-semibold leading-[1.65] text-foreground first:mt-0 sm:text-[18px]" {...props} />
  ),
  p: ({ node, ...props }) => (
    <p className="mt-6 text-[15px] leading-[2] tracking-[0.01em] text-foreground/88 first:mt-0" {...props} />
  ),
  ul: ({ node, ...props }) => (
    <ul className="mt-6 list-disc space-y-3 pl-6 text-[15px] leading-[1.95] text-foreground/86" {...props} />
  ),
  ol: ({ node, ...props }) => (
    <ol className="mt-6 list-decimal space-y-3 pl-6 text-[15px] leading-[1.95] text-foreground/86" {...props} />
  ),
  li: ({ node, ...props }) => <li className="pl-1 marker:text-foreground/42" {...props} />,
  strong: ({ node, ...props }) => <strong className="font-semibold text-foreground" {...props} />,
  blockquote: ({ node, ...props }) => (
    <blockquote
      className="mt-8 rounded-[24px] border border-slate-200/70 bg-slate-50/70 px-5 py-4 text-[15px] leading-[1.92] text-foreground/74 sm:px-6 sm:text-[16px]"
      {...props}
    />
  ),
  hr: ({ node, ...props }) => <hr className="my-10 border-0 border-t border-border/70" {...props} />,
  table: ({ node, ...props }) => (
    <div className="my-8 overflow-x-auto rounded-[24px] border border-border/70 bg-white">
      <table className="min-w-[720px] w-full border-collapse text-left" {...props} />
    </div>
  ),
  thead: ({ node, ...props }) => <thead className="bg-secondary/45" {...props} />,
  tbody: ({ node, ...props }) => <tbody className="bg-white" {...props} />,
  tr: ({ node, ...props }) => <tr className="border-t border-border/60 first:border-t-0" {...props} />,
  th: ({ node, ...props }) => (
    <th className="min-w-[120px] px-4 py-3 text-[13px] font-semibold leading-6 text-foreground whitespace-normal align-top" {...props} />
  ),
  td: ({ node, ...props }) => (
    <td className="min-w-[120px] px-4 py-3 text-[15px] leading-7 text-foreground/82 whitespace-normal align-top" {...props} />
  ),
  img: ({ node, alt = '', src = '', ...props }) => (
    <img
      alt={alt}
      className="mt-8 block w-full rounded-[24px] border border-border/50 object-cover shadow-[0_16px_48px_rgba(15,23,42,0.06)]"
      loading="lazy"
      src={src}
      {...props}
    />
  ),
}

const reportMarkdownComponents = {
  h1: ({ node, ...props }) => <h1 className="mb-8 text-[28px] font-semibold tracking-[-0.03em] text-foreground" {...props} />,
  h2: ({ node, ...props }) => (
    <h2
      className="mt-12 pt-2 text-[26px] font-semibold tracking-[-0.03em] text-foreground first:mt-0 first:pt-0"
      {...props}
    />
  ),
  h3: ({ node, ...props }) => <h3 className="mt-8 text-[18px] font-semibold leading-[1.5] text-foreground" {...props} />,
  p: ({ node, ...props }) => <p className="mt-5 text-[15px] leading-[1.95] text-foreground/86 first:mt-0" {...props} />,
  ul: ({ node, ...props }) => <ul className="mt-5 space-y-3 pl-5 text-[15px] leading-[1.9] text-foreground/84" {...props} />,
  ol: ({ node, ...props }) => <ol className="mt-5 space-y-3 pl-5 text-[15px] leading-[1.9] text-foreground/84" {...props} />,
  li: ({ node, ...props }) => <li className="pl-1 marker:text-foreground/45" {...props} />,
  strong: ({ node, ...props }) => <strong className="font-semibold text-foreground" {...props} />,
  blockquote: ({ node, ...props }) => (
    <blockquote
      className="mt-6 rounded-[20px] border border-emerald-200/70 bg-emerald-50/70 px-5 py-4 text-[14px] leading-[1.8] text-emerald-900/80"
      {...props}
    />
  ),
  hr: () => null,
  table: ({ node, ...props }) => (
    <div className="my-8 overflow-x-auto rounded-[24px] border border-border/70 bg-white">
      <table className="min-w-[760px] w-full border-collapse text-left" {...props} />
    </div>
  ),
  thead: ({ node, ...props }) => <thead className="bg-secondary/45" {...props} />,
  tbody: ({ node, ...props }) => <tbody className="bg-white" {...props} />,
  tr: ({ node, ...props }) => <tr className="border-t border-border/60 first:border-t-0" {...props} />,
  th: ({ node, ...props }) => (
    <th className="min-w-[120px] px-4 py-3 text-[13px] font-semibold leading-6 text-foreground whitespace-normal align-top" {...props} />
  ),
  td: ({ node, ...props }) => (
    <td className="min-w-[120px] px-4 py-3 text-[14px] leading-7 text-foreground/82 whitespace-normal align-top" {...props} />
  ),
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function delay(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function clampFlowStepDuration(seconds = 1) {
  return Math.min(Math.max(seconds * FLOW_STEP_RATIO_MS, FLOW_STEP_MIN_MS), FLOW_STEP_MAX_MS)
}

function formatFlowElapsedLabel(ms, status) {
  if (status === 'skipped') {
    return '已跳过'
  }

  if (status === 'waiting') {
    return '--'
  }

  if (!Number.isFinite(ms) || ms <= 0) {
    return status === 'failed' ? '失败' : '0.1s'
  }

  const seconds = Math.max(0.1, ms / 1000)
  return `${seconds.toFixed(1)}s`
}

function attachWorkflowToMessages(messages, messageId, workflow) {
  if (!Array.isArray(messages) || !messageId) {
    return messages ?? []
  }

  return messages.map((message) => {
    if (message.id !== messageId) {
      return message
    }

    return {
      ...message,
      workflow,
    }
  })
}

function updateMessageById(messages, messageId, updater) {
  if (!Array.isArray(messages) || !messageId) {
    return messages ?? []
  }

  return messages.map((message) => {
    if (message.id !== messageId) {
      return message
    }

    const patch = typeof updater === 'function' ? updater(message) : updater

    if (!patch) {
      return message
    }

    return {
      ...message,
      ...patch,
    }
  })
}

function mergeFlowProgressSteps(currentSteps, incomingSteps) {
  if (!Array.isArray(currentSteps) || !Array.isArray(incomingSteps)) {
    return currentSteps ?? []
  }

  return currentSteps.map((step, index) => {
    const incomingStep = incomingSteps[index]

    if (!incomingStep) {
      return step
    }

    return {
      ...step,
      ...incomingStep,
      id: step.id,
      label: incomingStep.label ?? step.label,
    }
  })
}

function appendMessageParagraph(content = '', paragraph = '') {
  return [content.trim(), paragraph.trim()].filter(Boolean).join('\n\n')
}

function resolveInitialDraftFlowOutcome(reportMarkdown = '', decisionHint = '') {
  const normalizedDecision = typeof decisionHint === 'string' ? decisionHint.trim().toLowerCase() : ''

  if (normalizedDecision === 'pass') {
    return {
      decision: '无需修改',
      shouldSkipAutoRevision: true,
    }
  }

  if (normalizedDecision === 'partial') {
    return {
      decision: '局部修改',
      shouldSkipAutoRevision: false,
    }
  }

  if (normalizedDecision === 'rewrite') {
    return {
      decision: '整篇重写',
      shouldSkipAutoRevision: false,
    }
  }

  if (!reportMarkdown) {
    return {
      decision: '无需修改',
      shouldSkipAutoRevision: false,
    }
  }

  const noAutoRevisionApplied = reportMarkdown.includes('程序兜底修正：本轮未触发。')

  return {
    decision: noAutoRevisionApplied ? '无需修改' : '局部修改',
    shouldSkipAutoRevision: noAutoRevisionApplied,
  }
}

function buildMockInitialDraftExperience({ current, topic }) {
  const workflowMessageId = createId('assistant')
  const startedAt = Date.now() - 9800
  const flow = {
    ...buildMockFlowSnapshot({
      startedAt,
      steps: [
        { label: '接收选题', status: 'done', elapsedMs: 900 },
        { label: '整理写作要求', status: 'done', elapsedMs: 1200 },
        { label: '生成正文初稿', status: 'running' },
        { label: '开始内容审核', status: 'waiting' },
        { label: '输出审核结果', status: 'waiting' },
        { label: '判定修改方式', status: 'waiting' },
        { label: '自动修订内容', status: 'waiting' },
        { label: '呈现首版稿件', status: 'waiting' },
      ],
    }),
    messageId: workflowMessageId,
  }

  return {
    activeWorkbenchTab: current.activeWorkbenchTab,
    draftReview: {
      ...current.draftReview,
      activeVersionId: null,
      latestNote: '',
      versions: [],
    },
    draft: '',
    isWorkbenchOpen: false,
    lastFlowSummary: null,
    messages: [
      ...current.messages,
      {
        id: createId('user'),
        role: 'user',
        content: `我选这个：${topic.title}`,
        createdAt: new Date(startedAt - 1500).toISOString(),
      },
      {
        id: workflowMessageId,
        role: 'assistant',
        content: INITIAL_DRAFT_FLOW_INTRO_MESSAGE,
        createdAt: new Date(startedAt).toISOString(),
        workflow: flow,
      },
    ],
    processingFlow: flow,
    stageId: 'draft',
    title: topic.title,
    topicSelection: {
      ...current.topicSelection,
      recommendationError: '',
      selectedTopicId: topic.id,
      selectedTopic: topic,
    },
  }
}

function getTopicStatusMeta(status = 'pending') {
  return TOPIC_STATUS_META[status] ?? TOPIC_STATUS_META.pending
}

function formatMessageTime(value) {
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

function normalizePreviewFontSize(value) {
  if (value === 'small' || value === 'large') {
    return value
  }

  return 'medium'
}

function normalizePreviewSurfaceMode(value) {
  return value === 'wechat' ? 'wechat' : 'preview'
}

function resolveWechatSyncIndicatorMeta({ hasCoverImage, isWechatSyncing, wechatDraftSync, wechatStatus }) {
  if (isWechatSyncing) {
    return {
      description: '正在同步到微信草稿箱，正文图片会自动上传到微信素材。',
      icon: LoaderCircle,
      iconClassName: 'animate-spin text-muted-foreground',
      title: '同步中',
      toneClassName: 'border-border/70 bg-secondary/55 text-muted-foreground',
    }
  }

  if (wechatDraftSync?.status === 'success' && wechatDraftSync?.lastSyncedAt) {
    const actionLabel = wechatDraftSync?.summary?.action === 'updated' ? '已更新微信草稿' : '已保存到微信草稿'

    return {
      description: `${actionLabel} · ${formatMessageTime(wechatDraftSync.lastSyncedAt)}`,
      icon: CheckCircle2,
      iconClassName: 'text-emerald-600',
      title: '同步成功',
      toneClassName: 'border-emerald-200/80 bg-emerald-50 text-emerald-600',
    }
  }

  if (wechatDraftSync?.status === 'error' && wechatDraftSync?.error) {
    return {
      description: wechatDraftSync.error,
      icon: X,
      iconClassName: 'text-rose-600',
      title: '同步失败',
      toneClassName: 'border-rose-200/80 bg-rose-50 text-rose-600',
    }
  }

  if (wechatStatus?.error) {
    return {
      description: wechatStatus.error,
      icon: X,
      iconClassName: 'text-rose-600',
      title: '状态异常',
      toneClassName: 'border-rose-200/80 bg-rose-50 text-rose-600',
    }
  }

  if (!wechatStatus?.configured) {
    return {
      description: '当前未配置微信公众号凭证，暂时不能保存草稿。',
      icon: History,
      iconClassName: 'text-muted-foreground',
      title: '待同步',
      toneClassName: 'border-border/70 bg-secondary/55 text-muted-foreground',
    }
  }

  if (!hasCoverImage) {
    return {
      description: '当前没有可用封面图，请先补齐头图或确认正文首图可用。',
      icon: History,
      iconClassName: 'text-muted-foreground',
      title: '待同步',
      toneClassName: 'border-border/70 bg-secondary/55 text-muted-foreground',
    }
  }

  return {
    description: '点击同步按钮后，会保存或更新公众号草稿箱，不会自动发布。',
    icon: History,
    iconClassName: 'text-muted-foreground',
    title: '待同步',
    toneClassName: 'border-border/70 bg-secondary/55 text-muted-foreground',
  }
}

function countReadableLength(content = '') {
  return content
    .replace(/[#>*`\-\[\]\(\)\|]/g, '')
    .replace(/\s+/g, '')
    .trim().length
}

function clampRightPaneWidth(width, containerWidth) {
  const maxWidth = Math.max(RIGHT_PANE_MIN_WIDTH, containerWidth - LEFT_PANE_MIN_WIDTH)
  return Math.min(Math.max(width, RIGHT_PANE_MIN_WIDTH), maxWidth)
}

function renderMarkdownBlock(content, components = markdownComponents) {
  return (
    <ReactMarkdown components={components} remarkPlugins={[remarkGfm]}>
      {content}
    </ReactMarkdown>
  )
}

function getSessionById(sessionId) {
  return useBenchmarkStore.getState().sessions.find((session) => session.id === sessionId) ?? null
}

function getSelectedTopic(session) {
  const selectedTopicId = session?.topicSelection?.selectedTopicId

  return (
    session?.topicSelection?.selectedTopic ??
    session?.topicSelection?.recommendations?.find((topic) => topic.id === selectedTopicId) ??
    getTopicById(selectedTopicId) ??
    session?.topicSelection?.recommendations?.[0] ??
    null
  )
}

function getActiveVersion(session) {
  const versions = session?.draftReview?.versions ?? []

  if (versions.length === 0) {
    return null
  }

  return (
    versions.find((version) => version.id === session?.draftReview?.activeVersionId) ??
    versions[versions.length - 1]
  )
}

function buildFallbackGeneratedTitle(topic) {
  return typeof topic?.title === 'string' ? topic.title.trim() : ''
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

function getDraftBodyMarkdown(version) {
  const draftMarkdown = version?.draftMarkdown ?? ''

  if (resolveVersionGeneratedTitle(version)) {
    return getReadableDraftBodyMarkdown(draftMarkdown)
  }

  return getReadableDraftBodyMarkdown(draftMarkdown)
}

function getArticleListStatusMeta(stageId = 'preview') {
  return ARTICLE_LIST_STATUS_META[stageId] ?? ARTICLE_LIST_STATUS_META.preview
}

function createArticleListEntries(sessions = []) {
  if (!Array.isArray(sessions) || sessions.length === 0) {
    return []
  }

  return sessions
    .filter((session) => session?.stageId === 'preview' || session?.stageId === 'completed')
    .map((session) => {
      const topic = getSelectedTopic(session)
      const version = getActiveVersion(session)
      const stageId = session.stageId === 'completed' ? 'completed' : 'preview'

      return {
        defaultTab: stageId === 'completed' ? 'preview' : 'draft',
        id: session.id,
        stageId,
        theme: topic?.theme || '未设置母题',
        title: resolveVersionDisplayTitle(session, version) || session?.title || '未命名文章',
        updatedAt: session?.updatedAt || session?.createdAt || '',
      }
    })
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
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

function getSessionHistoryLatestTimestamp(sessions = []) {
  return (Array.isArray(sessions) ? sessions : []).reduce((latest, session) => {
    if (!hasSessionHistory(session)) {
      return latest
    }

    const nextTimestamp = new Date(session?.updatedAt || session?.createdAt || 0).getTime()
    return Number.isFinite(nextTimestamp) && nextTimestamp > latest ? nextTimestamp : latest
  }, 0)
}

function buildDraftVersion({ note = '', supplement = '', topic, versionNumber }) {
  const noteSummary = note.trim() ? `这次重点吸收了你的修改意见：${note.trim()}。` : ''
  const draftMarkdown = [
    `# ${topic.title}`,
    '',
    '很多关系走到后半程，真正让人寒心的，从来不是一件惊天动地的大事，而是那些被一次次轻轻放过去的小失望。',
    '',
    '人到了中年，最怕的不是忙，也不是累，而是你心里已经委屈得发紧，嘴上却越来越不想说。很多女人不是输在不会经营婚姻，而是太习惯把自己往后放，放着放着，就把体面和底气都放没了。',
    '',
    `这一版继续沿着 ${topic.penName} 的叙述口吻来写，不急着讲大道理，而是先把现实处境写透，再慢慢把人带到真正该守住的地方。`,
    '',
    '婚姻走到后半程，女人真正要守的，往往不是面子，不是一时输赢，而是那几样决定余生稳不稳、值不值得的根本东西。',
    '',
    '## 一、先守住自己的底气',
    '',
    '一个女人过得稳不稳，很多时候不是看她嘴上多硬，而是看她手里有没有属于自己的底气。这个底气，可以是钱，可以是本事，也可以是任何一份不依附别人的把握。',
    '',
    '真正聪明的女人，心里都明白一件事：别人对你好，是福气；自己站得住，才是底牌。到了中年，更不能把全部安全感都押在别人一句“我会一直在”上。',
    '',
    `${noteSummary}这份底气，不是为了和谁较劲，而是为了在风大雨急的时候，你心里还能稳得住。`.trim(),
    '',
    '[IMAGE_1]',
    '',
    '## 二、再守住自己的分寸',
    '',
    '很多婚姻后半程的问题，说到底，不是感情没了，而是边界乱了。什么都替别人扛，什么都往自己身上揽，看起来是懂事，时间久了，反而会把关系拖得越来越失衡。',
    '',
    '分寸这件事，听起来轻，实际上最见修养。该帮的时候帮，该退的时候退，该沉默的时候沉默，该说清的时候说清。一个有分寸的人，不会把自己的情绪随便砸给别人，也不会把别人的需求统统背到自己身上。',
    '',
    '守住分寸，不是冷淡，而是让关系里每个人都待在该待的位置上。边界清楚了，很多无谓的内耗自然就少了。',
    '',
    '[IMAGE_2]',
    '',
    '## 三、最后守住自己的心气',
    '',
    '人到了这个年纪，最怕的不是生活里多一点辛苦，而是心一点点灰下去。心气没了，再好的日子也会过得发沉；心气还在，再平常的日子也能慢慢过出亮色。',
    '',
    '所谓守住心气，不是逞强，不是嘴硬，而是始终记得自己是谁，始终不肯把全部希望都交给别人。你可以疲惫，可以委屈，但不能把自己彻底放弃。',
    '',
    '说到底，婚姻不是女人后半生的全部，日子也从来不是只靠谁来拯救。真正能把一个人托起来的，还是她心里那口不肯熄的气。',
    '',
    '[IMAGE_3]',
    '',
    '[ENDING]',
    '',
    '## 写在最后',
    '',
    '一个女人到了中年，还能把底气、分寸和心气都守住，后面的路就不会走得太慌。',
    '',
    '愿你往后的日子，手里有底，心里有光，走到哪里都不必把自己活得太委屈。',
  ].join('\n')

  const reportMarkdown = [
    '# 详细校验报告',
    '',
    '## 结论',
    '',
    `当前版本已按固定模板正文结构生成，整体可进入文字稿确认与后续固定模板排版预览。`,
    '',
    '## 结构检查',
    '',
    '- 开篇：已完成情绪切入和主题铺垫。',
    '- 主体：三段主体内容后已预留 [IMAGE_1]、[IMAGE_2]、[IMAGE_3]。',
    '- 结尾：已使用 [ENDING] 标记切出收束段落，适合固定模板渲染。',
    '',
    '## 风格检查',
    '',
    `- 笔名风格：当前更偏 ${topic.penName} 的叙述方式。`,
    '- 禁用词：未使用总结式 AI 腔词汇。',
    '- 句式节奏：以短句和递进表达为主，适合公众号阅读。',
    '',
    '## 当前仍可优化的地方',
    '',
    '- 可以再补一个更扎心的瞬间，让读者更快鼻酸。',
    '- 若想提升传播性，可再收一版标题和首段。',
    note.trim() ? `- 本轮已根据你的修改意见处理：${note.trim()}` : '- 本轮暂无额外人工修改意见。',
    '',
    '## AI 已处理动作',
    '',
    `- 第 ${versionNumber} 版已完成正文修订。`,
    '- 当前版本未附加额外选题约束。',
  ].join('\n')

  return {
    id: createId('version'),
    createdAt: new Date().toISOString(),
    draftMarkdown,
    generatedTitle: buildFallbackGeneratedTitle(topic),
    label: `V${versionNumber}`,
    note: note.trim(),
    reportMarkdown,
    summary: note.trim() ? `根据“${note.trim()}”完成重写。` : '初稿生成完成，可进入文字稿确认。',
    wordCount: countReadableLength(draftMarkdown),
  }
}

function buildVersionFromGeneratedResult({ generated, note = '', supplement = '', topic, versionNumber }) {
  const fallbackVersion = buildDraftVersion({
    note,
    supplement,
    topic,
    versionNumber,
  })

  return {
    ...fallbackVersion,
    draftMarkdown: generated?.draftMarkdown?.trim() || fallbackVersion.draftMarkdown,
    generatedTitle: readLooseTitle(generated?.generatedTitle) || fallbackVersion.generatedTitle,
    reportMarkdown: generated?.reportMarkdown?.trim() || fallbackVersion.reportMarkdown,
    summary: generated?.summary?.trim() || fallbackVersion.summary,
    wordCount: countReadableLength(generated?.draftMarkdown?.trim() || fallbackVersion.draftMarkdown),
  }
}

function buildMockFlowSnapshot({ steps, startedAt, summary = INITIAL_DRAFT_FLOW_SUMMARY, title = INITIAL_DRAFT_FLOW_TITLE }) {
  const flowId = createId('flow')
  let cursor = startedAt

  const preparedSteps = steps.map((step, index) => {
    if (step.status === 'skipped') {
      return {
        ...step,
        completedAt: cursor,
        elapsedMs: 0,
        id: `${flowId}-step-${index + 1}`,
        startedAt: null,
      }
    }

    if (step.status === 'running') {
      return {
        ...step,
        completedAt: null,
        elapsedMs: 0,
        id: `${flowId}-step-${index + 1}`,
        startedAt: cursor,
      }
    }

    if (step.status === 'waiting' || step.status === 'failed') {
      return {
        ...step,
        completedAt: null,
        elapsedMs: 0,
        id: `${flowId}-step-${index + 1}`,
        startedAt: null,
      }
    }

    const elapsedMs = Math.max(100, step.elapsedMs ?? 1000)
    const stepStartedAt = cursor
    const completedAt = cursor + elapsedMs
    cursor = completedAt

    return {
      ...step,
      completedAt,
      elapsedMs,
      id: `${flowId}-step-${index + 1}`,
      startedAt: stepStartedAt,
    }
  })

  const hasIncompleteStep = preparedSteps.some((step) => step.status === 'running' || step.status === 'waiting' || step.status === 'failed')

  return {
    completedAt: hasIncompleteStep ? null : new Date(cursor).toISOString(),
    createdAt: new Date(startedAt).toISOString(),
    id: flowId,
    steps: preparedSteps,
    summary,
    title,
  }
}

async function requestGeneratedDraft({
  action,
  deepThinkingEnabled,
  note = '',
  onProgress,
  streamProgress = false,
  supplement = '',
  topic,
}) {
  const response = await fetch('/api/content-draft', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action,
      deepThinkingEnabled,
      note,
      streamProgress,
      supplement,
      topic,
    }),
  })

  if (streamProgress) {
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}))
      throw new Error(payload?.error || '内容创作请求失败')
    }

    const reader = response.body?.getReader()

    if (!reader) {
      throw new Error('内容创作流读取失败')
    }

    const decoder = new TextDecoder()
    let buffer = ''
    let finalPayload = null

    function handleEventLine(line) {
      const trimmed = line.trim()

      if (!trimmed) {
        return
      }

      const event = JSON.parse(trimmed)

      if (event.type === 'progress') {
        onProgress?.(event)
        return
      }

      if (event.type === 'result') {
        finalPayload = event.data ?? null
        return
      }

      if (event.type === 'error') {
        const error = new Error(event.error || '内容创作请求失败')
        error.payload = event.details ?? null
        throw error
      }
    }

    while (true) {
      const { value, done } = await reader.read()
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done })

      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        handleEventLine(line)
      }

      if (done) {
        break
      }
    }

    if (buffer.trim()) {
      handleEventLine(buffer)
    }

    if (!finalPayload) {
      throw new Error('内容创作流未返回最终结果')
    }

    return finalPayload
  }

  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    throw new Error(payload?.error || 'MiniMax 内容创作失败')
  }

  return payload
}

function formatLibraryAssetDate(value) {
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

async function readJsonResponse(response, fallbackMessage) {
  const contentType = response.headers.get('content-type') || ''
  const payload = await response.json().catch(() => null)

  if (!contentType.includes('application/json')) {
    throw new Error(fallbackMessage)
  }

  return payload
}

async function requestLibraryAssets({ emotion = '', figures = '', sort = DEFAULT_LIBRARY_ASSET_SORT, topic = '' } = {}) {
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

async function requestLibraryAssetMatch({ sections = [], topic = '', type = '', wordCount = 0 } = {}) {
  const response = await fetch('/api/library-assets/match', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sections,
      topic,
      type,
      wordCount,
    }),
  })
  const payload = await readJsonResponse(response, '素材自动匹配接口返回异常，请稍后重试。')

  if (!response.ok) {
    throw new Error(payload?.error || '自动匹配素材失败')
  }

  return payload
}

async function requestLibraryAssetUsage({ assetIds = [], usedAt } = {}) {
  const response = await fetch('/api/library-assets/usage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      assetIds,
      usedAt,
    }),
  })
  const payload = await readJsonResponse(response, '素材使用记录接口返回异常，请稍后重试。')

  if (!response.ok) {
    throw new Error(payload?.error || '更新素材使用记录失败')
  }

  return payload
}

async function requestLibraryAssetUpdate(assetId, patch) {
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

async function requestLibraryAssetDelete(assetId) {
  const response = await fetch(`/api/library-assets/${assetId}`, {
    method: 'DELETE',
  })
  const payload = await readJsonResponse(response, '素材库删除接口返回异常，请稍后重试。')

  if (!response.ok) {
    throw new Error(payload?.error || '删除素材失败')
  }

  return payload
}

async function requestFixedLayoutConfig() {
  const response = await fetch('/api/fixed-layout-config')
  const payload = await readJsonResponse(response, '模板配置接口返回异常，请刷新页面后重试。')

  if (!response.ok) {
    throw new Error(payload?.error || '读取模板配置失败')
  }

  return {
    ...createEmptyFixedLayoutConfig(),
    ...(payload ?? {}),
  }
}

function announceFixedLayoutConfigUpdated(config) {
  if (typeof window === 'undefined') {
    return
  }

  window.dispatchEvent(
    new CustomEvent(FIXED_LAYOUT_CONFIG_UPDATED_EVENT, {
      detail: config,
    }),
  )
}

async function requestFixedLayoutConfigUpdate({ endingText, imageSlots } = {}) {
  const response = await fetch('/api/fixed-layout-config', {
    body: JSON.stringify({ endingText, imageSlots }),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'PATCH',
  })
  const payload = await readJsonResponse(response, '模板配置接口返回异常，请稍后重试。')

  if (!response.ok) {
    throw new Error(payload?.error || '保存模板配置失败')
  }

  const nextConfig = {
    ...createEmptyFixedLayoutConfig(),
    ...(payload ?? {}),
  }
  announceFixedLayoutConfigUpdated(nextConfig)
  return nextConfig
}

async function requestFixedLayoutAssetUpload({ file, slot }) {
  const formData = new FormData()
  formData.set('slot', slot)
  formData.set('file', file)

  const response = await fetch('/api/fixed-layout-config/upload', {
    body: formData,
    method: 'POST',
  })
  const payload = await readJsonResponse(response, '固定图片上传接口返回异常，请稍后重试。')

  if (!response.ok) {
    throw new Error(payload?.error || '上传固定图片失败')
  }

  return payload?.asset ?? null
}

async function requestPersistedContentSessions() {
  const response = await fetch('/api/content-sessions')
  const payload = await readJsonResponse(response, '本地历史记录接口返回异常，请刷新页面后重试。')

  if (!response.ok) {
    throw new Error(payload?.error || '读取本地历史记录失败')
  }

  return payload?.item ?? null
}

async function requestPersistedContentSessionsUpdate(item) {
  const response = await fetch('/api/content-sessions', {
    body: JSON.stringify({
      item,
      name: CONTENT_SESSION_STORAGE_KEY,
    }),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'PUT',
  })
  const payload = await readJsonResponse(response, '写入本地历史记录接口返回异常，请稍后重试。')

  if (!response.ok) {
    throw new Error(payload?.error || '写入本地历史记录失败')
  }

  return payload
}

async function requestWechatDraftStatus(sessionId) {
  const searchParams = new URLSearchParams()

  if (sessionId) {
    searchParams.set('sessionId', sessionId)
  }

  const query = searchParams.toString()
  const response = await fetch(query ? `/api/wechat/draft/status?${query}` : '/api/wechat/draft/status')
  const payload = await readJsonResponse(response, '微信草稿状态接口返回异常，请稍后重试。')

  if (!response.ok) {
    throw new Error(payload?.error || '读取微信草稿状态失败')
  }

  return payload ?? {}
}

async function requestWechatDraftSync({ article, sessionId }) {
  const response = await fetch('/api/wechat/draft/sync', {
    body: JSON.stringify({
      article,
      sessionId,
    }),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })
  const payload = await readJsonResponse(response, '微信草稿同步接口返回异常，请稍后重试。')

  if (!response.ok) {
    throw new Error(payload?.error || '同步微信草稿失败')
  }

  return payload ?? {}
}

async function requestWechatClipboardPreparation({ bodyHtml, plainText }) {
  const response = await fetch('/api/wechat/clipboard/prepare', {
    body: JSON.stringify({
      bodyHtml,
      plainText,
    }),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })
  const payload = await readJsonResponse(response, '微信复制预处理接口返回异常，请稍后重试。')

  if (!response.ok) {
    throw new Error(payload?.error || '准备复制微信样式失败')
  }

  return payload ?? {}
}

function cloneFixedLayoutConfig(config) {
  return JSON.parse(JSON.stringify(config ?? createEmptyFixedLayoutConfig()))
}

function serializeFixedLayoutConfigForComparison(config) {
  const normalized = config ?? createEmptyFixedLayoutConfig()

  return JSON.stringify({
    endingText: normalizeFixedLayoutTextContent(normalized?.endingText?.content ?? ''),
    imageSlots: FIXED_LAYOUT_IMAGE_SLOT_IDS.map((slot) => {
      const slotConfig = normalized?.[slot] ?? {}
      const asset = resolveFixedLayoutSlotAsset(slotConfig)

      return {
        assetPath: asset?.path || '',
        displayOrder: Number(slotConfig?.displayOrder || 0),
        slot,
        spacingPreset: slotConfig?.spacingPreset || 'medium',
        widthPx: Number(slotConfig?.widthPx || 0),
      }
    }),
  })
}

function areFixedLayoutConfigsEqual(leftConfig, rightConfig) {
  return serializeFixedLayoutConfigForComparison(leftConfig) === serializeFixedLayoutConfigForComparison(rightConfig)
}

function mergeDraftConfigWithServerUpdate(currentDraftConfig, nextSavedConfig, updatedSlots = []) {
  const nextDraftConfig = cloneFixedLayoutConfig(nextSavedConfig)
  const currentDraft = currentDraftConfig ?? createEmptyFixedLayoutConfig()

  nextDraftConfig.endingText = {
    ...nextDraftConfig.endingText,
    content: currentDraft?.endingText?.content ?? nextDraftConfig?.endingText?.content ?? '',
  }

  FIXED_LAYOUT_IMAGE_SLOT_IDS.forEach((slot) => {
    const currentSlotConfig = currentDraft?.[slot] ?? {}
    const savedSlotConfig = nextSavedConfig?.[slot] ?? {}
    const shouldUseSavedAsset = updatedSlots.includes(slot)

    nextDraftConfig[slot] = {
      ...savedSlotConfig,
      asset: shouldUseSavedAsset ? resolveFixedLayoutSlotAsset(savedSlotConfig) : resolveFixedLayoutSlotAsset(currentSlotConfig) || resolveFixedLayoutSlotAsset(savedSlotConfig),
      displayOrder: currentSlotConfig?.displayOrder ?? savedSlotConfig?.displayOrder,
      spacingPreset: currentSlotConfig?.spacingPreset ?? savedSlotConfig?.spacingPreset,
      widthPx: currentSlotConfig?.widthPx ?? savedSlotConfig?.widthPx,
    }
  })

  return nextDraftConfig
}

function buildPersistedContentSessionItem(state) {
  return {
    state: createPersistableBenchmarkState(state),
    version: CONTENT_SESSION_STORAGE_VERSION,
  }
}

function useFixedLayoutConfigState() {
  const [config, setConfig] = useState(() => createEmptyFixedLayoutConfig())
  const [errorMessage, setErrorMessage] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  async function reloadConfig() {
    setIsLoading(true)

    try {
      const nextConfig = await requestFixedLayoutConfig()
      setConfig(nextConfig)
      setErrorMessage('')
      return nextConfig
    } catch (error) {
      setErrorMessage(error.message || '读取模板配置失败')
      setConfig(createEmptyFixedLayoutConfig())
      return createEmptyFixedLayoutConfig()
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    async function loadConfig() {
      setIsLoading(true)

      try {
        const nextConfig = await requestFixedLayoutConfig()

        if (!cancelled) {
          setConfig(nextConfig)
          setErrorMessage('')
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error.message || '读取模板配置失败')
          setConfig(createEmptyFixedLayoutConfig())
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    loadConfig()

    function handleConfigUpdated(event) {
      if (cancelled) {
        return
      }

      const nextConfig = event?.detail && typeof event.detail === 'object' ? event.detail : null

      if (nextConfig) {
        setConfig(nextConfig)
        setErrorMessage('')
        setIsLoading(false)
      } else {
        reloadConfig()
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener(FIXED_LAYOUT_CONFIG_UPDATED_EVENT, handleConfigUpdated)
    }

    return () => {
      cancelled = true
      if (typeof window !== 'undefined') {
        window.removeEventListener(FIXED_LAYOUT_CONFIG_UPDATED_EVENT, handleConfigUpdated)
      }
    }
  }, [])

  return {
    config,
    errorMessage,
    isLoading,
    reloadConfig,
    setErrorMessage,
    setConfig,
  }
}

function ArticlePreviewFrame({ className = '', documentHtml, title = '排版预览' }) {
  const iframeRef = useRef(null)
  const [frameHeight, setFrameHeight] = useState(0)

  useEffect(() => {
    const iframe = iframeRef.current

    if (!iframe) {
      return undefined
    }

    let cleanupAttachedResources = () => {}

    function attachFrameObserver() {
      cleanupAttachedResources()

      const frameDocument = iframe.contentDocument

      if (!frameDocument) {
        return
      }

      const updateHeight = () => {
        const nextHeight = Math.max(
          frameDocument.body?.scrollHeight ?? 0,
          frameDocument.documentElement?.scrollHeight ?? 0,
          frameDocument.body?.offsetHeight ?? 0,
          frameDocument.documentElement?.offsetHeight ?? 0,
          0,
        )

        setFrameHeight(nextHeight)
      }

      updateHeight()

      const resizeObserver =
        typeof ResizeObserver === 'function'
          ? new ResizeObserver(() => {
              updateHeight()
            })
          : null

      if (resizeObserver) {
        if (frameDocument.body) {
          resizeObserver.observe(frameDocument.body)
        }

        if (frameDocument.documentElement) {
          resizeObserver.observe(frameDocument.documentElement)
        }
      }

      const frameImages = Array.from(frameDocument.images ?? [])
      frameImages.forEach((image) => {
        image.addEventListener('error', updateHeight)
        image.addEventListener('load', updateHeight)
      })

      const timerId = window.setTimeout(() => {
        updateHeight()
      }, 60)

      cleanupAttachedResources = () => {
        resizeObserver?.disconnect()
        window.clearTimeout(timerId)

        frameImages.forEach((image) => {
          image.removeEventListener('error', updateHeight)
          image.removeEventListener('load', updateHeight)
        })
      }
    }

    iframe.addEventListener('load', attachFrameObserver)

    if (iframe.contentDocument?.readyState === 'complete') {
      attachFrameObserver()
    }

    return () => {
      iframe.removeEventListener('load', attachFrameObserver)
      cleanupAttachedResources()
    }
  }, [documentHtml])

  return (
    <iframe
      className={className}
      ref={iframeRef}
      scrolling="no"
      srcDoc={documentHtml}
      style={{ border: 0, display: 'block', height: frameHeight > 0 ? `${frameHeight}px` : '1px', width: '100%' }}
      title={title}
    />
  )
}

function buildPreviewDocumentFromBodyHtml(bodyHtml = '') {
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/></head><body style="margin:0;background:#ffffff;">${bodyHtml}</body></html>`
}

function useRenderablePreviewSlots(session, version) {
  const [liveAssetMap, setLiveAssetMap] = useState(null)
  const imageSelection = session?.imageSelection
  const sourceVersionId = imageSelection?.sourceVersionId ?? ''
  const hasMatchedAssets =
    Boolean(version?.id) &&
    sourceVersionId === version?.id &&
    Array.isArray(imageSelection?.referenceAssets) &&
    imageSelection.referenceAssets.length > 0 &&
    Array.isArray(imageSelection?.slots) &&
    imageSelection.slots.length > 0

  useEffect(() => {
    if (!hasMatchedAssets) {
      setLiveAssetMap(null)
      return
    }

    let cancelled = false

    requestLibraryAssets()
      .then((items) => {
        if (!cancelled) {
          setLiveAssetMap(new Map(items.map((item) => [item.id, item])))
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLiveAssetMap(null)
        }
      })

    return () => {
      cancelled = true
    }
  }, [hasMatchedAssets, imageSelection?.matchedAt, sourceVersionId, version?.id])

  return useMemo(
    () =>
      getRenderablePreviewSlots({
        imageSelection,
        liveAssetMap,
        versionId: version?.id ?? '',
      }),
    [imageSelection, liveAssetMap, version?.id],
  )
}

function buildTemplateMatchSections(previewSections) {
  const fallbackSections = buildPreviewSections('', { fillTrailingSections: true })

  return Array.from({ length: 3 }, (_, index) => {
    const matchedSection =
      previewSections.find((section) => section.order === index + 1) ??
      previewSections[index] ??
      fallbackSections[index]

    return {
      ...matchedSection,
      order: index + 1,
      positionLabel: `第 ${index + 1} 段后`,
      sectionOrder: index + 1,
    }
  })
}

async function copyHtmlToClipboard(html, plainText) {
  if (window.ClipboardItem && navigator.clipboard && window.isSecureContext) {
    const item = new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([plainText], { type: 'text/plain' }),
    })
    await navigator.clipboard.write([item])
    return true
  }

  const tmp = document.createElement('div')
  tmp.contentEditable = 'true'
  tmp.innerHTML = html
  Object.assign(tmp.style, {
    left: '-9999px',
    opacity: '0',
    position: 'fixed',
  })

  document.body.appendChild(tmp)
  const range = document.createRange()
  range.selectNodeContents(tmp)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
  document.execCommand('copy')
  selection?.removeAllRanges()
  document.body.removeChild(tmp)
  return true
}

function getAvailableTabs(session) {
  const tabs = []
  const hasDraft = Boolean(getActiveVersion(session)?.draftMarkdown)
  const hasPreview = session?.stageId === 'preview' || session?.stageId === 'completed'

  if (hasDraft) {
    tabs.push('draft', 'report')
  }

  if (hasPreview) {
    tabs.push('preview')
  }

  if ((session?.draftReview?.versions?.length ?? 0) > 0) {
    tabs.push('versions')
  }

  return tabs
}

function createPreparedFlowSteps(flowId, steps, startedAt) {
  return steps.map((step, index) => ({
    ...step,
    completedAt: null,
    elapsedMs: 0,
    id: `${flowId}-step-${index + 1}`,
    startedAt: index === 0 ? startedAt : null,
    status: index === 0 ? 'running' : 'waiting',
  }))
}

function advanceFlowSteps(steps, currentIndex, movedAt) {
  return steps.map((step, stepIndex) => {
    if (stepIndex < currentIndex) {
      return step
    }

    if (stepIndex === currentIndex) {
      const startedAt = step.startedAt ?? movedAt

      return {
        ...step,
        completedAt: movedAt,
        elapsedMs: Math.max(0, movedAt - startedAt),
        startedAt,
        status: 'done',
      }
    }

    if (stepIndex === currentIndex + 1) {
      return {
        ...step,
        startedAt: step.startedAt ?? movedAt,
        status: 'running',
      }
    }

    return step
  })
}

function completeFlowSteps(steps, finishedAt) {
  return steps.map((step) => {
    if (step.status === 'done' || step.status === 'skipped') {
      return step
    }

    const startedAt = step.startedAt ?? finishedAt

    return {
      ...step,
      completedAt: finishedAt,
      elapsedMs: Math.max(0, finishedAt - startedAt),
      startedAt,
      status: 'done',
    }
  })
}

function failFlowSteps(steps, finishedAt) {
  const runningIndex = steps.findIndex((step) => step.status === 'running')
  const failureIndex = runningIndex === -1 ? steps.findLastIndex((step) => step.status === 'done') : runningIndex

  return steps.map((step, index) => {
    if (index === failureIndex) {
      const startedAt = step.startedAt ?? finishedAt

      return {
        ...step,
        completedAt: finishedAt,
        elapsedMs: Math.max(0, finishedAt - startedAt),
        startedAt,
        status: 'failed',
      }
    }

    if (step.status === 'running') {
      const startedAt = step.startedAt ?? finishedAt

      return {
        ...step,
        completedAt: finishedAt,
        elapsedMs: Math.max(0, finishedAt - startedAt),
        startedAt,
        status: index < failureIndex ? 'done' : 'waiting',
      }
    }

    return step
  })
}

function AttachmentPills({ attachments, onRemove, align = 'left' }) {
  if (attachments.length === 0) {
    return null
  }

  return (
    <div className={cn('flex flex-wrap gap-2', align === 'right' && 'justify-end')}>
      {attachments.map((attachment) => (
        <div
          key={attachment.id}
          className="flex items-center gap-2 rounded-full border border-border/70 bg-white px-3 py-1.5 text-[12px] text-foreground"
        >
          <Paperclip size={13} />
          <span className="max-w-[180px] truncate">{attachment.name}</span>
          <span className="text-muted-foreground">{attachment.sizeLabel}</span>
          {onRemove ? (
            <button
              className="rounded-full p-0.5 text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => onRemove(attachment.id)}
              type="button"
            >
              <X size={13} />
            </button>
          ) : null}
        </div>
      ))}
    </div>
  )
}

function CopyButton({ copied, onClick }) {
  return (
    <button
      className="inline-flex size-8 items-center justify-center rounded-full border border-border/70 bg-white text-muted-foreground opacity-0 shadow-none transition-all hover:border-foreground/15 hover:text-foreground group-hover/message:opacity-100"
      onClick={onClick}
      type="button"
    >
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  )
}

function ThinkingToggle({ checked, onChange }) {
  return (
    <div className="inline-flex items-center gap-2">
      <button
        aria-pressed={checked}
        className="inline-flex items-center"
        onClick={onChange}
        type="button"
      >
        <span
          className={cn(
            'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
            checked ? 'bg-[#171b22]' : 'bg-secondary',
          )}
        >
          <span
            className={cn(
              'absolute left-0.5 size-4 rounded-full bg-white transition-transform',
              checked && 'translate-x-4',
            )}
          />
        </span>
      </button>

      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-default text-[12px] text-foreground">深度思考</span>
        </TooltipTrigger>
        <TooltipContent
          className="max-w-[260px] items-start rounded-xl bg-[#171b22] px-3 py-2 text-[12px] leading-5 text-white"
          side="top"
          sideOffset={8}
        >
          <span>
            开启时优先走完整创作链路，适合需要更稳稿件质量的场景。
            <br />
            关闭时会优先使用更快的生成策略。
          </span>
        </TooltipContent>
      </Tooltip>
    </div>
  )
}

function QuickMessageItem({ disabled = false, label, onSelect }) {
  return (
    <button
      className={cn(
        'flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px] transition-colors',
        disabled
          ? 'cursor-not-allowed border border-dashed border-border/60 bg-secondary/35 text-muted-foreground'
          : 'border border-transparent bg-white text-foreground hover:border-border/80 hover:bg-secondary/45',
      )}
      disabled={disabled}
      onClick={() => onSelect(label)}
      type="button"
    >
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
        <MessageSquareText size={13} />
      </div>
      <span className="truncate">{label}</span>
    </button>
  )
}

function QuickMessageMenu({ disabled = false, onSelect }) {
  return (
    <div className="group/quick relative">
      <button
        className={cn(
          'inline-flex items-center gap-2 rounded-full border border-border/75 bg-white px-3.5 py-2 text-[13px] text-foreground transition-colors hover:border-foreground/15',
          disabled && 'cursor-not-allowed opacity-50 hover:border-border/75',
        )}
        disabled={disabled}
        type="button"
      >
        <MessageSquareText size={14} />
        <span>快捷消息</span>
        <ChevronRight
          className="text-muted-foreground transition-transform duration-150 group-hover/quick:translate-x-0.5"
          size={14}
        />
      </button>

      {!disabled ? (
        <div className="pointer-events-none absolute bottom-full right-0 z-30 mb-2 w-[296px] opacity-0 transition-all duration-150 group-hover/quick:pointer-events-auto group-hover/quick:opacity-100">
          <div className="rounded-2xl border border-border/80 bg-white p-2 shadow-[0_14px_32px_rgba(15,23,42,0.06)]">
            <div className="space-y-1.5">
              {quickMessageItems.map((item) => (
                <QuickMessageItem
                  disabled={item.disabled}
                  key={item.id}
                  label={item.label}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function SearchField({ onChange, value }) {
  return (
    <div className="relative mt-3">
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        className="h-11 w-full rounded-2xl border border-border/75 bg-white pl-10 pr-4 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground hover:border-foreground/15 focus:border-foreground/20"
        onChange={(event) => onChange(event.target.value)}
        placeholder="搜索文章标题"
        type="search"
        value={value}
      />
    </div>
  )
}

function PlaceholderAvatar({ compact = false }) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-full border border-white/80 bg-white shadow-[0_10px_22px_rgba(15,23,42,0.08)]',
        compact ? 'h-11 w-11' : 'h-12 w-12',
      )}
    >
      <img alt="内容创作头像" className="h-full w-full object-cover" src="/sidebar-avatar.png" />
    </div>
  )
}

function SidebarRailButton({ children, label, onClick, popup, selected = false, type = 'button' }) {
  return (
    <div className="relative">
      <button
        aria-label={label}
        className={cn(
          'inline-flex h-11 w-11 items-center justify-center rounded-[14px] border transition-all',
          selected
            ? 'border-border/80 bg-white text-foreground shadow-[0_8px_18px_rgba(15,23,42,0.04)]'
            : 'border-transparent bg-transparent text-muted-foreground hover:border-border/70 hover:bg-white hover:text-foreground',
        )}
        onClick={onClick}
        type={type}
      >
        {children}
      </button>
      {popup}
    </div>
  )
}

function HistoryHoverCard({ activeSessionId, onSelectSession, sessions }) {
  return (
    <div className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-40 w-[280px] -translate-y-1/2 rounded-[18px] border border-border/80 bg-white p-4 opacity-0 shadow-[0_24px_60px_rgba(15,23,42,0.14)] transition-all duration-150 group-hover/history-card:pointer-events-auto group-hover/history-card:opacity-100">
      <div className="relative">
        <span className="absolute left-[-15px] top-[-18px] h-[calc(100%+36px)] w-5" aria-hidden="true" />
        <span className="absolute left-[-15px] top-1/2 h-3 w-3 -translate-y-1/2 rotate-45 rounded-[3px] border-l border-t border-border/80 bg-white" />
        <div className="text-[12px] font-medium tracking-[0.08em] text-muted-foreground">历史记录</div>
        {sessions.length === 0 ? (
          <div className="mt-4 rounded-[16px] border border-border/70 bg-secondary/20 px-4 py-10 text-center text-[14px] text-muted-foreground">
            暂无历史对话
          </div>
        ) : (
          <div className="mt-3 space-y-0">
            {sessions.slice(0, 8).map((session) => (
              <button
                className={cn(
                  'flex w-full items-center justify-between rounded-[14px] px-3 py-2.5 text-left text-[14px] transition-colors',
                  session.id === activeSessionId ? 'bg-secondary text-foreground' : 'text-foreground/84 hover:bg-secondary/35',
                )}
                key={session.id}
                onClick={() => onSelectSession(session.id)}
                type="button"
              >
                <span className="truncate">{session.title}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function SidebarExpandedItem({ icon: Icon, label, onClick, selected = false }) {
  return (
    <button
      className={cn(
        'flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left transition-colors',
        selected ? 'bg-white text-foreground shadow-[0_8px_18px_rgba(15,23,42,0.05)]' : 'text-foreground/82 hover:bg-white/80',
      )}
      onClick={onClick}
      type="button"
    >
      <Icon className={cn(selected ? 'text-foreground' : 'text-muted-foreground')} size={20} strokeWidth={1.9} />
      <span className="text-[14px] font-medium">{label}</span>
    </button>
  )
}

function TopicCard({ disabled = false, isSelected, onSelect, topic, topicStatus = 'pending' }) {
  const topicStatusMeta = getTopicStatusMeta(topicStatus)

  return (
    <button
      className={cn(
        'w-full rounded-[24px] border px-5 py-5 text-left transition-all',
        isSelected
          ? 'border-primary/30 bg-primary/5 shadow-[0_10px_30px_rgba(14,159,110,0.08)]'
          : 'border-border/70 bg-white hover:border-foreground/15 hover:bg-secondary/25',
        disabled && 'cursor-not-allowed opacity-65',
      )}
      disabled={disabled}
      onClick={() => onSelect(topic.id)}
      type="button"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[15px] font-semibold leading-[1.55] text-foreground">{topic.title}</div>
          <p className="mt-2 text-[13px] leading-6 text-muted-foreground">{topic.reason}</p>
        </div>
        {isSelected ? (
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-white">
            <Check size={14} />
          </span>
        ) : null}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <span className={cn('rounded-full px-2.5 py-1 text-[11px]', topicStatusMeta.className)}>{topicStatusMeta.label}</span>
        <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] text-muted-foreground">{topic.penName}</span>
        <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] text-muted-foreground">{topic.theme}</span>
      </div>
    </button>
  )
}

function TopicLibraryCard({ topic, topicStatus = 'pending' }) {
  const topicStatusMeta = getTopicStatusMeta(topicStatus)

  return (
    <article className="rounded-[24px] border border-border/70 bg-white px-5 py-5 transition-all hover:border-foreground/15 hover:bg-secondary/25">
      <div className="min-w-0">
        <div className="text-[15px] font-semibold leading-[1.55] text-foreground">{topic.title}</div>
        <p className="mt-2 text-[13px] leading-6 text-muted-foreground">{topic.reason}</p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <span className={cn('rounded-full px-2.5 py-1 text-[11px]', topicStatusMeta.className)}>{topicStatusMeta.label}</span>
        <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] text-muted-foreground">{topic.penName}</span>
        <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] text-muted-foreground">{topic.theme}</span>
      </div>
    </article>
  )
}

function WorkflowTimeline({ flow }) {
  if (!flow) {
    return null
  }

  const hasRunningStep = flow.steps.some((step) => step.status === 'running')
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!hasRunningStep) {
      return
    }

    const timerId = window.setInterval(() => {
      setNow(Date.now())
    }, 100)

    return () => {
      window.clearInterval(timerId)
    }
  }, [hasRunningStep])

  return (
    <div className="mt-4 space-y-2.5">
      {flow.steps.map((step, index) => {
        const isRunning = step.status === 'running'
        const isDone = step.status === 'done'
        const isFailed = step.status === 'failed'
        const isSkipped = step.status === 'skipped'
        const isWaiting = step.status === 'waiting'
        const elapsedMs = isRunning ? now - (step.startedAt ?? now) : step.elapsedMs ?? 0

        return (
          <div className="relative flex min-h-[30px] items-center gap-2.5 pl-6" key={step.id}>
            {index < flow.steps.length - 1 ? (
              <span
                className={cn(
                  'absolute left-[9px] top-5.5 h-[calc(100%+8px)] w-px',
                  isDone || isSkipped ? 'bg-border/90' : 'bg-border/55',
                )}
              />
            ) : null}

            <span
              className={cn(
                'absolute left-0 top-1.5 inline-flex size-[18px] items-center justify-center rounded-full border bg-white',
                isRunning && 'border-primary/25 text-primary shadow-[0_0_0_4px_rgba(14,159,110,0.08)]',
                isDone && 'border-foreground/10 text-foreground',
                isSkipped && 'border-border/80 text-muted-foreground',
                isFailed && 'border-red-200 text-red-600',
                isWaiting && 'border-border/70 text-muted-foreground',
              )}
            >
              {isRunning ? <LoaderCircle className="animate-spin" size={10} /> : null}
              {isDone ? <Check size={10} /> : null}
              {isSkipped ? <History size={10} /> : null}
              {isFailed ? <X size={10} /> : null}
              {isWaiting ? <span className="size-1.5 rounded-full bg-current" /> : null}
            </span>

            <div className="flex max-w-full items-center gap-2">
              <div
                className={cn(
                  'inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-[12px] leading-none transition-colors',
                  isRunning && 'border-primary/20 bg-primary/[0.06] text-primary',
                  isDone && 'border-border/70 bg-white text-foreground/80',
                  isSkipped && 'border-border/70 bg-secondary/20 text-muted-foreground',
                  isFailed && 'border-red-200 bg-red-50/70 text-red-600',
                  isWaiting && 'border-border/70 bg-white text-muted-foreground',
                )}
              >
                <span className="max-w-[220px] truncate sm:max-w-[280px]">{step.label}</span>
              </div>

              <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                {formatFlowElapsedLabel(elapsedMs, step.status)}
              </span>
            </div>

          </div>
        )
      })}
    </div>
  )
}

function TopicStageCard({
  filterTypes,
  onApplyFilters,
  onClearFilters,
  onSelectPage,
  onSelectTopic,
  pageCount,
  pageIndex,
  recommendations,
  selectedTopicId,
  topicStatusById,
}) {
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [draftFilterTypes, setDraftFilterTypes] = useState(filterTypes)
  const filterPopoverRef = useRef(null)

  useEffect(() => {
    setDraftFilterTypes(filterTypes)
  }, [filterTypes])

  useEffect(() => {
    if (!isFilterOpen) {
      return
    }

    function handlePointerDown(event) {
      if (!filterPopoverRef.current?.contains(event.target)) {
        setIsFilterOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [isFilterOpen])

  function handleToggleDraftType(type) {
    setDraftFilterTypes((current) => {
      if (current.includes(type)) {
        return current.filter((item) => item !== type)
      }

      if (current.length >= 3) {
        return current
      }

      return [...current, type]
    })
  }

  function handleConfirmFilters() {
    onApplyFilters(draftFilterTypes)
    setIsFilterOpen(false)
  }

  function handleClearButtonClick(event) {
    event.stopPropagation()
    setDraftFilterTypes([])
    onClearFilters()
    setIsFilterOpen(false)
  }

  return (
    <div className="rounded-[30px] border border-border/70 bg-white p-5 shadow-[0_24px_50px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-[22px] font-semibold text-foreground">选题确认</h3>

        <div className="relative" ref={filterPopoverRef}>
          <button
            className={cn(
              'inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[13px] transition-colors',
              filterTypes.length > 0
                ? 'border-foreground/20 bg-foreground text-white'
                : 'border-border/75 bg-white text-foreground hover:border-foreground/15',
            )}
            onClick={() => {
              setDraftFilterTypes(filterTypes)
              setIsFilterOpen((current) => !current)
            }}
            type="button"
          >
            <ListFilter size={14} />
            <span>筛选</span>
            {filterTypes.length > 0 ? (
              <>
                <span className="rounded-full bg-white/14 px-1.5 py-0.5 text-[11px] leading-none text-white">
                  {filterTypes.length}
                </span>
                <span
                  className="inline-flex size-4 items-center justify-center rounded-full bg-white/12 text-white/88 transition-colors hover:bg-white/18"
                  onClick={handleClearButtonClick}
                  role="button"
                  tabIndex={0}
                >
                  <X size={11} />
                </span>
              </>
            ) : null}
          </button>

          {isFilterOpen ? (
            <div className="absolute right-0 top-[calc(100%+10px)] z-30 w-[300px] rounded-[22px] border border-border/80 bg-white p-4 shadow-[0_24px_60px_rgba(15,23,42,0.12)]">
              <div className="text-[14px] font-medium text-foreground">筛选预设选题</div>
              <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
                根据文章类型筛选当前预设选题，最多选择 3 个不同类型。
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {TOPIC_LIBRARY_TYPES.map((type) => {
                  const selected = draftFilterTypes.includes(type)

                  return (
                    <button
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-[12px] transition-colors',
                        selected
                          ? 'border-foreground/15 bg-foreground text-white'
                          : 'border-border/70 bg-white text-foreground hover:border-foreground/15 hover:bg-secondary/25',
                      )}
                      key={type}
                      onClick={() => handleToggleDraftType(type)}
                      type="button"
                    >
                      {type}
                    </button>
                  )
                })}
              </div>

              <div className="mt-5 flex items-center justify-between gap-3">
                <button
                  className="text-[12px] text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => {
                    setDraftFilterTypes([])
                    setIsFilterOpen(false)
                  }}
                  type="button"
                >
                  清空选择
                </button>
                <Button className="rounded-full" onClick={handleConfirmFilters} size="sm" type="button">
                  确定
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-3 xl:grid-cols-2">
        {recommendations.length === 0 ? (
          <div className="col-span-full rounded-[24px] border border-dashed border-border/80 bg-secondary/15 px-5 py-14 text-center text-[14px] text-muted-foreground">
            当前筛选条件下暂无预设选题，换一个类型再试试。
          </div>
        ) : (
          recommendations.map((topic) => (
            <TopicCard
              isSelected={topic.id === selectedTopicId}
              key={topic.id}
              onSelect={onSelectTopic}
              topic={topic}
              topicStatus={topicStatusById[topic.id] ?? 'pending'}
            />
          ))
        )}
      </div>

      {pageCount > 1 ? (
        <div className="mt-5 flex items-center justify-center gap-2">
          <button
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-white text-muted-foreground transition-colors hover:border-foreground/15 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"
            disabled={pageIndex === 0}
            onClick={() => onSelectPage(pageIndex - 1)}
            type="button"
          >
            <ChevronLeft size={14} />
          </button>

          {Array.from({ length: pageCount }, (_, index) => (
            <button
              className={cn(
                'inline-flex h-9 min-w-9 items-center justify-center rounded-full border px-3 text-[12px] transition-colors',
                pageIndex === index
                  ? 'border-foreground/15 bg-foreground text-white'
                  : 'border-border/70 bg-white text-foreground hover:border-foreground/15 hover:bg-secondary/25',
              )}
              key={`page-${index + 1}`}
              onClick={() => onSelectPage(index)}
              type="button"
            >
              {index + 1}
            </button>
          ))}

          <button
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-white text-muted-foreground transition-colors hover:border-foreground/15 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"
            disabled={pageIndex >= pageCount - 1}
            onClick={() => onSelectPage(pageIndex + 1)}
            type="button"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      ) : null}
    </div>
  )
}

function DraftStageCard({ activeVersion, onProceedWithoutChanges, onOpenTab, onRewriteAll }) {
  if (!activeVersion) {
    return null
  }

  return (
    <div className="rounded-[28px] border border-border/70 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.04)]">
      <div className="max-w-[640px]">
        <h3 className="text-[22px] font-semibold text-foreground">文字稿确认</h3>
      </div>

      <div className="mt-6 rounded-[24px] border border-border/70 bg-secondary/35 px-4 py-5 sm:px-5">
        <div className="flex flex-col gap-5">
          <div>
            <p className="text-[15px] font-medium text-foreground">右侧已更新当前版本</p>
            <p className="mt-1 text-[13px] leading-6 text-muted-foreground">继续修改，或直接进入排版。</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button className="rounded-full bg-[#171b22] px-5 text-white hover:bg-black" onClick={onProceedWithoutChanges} type="button">
              无需修改
            </Button>
            <Button className="rounded-full" onClick={onRewriteAll} type="button" variant="outline">
              整篇重写
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function PreviewStageCard({ onConfirm, onOpenTab }) {
  return (
    <div className="rounded-[28px] border border-border/70 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.04)]">
      <div className="max-w-[640px]">
        <h3 className="text-[22px] font-semibold text-foreground">排版效果确认</h3>
      </div>

      <div className="mt-6 rounded-[24px] border border-border/70 bg-secondary/35 px-4 py-5 sm:px-5">
        <div className="flex flex-col gap-5">
          <div>
            <p className="text-[15px] font-medium text-foreground">右侧已更新排版预览</p>
            <p className="mt-1 text-[13px] leading-6 text-muted-foreground">确认无误后完成本轮创作。</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button className="rounded-full bg-[#171b22] px-5 text-white hover:bg-black" onClick={onConfirm} type="button">
              确认排版
            </Button>
            <Button className="rounded-full" onClick={() => onOpenTab('preview')} type="button" variant="outline">
              查看排版预览
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function CompletedStageCard({ onOpenTab }) {
  return (
    <div className="rounded-[28px] border border-border/70 bg-white p-5 shadow-[0_18px_40px_rgba(15,23,42,0.04)]">
      <div className="flex items-center gap-2 text-[12px] font-medium tracking-[0.08em] text-muted-foreground">
        当前版本已完成
        <CheckCircle2 className="text-primary" size={14} />
      </div>
      <h3 className="mt-2 text-[22px] font-semibold text-foreground">排版确认完成</h3>
      <p className="mt-1 text-[14px] leading-6 text-muted-foreground">
        这篇文章已经完成本轮内容创作。你可以继续在右侧查看正文、校验报告和排版预览。
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button className="rounded-full" onClick={() => onOpenTab('preview')} size="sm" type="button" variant="outline">
          <LayoutTemplate size={14} />
          查看排版预览
        </Button>
        <Button className="rounded-full" onClick={() => onOpenTab('draft')} size="sm" type="button" variant="outline">
          <FileText size={14} />
          查看文字稿
        </Button>
      </div>
    </div>
  )
}

function SessionSidebar({
  activeModule,
  activeSessionId,
  isCollapsed,
  onChangeModule,
  onCreateSession,
  onDeleteSession,
  onSelectSession,
  onToggleCollapsed,
  sessions,
}) {
  if (isCollapsed) {
    return (
      <aside className="relative flex h-full w-[88px] shrink-0 flex-col items-center border-r border-border/70 bg-[#f5f5f5] px-3 py-4">
        <div className="flex w-full justify-center">
          <button
            aria-label="展开导航"
            className="inline-flex h-11 w-11 items-center justify-center rounded-[14px] border border-border/70 bg-white shadow-[0_8px_18px_rgba(15,23,42,0.05)] transition-colors hover:border-foreground/15 hover:bg-secondary/45"
            onClick={onToggleCollapsed}
            type="button"
          >
            <PanelLeftOpen size={18} strokeWidth={1.9} />
          </button>
        </div>

        <div className="mt-7 flex w-full flex-col items-center gap-2">
          <SidebarRailButton label="新建" onClick={onCreateSession} selected={activeModule === 'content'}>
            <Plus size={20} strokeWidth={1.9} />
          </SidebarRailButton>

          {sidebarModules.map((module) => (
            <SidebarRailButton
              key={module.id}
              label={module.label}
              onClick={() => onChangeModule(module.id)}
              selected={activeModule === module.id}
            >
              <module.icon size={20} strokeWidth={1.9} />
            </SidebarRailButton>
          ))}
        </div>

        <div className="mt-6 h-px w-10 rounded-full bg-border/70" />

        <div className="mt-4">
          <div className="group/history-card relative">
            <span className="absolute left-full top-[-18px] h-[84px] w-5" aria-hidden="true" />
            <SidebarRailButton
              label="AI 对话历史"
              onClick={() => onChangeModule('content')}
              popup={
                <HistoryHoverCard
                  activeSessionId={activeSessionId}
                  onSelectSession={onSelectSession}
                  sessions={sessions}
                />
              }
            >
              <History size={20} strokeWidth={1.9} />
            </SidebarRailButton>
          </div>
        </div>
      </aside>
    )
  }

  return (
    <aside className="flex h-full w-[320px] shrink-0 flex-col border-r border-border/70 bg-[#f5f5f5] px-4 py-5">
      <div className="flex items-center gap-3">
        <button
          aria-label="收起导航"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-border/70 bg-white text-muted-foreground shadow-[0_8px_18px_rgba(15,23,42,0.05)] transition-colors hover:border-foreground/15 hover:bg-secondary/45 hover:text-foreground"
          onClick={onToggleCollapsed}
          type="button"
        >
          <PanelLeftClose size={18} strokeWidth={1.9} />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <PlaceholderAvatar />
            <div className="truncate text-[14px] font-medium text-foreground">内容创作</div>
          </div>
        </div>
      </div>

      <div className="mt-8 space-y-1.5">
        <SidebarExpandedItem icon={Plus} label="新建" onClick={onCreateSession} selected={activeModule === 'content'} />
        {sidebarModules.map((module) => (
          <SidebarExpandedItem
            icon={module.icon}
            key={module.id}
            label={module.label}
            onClick={() => onChangeModule(module.id)}
            selected={activeModule === module.id}
          />
        ))}
      </div>

      <div className="mt-8 text-[12px] font-medium tracking-[0.08em] text-muted-foreground">AI 对话历史</div>

      <div className="benchmark-scroll-hidden mt-3 min-h-0 flex-1 overflow-y-auto pb-4">
        {sessions.length === 0 ? (
          <div className="rounded-[16px] border border-border/70 bg-white px-4 py-10 text-center text-[14px] text-muted-foreground shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
            暂无历史对话
          </div>
        ) : (
          <div className="space-y-0">
            {sessions.map((session) => (
              <div
                className={cn(
                  'group/session flex items-center gap-2 rounded-[14px] border px-3 py-2.5 transition-colors',
                  session.id === activeSessionId
                    ? 'border-border/80 bg-white shadow-[0_8px_18px_rgba(15,23,42,0.04)]'
                    : 'border-transparent bg-transparent hover:border-border/70 hover:bg-white/75',
                )}
                key={session.id}
              >
                <button
                  className={cn(
                    'min-w-0 flex-1 text-left text-[14px] transition-colors',
                    session.id === activeSessionId ? 'text-foreground' : 'text-foreground/78 group-hover/session:text-foreground',
                  )}
                  onClick={() => onSelectSession(session.id)}
                  title={session.title}
                  type="button"
                >
                  <span className="block truncate">{session.title}</span>
                </button>

                <button
                  aria-label={`删除 ${session.title}`}
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-all hover:bg-secondary hover:text-foreground group-hover/session:opacity-100"
                  onClick={(event) => {
                    event.stopPropagation()
                    onDeleteSession(session)
                  }}
                  type="button"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
        </div>
    </aside>
  )
}

function DeleteSessionDialog({ onClose, onConfirm, open, sessionTitle }) {
  if (!open || typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/18 p-6 backdrop-blur-[8px]"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-[460px] overflow-hidden rounded-[26px] border border-white/80 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.16)]"
        onClick={(event) => event.stopPropagation()}
        role="presentation"
      >
        <div className="flex items-start justify-between gap-5 px-6 pb-0 pt-6">
          <div className="space-y-2">
            <h2 className="text-[24px] font-semibold leading-[1.2] tracking-[-0.02em] text-foreground">
              删除这篇文章？
            </h2>
            <p className="text-[14px] leading-[1.7] text-muted-foreground">
              《{sessionTitle}》会从本地历史记录里彻底删除，这个操作不能撤销。
            </p>
          </div>
          <button
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/70 bg-white text-muted-foreground shadow-sm transition-all hover:-translate-y-px hover:border-foreground/15 hover:bg-slate-50 hover:text-foreground"
            onClick={onClose}
            type="button"
          >
            <X size={17} />
          </button>
        </div>

        <div className="flex flex-col-reverse gap-3 px-6 pb-6 pt-6 sm:flex-row sm:justify-end">
          <Button
            className="h-11 rounded-xl border border-border/70 bg-white px-5 shadow-sm transition-all hover:-translate-y-px hover:border-foreground/15 hover:bg-slate-50 hover:text-foreground"
            onClick={onClose}
            type="button"
            variant="outline"
          >
            取消
          </Button>
          <Button
            className="h-11 rounded-xl bg-[#171b22] px-5 text-white shadow-none transition-all hover:-translate-y-px hover:bg-black"
            onClick={onConfirm}
            type="button"
          >
            确认删除
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function MessageBubble({ copiedMessageId, message, onCopy }) {
  const isAssistant = message.role === 'assistant'
  const isUser = message.role === 'user'
  const hasWorkflow = isAssistant && Boolean(message.workflow)

  return (
    <div
      className={cn(
        'group/message relative',
        isAssistant ? 'max-w-3xl' : 'ml-auto max-w-2xl text-right',
      )}
    >
      {message.attachments?.length ? (
        <div className={cn('mb-4', isUser && 'flex justify-end')}>
          <AttachmentPills align={isAssistant ? 'left' : 'right'} attachments={message.attachments} />
        </div>
      ) : null}

      <div
        className={cn(
          'text-[15px] leading-[1.7] text-foreground sm:text-[16px]',
          hasWorkflow && 'max-w-[720px]',
          isUser && 'ml-auto w-fit max-w-full rounded-[24px] bg-secondary/65 px-6 py-5 text-left font-medium',
        )}
      >
        {isAssistant ? renderMarkdownBlock(message.content) : message.content}
      </div>

      {hasWorkflow ? <WorkflowTimeline flow={message.workflow} /> : null}

      <div
        className={cn(
          'flex items-center gap-2 text-[12px] text-muted-foreground opacity-0 transition-opacity duration-150 group-hover/message:opacity-100',
          hasWorkflow ? 'mt-4' : 'mt-3',
          isAssistant && 'justify-start',
          isUser && 'justify-end',
        )}
      >
        <span>{formatMessageTime(message.createdAt)}</span>
        <CopyButton copied={copiedMessageId === message.id} onClick={() => onCopy(message.id, message.content)} />
      </div>
    </div>
  )
}

function GeneratedTitleSection({ title = '' }) {
  if (!title.trim()) {
    return null
  }

  return (
    <section className="mb-8 sm:mb-10">
      <div className="text-[18px] font-semibold leading-[1.75] text-foreground sm:text-[20px]">
        {title}
      </div>
    </section>
  )
}

function DraftWorkbench({ session, version }) {
  if (!version) {
    return <div className="text-[14px] text-muted-foreground">当前还没有文字稿。</div>
  }

  const topic = getSelectedTopic(session)
  const generatedTitle = resolveVersionGeneratedTitle(version)

  return (
    <div className="px-4 py-6 sm:px-6 sm:py-7">
      <div className="mx-auto max-w-[780px]">
        <div className="mb-6 flex flex-wrap items-center gap-2.5">
          <span className="rounded-full border border-border/70 bg-secondary/55 px-3 py-1.5 text-[12px] text-muted-foreground">
            {version.label}
          </span>
          <span className="rounded-full border border-border/70 bg-secondary/55 px-3 py-1.5 text-[12px] text-muted-foreground">
            {version.wordCount} 字
          </span>
          <span className="rounded-full border border-border/70 bg-secondary/55 px-3 py-1.5 text-[12px] text-muted-foreground">
            {topic?.penName || '未命名作者'}
          </span>
          <span className="rounded-full border border-border/70 bg-secondary/55 px-3 py-1.5 text-[12px] text-muted-foreground">
            {topic?.type || '未分类'}
          </span>
        </div>

        <article className="border-t border-border/65 pt-8 sm:pt-10">
          <GeneratedTitleSection title={generatedTitle} />
          {renderMarkdownBlock(getDraftBodyMarkdown(version), draftMarkdownComponents)}
        </article>
      </div>
    </div>
  )
}

function ReportWorkbench({ version }) {
  if (!version) {
    return <div className="text-[14px] text-muted-foreground">当前还没有校验报告。</div>
  }

  return (
    <div className="px-4 py-6 sm:px-6 sm:py-7">
      <div className="mx-auto max-w-[720px]">
        {renderMarkdownBlock(version.reportMarkdown, reportMarkdownComponents)}
      </div>
    </div>
  )
}

function PreviewWorkbench({
  onCopyTitleSuccess,
  onShowPageToast,
  onSetPreviewDevice,
  onSetPreviewFontSize,
  onSetPreviewSurfaceMode,
  onUpdateDraftSync,
  previewFontSize = 'medium',
  session,
}) {
  const [copyStatus, setCopyStatus] = useState('idle')
  const [clipboardPreviewState, setClipboardPreviewState] = useState({
    bodyHtml: '',
    error: '',
    key: '',
    status: 'idle',
    uploadedImageCount: 0,
  })
  const [isWechatSyncing, setIsWechatSyncing] = useState(false)
  const [wechatStatus, setWechatStatus] = useState({
    appId: '',
    configured: false,
    error: '',
    isLoading: true,
  })
  const topic = getSelectedTopic(session)
  const version = getActiveVersion(session)
  const { config: fixedLayoutConfig } = useFixedLayoutConfigState()
  const previewSlots = useRenderablePreviewSlots(session, version)
  const previewDevice = session?.layoutReview?.device === 'desktop' || session?.layoutReview?.device === 'pc' ? 'desktop' : 'mobile'
  const previewSurfaceMode = normalizePreviewSurfaceMode(session?.layoutReview?.surfaceMode)
  const normalizedPreviewFontSize = normalizePreviewFontSize(previewFontSize)
  const draftStructureState = useMemo(
    () => analyzeStructuredPreviewDraft(version?.draftMarkdown ?? '', { requireTitle: true }),
    [version?.draftMarkdown],
  )
  const canRenderStructuredPreview = draftStructureState.canPreview
  const bodyMarkdown = stripPreviewHeading(version?.draftMarkdown ?? '')
  const displayTitle = resolveVersionDisplayTitle(session, version)
  const previewRenderResult = useMemo(
    () => {
      if (!canRenderStructuredPreview) {
        return {
          bodyHtml: '',
          documentHtml: '',
          plainText: '',
          valid: false,
        }
      }

      return renderArticlePreviewDocument({
        articleType: topic?.type || '',
        bodyMarkdown,
        displayTitle,
        fixedLayoutConfig,
        fontSize: normalizedPreviewFontSize,
        imageSlots: previewSlots,
        origin: typeof window === 'undefined' ? '' : window.location.origin,
        penName: topic?.penName || '',
        structuredContent: draftStructureState,
        wordCount: version?.wordCount ?? 0,
      })
    },
    [bodyMarkdown, canRenderStructuredPreview, displayTitle, draftStructureState, fixedLayoutConfig, normalizedPreviewFontSize, previewSlots, topic?.penName, topic?.type, version?.wordCount],
  )
  const wechatRenderResult = useMemo(
    () => {
      if (!canRenderStructuredPreview) {
        return {
          bodyHtml: '',
          plainText: '',
          valid: false,
        }
      }

      return renderWechatDraftHtml({
        articleType: topic?.type || '',
        bodyMarkdown,
        fixedLayoutConfig,
        fontSize: normalizedPreviewFontSize,
        imageSlots: previewSlots,
        origin: '',
        penName: topic?.penName || '',
        structuredContent: draftStructureState,
        wordCount: version?.wordCount ?? 0,
      })
    },
    [bodyMarkdown, canRenderStructuredPreview, draftStructureState, fixedLayoutConfig, normalizedPreviewFontSize, previewSlots, topic?.penName, topic?.type, version?.wordCount],
  )
  const wechatClipboardRenderResult = useMemo(
    () => {
      if (!canRenderStructuredPreview) {
        return {
          bodyHtml: '',
          plainText: '',
          valid: false,
        }
      }

      return renderWechatClipboardHtml({
        articleType: topic?.type || '',
        bodyMarkdown,
        fixedLayoutConfig,
        fontSize: normalizedPreviewFontSize,
        imageSlots: previewSlots,
        origin: typeof window === 'undefined' ? '' : window.location.origin,
        penName: topic?.penName || '',
        structuredContent: draftStructureState,
        wordCount: version?.wordCount ?? 0,
      })
    },
    [bodyMarkdown, canRenderStructuredPreview, draftStructureState, fixedLayoutConfig, normalizedPreviewFontSize, previewSlots, topic?.penName, topic?.type, version?.wordCount],
  )
  const wechatCoverImageSrc =
    getFixedLayoutImageDisplaySlots(fixedLayoutConfig)
      .map((slot) => slot?.asset?.path || '')
      .find(Boolean) ||
    previewSlots.map((slot) => slot?.asset?.path || '').find(Boolean) ||
    ''
  const wechatDraftSync = session?.draftSync?.provider === 'wechat' ? session.draftSync : session?.draftSync ?? null
  const syncIndicatorMeta = resolveWechatSyncIndicatorMeta({
    hasCoverImage: Boolean(wechatCoverImageSrc),
    isWechatSyncing,
    wechatDraftSync,
    wechatStatus,
  })
  const previewRenderKey = wechatClipboardRenderResult.bodyHtml

  useEffect(() => {
    if (!canRenderStructuredPreview || !previewRenderKey) {
      setClipboardPreviewState({
        bodyHtml: '',
        error: '',
        key: '',
        status: 'idle',
        uploadedImageCount: 0,
      })
      return
    }

    if (previewSurfaceMode !== 'wechat') {
      return
    }

    if (clipboardPreviewState.key === previewRenderKey && clipboardPreviewState.status === 'ready') {
      return
    }

    let cancelled = false

    setClipboardPreviewState((current) => ({
      bodyHtml: current.key === previewRenderKey ? current.bodyHtml : '',
      error: '',
      key: previewRenderKey,
      status: 'loading',
      uploadedImageCount: current.key === previewRenderKey ? current.uploadedImageCount : 0,
    }))

    requestWechatClipboardPreparation({
      bodyHtml: wechatClipboardRenderResult.bodyHtml,
      plainText: wechatClipboardRenderResult.plainText,
    })
      .then((payload) => {
        if (cancelled) {
          return
        }

        setClipboardPreviewState({
          bodyHtml: payload?.bodyHtml || wechatClipboardRenderResult.bodyHtml,
          error: '',
          key: previewRenderKey,
          status: 'ready',
          uploadedImageCount: Number(payload?.uploadedImageCount || 0),
        })
      })
      .catch((error) => {
        if (cancelled) {
          return
        }

        setClipboardPreviewState({
          bodyHtml: '',
          error: error.message || '准备微信粘贴预览失败',
          key: previewRenderKey,
          status: 'error',
          uploadedImageCount: 0,
        })
      })

    return () => {
      cancelled = true
    }
  }, [canRenderStructuredPreview, clipboardPreviewState.key, clipboardPreviewState.status, previewRenderKey, previewSurfaceMode, wechatClipboardRenderResult.bodyHtml, wechatClipboardRenderResult.plainText])

  const activePreviewDocumentHtml = useMemo(() => {
    if (previewSurfaceMode === 'wechat' && clipboardPreviewState.status === 'ready' && clipboardPreviewState.bodyHtml) {
      return buildPreviewDocumentFromBodyHtml(clipboardPreviewState.bodyHtml)
    }

    if (previewSurfaceMode === 'wechat' && wechatClipboardRenderResult.bodyHtml) {
      return buildPreviewDocumentFromBodyHtml(wechatClipboardRenderResult.bodyHtml)
    }

    return previewRenderResult.documentHtml
  }, [clipboardPreviewState.bodyHtml, clipboardPreviewState.status, previewRenderResult.documentHtml, previewSurfaceMode, wechatClipboardRenderResult.bodyHtml])
  const previewViewportClassName =
    previewSurfaceMode === 'wechat' ? 'max-w-[578px]' : previewDevice === 'mobile' ? 'max-w-[390px]' : 'max-w-[760px]'

  useEffect(() => {
    if (!session?.id) {
      setWechatStatus({
        appId: '',
        configured: false,
        error: '',
        isLoading: false,
      })
      return
    }

    let cancelled = false

    setWechatStatus((current) => ({
      ...current,
      error: '',
      isLoading: true,
    }))

    requestWechatDraftStatus(session.id)
      .then((payload) => {
        if (cancelled) {
          return
        }

        setWechatStatus({
          appId: payload?.appId || '',
          configured: Boolean(payload?.configured),
          error: '',
          isLoading: false,
        })

        if (payload?.draftSync && onUpdateDraftSync) {
          onUpdateDraftSync(payload.draftSync)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setWechatStatus({
            appId: '',
            configured: false,
            error: error.message || '读取微信草稿状态失败',
            isLoading: false,
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [onUpdateDraftSync, session?.id])

  async function handleCopyWechat() {
    if (!wechatClipboardRenderResult.bodyHtml || copyStatus === 'copying') {
      return
    }

    try {
      setCopyStatus('copying')
      const preparedPayload =
        clipboardPreviewState.key === previewRenderKey && clipboardPreviewState.status === 'ready'
          ? {
              bodyHtml: clipboardPreviewState.bodyHtml,
              plainText: wechatClipboardRenderResult.plainText,
              uploadedImageCount: clipboardPreviewState.uploadedImageCount,
            }
          : await requestWechatClipboardPreparation({
              bodyHtml: wechatClipboardRenderResult.bodyHtml,
              plainText: wechatClipboardRenderResult.plainText,
            })

      await copyHtmlToClipboard(
        preparedPayload.bodyHtml || wechatClipboardRenderResult.bodyHtml,
        preparedPayload.plainText || wechatClipboardRenderResult.plainText,
      )

      setCopyStatus('copied')
      onShowPageToast?.(
        preparedPayload?.uploadedImageCount > 0
          ? `已复制微信样式，并处理 ${preparedPayload.uploadedImageCount} 张图片链接`
          : '已复制微信样式',
        'success',
      )
      window.setTimeout(() => {
        setCopyStatus('idle')
      }, 2000)
    } catch (error) {
      const errorMessage = error.message || '复制微信样式失败'
      setCopyStatus('error')
      onShowPageToast?.(`复制失败，未更新剪贴板：${errorMessage}`, 'error')
      window.setTimeout(() => {
        setCopyStatus('idle')
      }, 2000)
    }
  }

  async function handleCopyTitle() {
    try {
      await navigator.clipboard.writeText(displayTitle || '未命名标题')
      onCopyTitleSuccess?.()
    } catch {}
  }

  async function handleSyncWechatDraft() {
    if (!session?.id || !wechatRenderResult.bodyHtml || isWechatSyncing) {
      return
    }

    const nextDraftSync = {
      ...(session?.draftSync ?? {}),
      attemptCount: Math.max(1, Number(session?.draftSync?.attemptCount || 0) + 1),
      error: '',
      lastSyncedAt: session?.draftSync?.lastSyncedAt ?? null,
      mediaId: session?.draftSync?.mediaId ?? '',
      provider: 'wechat',
      status: 'syncing',
      summary: null,
    }

    setIsWechatSyncing(true)
    onUpdateDraftSync?.(nextDraftSync)

    try {
      const payload = await requestWechatDraftSync({
        article: {
          author: topic?.penName || '',
          bodyHtml: wechatRenderResult.bodyHtml,
          contentSourceUrl: '',
          coverImageSrc: wechatCoverImageSrc,
          mediaId: session?.draftSync?.mediaId || '',
          plainText: wechatRenderResult.plainText,
          title: displayTitle || '未命名文章',
        },
        sessionId: session.id,
      })

      if (payload?.draftSync) {
        onUpdateDraftSync?.(payload.draftSync)
      }

      setWechatStatus((current) => ({
        ...current,
        error: '',
      }))
    } catch (error) {
      onUpdateDraftSync?.({
        ...nextDraftSync,
        error: error.message || '同步微信草稿失败',
        status: 'error',
      })
      setWechatStatus((current) => ({
        ...current,
        error: error.message || '同步微信草稿失败',
      }))
    } finally {
      setIsWechatSyncing(false)
    }
  }

  const syncActionLabel = isWechatSyncing
    ? '同步中...'
    : wechatDraftSync?.mediaId
      ? '更新微信草稿'
      : '保存到微信草稿'
  const copyActionLabel =
    copyStatus === 'copying'
      ? '准备复制...'
      : copyStatus === 'copied'
        ? '已复制'
        : copyStatus === 'error'
          ? '复制失败'
          : '复制微信样式'
  const CopyWechatIcon =
    copyStatus === 'copying' ? LoaderCircle : copyStatus === 'copied' ? Check : copyStatus === 'error' ? X : Copy
  const SyncIndicatorIcon = syncIndicatorMeta.icon

  return (
    <div className="benchmark-scroll-hidden h-full min-h-0 overflow-y-auto px-6 py-6">
      <div className="mx-auto flex w-full max-w-[980px] flex-col gap-5">
        <div className="flex items-center justify-between gap-3 px-1 py-1">
          <div className="benchmark-scroll-hidden flex min-w-0 items-center gap-2 overflow-x-auto">
            <div className="inline-flex shrink-0 rounded-full bg-secondary/55 p-1">
              {[
                { id: 'mobile', label: '移动端', icon: Smartphone },
                { id: 'desktop', label: 'PC端', icon: Monitor },
              ].map((item) => (
                <button
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] transition-colors',
                    previewDevice === item.id ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                  )}
                  key={item.id}
                  onClick={() => onSetPreviewDevice?.(item.id)}
                  type="button"
                >
                  <item.icon size={14} />
                  {item.label}
                </button>
              ))}
            </div>

            <div className="inline-flex shrink-0 rounded-full bg-secondary/55 p-1">
              {previewFontSizeOptions.map((item) => (
                <button
                  className={cn(
                    'inline-flex items-center rounded-full px-4 py-2 text-[13px] transition-colors',
                    normalizedPreviewFontSize === item.id
                      ? 'bg-white text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                  key={item.id}
                  onClick={() => onSetPreviewFontSize?.(item.id)}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="inline-flex shrink-0 rounded-full bg-secondary/55 p-1">
              {previewSurfaceModeOptions.map((item) => (
                <button
                  className={cn(
                    'inline-flex items-center rounded-full px-4 py-2 text-[13px] transition-colors',
                    previewSurfaceMode === item.id
                      ? 'bg-white text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                  key={item.id}
                  onClick={() => onSetPreviewSurfaceMode?.(item.id)}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    aria-label={syncActionLabel}
                    className="rounded-full"
                    disabled={!canRenderStructuredPreview || !wechatStatus.configured || !wechatCoverImageSrc || !version?.id || isWechatSyncing}
                    onClick={handleSyncWechatDraft}
                    size="icon-lg"
                    type="button"
                  >
                    {isWechatSyncing ? <LoaderCircle className="animate-spin" size={16} /> : <MessageSquareText size={16} />}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent sideOffset={10}>{syncActionLabel}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className={cn(
                    'inline-flex size-10 items-center justify-center rounded-full border shadow-sm',
                    syncIndicatorMeta.toneClassName,
                  )}
                >
                  <SyncIndicatorIcon className={syncIndicatorMeta.iconClassName} size={17} />
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-[280px] flex-col items-start gap-1.5 px-3 py-2 text-left" sideOffset={10}>
                <div className="text-[12px] font-medium">{syncIndicatorMeta.title}</div>
                <div className="text-[12px] leading-5 text-background/80">{syncIndicatorMeta.description}</div>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    aria-label={copyActionLabel}
                    className="rounded-full"
                    disabled={!canRenderStructuredPreview || copyStatus === 'copying'}
                    onClick={handleCopyWechat}
                    size="icon-lg"
                    type="button"
                    variant="outline"
                  >
                    <CopyWechatIcon className={copyStatus === 'copying' ? 'animate-spin' : undefined} size={16} />
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-[280px] text-left" sideOffset={10}>
                {copyActionLabel}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        <div className="rounded-[22px] border border-border/70 bg-white px-5 py-4 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 text-[18px] font-semibold leading-[1.55] text-foreground">{displayTitle || '未命名标题'}</div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button aria-label="复制标题" className="rounded-full" onClick={handleCopyTitle} size="icon-sm" type="button" variant="ghost">
                  <Copy size={15} />
                </Button>
              </TooltipTrigger>
              <TooltipContent sideOffset={10}>复制标题</TooltipContent>
            </Tooltip>
          </div>
        </div>

        <div className="flex justify-center">
          <div className={cn('w-full transition-all', previewViewportClassName)}>
            {canRenderStructuredPreview ? (
              previewSurfaceMode === 'wechat' && clipboardPreviewState.status === 'loading' ? (
                <div className="rounded-[20px] border border-border/70 bg-white px-5 py-8 text-center text-[13px] text-muted-foreground shadow-[0_8px_24px_rgba(18,20,38,0.06)]">
                  正在生成微信粘贴预览...
                </div>
              ) : previewSurfaceMode === 'wechat' && clipboardPreviewState.status === 'error' ? (
                <div className="rounded-[20px] border border-red-200 bg-red-50 px-5 py-4 text-red-700">
                  <div className="text-[14px] font-semibold">微信粘贴预览生成失败</div>
                  <div className="mt-2 text-[13px] leading-6 text-red-700/90">{clipboardPreviewState.error || '当前复制链路处理失败。'}</div>
                </div>
              ) : (
                <div className="overflow-hidden rounded-none border border-border/70 bg-white shadow-[0_8px_24px_rgba(18,20,38,0.06)]">
                  <ArticlePreviewFrame documentHtml={activePreviewDocumentHtml} />
                </div>
              )
            ) : (
              <div className="rounded-[20px] border border-red-200 bg-red-50 px-5 py-4 text-red-700">
                <div className="text-[14px] font-semibold">格式有问题，无法进入排版</div>
                <div className="mt-2 text-[13px] leading-6 text-red-700/90">
                  {draftStructureState.issues.length > 0
                    ? draftStructureState.issues.join('；')
                    : '当前文字稿的标题层级或结尾结构无法稳定识别，请先修改或重新生成。'}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function VersionsWorkbench({ activeVersionId, onSelectVersion, versions }) {
  return (
    <div className="mx-auto w-full max-w-[820px] space-y-4">
      {versions
        .slice()
        .reverse()
        .map((version) => (
          <div
            className={cn(
              'rounded-[26px] border p-5 transition-colors',
              version.id === activeVersionId ? 'border-primary/20 bg-primary/5' : 'border-border/70 bg-white',
            )}
            key={version.id}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-[16px] font-semibold text-foreground">{version.label}</div>
                <div className="mt-1 text-[12px] text-muted-foreground">
                  {formatMessageTime(version.createdAt)} · {version.wordCount} 字
                </div>
              </div>
              <Button
                className="rounded-full"
                onClick={() => onSelectVersion(version.id)}
                size="sm"
                type="button"
                variant={version.id === activeVersionId ? 'default' : 'outline'}
              >
                {version.id === activeVersionId ? '当前查看中' : '切换查看'}
              </Button>
            </div>
            <div className="mt-3 text-[13px] leading-6 text-muted-foreground">{version.summary}</div>
            {version.note ? (
              <div className="mt-3 rounded-2xl bg-secondary/25 px-4 py-3 text-[13px] text-foreground">
                修改意见：{version.note}
              </div>
            ) : null}
          </div>
        ))}
    </div>
  )
}

function RightWorkbenchShell({
  activeTabId,
  onOpenTab,
  onCopyTitleSuccess,
  onShowPageToast,
  onSelectVersion,
  onSetPreviewDevice,
  onSetPreviewFontSize,
  onSetPreviewSurfaceMode,
  onUpdateDraftSync,
  session,
  tabs,
}) {
  const activeVersion = getActiveVersion(session)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const previewFontSize = normalizePreviewFontSize(session?.layoutReview?.fontSize)

  useEffect(() => {
    if (!isFullscreen) {
      return
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setIsFullscreen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isFullscreen])

  function renderBody() {
    switch (activeTabId) {
      case 'draft':
        return <DraftWorkbench session={session} version={activeVersion} />
      case 'report':
        return <ReportWorkbench version={activeVersion} />
      case 'preview':
        return (
          <PreviewWorkbench
            onCopyTitleSuccess={onCopyTitleSuccess}
            onShowPageToast={onShowPageToast}
            onSetPreviewDevice={onSetPreviewDevice}
            onSetPreviewFontSize={onSetPreviewFontSize}
            onSetPreviewSurfaceMode={onSetPreviewSurfaceMode}
            onUpdateDraftSync={onUpdateDraftSync}
            previewFontSize={previewFontSize}
            session={session}
          />
        )
      case 'versions':
        return (
          <VersionsWorkbench
            activeVersionId={session.draftReview.activeVersionId}
            onSelectVersion={onSelectVersion}
            versions={session.draftReview.versions}
          />
        )
      default:
        return null
    }
  }

  const shellContent = (
    <aside
      className={cn(
        'flex min-h-0 flex-col overflow-hidden bg-white',
        isFullscreen ? 'fixed inset-0 z-50 rounded-none border-none' : 'h-full rounded-tl-[30px] border-l border-t border-border/70',
      )}
    >
      <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
        <div className="benchmark-scroll-hidden flex min-w-0 gap-2 overflow-x-auto pb-1">
            {tabs.map((tabId) => {
              const tab = workbenchTabs.find((item) => item.id === tabId)

              if (!tab) {
                return null
              }

              return (
                <button
                  className={cn(
                    'inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-[13px] transition-colors',
                    activeTabId === tab.id
                      ? 'border-border/75 bg-white text-foreground'
                      : 'border-transparent text-muted-foreground hover:bg-secondary/40 hover:text-foreground',
                  )}
                  key={tab.id}
                  onClick={() => onOpenTab(tab.id)}
                  type="button"
                >
                  <tab.icon size={14} />
                  {tab.label}
                </button>
              )
            })}
        </div>
        <button
          aria-label={isFullscreen ? '退出全屏' : '全屏视图'}
          className="ml-2 inline-flex shrink-0 items-center justify-center rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary/40 hover:text-foreground"
          onClick={() => setIsFullscreen((prev) => !prev)}
          type="button"
        >
          {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        </button>
      </div>

      <div className="benchmark-scroll-hidden min-h-0 flex-1 overflow-y-auto bg-white px-6 py-6">
        {renderBody()}
      </div>
    </aside>
  )

  if (isFullscreen) {
    return createPortal(shellContent, document.body)
  }

  return shellContent
}

function LibraryModuleCanvas({ topicStatusById }) {
  return (
    <div className="benchmark-scroll-hidden min-h-0 flex-1 overflow-y-auto bg-white">
      <div className="mx-auto w-full max-w-[1320px] px-4 py-8 sm:px-5 lg:px-6">
        <div className="mb-6">
          <h1 className="text-[30px] font-semibold tracking-[-0.03em] text-foreground sm:text-[34px]">选题库</h1>
          <p className="mt-2 text-[14px] leading-6 text-muted-foreground">
            当前选题状态会和创作流程联动，已创作或创作中的选题会在这里同步标记。
          </p>
          <div className="mt-4 inline-flex rounded-full bg-secondary px-3 py-1.5 text-[12px] text-muted-foreground">
            当前预置 {topicLibraryItems.length} 个选题
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {topicLibraryItems.map((topic) => (
            <TopicLibraryCard key={topic.id} topic={topic} topicStatus={topicStatusById[topic.id] ?? 'pending'} />
          ))}
        </div>
      </div>
    </div>
  )
}

function ArticleListRow({ article, onOpen }) {
  const statusMeta = getArticleListStatusMeta(article.stageId)

  return (
    <button
      className="flex w-full items-center gap-4 border-b border-border/70 px-2 py-4 text-left transition-colors hover:bg-secondary/20"
      onClick={() => onOpen(article.id)}
      type="button"
    >
      <div className="min-w-0 flex-1 text-[15px] font-medium leading-7 text-foreground">
        <span className="block truncate">{article.title}</span>
      </div>
      <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-[11px]', statusMeta.className)}>{statusMeta.label}</span>
      <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-[11px] text-muted-foreground">{article.theme}</span>
    </button>
  )
}

function ArticlePreviewDrawer({ onClose, onCopyTitleSuccess, onSetPreviewDevice, onSetPreviewFontSize, onSetPreviewSurfaceMode, onShowPageToast, open, session }) {
  const availableTabs = session?.stageId === 'completed' ? ['draft', 'preview'] : ['draft']
  const [activeTab, setActiveTab] = useState(availableTabs[0] ?? 'draft')
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    if (!open) {
      return
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        if (isFullscreen) {
          setIsFullscreen(false)
          return
        }

        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isFullscreen, onClose, open])

  useEffect(() => {
    if (!open || typeof document === 'undefined') {
      return
    }

    const { body, documentElement } = document
    const previousBodyOverflow = body.style.overflow
    const previousHtmlOverflow = documentElement.style.overflow

    body.style.overflow = 'hidden'
    documentElement.style.overflow = 'hidden'

    return () => {
      body.style.overflow = previousBodyOverflow
      documentElement.style.overflow = previousHtmlOverflow
    }
  }, [open])

  useEffect(() => {
    if (!session) {
      return
    }

    setActiveTab(session.stageId === 'completed' ? 'preview' : 'draft')
    setIsFullscreen(false)
  }, [session])

  if (!open || !session || typeof document === 'undefined') {
    return null
  }

  const activeVersion = getActiveVersion(session)
  const selectedTopic = getSelectedTopic(session)
  const displayTitle = resolveVersionDisplayTitle(session, activeVersion)

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end overscroll-none bg-slate-950/18 backdrop-blur-[6px]" onClick={onClose} role="presentation">
      <aside
        className={cn(
          'flex h-full w-full flex-col overflow-hidden overscroll-contain bg-white shadow-[-20px_0_60px_rgba(15,23,42,0.14)]',
          isFullscreen ? 'sm:w-full' : 'sm:w-[80vw]',
        )}
        onClick={(event) => event.stopPropagation()}
        role="presentation"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border/70 px-6 pb-5 pt-6">
          <div className="min-w-0">
            <h2 className="text-[24px] font-semibold leading-[1.25] tracking-[-0.02em] text-foreground">
              文字预览
            </h2>
            <div className="mt-2 truncate text-[15px] leading-7 text-foreground/78">{displayTitle}</div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className={cn('rounded-full px-2.5 py-1 text-[11px]', getArticleListStatusMeta(session.stageId).className)}>
                {getArticleListStatusMeta(session.stageId).label}
              </span>
              <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] text-muted-foreground">
                {selectedTopic?.theme || '未设置母题'}
              </span>
            </div>
          </div>

          <button
            aria-label="关闭文章预览"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border/70 bg-white text-muted-foreground transition-colors hover:border-foreground/15 hover:bg-secondary/35 hover:text-foreground"
            onClick={onClose}
            type="button"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 border-b border-border/70 px-6 py-3">
          <div className="benchmark-scroll-hidden flex min-w-0 gap-2 overflow-x-auto">
            {availableTabs.map((tabId) => {
              const tabMeta =
                tabId === 'preview'
                  ? { icon: LayoutTemplate, label: '排版预览' }
                  : { icon: FileText, label: '文字稿' }

              return (
                <button
                  className={cn(
                    'inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-[13px] transition-colors',
                    activeTab === tabId
                      ? 'border-border/75 bg-white text-foreground'
                      : 'border-transparent text-muted-foreground hover:bg-secondary/40 hover:text-foreground',
                  )}
                  key={tabId}
                  onClick={() => setActiveTab(tabId)}
                  type="button"
                >
                  <tabMeta.icon size={14} />
                  {tabMeta.label}
                </button>
              )
            })}
          </div>

          <button
            aria-label={isFullscreen ? '退出全屏' : '全屏视图'}
            className="inline-flex shrink-0 items-center justify-center rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary/40 hover:text-foreground"
            onClick={() => setIsFullscreen((current) => !current)}
            type="button"
          >
            {isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden bg-white">
          {activeTab === 'preview' ? (
            <div className="benchmark-scroll-hidden h-full overflow-y-auto overscroll-contain">
              <PreviewWorkbench
                onCopyTitleSuccess={onCopyTitleSuccess}
                onShowPageToast={onShowPageToast}
                onSetPreviewDevice={onSetPreviewDevice}
                onSetPreviewFontSize={onSetPreviewFontSize}
                onSetPreviewSurfaceMode={onSetPreviewSurfaceMode}
                previewFontSize={normalizePreviewFontSize(session?.layoutReview?.fontSize)}
                session={session}
              />
            </div>
          ) : (
            <div className="benchmark-scroll-hidden h-full overflow-y-auto overscroll-contain">
              <DraftWorkbench session={session} version={activeVersion} />
            </div>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  )
}

function ArticlesModuleCanvas({ articles, onOpenArticle }) {
  return (
    <div className="benchmark-scroll-hidden min-h-0 flex-1 overflow-y-auto bg-white">
      <div className="mx-auto w-full max-w-[1320px] px-4 py-8 sm:px-5 lg:px-6">
        <div className="mb-8">
          <h1 className="text-[30px] font-semibold tracking-[-0.03em] text-foreground sm:text-[34px]">文章列表</h1>
          <div className="mt-4 inline-flex rounded-full bg-secondary px-3 py-1.5 text-[12px] text-muted-foreground">
            创作中 {articles.length} 篇
          </div>
        </div>

        <section>
          <div className="mb-3 text-[12px] font-medium tracking-[0.08em] text-muted-foreground">创作中</div>

          {articles.length === 0 ? (
            <div className="border-t border-border/70 py-16 text-center text-[14px] text-muted-foreground">
              暂无已确认文字稿的文章
            </div>
          ) : (
            <div className="border-t border-border/70">
              {articles.map((article) => (
                <ArticleListRow article={article} key={article.id} onOpen={onOpenArticle} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function LibraryAssetThumbnail({ asset, onPreview }) {
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    setHasError(false)
  }, [asset.path])

  if (hasError || !asset.path) {
    return (
      <div className="flex aspect-[16/10] w-full items-center justify-center bg-secondary/45 text-center text-[13px] leading-6 text-muted-foreground">
        图片已移除
      </div>
    )
  }

  return (
    <button className="block w-full cursor-zoom-in overflow-hidden" onClick={() => onPreview?.(asset.id)} type="button">
      <img
        alt={asset.scene}
        className="aspect-[16/10] w-full object-cover transition-transform duration-200 hover:scale-[1.02]"
        onError={() => setHasError(true)}
        src={asset.path}
      />
    </button>
  )
}

function LibraryAssetCard({ asset, deletingId, onDelete, onPreview, onSave, savingId }) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState({
    emotion: asset.emotion,
    figures: asset.figures,
    scene: asset.scene,
    topic: asset.topic,
  })

  useEffect(() => {
    setDraft({
      emotion: asset.emotion,
      figures: asset.figures,
      scene: asset.scene,
      topic: asset.topic,
    })
    setIsEditing(false)
  }, [asset])

  async function handleSave() {
    await onSave(asset.id, draft)
    setIsEditing(false)
  }

  function handleCancel() {
    setDraft({
      emotion: asset.emotion,
      figures: asset.figures,
      scene: asset.scene,
      topic: asset.topic,
    })
    setIsEditing(false)
  }

  return (
    <article className="overflow-hidden rounded-[26px] border border-border/70 bg-white shadow-[0_16px_36px_rgba(15,23,42,0.05)]">
      <LibraryAssetThumbnail asset={asset} onPreview={onPreview} />

      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-[15px] font-medium text-foreground">{asset.scene}</div>
            <div className="mt-1 truncate text-[12px] text-muted-foreground">{asset.filename}</div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {isEditing ? null : (
              <Button className="rounded-full" onClick={() => setIsEditing(true)} size="sm" type="button" variant="outline">
                编辑标签
              </Button>
            )}
            <Button
              className="rounded-full"
              disabled={deletingId === asset.id || savingId === asset.id}
              onClick={() => onDelete(asset)}
              size="icon-sm"
              type="button"
              variant="outline"
            >
              {deletingId === asset.id ? <LoaderCircle className="animate-spin" size={14} /> : <Trash2 size={14} />}
            </Button>
          </div>
        </div>

        {!isEditing ? (
          <>
            <div className="mt-4 flex flex-wrap gap-2">
              {[asset.emotion, asset.topic, asset.figures].map((label) => (
                <span
                  className="rounded-full border border-border/70 bg-secondary/55 px-2.5 py-1 text-[11px] text-muted-foreground"
                  key={label}
                >
                  {label}
                </span>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
              <span className="rounded-full border border-border/70 px-2.5 py-1">使用 {asset.usedCount} 次</span>
              <span className="rounded-full border border-border/70 px-2.5 py-1">入库于 {formatLibraryAssetDate(asset.createdAt)}</span>
            </div>
          </>
        ) : (
          <div className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1.5">
                <div className="text-[12px] font-medium text-muted-foreground">情绪标签</div>
                <select
                  className="h-10 w-full rounded-2xl border border-border/70 bg-white px-3 text-[14px] outline-none"
                  onChange={(event) => setDraft((current) => ({ ...current, emotion: event.target.value }))}
                  value={draft.emotion}
                >
                  {LIBRARY_ASSET_EMOTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1.5">
                <div className="text-[12px] font-medium text-muted-foreground">母题标签</div>
                <select
                  className="h-10 w-full rounded-2xl border border-border/70 bg-white px-3 text-[14px] outline-none"
                  onChange={(event) => setDraft((current) => ({ ...current, topic: event.target.value }))}
                  value={draft.topic}
                >
                  {LIBRARY_ASSET_TOPICS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1.5">
                <div className="text-[12px] font-medium text-muted-foreground">人物构成</div>
                <select
                  className="h-10 w-full rounded-2xl border border-border/70 bg-white px-3 text-[14px] outline-none"
                  onChange={(event) => setDraft((current) => ({ ...current, figures: event.target.value }))}
                  value={draft.figures}
                >
                  {LIBRARY_ASSET_FIGURES.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1.5">
                <div className="text-[12px] font-medium text-muted-foreground">场景描述</div>
                <input
                  className="h-10 w-full rounded-2xl border border-border/70 bg-white px-3 text-[14px] outline-none"
                  maxLength={LIBRARY_ASSET_SCENE_MAX_LENGTH}
                  onChange={(event) => setDraft((current) => ({ ...current, scene: event.target.value }))}
                  value={draft.scene}
                />
              </label>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="text-[12px] text-muted-foreground">场景描述建议控制在 {LIBRARY_ASSET_SCENE_MAX_LENGTH} 字以内</div>
              <div className="flex items-center gap-2">
                <Button className="rounded-full" onClick={handleCancel} size="sm" type="button" variant="outline">
                  取消
                </Button>
                <Button
                  className="rounded-full"
                  disabled={savingId === asset.id || deletingId === asset.id || !draft.scene.trim()}
                  onClick={handleSave}
                  size="sm"
                  type="button"
                >
                  {savingId === asset.id ? <LoaderCircle className="animate-spin" size={14} /> : <Check size={14} />}
                  保存
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </article>
  )
}

function LibraryAssetLightbox({ activeAssetId, assets, onClose, onSelectAssetId }) {
  const activeIndex = Array.isArray(assets) ? assets.findIndex((asset) => asset.id === activeAssetId) : -1
  const activeAsset = activeIndex >= 0 ? assets[activeIndex] : null

  useEffect(() => {
    if (activeAssetId && !activeAsset) {
      onClose()
    }
  }, [activeAsset, activeAssetId, onClose])

  useEffect(() => {
    if (!activeAsset) {
      return
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onClose()
        return
      }

      if (assets.length < 2) {
        return
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault()
        const previousIndex = (activeIndex - 1 + assets.length) % assets.length
        onSelectAssetId(assets[previousIndex].id)
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        const nextIndex = (activeIndex + 1) % assets.length
        onSelectAssetId(assets[nextIndex].id)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [activeAsset, activeIndex, assets, onClose, onSelectAssetId])

  if (!activeAsset || typeof document === 'undefined') {
    return null
  }

  const canNavigate = assets.length > 1
  const previousIndex = canNavigate ? (activeIndex - 1 + assets.length) % assets.length : activeIndex
  const nextIndex = canNavigate ? (activeIndex + 1) % assets.length : activeIndex

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-black/88" onClick={onClose} role="presentation">
      <button
        aria-label="关闭大图预览"
        className="absolute right-5 top-5 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/12 bg-white/8 text-white transition-colors hover:bg-white/14"
        onClick={onClose}
        type="button"
      >
        <X size={18} />
      </button>

      <div className="absolute right-5 top-1/2 flex -translate-y-1/2 flex-col gap-3">
        <button
          aria-label="上一张"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/12 bg-white/8 text-white transition-colors hover:bg-white/14 disabled:cursor-not-allowed disabled:opacity-45"
          disabled={!canNavigate}
          onClick={(event) => {
            event.stopPropagation()
            onSelectAssetId(assets[previousIndex].id)
          }}
          type="button"
        >
          <ArrowUp size={18} />
        </button>
        <button
          aria-label="下一张"
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/12 bg-white/8 text-white transition-colors hover:bg-white/14 disabled:cursor-not-allowed disabled:opacity-45"
          disabled={!canNavigate}
          onClick={(event) => {
            event.stopPropagation()
            onSelectAssetId(assets[nextIndex].id)
          }}
          type="button"
        >
          <ArrowDown size={18} />
        </button>
      </div>

      <div className="flex h-full w-full items-center justify-center px-8 py-8 sm:px-12 sm:py-10" onClick={(event) => event.stopPropagation()}>
        {activeAsset.path ? (
          <img
            alt={activeAsset.scene}
            className="max-h-full max-w-[calc(100vw-140px)] rounded-[18px] object-contain"
            src={activeAsset.path}
          />
        ) : (
          <div className="flex min-h-[320px] w-full max-w-[960px] items-center justify-center rounded-[18px] border border-white/10 bg-white/6 px-6 text-center text-[15px] text-white/68">
            图片已移除
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

function FixedLayoutImageLightbox({ asset, onClose }) {
  useEffect(() => {
    if (!asset) {
      return
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [asset, onClose])

  if (!asset || typeof document === 'undefined') {
    return null
  }

  const assetSrc = resolveRenderableAssetPath(asset, typeof window === 'undefined' ? '' : window.location.origin)

  return createPortal(
    <div className="fixed inset-0 z-[80] bg-black/88" onClick={onClose} role="presentation">
      <button
        aria-label="关闭大图预览"
        className="absolute right-5 top-5 inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/12 bg-white/8 text-white transition-colors hover:bg-white/14"
        onClick={onClose}
        type="button"
      >
        <X size={18} />
      </button>

      <div className="flex h-full w-full items-center justify-center px-8 py-8 sm:px-12 sm:py-10" onClick={(event) => event.stopPropagation()}>
        {assetSrc ? (
          <img
            alt={asset.label}
            className="max-h-full max-w-[calc(100vw-140px)] object-contain"
            src={assetSrc}
          />
        ) : (
          <div className="flex min-h-[320px] w-full max-w-[960px] items-center justify-center rounded-[18px] border border-white/10 bg-white/6 px-6 text-center text-[15px] text-white/68">
            图片已移除
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

function FixedLayoutTemplatePreview({ config }) {
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  const previewRenderResult = useMemo(
    () =>
      renderArticlePreviewDocument({
        bodyMarkdown: stripPreviewHeading(TEMPLATE_PREVIEW_SAMPLE_MARKDOWN),
        fixedLayoutConfig: config,
        fontSize: 'medium',
        imageSlots: createTemplatePreviewPlaceholderSlots(),
        origin,
        penName: TEMPLATE_PREVIEW_SAMPLE_PEN_NAME,
      }),
    [config, origin],
  )

  return (
    <div className="mx-auto w-[375px] max-w-full overflow-hidden border border-[#e8eaef] bg-white shadow-[0_8px_18px_rgba(15,23,42,0.05)]">
      <div className="border-b border-[#eef1f5] px-4 py-4">
        <div className="text-[18px] font-semibold leading-8 text-foreground">{TEMPLATE_PREVIEW_SAMPLE_TITLE}</div>
      </div>
      <div className="w-full bg-white">
        <ArticlePreviewFrame documentHtml={previewRenderResult.documentHtml} title="模板预览" />
      </div>
    </div>
  )
}

function FixedLayoutImageSlotCard({
  onDelete,
  onPreview,
  onSelect,
  onSetSpacing,
  onUpload,
  isSavingTemplate,
  selected,
  slotConfig,
  uploadingSlot,
}) {
  const fileInputRef = useRef(null)
  const slot = slotConfig.slot
  const asset = resolveFixedLayoutSlotAsset(slotConfig)
  const uploadedAtLabel = asset?.uploadedAt ? formatLibraryAssetDate(asset.uploadedAt) : ''
  const isUploading = uploadingSlot === slot
  const hasAsset = Boolean(asset?.path)

  async function handleFileChange(event) {
    const nextFile = event.target.files?.[0]

    if (nextFile) {
      await onUpload(slot, nextFile)
    }

    event.target.value = ''
  }

  return (
    <article
      className={cn(
        'rounded-[22px] border border-border/70 bg-white p-4 transition-all',
        selected ? 'bg-secondary/10 shadow-[0_16px_28px_rgba(15,23,42,0.08)]' : '',
      )}
    >
      <button className="block w-full text-left" onClick={() => onSelect(slot)} type="button">
        <div className="flex min-w-0 items-center gap-3">
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: slotConfig.accent }} />
          <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
            <div className="truncate text-[15px] font-medium text-foreground">{slotConfig.label}</div>
            <div className="shrink-0 text-right text-[12px] text-muted-foreground">{slotConfig.description}</div>
          </div>
        </div>
      </button>

      <div className="mt-4 flex items-start gap-4">
        <button
          className="group relative inline-flex h-[92px] w-[132px] shrink-0 items-center justify-center overflow-hidden rounded-[12px] border border-border/70 bg-secondary/20"
          disabled={!hasAsset}
          onClick={() =>
            hasAsset &&
            onPreview({
              ...asset,
              label: slotConfig.label,
            })
          }
          type="button"
        >
          {hasAsset ? (
            <img
              alt={slotConfig.label}
              className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
              src={resolveRenderableAssetPath(asset, typeof window === 'undefined' ? '' : window.location.origin)}
            />
          ) : (
            <div className="h-full w-full" style={{ backgroundColor: slotConfig.accent }} />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="text-[12px] text-muted-foreground">{asset?.filename || '支持 gif、png、jpg、jpeg'}</div>
          {uploadedAtLabel ? <div className="mt-1 text-[12px] text-muted-foreground">更新于 {uploadedAtLabel}</div> : null}

          <div className="mt-4 flex items-center justify-between gap-3">
            <div className="shrink-0 text-[12px] font-medium text-muted-foreground">间距</div>
            <div className="flex flex-nowrap gap-2">
              {FIXED_LAYOUT_SPACING_PRESETS.map((preset) => (
                <button
                  className={cn(
                    'shrink-0 rounded-[12px] border border-border/70 px-3 py-1.5 text-[12px] transition-colors',
                    slotConfig.spacingPreset === preset.id
                      ? 'bg-secondary text-foreground'
                      : 'bg-white text-muted-foreground hover:text-foreground',
                  )}
                  key={preset.id}
                  onClick={() => onSetSpacing(slot, preset.id)}
                  type="button"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {slot === 'qrImage' ? <div className="mt-4 text-[12px] leading-6 text-muted-foreground">二维码宽度已固定为 200px。</div> : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input accept={FIXED_LAYOUT_FILE_ACCEPT} className="hidden" onChange={handleFileChange} ref={fileInputRef} type="file" />
        <Button
          className="rounded-[12px]"
          disabled={isSavingTemplate || isUploading}
          onClick={() => fileInputRef.current?.click()}
          size="sm"
          type="button"
          variant="outline"
        >
          {isUploading ? <LoaderCircle className="animate-spin" size={14} /> : <Paperclip size={14} />}
          {hasAsset ? '替换' : '上传'}
        </Button>
        {hasAsset ? (
          <Button
            className="rounded-[12px]"
            disabled={isSavingTemplate || isUploading}
            onClick={() => onDelete(slot, slotConfig.label)}
            size="sm"
            type="button"
            variant="outline"
          >
            <Trash2 size={14} />
            删除
          </Button>
        ) : null}
      </div>
    </article>
  )
}

function FixedLayoutConfigCanvas() {
  const { config, errorMessage, isLoading, setConfig, setErrorMessage } = useFixedLayoutConfigState()
  const [draftConfig, setDraftConfig] = useState(() => createEmptyFixedLayoutConfig())
  const [hasHydratedDraft, setHasHydratedDraft] = useState(false)
  const [isSavingTemplate, setIsSavingTemplate] = useState(false)
  const [savedConfigSnapshot, setSavedConfigSnapshot] = useState(() => createEmptyFixedLayoutConfig())
  const [selectedSlot, setSelectedSlot] = useState(FIXED_LAYOUT_IMAGE_SLOT_IDS[0])
  const [uploadingSlot, setUploadingSlot] = useState('')
  const [previewAsset, setPreviewAsset] = useState(null)
  const draftPreviewUrlMapRef = useRef(new Map())
  const imageSlots = useMemo(() => getFixedLayoutImageDisplaySlots(draftConfig), [draftConfig])
  const isDirty = useMemo(() => !areFixedLayoutConfigsEqual(draftConfig, savedConfigSnapshot), [draftConfig, savedConfigSnapshot])
  const isServerMutationPending = Boolean(uploadingSlot)

  useEffect(() => {
    if (isLoading || hasHydratedDraft) {
      return
    }

    const nextConfig = cloneFixedLayoutConfig(config)
    setSavedConfigSnapshot(nextConfig)
    setDraftConfig(nextConfig)
    setHasHydratedDraft(true)
  }, [config, hasHydratedDraft, isLoading])

  useEffect(() => {
    if (!imageSlots.some((slot) => slot.slot === selectedSlot)) {
      setSelectedSlot(imageSlots[0]?.slot || FIXED_LAYOUT_IMAGE_SLOT_IDS[0])
    }
  }, [imageSlots, selectedSlot])

  function revokeDraftPreviewUrl(slot) {
    const previewUrl = draftPreviewUrlMapRef.current.get(slot)

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
      draftPreviewUrlMapRef.current.delete(slot)
    }
  }

  function revokeAllDraftPreviewUrls() {
    draftPreviewUrlMapRef.current.forEach((previewUrl) => {
      URL.revokeObjectURL(previewUrl)
    })
    draftPreviewUrlMapRef.current.clear()
  }

  useEffect(() => () => revokeAllDraftPreviewUrls(), [])

  async function handleSaveTemplate() {
    const imageSlotsPayload = Object.fromEntries(
      FIXED_LAYOUT_IMAGE_SLOT_IDS.map((slot) => [
        slot,
        {
          asset: resolveFixedLayoutSlotAsset(draftConfig?.[slot]),
          displayOrder: draftConfig?.[slot]?.displayOrder,
          spacingPreset: draftConfig?.[slot]?.spacingPreset,
          widthPx: draftConfig?.[slot]?.widthPx,
        },
      ]),
    )

    setIsSavingTemplate(true)
    setErrorMessage('')

    try {
      const nextConfig = await requestFixedLayoutConfigUpdate({
        endingText: draftConfig?.endingText?.content ?? '',
        imageSlots: imageSlotsPayload,
      })
      revokeAllDraftPreviewUrls()
      setConfig(nextConfig)
      setSavedConfigSnapshot(cloneFixedLayoutConfig(nextConfig))
      setDraftConfig(cloneFixedLayoutConfig(nextConfig))
    } catch (error) {
      setErrorMessage(error.message || '保存模板配置失败')
    } finally {
      setIsSavingTemplate(false)
    }
  }

  function handleRestoreSaved() {
    revokeAllDraftPreviewUrls()
    setDraftConfig(cloneFixedLayoutConfig(savedConfigSnapshot))
    setErrorMessage('')
  }

  async function handleUpload(slot, file) {
    setUploadingSlot(slot)
    setErrorMessage('')

    try {
      const nextAsset = await requestFixedLayoutAssetUpload({
        file,
        slot,
      })
      const previewUrl =
        typeof window !== 'undefined' && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : ''

      revokeDraftPreviewUrl(slot)
      if (previewUrl) {
        draftPreviewUrlMapRef.current.set(slot, previewUrl)
      }
      setSelectedSlot(slot)

      setDraftConfig((current) => ({
        ...current,
        [slot]: {
          ...current?.[slot],
          asset: nextAsset
            ? {
                ...nextAsset,
                ...(previewUrl ? { previewUrl } : null),
              }
            : null,
        },
      }))
    } catch (error) {
      setErrorMessage(error.message || '上传模板图片失败')
    } finally {
      setUploadingSlot('')
    }
  }

  function handleDelete(slot, label) {
    const confirmed = window.confirm(`确认清空“${label}”吗？当前只会清空模板草稿，点击“保存模板”后才会正式生效。`)

    if (!confirmed) {
      return
    }

    setErrorMessage('')
    revokeDraftPreviewUrl(slot)
    setDraftConfig((current) => ({
      ...current,
      [slot]: {
        ...current?.[slot],
        asset: null,
      },
    }))
  }

  function handleSetSpacing(slot, spacingPreset) {
    setDraftConfig((current) => ({
      ...current,
      [slot]: {
        ...current?.[slot],
        spacingPreset,
      },
    }))
  }

  return (
    <div className="benchmark-scroll-hidden min-h-0 flex-1 overflow-y-auto bg-white">
      <div className="mx-auto w-full max-w-[1320px] px-4 py-8 sm:px-5 lg:px-6">
        <div className="mb-6">
          <h1 className="text-[28px] font-semibold tracking-[-0.03em] text-foreground sm:text-[32px]">模板配置</h1>
        </div>

        {errorMessage ? (
          <div className="mb-5 rounded-[16px] border border-red-200 bg-red-50 px-4 py-3 text-[13px] leading-6 text-red-700">
            {errorMessage}
          </div>
        ) : null}

        {isLoading ? (
          <div className="py-16 text-center text-[14px] text-muted-foreground">
            <div className="inline-flex items-center gap-2">
              <LoaderCircle className="animate-spin" size={16} />
              正在读取模板配置
            </div>
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,520px)_minmax(0,1fr)]">
            <section className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[15px] font-medium text-foreground">移动端模板预览 · 375 宽度</div>
              </div>

              <FixedLayoutTemplatePreview config={draftConfig} />
            </section>

            <section className="space-y-5">
              <div className="rounded-[22px] border border-border/70 bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-[15px] font-medium text-foreground">图片顺序与图片设置</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        'rounded-full px-3 py-1.5 text-[12px]',
                        isDirty ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700',
                      )}
                    >
                      {isDirty ? '有未保存更改' : '当前已保存'}
                    </span>
                    <Button
                      className="rounded-full"
                      disabled={!isDirty || isSavingTemplate || isServerMutationPending}
                      onClick={handleRestoreSaved}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      恢复已保存
                    </Button>
                    <Button
                      className="rounded-full"
                      disabled={!isDirty || isSavingTemplate || isServerMutationPending}
                      onClick={handleSaveTemplate}
                      size="sm"
                      type="button"
                    >
                      {isSavingTemplate ? <LoaderCircle className="animate-spin" size={14} /> : <Check size={14} />}
                      保存模板
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                {imageSlots.map((slotConfig) => (
                  <FixedLayoutImageSlotCard
                    isSavingTemplate={isSavingTemplate}
                    key={slotConfig.slot}
                    onDelete={handleDelete}
                    onPreview={setPreviewAsset}
                    onSelect={setSelectedSlot}
                    onSetSpacing={handleSetSpacing}
                    onUpload={handleUpload}
                    selected={selectedSlot === slotConfig.slot}
                    slotConfig={slotConfig}
                    uploadingSlot={uploadingSlot}
                  />
                ))}
              </div>

              <div className="rounded-[22px] border border-dashed border-border/70 bg-secondary/10 p-4 text-[12px] leading-6 text-muted-foreground">
                非二维码图片固定按 100% 宽显示。上传格式支持 jpg、png、gif；webp 不再作为模板图片格式。
              </div>
            </section>
          </div>
        )}
      </div>

      <FixedLayoutImageLightbox asset={previewAsset} onClose={() => setPreviewAsset(null)} />
    </div>
  )
}

function AssetsModuleCanvas() {
  const [emotionFilter, setEmotionFilter] = useState('')
  const [topicFilter, setTopicFilter] = useState('')
  const [figuresFilter, setFiguresFilter] = useState('')
  const [sort, setSort] = useState(DEFAULT_LIBRARY_ASSET_SORT)
  const [items, setItems] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [previewAssetId, setPreviewAssetId] = useState('')
  const [savingId, setSavingId] = useState('')
  const [deletingId, setDeletingId] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadAssets() {
      setIsLoading(true)
      setErrorMessage('')

      try {
        const nextItems = await requestLibraryAssets({
          emotion: emotionFilter,
          figures: figuresFilter,
          sort,
          topic: topicFilter,
        })

        if (!cancelled) {
          setItems(nextItems)
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error.message || '读取素材库失败')
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    loadAssets()

    return () => {
      cancelled = true
    }
  }, [emotionFilter, figuresFilter, sort, topicFilter])

  useEffect(() => {
    if (previewAssetId && !items.some((asset) => asset.id === previewAssetId)) {
      setPreviewAssetId('')
    }
  }, [items, previewAssetId])

  async function handleSave(assetId, draft) {
    setSavingId(assetId)
    setErrorMessage('')

    try {
      await requestLibraryAssetUpdate(assetId, draft)
      const nextItems = await requestLibraryAssets({
        emotion: emotionFilter,
        figures: figuresFilter,
        sort,
        topic: topicFilter,
      })
      setItems(nextItems)
    } catch (error) {
      setErrorMessage(error.message || '更新素材失败')
      throw error
    } finally {
      setSavingId('')
    }
  }

  async function handleDelete(asset) {
    const confirmed = window.confirm(`确认删除素材记录“${asset.scene}”吗？这不会删除本地图片文件。`)

    if (!confirmed) {
      return
    }

    setDeletingId(asset.id)
    setErrorMessage('')

    try {
      await requestLibraryAssetDelete(asset.id)
      const nextItems = await requestLibraryAssets({
        emotion: emotionFilter,
        figures: figuresFilter,
        sort,
        topic: topicFilter,
      })
      setItems(nextItems)
    } catch (error) {
      setErrorMessage(error.message || '删除素材失败')
    } finally {
      setDeletingId('')
    }
  }

  function clearFilters() {
    setEmotionFilter('')
    setTopicFilter('')
    setFiguresFilter('')
    setSort(DEFAULT_LIBRARY_ASSET_SORT)
  }

  const hasActiveFilters = Boolean(emotionFilter || topicFilter || figuresFilter || sort !== DEFAULT_LIBRARY_ASSET_SORT)

  return (
    <div className="benchmark-scroll-hidden min-h-0 flex-1 overflow-y-auto bg-white">
      <div className="mx-auto flex h-full w-full max-w-[1320px] flex-col px-4 py-8 sm:px-5 lg:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[30px] font-semibold tracking-[-0.03em] text-foreground sm:text-[34px]">素材库</h1>
            <p className="mt-2 text-[14px] leading-6 text-muted-foreground">
              当前素材会统一从本地目录导入到仓库，并在这里做筛选、查看和标签编辑。
            </p>
          </div>

          <div className="rounded-full border border-border/70 bg-secondary/45 px-4 py-2 text-[13px] text-muted-foreground">
            当前共 {items.length} 张素材
          </div>
        </div>

        <div className="mt-6 rounded-[26px] border border-border/70 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.04)] sm:p-5">
          <div className="flex items-center gap-2 text-[13px] font-medium text-foreground">
            <ListFilter size={16} />
            筛选与排序
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <select
              className="h-11 rounded-2xl border border-border/70 bg-white px-3 text-[14px] outline-none"
              onChange={(event) => setEmotionFilter(event.target.value)}
              value={emotionFilter}
            >
              <option value="">全部情绪</option>
              {LIBRARY_ASSET_EMOTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            <select
              className="h-11 rounded-2xl border border-border/70 bg-white px-3 text-[14px] outline-none"
              onChange={(event) => setTopicFilter(event.target.value)}
              value={topicFilter}
            >
              <option value="">全部母题</option>
              {LIBRARY_ASSET_TOPICS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            <select
              className="h-11 rounded-2xl border border-border/70 bg-white px-3 text-[14px] outline-none"
              onChange={(event) => setFiguresFilter(event.target.value)}
              value={figuresFilter}
            >
              <option value="">全部人物构成</option>
              {LIBRARY_ASSET_FIGURES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>

            <select
              className="h-11 rounded-2xl border border-border/70 bg-white px-3 text-[14px] outline-none"
              onChange={(event) => setSort(event.target.value)}
              value={sort}
            >
              {LIBRARY_ASSET_SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <Button className="h-11 rounded-2xl" onClick={clearFilters} type="button" variant="outline">
              清空筛选
            </Button>
          </div>
        </div>

        {errorMessage ? (
          <div className="mt-4 rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-[13px] leading-6 text-red-700">
            {errorMessage}
          </div>
        ) : null}

        <div className="mt-6 flex-1">
          {isLoading ? (
            <div className="flex min-h-[360px] items-center justify-center rounded-[28px] border border-border/70 bg-white">
              <div className="flex items-center gap-2 text-[14px] text-muted-foreground">
                <LoaderCircle className="animate-spin" size={16} />
                正在读取素材库
              </div>
            </div>
          ) : items.length === 0 ? (
            <div className="flex min-h-[360px] items-center justify-center rounded-[28px] border border-dashed border-border/80 bg-secondary/20">
              <div className="max-w-[420px] text-center">
                <div className="text-[16px] font-medium text-foreground">{hasActiveFilters ? '当前筛选下暂无素材' : '暂无素材'}</div>
                <p className="mt-2 text-[14px] leading-6 text-muted-foreground">
                  {hasActiveFilters ? '可以调整筛选条件后再看，或继续补充新的素材。' : '导入完成后，这里会显示图片、标签和场景描述。'}
                </p>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {items.map((asset) => (
                <LibraryAssetCard
                  asset={asset}
                  deletingId={deletingId}
                  key={asset.id}
                  onDelete={handleDelete}
                  onPreview={setPreviewAssetId}
                  onSave={handleSave}
                  savingId={savingId}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <LibraryAssetLightbox
        activeAssetId={previewAssetId}
        assets={items}
        onClose={() => setPreviewAssetId('')}
        onSelectAssetId={setPreviewAssetId}
      />
    </div>
  )
}

export default function BenchmarkWorkbenchPage() {
  const activeSessionId = useBenchmarkStore((state) => state.activeSessionId)
  const createSession = useBenchmarkStore((state) => state.createSession)
  const deleteSession = useBenchmarkStore((state) => state.deleteSession)
  const hydrateFromPersistedSnapshot = useBenchmarkStore((state) => state.hydrateFromPersistedSnapshot)
  const isSidebarCollapsed = useBenchmarkStore((state) => state.isSidebarCollapsed)
  const resetAllSessions = useBenchmarkStore((state) => state.resetAllSessions)
  const setSidebarCollapsed = useBenchmarkStore((state) => state.setSidebarCollapsed)
  const sessions = useBenchmarkStore((state) => state.sessions)
  const setActiveSessionId = useBenchmarkStore((state) => state.setActiveSessionId)
  const updateSession = useBenchmarkStore((state) => state.updateSession)

  const [searchQuery, setSearchQuery] = useState('')
  const [activeModule, setActiveModule] = useState('content')
  const [articlePreviewSessionId, setArticlePreviewSessionId] = useState(null)
  const [sessionPendingDelete, setSessionPendingDelete] = useState(null)
  const [copiedMessageId, setCopiedMessageId] = useState(null)
  const [isResizingSplit, setIsResizingSplit] = useState(false)
  const [pageToast, setPageToast] = useState(null)
  const [rightPaneWidth, setRightPaneWidth] = useState(620)

  const composerRef = useRef(null)
  const hasInitializedContentSessionMirrorRef = useRef(false)
  const splitContainerRef = useRef(null)

  const orderedSessions = useMemo(
    () =>
      [...sessions]
        .filter((session) => {
          if (!searchQuery.trim()) {
            return true
          }

          return session.title.toLowerCase().includes(searchQuery.trim().toLowerCase())
        })
        .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()),
    [searchQuery, sessions],
  )
  const historySessions = useMemo(() => orderedSessions.filter(hasSessionHistory), [orderedSessions])
  const topicStatusById = useMemo(() => getTopicStatusMap(sessions), [sessions])
  const articleEntries = useMemo(() => createArticleListEntries(sessions), [sessions])

  const activeSession =
    sessions.find((session) => session.id === activeSessionId) ?? orderedSessions[0] ?? sessions[0] ?? null
  const activeArticleSession =
    articlePreviewSessionId != null ? sessions.find((session) => session.id === articlePreviewSessionId) ?? null : null
  const currentSessionId = activeSession?.id ?? null
  const currentStageId = activeSession?.stageId ?? 'topic'

  useEffect(() => {
    let cancelled = false
    let debounceId = null
    let unsubscribe = () => {}

    async function initializeContentSessionMirror() {
      const currentState = useBenchmarkStore.getState()
      const currentPersistedState = createPersistableBenchmarkState(currentState)
      const currentHasHistory = currentPersistedState.sessions.some(hasSessionHistory)
      const currentLatestTimestamp = getSessionHistoryLatestTimestamp(currentPersistedState.sessions)

      try {
        const persistedItem = await requestPersistedContentSessions()

        if (!cancelled && persistedItem?.state) {
          const persistedState = persistedItem.state
          const persistedHasHistory = Array.isArray(persistedState.sessions) && persistedState.sessions.some(hasSessionHistory)
          const persistedLatestTimestamp = getSessionHistoryLatestTimestamp(persistedState.sessions)

          if (persistedHasHistory && (!currentHasHistory || persistedLatestTimestamp > currentLatestTimestamp)) {
            hydrateFromPersistedSnapshot(persistedState)
          }
        }
      } catch {
        // 本地历史镜像不可用时，继续使用当前浏览器内的持久化数据
      }

      if (cancelled) {
        return
      }

      hasInitializedContentSessionMirrorRef.current = true

      const persistSnapshot = (state) => {
        if (!hasInitializedContentSessionMirrorRef.current) {
          return
        }

        const nextItem = buildPersistedContentSessionItem(state)

        window.clearTimeout(debounceId)
        debounceId = window.setTimeout(() => {
          requestPersistedContentSessionsUpdate(nextItem).catch(() => {})
        }, 280)
      }

      unsubscribe = useBenchmarkStore.subscribe((state) => {
        persistSnapshot(state)
      })

      persistSnapshot(useBenchmarkStore.getState())
    }

    initializeContentSessionMirror()

    return () => {
      cancelled = true
      hasInitializedContentSessionMirrorRef.current = false
      window.clearTimeout(debounceId)
      unsubscribe()
    }
  }, [hydrateFromPersistedSnapshot])
  const selectedTopic = activeSession ? getSelectedTopic(activeSession) : null
  const activeVersion = activeSession ? getActiveVersion(activeSession) : null
  const activeFilterTypes = activeSession?.topicSelection?.filterTypes ?? []
  const visibleTopicRecommendations = useMemo(() => {
    if (!activeSession) {
      return []
    }

    if (activeSession.topicSelection.source !== 'preset') {
      return activeSession.topicSelection.recommendations ?? []
    }

    return createTopicRecommendations({
      filterTypes: activeFilterTypes,
      pageIndex: activeSession.topicSelection.pageIndex ?? 0,
      excludeSessionId: activeSession.id,
      sessions,
    })
  }, [activeFilterTypes, activeSession, sessions])
  const topicPageCount = useMemo(() => {
    if (!activeSession) {
      return 1
    }

    if (activeSession.topicSelection.source !== 'preset') {
      return Math.max(1, Math.ceil((activeSession.topicSelection.recommendations?.length ?? 0) / 6))
    }

    return getTopicRecommendationPageCount(activeFilterTypes, {
      excludeSessionId: activeSession.id,
      sessions,
    })
  }, [activeFilterTypes, activeSession, sessions])
  const availableTabs = activeSession ? getAvailableTabs(activeSession) : []
  const isBusy = Boolean(activeSession?.processingFlow)
  const isContentModule = activeModule === 'content'
  const composerDisabled = currentStageId !== 'draft' || isBusy
  const canSend = !composerDisabled && Boolean(activeSession?.draft.trim())
  const hasWorkbenchOutputs = availableTabs.length > 0
  const shouldRenderHero = isContentModule && currentStageId === 'topic' && !activeSession?.topicSelection?.selectedTopicId
  const showWorkbench = isContentModule && activeSession?.isWorkbenchOpen && hasWorkbenchOutputs

  useEffect(() => {
    if (!currentSessionId && orderedSessions[0]) {
      setActiveSessionId(orderedSessions[0].id)
    }
  }, [currentSessionId, orderedSessions, setActiveSessionId])

  useEffect(() => {
    if (activeModule !== 'articles') {
      setArticlePreviewSessionId(null)
    }
  }, [activeModule])

  useEffect(() => {
    if (!articlePreviewSessionId) {
      return
    }

    if (!activeArticleSession || (activeArticleSession.stageId !== 'preview' && activeArticleSession.stageId !== 'completed')) {
      setArticlePreviewSessionId(null)
    }
  }, [activeArticleSession, articlePreviewSessionId])

  useEffect(() => {
    if (!activeSession || availableTabs.length === 0) {
      return
    }

    if (!availableTabs.includes(activeSession.activeWorkbenchTab)) {
      updateSession(activeSession.id, {
        activeWorkbenchTab: availableTabs[0],
      })
    }
  }, [activeSession, availableTabs, updateSession])

  useEffect(() => {
    if (!activeSession || activeSession.topicSelection.source !== 'preset') {
      return
    }

    const currentPageIndex = activeSession.topicSelection.pageIndex ?? 0
    const clampedPageIndex = Math.min(Math.max(currentPageIndex, 0), topicPageCount - 1)

    if (clampedPageIndex === currentPageIndex) {
      return
    }

    updateSession(activeSession.id, (current) => ({
      ...current,
      topicSelection: {
        ...current.topicSelection,
        pageIndex: clampedPageIndex,
        recommendationError: '',
        recommendations: createTopicRecommendations({
          filterTypes: current.topicSelection.filterTypes,
          pageIndex: clampedPageIndex,
          excludeSessionId: current.id,
          sessions,
        }),
      },
    }))
  }, [activeSession, sessions, topicPageCount, updateSession])

  useLayoutEffect(() => {
    const container = splitContainerRef.current

    if (!container) {
      return
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]

      if (!entry) {
        return
      }

      setRightPaneWidth((current) => clampRightPaneWidth(current, entry.contentRect.width))
    })

    observer.observe(container)

    return () => {
      observer.disconnect()
    }
  }, [])

  useEffect(() => {
    if (!isResizingSplit) {
      return
    }

    function handlePointerMove(event) {
      const container = splitContainerRef.current

      if (!container) {
        return
      }

      const rect = container.getBoundingClientRect()
      const nextRightWidth = rect.right - event.clientX
      setRightPaneWidth(clampRightPaneWidth(nextRightWidth, rect.width))
    }

    function handlePointerUp() {
      setIsResizingSplit(false)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }

    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'
    window.addEventListener('mousemove', handlePointerMove)
    window.addEventListener('mouseup', handlePointerUp)

    return () => {
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      window.removeEventListener('mousemove', handlePointerMove)
      window.removeEventListener('mouseup', handlePointerUp)
    }
  }, [isResizingSplit])

  useEffect(() => {
    if (!pageToast?.id) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setPageToast((current) => (current?.id === pageToast.id ? null : current))
    }, 2000)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [pageToast])

  function updateCurrentSession(updater) {
    if (!currentSessionId) {
      return
    }

    updateSession(currentSessionId, updater)
  }

  function handleSetPreviewDevice(sessionId, nextDevice) {
    if (!sessionId) {
      return
    }

    const normalizedDevice = nextDevice === 'desktop' ? 'desktop' : 'mobile'

    updateSession(sessionId, (current) => ({
      layoutReview: {
        ...(current.layoutReview ?? {}),
        device: normalizedDevice,
      },
    }))
  }

  function handleSetPreviewFontSize(sessionId, nextFontSize) {
    if (!sessionId) {
      return
    }

    const normalizedFontSize = normalizePreviewFontSize(nextFontSize)

    updateSession(sessionId, (current) => ({
      layoutReview: {
        ...(current.layoutReview ?? {}),
        fontSize: normalizedFontSize,
      },
    }))
  }

  function handleSetPreviewSurfaceMode(sessionId, nextSurfaceMode) {
    if (!sessionId) {
      return
    }

    const normalizedSurfaceMode = normalizePreviewSurfaceMode(nextSurfaceMode)

    updateSession(sessionId, (current) => ({
      layoutReview: {
        ...(current.layoutReview ?? {}),
        surfaceMode: normalizedSurfaceMode,
      },
    }))
  }

  function showPageToast(message, tone = 'success') {
    setPageToast({
      id: createId('toast'),
      message,
      tone,
    })
  }

  async function runFlow({
    awaitResultStepIndex,
    introMessageContent,
    onComplete,
    onError,
    resolveFlowOnComplete,
    resolveResult,
    resolveStepDelayMs,
    sessionId,
    summary,
    steps,
    title,
  }) {
    const flowId = createId('flow')
    const messageId = createId('assistant')
    const startedAt = Date.now()
    const holdStepIndex = Math.min(Math.max(awaitResultStepIndex ?? steps.length - 1, 0), steps.length - 1)
    const preparedSteps = createPreparedFlowSteps(flowId, steps, startedAt)

    const startedFlow = {
      createdAt: new Date(startedAt).toISOString(),
      id: flowId,
      messageId,
      steps: preparedSteps,
      summary,
      title,
    }

    updateSession(sessionId, (current) => ({
      ...current,
      messages: [
        ...current.messages,
        {
          content: introMessageContent || summary || title,
          createdAt: new Date(startedAt).toISOString(),
          id: messageId,
          role: 'assistant',
          workflow: startedFlow,
        },
      ],
      processingFlow: startedFlow,
    }))

    const updateExternalFlowSteps = (incomingSteps) => {
      updateSession(sessionId, (current) => {
        const activeFlow = current.processingFlow

        if (!activeFlow || activeFlow.id !== flowId) {
          return current
        }

        const nextFlow = {
          ...activeFlow,
          steps: mergeFlowProgressSteps(activeFlow.steps, incomingSteps),
        }

        return {
          ...current,
          messages: attachWorkflowToMessages(current.messages, messageId, nextFlow),
          processingFlow: nextFlow,
        }
      })
    }

    const resultPromise = resolveResult
      ? Promise.resolve().then(() =>
          resolveResult({
            flowId,
            messageId,
            startedAt,
            updateFlowSteps: updateExternalFlowSteps,
          }),
        )
      : Promise.resolve(null)

    for (let index = 0; index < holdStepIndex; index += 1) {
      const step = preparedSteps[index]
      const stepDelayMs =
        typeof resolveStepDelayMs === 'function'
          ? Math.max(0, resolveStepDelayMs(step, index, preparedSteps))
          : clampFlowStepDuration(step?.seconds ?? 1)

      await delay(stepDelayMs)

      updateSession(sessionId, (current) => {
        const activeFlow = current.processingFlow

        if (!activeFlow || activeFlow.id !== flowId) {
          return current
        }

        const nextSteps = advanceFlowSteps(activeFlow.steps, index, Date.now())
        const nextFlow = {
          ...activeFlow,
          steps: nextSteps,
        }

        return {
          ...current,
          messages: attachWorkflowToMessages(current.messages, messageId, nextFlow),
          processingFlow: nextFlow,
        }
      })
    }

    let resolvedResult = null

    try {
      resolvedResult = await resultPromise
    } catch (error) {
      updateSession(sessionId, (current) => {
        const activeFlow = current.processingFlow?.id === flowId ? current.processingFlow : startedFlow
        const failedFlow = {
          ...activeFlow,
          completedAt: new Date().toISOString(),
          errorMessage: error.message,
          steps: failFlowSteps(activeFlow.steps, Date.now()),
        }
        const nextSession = onError
          ? onError(current, error, { flowId, messageId, startedAt })
          : {
              activeWorkbenchTab: 'draft',
              isWorkbenchOpen: true,
              messages: updateMessageById(current.messages, messageId, (message) => ({
                content: appendMessageParagraph(message.content, `这一步执行失败了：${error.message}`),
              })),
            }

        return {
          ...current,
          ...nextSession,
          messages: attachWorkflowToMessages(nextSession.messages ?? current.messages, messageId, failedFlow),
          lastFlowSummary: failedFlow,
          processingFlow: null,
          runLogs: [failedFlow, ...(current.runLogs ?? [])].slice(0, 12),
        }
      })

      return
    }

    updateSession(sessionId, (current) => {
      const activeFlow = current.processingFlow?.id === flowId ? current.processingFlow : startedFlow
      const finishedAt = Date.now()
      let finalSteps = completeFlowSteps(activeFlow.steps, finishedAt)

      if (resolveFlowOnComplete) {
        finalSteps = resolveFlowOnComplete(finalSteps, resolvedResult, finishedAt)
      }

      const completedFlow = {
        ...activeFlow,
        completedAt: new Date(finishedAt).toISOString(),
        steps: finalSteps,
      }
      const nextSession = onComplete(current, resolvedResult, { flowId, messageId, startedAt })

      return {
        ...current,
        ...nextSession,
        messages: attachWorkflowToMessages(nextSession.messages ?? current.messages, messageId, completedFlow),
        lastFlowSummary: completedFlow,
        processingFlow: null,
        runLogs: [completedFlow, ...(current.runLogs ?? [])].slice(0, 12),
      }
    })
  }

  async function handleSelectTopic(topicId, topicOverride = null) {
    if (!currentSessionId || !activeSession) {
      return
    }

    const topic =
      topicOverride ??
      visibleTopicRecommendations.find((item) => item.id === topicId)

    if (!topic) {
      return
    }

    if (CONTENT_FLOW_UI_PREVIEW) {
      updateSession(currentSessionId, (current) => buildMockInitialDraftExperience({ current, topic }))
      return
    }

    updateSession(currentSessionId, (current) => ({
      ...current,
      messages: [
        ...current.messages,
        {
          id: createId('user'),
          role: 'user',
          content: `我选这个：${topic.title}`,
          createdAt: new Date().toISOString(),
        },
      ],
      title: topic.title,
      topicSelection: {
        ...current.topicSelection,
        recommendationError: '',
        selectedTopicId: topicId,
        selectedTopic: topic,
      },
    }))

    await runFlow({
      awaitResultStepIndex: 0,
      introMessageContent: INITIAL_DRAFT_FLOW_INTRO_MESSAGE,
      onComplete: (current, generated, { messageId }) => {
        const currentTopic = getSelectedTopic(current)
        const version = buildVersionFromGeneratedResult({
          generated,
          note: '',
          supplement: '',
          topic: currentTopic,
          versionNumber: 1,
        })

        return {
          activeWorkbenchTab: 'draft',
          draftReview: {
            ...current.draftReview,
            activeVersionId: version.id,
            latestNote: '',
            versions: [version],
          },
          isWorkbenchOpen: true,
          messages: updateMessageById(current.messages, messageId, (message) => ({
            content: appendMessageParagraph(
              message.content,
              '首版稿件已经准备好了，右侧可以查看正文和校验报告。你确认后，我会继续生成排版预览。',
            ),
          })),
          stageId: 'draft',
          title: resolveVersionDisplayTitle(current, version),
        }
      },
      onError: (current, error, { messageId }) => ({
        activeWorkbenchTab: 'draft',
        isWorkbenchOpen: true,
        messages: updateMessageById(current.messages, messageId, (message) => ({
          content: appendMessageParagraph(
            message.content,
            `首版稿件生成失败了：${error.message}。你可以重新点击当前选题，再试一次。`,
          ),
        })),
        topicSelection: {
          ...current.topicSelection,
          selectedTopicId: null,
          selectedTopic: null,
        },
      }),
      resolveResult: ({ updateFlowSteps }) =>
        requestGeneratedDraft({
          action: 'initial',
          deepThinkingEnabled: activeSession.deepThinkingEnabled,
          onProgress: (event) => {
            updateFlowSteps(event.steps)
          },
          streamProgress: true,
          supplement: '',
          topic,
        }),
      resolveFlowOnComplete: (flowSteps, generated, finishedAt) => {
        const { decision, shouldSkipAutoRevision } = resolveInitialDraftFlowOutcome(
          generated?.reportMarkdown ?? '',
          generated?.decision ?? '',
        )
        return flowSteps.map((step, index) => {
          if (index === 5) {
            return {
              ...step,
              label: `判定修改方式（${decision}）`,
            }
          }

          if (index !== 6 || !shouldSkipAutoRevision) {
            return step
          }

          return {
            ...step,
            completedAt: finishedAt,
            elapsedMs: 0,
            startedAt: null,
            status: 'skipped',
          }
        })
      },
      sessionId: currentSessionId,
      summary: INITIAL_DRAFT_FLOW_SUMMARY,
      steps: INITIAL_DRAFT_FLOW_STEPS,
      title: INITIAL_DRAFT_FLOW_TITLE,
    })
  }

  function handleApplyTopicFilters(nextFilterTypes) {
    if (!currentSessionId || !activeSession) {
      return
    }

    const normalizedFilterTypes = Array.from(new Set(nextFilterTypes)).slice(0, 3)
    const nextRecommendations = createTopicRecommendations({
      filterTypes: normalizedFilterTypes,
      pageIndex: 0,
      excludeSessionId: currentSessionId,
      sessions,
    })

    updateSession(currentSessionId, (current) => ({
      ...current,
      topicSelection: {
        ...current.topicSelection,
        filterTypes: normalizedFilterTypes,
        pageIndex: 0,
        recommendationError: '',
        recommendations: nextRecommendations,
        selectedTopicId: null,
        selectedTopic: null,
        source: 'preset',
      },
    }))
  }

  function handleClearTopicFilters() {
    handleApplyTopicFilters([])
  }

  function handleSelectTopicPage(nextPageIndex) {
    if (!currentSessionId || !activeSession) {
      return
    }

    const clampedPageIndex = Math.min(Math.max(nextPageIndex, 0), topicPageCount - 1)
    const nextRecommendations = createTopicRecommendations({
      filterTypes: activeSession.topicSelection.filterTypes,
      pageIndex: clampedPageIndex,
      excludeSessionId: currentSessionId,
      sessions,
    })

    updateSession(currentSessionId, (current) => ({
      ...current,
      topicSelection: {
        ...current.topicSelection,
        pageIndex: clampedPageIndex,
        recommendationError: '',
        recommendations: nextRecommendations,
        selectedTopicId: null,
        selectedTopic: null,
        source: 'preset',
      },
    }))
  }

  function handleSelectWorkbenchTab(tabId) {
    updateCurrentSession((current) => ({
      ...current,
      activeWorkbenchTab: tabId,
      isWorkbenchOpen: true,
    }))
  }

  async function handleProceedWithoutChanges() {
    if (!currentSessionId || !activeSession) {
      return
    }

    updateSession(currentSessionId, (current) => ({
      ...current,
      messages: [
        ...current.messages,
        {
          id: createId('user'),
          role: 'user',
          content: '无需修改',
          createdAt: new Date().toISOString(),
        },
      ],
    }))

    const currentVersion = getActiveVersion(activeSession)
    const currentTopic = getSelectedTopic(activeSession)

    if (!currentVersion || !currentTopic) {
      return
    }

    const previewStructureState = analyzeStructuredPreviewDraft(currentVersion.draftMarkdown ?? '', { requireTitle: true })

    if (!previewStructureState.canPreview) {
      updateSession(currentSessionId, (current) => ({
        ...current,
        activeWorkbenchTab: 'draft',
        isWorkbenchOpen: true,
        messages: [
          ...current.messages,
          {
            id: createId('assistant'),
            role: 'assistant',
            content: `当前文字稿格式有问题，暂时无法进入排版。${previewStructureState.issues.length > 0 ? `问题：${previewStructureState.issues.join('；')}。` : ''}你可以让我重写、修改，或者重新生成。`,
            createdAt: new Date().toISOString(),
          },
        ],
        stageId: 'draft',
      }))
      return
    }

    const previewSections = buildPreviewSections(stripPreviewHeading(currentVersion.draftMarkdown ?? ''))
    const matchSections = buildTemplateMatchSections(previewSections)

    await runFlow({
      awaitResultStepIndex: 0,
      introMessageContent:
        '收到，这一版文字稿已确认。我现在开始整理排版预览，完成后右侧会显示可确认的排版效果。',
      onComplete: (current, matchedAssets, { messageId }) => {
        const nextVersion = getActiveVersion(current)
        const nextImageSelection =
          nextVersion && matchedAssets
            ? buildImageSelectionFromMatchResult({
                matchResult: matchedAssets,
                sections: matchSections,
                versionId: nextVersion.id,
              })
            : current.imageSelection

        return {
          activeWorkbenchTab: 'preview',
          imageSelection: nextImageSelection,
          messages: updateMessageById(current.messages, messageId, (message) => ({
            content: appendMessageParagraph(
              message.content,
              '固定模板排版预览已经准备好了。右侧可以查看最终展示效果，确认后这轮内容创作就完成了。',
            ),
          })),
          stageId: 'preview',
        }
      },
      resolveResult: () =>
        requestLibraryAssetMatch({
          sections: matchSections.map((section) => ({
            order: section.order,
            positionLabel: section.positionLabel,
            text: section.text,
            title: section.title,
          })),
          topic: currentTopic.theme || '通用',
          type: currentTopic.type || '',
          wordCount: currentVersion.wordCount || 0,
        }),
      sessionId: currentSessionId,
      summary: '文字稿确认完成，系统正在按固定模板整理排版预览。',
      steps: [
        { label: '整理固定模板结构', seconds: 5, tabId: 'draft' },
        { label: '匹配正文三张配图', seconds: 6, tabId: 'preview' },
        { label: '生成固定模板预览', seconds: 6, tabId: 'preview' },
      ],
      title: '正在生成排版预览',
    })
  }

  async function handleRewriteWholeDraft() {
    if (!currentSessionId || !activeSession) {
      return
    }

    const rewriteInstruction = '请整篇重写当前文章，保留核心主题，但重新组织结构、故事和表达节奏。'

    updateSession(currentSessionId, (current) => ({
      ...current,
      messages: [
        ...current.messages,
        {
          id: createId('user'),
          role: 'user',
          content: '整篇重写',
          createdAt: new Date().toISOString(),
        },
      ],
    }))

    await runFlow({
      introMessageContent:
        '收到，我会按整篇重写的方式重新处理这一版文字稿。完成后，右侧会同步更新正文和校验报告。',
      onComplete: (current, generated, { messageId }) => {
        const currentTopic = getSelectedTopic(current)
        const nextVersion = buildVersionFromGeneratedResult({
          generated,
          note: rewriteInstruction,
          supplement: '',
          topic: currentTopic,
          versionNumber: current.draftReview.versions.length + 1,
        })

        return {
          activeWorkbenchTab: 'draft',
          draftReview: {
            ...current.draftReview,
            activeVersionId: nextVersion.id,
            latestNote: rewriteInstruction,
            versions: [...current.draftReview.versions, nextVersion],
          },
          isWorkbenchOpen: true,
          messages: updateMessageById(current.messages, messageId, (message) => ({
            content: appendMessageParagraph(
              message.content,
              '我已经按“整篇重写”的方式重新生成了一版，右侧的正文和校验报告都更新好了。',
            ),
          })),
          title: resolveVersionDisplayTitle(current, nextVersion),
        }
      },
      onError: (current, error, { messageId }) => ({
        activeWorkbenchTab: 'draft',
        isWorkbenchOpen: true,
        messages: updateMessageById(current.messages, messageId, (message) => ({
          content: appendMessageParagraph(
            message.content,
            `整篇重写失败了：${error.message}。你可以稍后再试，或改用局部修改。`,
          ),
        })),
      }),
      resolveResult: () =>
        requestGeneratedDraft({
          action: 'revise',
          deepThinkingEnabled: activeSession.deepThinkingEnabled,
          note: rewriteInstruction,
          supplement: '',
          topic: selectedTopic,
        }),
      sessionId: currentSessionId,
      summary: '正在整篇重写当前文字稿。',
      steps: [
        { label: '重新规划文章结构与节奏', seconds: 4, tabId: 'draft' },
        { label: '整篇重写正文', seconds: 9, tabId: 'draft' },
        { label: '重新输出详细校验报告', seconds: 5, tabId: 'report' },
      ],
      title: '正在整篇重写',
    })
  }

  async function handleComposerSubmit() {
    if (!currentSessionId || !activeSession || !canSend) {
      return
    }

    const currentDraft = activeSession.draft.trim()

    updateSession(currentSessionId, (current) => ({
      ...current,
      draft: '',
      messages: [
        ...current.messages,
        {
          id: createId('user'),
          role: 'user',
          content: currentDraft,
          createdAt: new Date().toISOString(),
        },
      ],
    }))

    if (currentStageId === 'draft') {
      await runFlow({
        introMessageContent:
          '收到，我先根据你的修改意见重新处理这一版文字稿。完成后，右侧会同步更新正文和校验报告。',
        onComplete: (current, generated, { messageId }) => {
          const currentTopic = getSelectedTopic(current)
          const nextVersion = buildVersionFromGeneratedResult({
            generated,
            note: currentDraft,
            supplement: '',
            topic: currentTopic,
            versionNumber: current.draftReview.versions.length + 1,
          })

          return {
            activeWorkbenchTab: 'draft',
            draftReview: {
              ...current.draftReview,
              activeVersionId: nextVersion.id,
              latestNote: currentDraft,
              versions: [...current.draftReview.versions, nextVersion],
            },
            isWorkbenchOpen: true,
            messages: updateMessageById(current.messages, messageId, (message) => ({
              content: appendMessageParagraph(
                message.content,
                '我已经按你的修改意见完成重写，这一版正文和校验报告都更新在右侧了。',
              ),
            })),
            title: resolveVersionDisplayTitle(current, nextVersion),
          }
        },
        onError: (current, error, { messageId }) => ({
          activeWorkbenchTab: 'draft',
          draft: currentDraft,
          isWorkbenchOpen: true,
          messages: updateMessageById(current.messages, messageId, (message) => ({
            content: appendMessageParagraph(
              message.content,
              `这轮改稿失败了：${error.message}。修改意见我先帮你保留在输入框里了，处理好后可以直接重试。`,
            ),
          })),
        }),
        resolveResult: () =>
          requestGeneratedDraft({
            action: 'revise',
            deepThinkingEnabled: activeSession.deepThinkingEnabled,
            note: currentDraft,
            supplement: '',
            topic: selectedTopic,
          }),
        sessionId: currentSessionId,
        summary: '正在根据你的意见重写这一版文字稿。',
        steps: [
          { label: '读取修改意见并定位段落', seconds: 3, tabId: 'draft' },
          { label: '完成局部改写', seconds: 7, tabId: 'draft' },
          { label: '重新输出详细校验报告', seconds: 5, tabId: 'report' },
      ],
      title: '正在重写当前文字稿',
      })

      return
    }

    updateSession(currentSessionId, (current) => ({
      ...current,
      messages: [
        ...current.messages,
        {
          id: createId('assistant'),
          role: 'assistant',
          content: '我已经记下这条补充说明了。当前节点先在右侧确认预览效果。',
          createdAt: new Date().toISOString(),
        },
      ],
    }))
  }

  function handleSubmit(event) {
    event.preventDefault()
    handleComposerSubmit()
  }

  function handleComposerKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleComposerSubmit()
    }
  }

  async function handleConfirmPreview() {
    if (!currentSessionId || !activeSession) {
      return
    }

    updateSession(currentSessionId, (current) => ({
      ...current,
      messages: [
        ...current.messages,
        {
          id: createId('user'),
          role: 'user',
          content: '排版确认通过',
          createdAt: new Date().toISOString(),
        },
      ],
    }))

    const currentVersion = getActiveVersion(activeSession)
    const usedAssetIds = extractUsedAssetIds(activeSession.imageSelection, currentVersion?.id ?? '')

    await runFlow({
      awaitResultStepIndex: 0,
      introMessageContent:
        '收到，我正在完成这轮排版确认并收束最终结果。完成后，当前版本会进入已确认状态。',
      onComplete: (current, _generated, { messageId }) => ({
        activeWorkbenchTab: 'preview',
        messages: updateMessageById(current.messages, messageId, (message) => ({
          content: appendMessageParagraph(
            message.content,
            '当前版本已经完成排版确认。你可以继续在右侧查看正文、校验报告和最终预览。',
          ),
        })),
        stageId: 'completed',
      }),
      resolveResult: () =>
        requestLibraryAssetUsage({
          assetIds: usedAssetIds,
          usedAt: new Date().toISOString(),
        }),
      sessionId: currentSessionId,
      summary: '排版确认完成，系统正在收束本轮内容创作结果。',
      steps: [
        { label: '确认固定模板排版结果', seconds: 4, tabId: 'preview' },
        { label: '写入最终预览状态', seconds: 4, tabId: 'preview' },
      ],
      title: '正在完成本轮排版确认',
    })
  }

  function handleDraftChange(nextDraft) {
    updateCurrentSession((current) => ({
      ...current,
      draft: nextDraft,
    }))
  }

  function handleToggleDeepThinking() {
    updateCurrentSession((current) => ({
      ...current,
      deepThinkingEnabled: !current.deepThinkingEnabled,
    }))
  }

  function handleToggleSidebarCollapsed() {
    setSidebarCollapsed(!isSidebarCollapsed)
  }

  function handleToggleWorkbench() {
    updateCurrentSession((current) => ({
      ...current,
      isWorkbenchOpen: !current.isWorkbenchOpen,
    }))
  }

  function handleCreateSession() {
    const nextSessionId = createSession()
    setActiveModule('content')
    setCopiedMessageId(null)

    if (nextSessionId) {
      window.requestAnimationFrame(() => {
        composerRef.current?.focus()
      })
    }
  }

  function handleRequestDeleteSession(session) {
    setSessionPendingDelete({
      id: session.id,
      title: session.title,
    })
  }

  function handleCancelDeleteSession() {
    setSessionPendingDelete(null)
  }

  function handleConfirmDeleteSession() {
    if (!sessionPendingDelete?.id) {
      return
    }

    deleteSession(sessionPendingDelete.id)
    setSessionPendingDelete(null)
    setCopiedMessageId(null)
  }

  function handleSelectSession(sessionId) {
    setActiveModule('content')
    setArticlePreviewSessionId(null)
    setActiveSessionId(sessionId)
    setCopiedMessageId(null)
  }

  function handleOpenArticlePreview(sessionId) {
    setArticlePreviewSessionId(sessionId)
  }

  function handleCloseArticlePreview() {
    setArticlePreviewSessionId(null)
  }

  function handleQuickMessageInsert(label) {
    if (composerDisabled) {
      return
    }

    updateCurrentSession((current) => {
      const trimmed = current.draft.trim()

      if (!trimmed) {
        return {
          ...current,
          draft: label,
        }
      }

      return {
        ...current,
        draft: trimmed.includes(label) ? trimmed : `${trimmed} ${label}`,
      }
    })

    window.requestAnimationFrame(() => {
      composerRef.current?.focus()
    })
  }

  async function handleCopyMessage(messageId, content) {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedMessageId(messageId)
      window.setTimeout(() => {
        setCopiedMessageId((current) => (current === messageId ? null : current))
      }, 1500)
    } catch {
      setCopiedMessageId(null)
    }
  }

  function getComposerPlaceholder() {
    if (isBusy) {
      return '当前正在生成首版稿件，请先等待这轮处理完成'
    }

    if (currentStageId === 'topic') {
      return '先在上方确认推荐选题，或通过筛选切换当前显示的选题类型'
    }

    if (currentStageId === 'draft') {
      return '输入修改意见，按 Enter 发送'
    }

    if (currentStageId === 'preview') {
      return '当前先在右侧确认排版效果'
    }

    return '当前版本已经完成排版确认'
  }

  return (
    <section className="flex h-screen min-h-0 overflow-hidden bg-white">
      <SessionSidebar
        activeModule={activeModule}
        activeSessionId={currentSessionId}
        isCollapsed={isSidebarCollapsed}
        onChangeModule={setActiveModule}
        onCreateSession={handleCreateSession}
        onDeleteSession={handleRequestDeleteSession}
        onSearchChange={setSearchQuery}
        onSelectSession={handleSelectSession}
        onToggleCollapsed={handleToggleSidebarCollapsed}
        searchQuery={searchQuery}
        sessions={historySessions}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white">
        <div className="flex h-[76px] shrink-0 items-center justify-end bg-white px-6">
          {isContentModule && !shouldRenderHero ? (
            <button
              aria-label={activeSession?.isWorkbenchOpen ? '收起右侧工作区' : '展开右侧工作区'}
              className="inline-flex h-11 min-w-11 items-center justify-center rounded-2xl border border-border/80 bg-white px-3 text-muted-foreground transition-colors hover:text-foreground"
              disabled={!hasWorkbenchOutputs}
              onClick={handleToggleWorkbench}
              type="button"
            >
              {activeSession?.isWorkbenchOpen ? (
                <PanelRightClose className={cn(!hasWorkbenchOutputs && 'opacity-35')} size={18} strokeWidth={1.9} />
              ) : (
                <PanelRightOpen className={cn(!hasWorkbenchOutputs && 'opacity-35')} size={18} strokeWidth={1.9} />
              )}
            </button>
          ) : null}
        </div>

        <div ref={splitContainerRef} className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <div
            className="flex min-h-0 min-w-0 flex-1 flex-col bg-white"
            style={{
              minWidth: `${LEFT_PANE_MIN_WIDTH}px`,
              width: showWorkbench ? `calc(100% - ${rightPaneWidth}px)` : '100%',
            }}
          >
            {!isContentModule ? (
              activeModule === 'library' ? (
                <LibraryModuleCanvas topicStatusById={topicStatusById} />
              ) : activeModule === 'articles' ? (
                <ArticlesModuleCanvas articles={articleEntries} onOpenArticle={handleOpenArticlePreview} />
              ) : activeModule === 'fixed-layout' ? (
                <FixedLayoutConfigCanvas />
              ) : (
                <AssetsModuleCanvas />
              )
            ) : shouldRenderHero ? (
              <div className="benchmark-scroll-hidden min-h-0 flex-1 overflow-y-auto">
                <div className="mx-auto flex w-full max-w-[1240px] flex-col items-center px-6 py-8 sm:px-8 lg:px-12">
                  <div className="max-w-[880px] text-center">
                    <h1 className="text-[34px] font-semibold tracking-[-0.03em] text-foreground sm:text-[42px]">
                      开始内容创作
                    </h1>
                    <p className="mx-auto mt-3 max-w-[820px] text-[15px] leading-7 text-muted-foreground">
                      系统会优先从未进入创作的选题里随机加载 6 个预设选题。你也可以按类型筛选后翻页查看更多选题。
                    </p>
                  </div>

                  <div className="mt-8 w-full max-w-[1120px]">
                    <TopicStageCard
                      filterTypes={activeSession?.topicSelection?.filterTypes ?? []}
                      onApplyFilters={handleApplyTopicFilters}
                      onClearFilters={handleClearTopicFilters}
                      onSelectPage={handleSelectTopicPage}
                      onSelectTopic={handleSelectTopic}
                      pageCount={topicPageCount}
                      pageIndex={activeSession?.topicSelection?.pageIndex ?? 0}
                      recommendations={visibleTopicRecommendations}
                      selectedTopicId={activeSession?.topicSelection?.selectedTopicId ?? null}
                      topicStatusById={topicStatusById}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="mx-auto flex min-h-0 w-full max-w-[1240px] flex-1 flex-col px-4 sm:px-6 lg:px-8">
                <div className="min-h-0 flex-1 overflow-hidden">
                  <div className="benchmark-scroll-hidden h-full overflow-y-auto pb-1">
                    <div className="flex flex-col gap-8 pb-6 pt-6">
                      {(activeSession?.messages ?? []).map((message) => (
                        <MessageBubble
                          copiedMessageId={copiedMessageId}
                          key={message.id}
                          message={message}
                          onCopy={handleCopyMessage}
                        />
                      ))}

                      {!isBusy && currentStageId === 'draft' ? (
                        <DraftStageCard
                          activeVersion={activeVersion}
                          onOpenTab={handleSelectWorkbenchTab}
                          onProceedWithoutChanges={handleProceedWithoutChanges}
                          onRewriteAll={handleRewriteWholeDraft}
                        />
                      ) : null}

                      {!isBusy && currentStageId === 'preview' ? (
                        <PreviewStageCard onConfirm={handleConfirmPreview} onOpenTab={handleSelectWorkbenchTab} />
                      ) : null}

                      {!isBusy && currentStageId === 'completed' ? (
                        <CompletedStageCard onOpenTab={handleSelectWorkbenchTab} />
                      ) : null}
                    </div>
                  </div>
                </div>

                <footer className="shrink-0 bg-white pb-3 pt-1 sm:pb-5">
                  <form className="mx-auto w-full max-w-[1120px]" onSubmit={handleSubmit}>
                    <div className="rounded-[24px] border border-border/80 bg-white px-4 py-3">
                      <Textarea
                        className="benchmark-scroll-hidden max-h-[68px] min-h-[58px] resize-none border-0 bg-transparent px-1 py-2 text-[15px] leading-[1.5] shadow-none focus-visible:border-0 focus-visible:ring-0 sm:text-[15px]"
                        disabled={composerDisabled}
                        onChange={(event) => handleDraftChange(event.target.value)}
                        onKeyDown={handleComposerKeyDown}
                        placeholder={getComposerPlaceholder()}
                        ref={composerRef}
                        rows={1}
                        value={activeSession?.draft ?? ''}
                      />

                      <div className="mt-2 flex items-center justify-between border-t border-border/70 px-1 pt-3">
                        <div className="flex items-center gap-2">
                          <ThinkingToggle checked={activeSession?.deepThinkingEnabled ?? true} onChange={handleToggleDeepThinking} />
                        </div>

                        <div className="flex items-center gap-2">
                          <QuickMessageMenu disabled={composerDisabled} onSelect={handleQuickMessageInsert} />
                          <div className="rounded-full px-2.5 py-1 text-[13px] text-foreground">
                            {activeSession?.deepThinkingEnabled ? reasoningModel : highspeedModel}
                          </div>
                          <Button
                            className="size-10 rounded-full bg-[#171b22] text-white shadow-none hover:bg-black"
                            disabled={!canSend}
                            size="icon-lg"
                            type="submit"
                          >
                            {isBusy ? <LoaderCircle className="animate-spin" size={16} /> : <ArrowUp size={16} />}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </form>
                </footer>
              </div>
            )}
          </div>

          {showWorkbench ? (
            <div
              className="relative min-h-0 shrink-0 bg-white"
              style={{ minWidth: `${RIGHT_PANE_MIN_WIDTH}px`, width: `${rightPaneWidth}px` }}
            >
              <button
                aria-label="调整左右宽度"
                className="group absolute inset-y-0 left-0 z-20 w-6 -translate-x-1/2 cursor-col-resize"
                onMouseDown={() => setIsResizingSplit(true)}
                type="button"
              >
                <span className="absolute bottom-0 left-1/2 top-8 w-px -translate-x-1/2 bg-border/80 transition-colors group-hover:bg-foreground/35" />
                <span className="absolute left-1/2 top-1/2 h-10 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-border/80 bg-white shadow-[0_8px_18px_rgba(15,23,42,0.05)] transition-colors group-hover:border-foreground/20">
                  <span className="absolute inset-x-[3px] top-1/2 h-4 -translate-y-1/2 rounded-full bg-secondary/90" />
                </span>
              </button>
              <RightWorkbenchShell
                activeTabId={activeSession.activeWorkbenchTab}
                onCopyTitleSuccess={() => showPageToast('标题复制成功')}
                onOpenTab={handleSelectWorkbenchTab}
                onShowPageToast={showPageToast}
                onSetPreviewDevice={(nextDevice) => handleSetPreviewDevice(activeSession.id, nextDevice)}
                onSetPreviewFontSize={(nextFontSize) => handleSetPreviewFontSize(activeSession.id, nextFontSize)}
                onSetPreviewSurfaceMode={(nextSurfaceMode) => handleSetPreviewSurfaceMode(activeSession.id, nextSurfaceMode)}
                onSelectVersion={(versionId) =>
                  updateCurrentSession((current) => {
                    const nextSession = {
                      ...current,
                      activeWorkbenchTab: 'draft',
                      draftReview: {
                        ...current.draftReview,
                        activeVersionId: versionId,
                      },
                    }
                    const nextVersion =
                      nextSession.draftReview.versions.find((version) => version.id === versionId) ??
                      nextSession.draftReview.versions[nextSession.draftReview.versions.length - 1]

                    return {
                      ...nextSession,
                      title: resolveVersionDisplayTitle(nextSession, nextVersion),
                    }
                  })
                }
                onUpdateDraftSync={(draftSync) =>
                  updateCurrentSession((current) => ({
                    ...current,
                    draftSync: {
                      ...current.draftSync,
                      ...(draftSync ?? {}),
                    },
                  }))
                }
                session={activeSession}
                tabs={availableTabs}
              />
            </div>
          ) : null}
        </div>
      </div>

      <DeleteSessionDialog
        onClose={handleCancelDeleteSession}
        onConfirm={handleConfirmDeleteSession}
        open={Boolean(sessionPendingDelete)}
        sessionTitle={sessionPendingDelete?.title ?? ''}
      />

      <ArticlePreviewDrawer
        onClose={handleCloseArticlePreview}
        onCopyTitleSuccess={() => showPageToast('标题复制成功')}
        onShowPageToast={showPageToast}
        onSetPreviewDevice={(nextDevice) => handleSetPreviewDevice(activeArticleSession?.id, nextDevice)}
        onSetPreviewFontSize={(nextFontSize) => handleSetPreviewFontSize(activeArticleSession?.id, nextFontSize)}
        onSetPreviewSurfaceMode={(nextSurfaceMode) => handleSetPreviewSurfaceMode(activeArticleSession?.id, nextSurfaceMode)}
        open={activeModule === 'articles' && Boolean(activeArticleSession)}
        session={activeArticleSession}
      />

      {pageToast ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[80] flex justify-center px-4">
          <div
            className={cn(
              'inline-flex max-w-[520px] items-center gap-2 rounded-full bg-white px-4 py-2 shadow-[0_12px_36px_rgba(16,24,40,0.12)]',
              pageToast.tone === 'error' ? 'border border-red-200/80' : 'border border-emerald-200/80',
            )}
          >
            {pageToast.tone === 'error' ? <X className="text-red-600" size={16} /> : <CheckCircle2 className="text-emerald-600" size={16} />}
            <span className="text-[13px] font-medium text-foreground">{pageToast.message}</span>
          </div>
        </div>
      ) : null}
    </section>
  )
}
