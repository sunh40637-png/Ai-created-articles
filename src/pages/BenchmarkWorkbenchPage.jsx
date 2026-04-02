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
  buildImageSelectionFromMatchResult,
  buildPreviewSections,
  createTemplatePreviewPlaceholderSlots,
  extractUsedAssetIds,
  getRenderablePreviewSlots,
  renderArticlePreviewDocument,
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
  createArticleTemplateConfigSignature,
  createDefaultArticleTemplateConfig,
  normalizeArticleTemplateConfig,
} from '../../shared/articleTemplateConfig.js'
import {
  createEmptyFixedLayoutConfig,
  FIXED_LAYOUT_ENDING_TEXT_MAX_LENGTH,
  FIXED_LAYOUT_FILE_ACCEPT,
  FIXED_LAYOUT_IMAGE_SLOT_IDS,
  FIXED_LAYOUT_SLOT_META,
  FIXED_LAYOUT_SLOT_ORDER,
  normalizeFixedLayoutTextContent,
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
  { id: 'fixed-layout', label: '图片配置', icon: ImageUp },
  { id: 'layout-template', label: '排版模板', icon: LayoutTemplate },
]

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

const ARTICLE_TEMPLATE_PREVIEW_SAMPLE = {
  articleType: '家庭关系',
  bodyMarkdown: `## 第一段小标题
人到一定年纪，最珍贵的并不是热闹，而是有人在你累的时候，愿意静静坐下来陪你说几句话。很多真正有分量的感情，都不是靠声势撑起来的，而是在日常里一点点沉淀出来的。

- 一句及时的回应
- 一次耐心的等待
- 一个愿意停下来的眼神

> 真正让人安稳的，从来不是宏大的承诺，而是细碎却长期的在场。

## 第二段小标题
等你真正经历过人生的起伏之后，就会明白，人与人之间最舒服的关系，不是时时刻刻都黏在一起，而是在该伸手的时候有人伸手，在该沉默的时候彼此都懂得留白。

| 场景 | 感受 |
| --- | --- |
| 深夜灯下 | 安心 |
| 清晨厨房 | 踏实 |

## 第三段小标题
所以一篇成熟的文章，不只是把道理说清楚，更要把节奏、停顿、画面和余味排好。你在这里调的，其实不是某一篇文章，而是所有文章最终落地时给人的气质和分寸。`,
  displayTitle: '人到晚年才懂，最好的关系，是彼此都不费力',
  penName: '洞见心语',
  wordCount: 1326,
}

const ARTICLE_TEMPLATE_FIELD_GROUPS = [
  {
    description: '先调画布边距和正文最大宽度，确定整体版心。',
    fields: [
      { label: '移动端上边距', path: ['page', 'mobilePaddingTop'], step: 1, type: 'number' },
      { label: '移动端左右边距', path: ['page', 'mobilePaddingX'], step: 1, type: 'number' },
      { label: '移动端下边距', path: ['page', 'mobilePaddingBottom'], step: 1, type: 'number' },
      { label: 'PC 正文最大宽度', path: ['page', 'desktopContentMaxWidth'], step: 1, type: 'number' },
      { label: 'PC 左右边距', path: ['page', 'desktopPaddingX'], step: 1, type: 'number' },
      { label: 'PC 上边距', path: ['page', 'desktopPaddingTop'], step: 1, type: 'number' },
      { label: 'PC 下边距', path: ['page', 'desktopPaddingBottom'], step: 1, type: 'number' },
    ],
    title: '页面布局',
  },
  {
    description: '文章标题和作者/类型/字数这一行单独在这里调。',
    fields: [
      { label: '标题字号', path: ['title', 'fontSize'], step: 1, type: 'number' },
      { label: '标题行高', path: ['title', 'lineHeight'], step: 0.05, type: 'number' },
      { label: '标题最大宽度', path: ['title', 'maxWidth'], step: 1, type: 'number' },
      { label: '元信息字号', path: ['meta', 'fontSize'], step: 1, type: 'number' },
      { label: '元信息上边距', path: ['meta', 'marginTop'], step: 1, type: 'number' },
      { label: '元信息间距', path: ['meta', 'gap'], step: 1, type: 'number' },
      { label: '元信息字间距', path: ['meta', 'letterSpacing'], step: 0.01, type: 'number' },
    ],
    title: '标题与元信息',
  },
  {
    description: '正文基础阅读节奏，包括大小字号、小标题和列表。',
    fields: [
      { label: '小号正文字号', path: ['fontProfiles', 'small', 'bodySize'], step: 1, type: 'number' },
      { label: '小号正文行高', path: ['fontProfiles', 'small', 'bodyLineHeight'], step: 0.05, type: 'number' },
      { label: '推荐正文字号', path: ['fontProfiles', 'medium', 'bodySize'], step: 1, type: 'number' },
      { label: '推荐正文行高', path: ['fontProfiles', 'medium', 'bodyLineHeight'], step: 0.05, type: 'number' },
      { label: '大号正文字号', path: ['fontProfiles', 'large', 'bodySize'], step: 1, type: 'number' },
      { label: '大号正文行高', path: ['fontProfiles', 'large', 'bodyLineHeight'], step: 0.05, type: 'number' },
      { label: '正文段落上边距', path: ['body', 'paragraphMarginTop'], step: 1, type: 'number' },
      { label: 'H2 字号', path: ['body', 'heading2FontSize'], step: 1, type: 'number' },
      { label: 'H2 行高', path: ['body', 'heading2LineHeight'], step: 0.05, type: 'number' },
      { label: 'H2 上边距', path: ['body', 'heading2MarginTop'], step: 1, type: 'number' },
      { label: 'H3 字号', path: ['body', 'heading3FontSize'], step: 1, type: 'number' },
      { label: 'H3 行高', path: ['body', 'heading3LineHeight'], step: 0.05, type: 'number' },
      { label: 'H3 上边距', path: ['body', 'heading3MarginTop'], step: 1, type: 'number' },
      { label: '列表上边距', path: ['body', 'listMarginTop'], step: 1, type: 'number' },
      { label: '列表缩进', path: ['body', 'listPaddingLeft'], step: 1, type: 'number' },
      { label: '列表项底部间距', path: ['body', 'listItemMarginBottom'], step: 1, type: 'number' },
      { label: '列表项内边距', path: ['body', 'listItemPaddingLeft'], step: 1, type: 'number' },
    ],
    title: '正文文字',
  },
  {
    description: '正文内短分割线、正文主体分隔线和文末分隔线，都在这里单独调。',
    fields: [
      { label: '分割线颜色', path: ['colors', 'border'], type: 'color' },
      { label: '正文短分割线粗细', path: ['body', 'hrThickness'], step: 1, type: 'number' },
      { label: '正文短分割线上下边距', path: ['body', 'hrMarginY'], step: 1, type: 'number' },
      { label: '正文主体分割线粗细', path: ['body', 'sectionDividerThickness'], step: 1, type: 'number' },
      { label: '正文主体分割线上边距', path: ['body', 'sectionDividerMarginTop'], step: 1, type: 'number' },
      { label: '正文主体分割线下内边距', path: ['body', 'sectionDividerPaddingTop'], step: 1, type: 'number' },
      { label: '文末分割线粗细', path: ['tail', 'dividerThickness'], step: 1, type: 'number' },
      { label: '文末分割线上边距', path: ['tail', 'dividerMarginTop'], step: 1, type: 'number' },
      { label: '文末分割线下内边距', path: ['tail', 'dividerPaddingTop'], step: 1, type: 'number' },
      { label: '正文图默认分割线位置', options: [
        { label: '在分割线上方', value: 'before' },
        { label: '在分割线下方', value: 'after' },
      ], path: ['bodyImage', 'dividerPlacement'], type: 'select' },
    ],
    title: '分割线',
  },
  {
    description: '正文内配图本身的宽度、圆角和上下留白。',
    fields: [
      { label: '正文图宽度 (%)', path: ['bodyImage', 'widthPercent'], step: 1, type: 'number' },
      { label: '正文图对齐', options: [
        { label: '左对齐', value: 'left' },
        { label: '居中', value: 'center' },
        { label: '右对齐', value: 'right' },
      ], path: ['bodyImage', 'align'], type: 'select' },
      { label: '正文图圆角', path: ['bodyImage', 'borderRadius'], step: 1, type: 'number' },
      { label: '正文图上边距', path: ['bodyImage', 'marginTop'], step: 1, type: 'number' },
      { label: '正文图下边距', path: ['bodyImage', 'marginBottom'], step: 1, type: 'number' },
      { label: '正文图占位高度', path: ['bodyImage', 'minHeight'], step: 1, type: 'number' },
    ],
    title: '正文图片',
  },
  {
    description: '头图、二维码和底图这三个固定素材位的尺寸与留白。',
    fields: [
      { label: '开头图上边距', path: ['heroImage', 'marginTop'], step: 1, type: 'number' },
      { label: '开头图圆角', path: ['heroImage', 'borderRadius'], step: 1, type: 'number' },
      { label: '开头图最大高度', path: ['heroImage', 'maxHeight'], step: 1, type: 'number' },
      { label: '二维码宽度', path: ['qrImage', 'width'], step: 1, type: 'number' },
      { label: '二维码上边距', path: ['qrImage', 'marginTop'], step: 1, type: 'number' },
      { label: '二维码圆角', path: ['qrImage', 'borderRadius'], step: 1, type: 'number' },
      { label: '底图上边距', path: ['footerImage', 'marginTop'], step: 1, type: 'number' },
      { label: '底图圆角', path: ['footerImage', 'borderRadius'], step: 1, type: 'number' },
      { label: '底图最大高度', path: ['footerImage', 'maxHeight'], step: 1, type: 'number' },
    ],
    title: '固定图片区',
  },
  {
    description: '引用块的边线、字号和左侧缩进。',
    fields: [
      { label: '引用上边距', path: ['body', 'blockquoteMarginTop'], step: 1, type: 'number' },
      { label: '引用边线宽度', path: ['body', 'blockquoteBorderWidth'], step: 1, type: 'number' },
      { label: '引用左内边距', path: ['body', 'blockquotePaddingLeft'], step: 1, type: 'number' },
      { label: '引用字号', path: ['body', 'blockquoteFontSize'], step: 1, type: 'number' },
      { label: '引用行高', path: ['body', 'blockquoteLineHeight'], step: 0.05, type: 'number' },
      { label: '引用文字颜色', path: ['colors', 'blockquoteText'], type: 'color' },
      { label: '引用边线颜色', path: ['colors', 'blockquoteBorder'], type: 'color' },
    ],
    title: '引用样式',
  },
  {
    description: '表格圆角、表头字号和单元格密度都在这里调。',
    fields: [
      { label: '表格上边距', path: ['body', 'tableMarginTop'], step: 1, type: 'number' },
      { label: '表格圆角', path: ['body', 'tableBorderRadius'], step: 1, type: 'number' },
      { label: '表头字号', path: ['body', 'tableHeaderFontSize'], step: 1, type: 'number' },
      { label: '表头行高', path: ['body', 'tableHeaderLineHeight'], step: 0.05, type: 'number' },
      { label: '表体字号', path: ['body', 'tableBodyFontSize'], step: 1, type: 'number' },
      { label: '表体行高', path: ['body', 'tableBodyLineHeight'], step: 0.05, type: 'number' },
      { label: '表格水平内边距', path: ['body', 'tableCellPaddingX'], step: 1, type: 'number' },
      { label: '表格垂直内边距', path: ['body', 'tableCellPaddingY'], step: 1, type: 'number' },
      { label: '表头背景色', path: ['colors', 'tableHeaderBackground'], type: 'color' },
    ],
    title: '表格样式',
  },
  {
    description: '文末引导文案单独调，不和分割线、二维码混在一起。',
    fields: [
      { label: '文末文案字号', path: ['tail', 'endingTextFontSize'], step: 1, type: 'number' },
      { label: '文末文案行高', path: ['tail', 'endingTextLineHeight'], step: 0.05, type: 'number' },
      { label: '文末文案最大宽度', path: ['tail', 'endingTextMaxWidth'], step: 1, type: 'number' },
      { label: '文末文案颜色', path: ['colors', 'endingText'], type: 'color' },
    ],
    title: '文末文案',
  },
  {
    description: '最后再统一调基础色，避免一开始颜色把结构判断搞乱。',
    fields: [
      { label: '页面背景', path: ['colors', 'pageBackground'], type: 'color' },
      { label: '正文主色', path: ['colors', 'textPrimary'], type: 'color' },
      { label: '辅助文字', path: ['colors', 'textMuted'], type: 'color' },
    ],
    title: '颜色系统',
  },
]

const TEMPLATE_IMAGE_ALIGN_OPTIONS = [
  { label: '左对齐', value: 'left' },
  { label: '居中', value: 'center' },
  { label: '右对齐', value: 'right' },
]

const ARTICLE_TEMPLATE_BODY_IMAGE_STYLE_FIELDS = [
  { control: 'slider', label: '统一圆角', path: ['bodyImage', 'borderRadius'], step: 1, type: 'number' },
  { control: 'slider', label: '统一大小 (%)', path: ['bodyImage', 'widthPercent'], step: 1, type: 'number' },
  { control: 'slider', label: '图片上边距', path: ['bodyImage', 'marginTop'], step: 1, type: 'number' },
  { control: 'slider', label: '图片下边距', path: ['bodyImage', 'marginBottom'], step: 1, type: 'number' },
  { control: 'segmented', label: '统一位置', options: TEMPLATE_IMAGE_ALIGN_OPTIONS, path: ['bodyImage', 'align'], type: 'select' },
]

const ARTICLE_TEMPLATE_FIXED_IMAGE_GROUPS = [
  {
    description: FIXED_LAYOUT_SLOT_META.heroGif.description,
    fields: [
      { control: 'slider', label: '圆角', path: ['heroImage', 'borderRadius'], step: 1, type: 'number' },
      { control: 'slider', label: '大小 (%)', path: ['heroImage', 'widthPercent'], step: 1, type: 'number' },
      { control: 'slider', label: '上边距', path: ['heroImage', 'marginTop'], step: 1, type: 'number' },
      { control: 'segmented', label: '位置', options: TEMPLATE_IMAGE_ALIGN_OPTIONS, path: ['heroImage', 'align'], type: 'select' },
      { control: 'stepper', label: '最大高度', path: ['heroImage', 'maxHeight'], step: 1, type: 'number' },
    ],
    id: 'heroGif',
    title: FIXED_LAYOUT_SLOT_META.heroGif.label,
  },
  {
    description: FIXED_LAYOUT_SLOT_META.qrImage.description,
    fields: [
      { control: 'slider', label: '圆角', path: ['qrImage', 'borderRadius'], step: 1, type: 'number' },
      { control: 'stepper', label: '大小', path: ['qrImage', 'width'], step: 1, type: 'number' },
      { control: 'slider', label: '上边距', path: ['qrImage', 'marginTop'], step: 1, type: 'number' },
      { control: 'segmented', label: '位置', options: TEMPLATE_IMAGE_ALIGN_OPTIONS, path: ['qrImage', 'align'], type: 'select' },
    ],
    id: 'qrImage',
    title: FIXED_LAYOUT_SLOT_META.qrImage.label,
  },
  {
    description: FIXED_LAYOUT_SLOT_META.footerGif.description,
    fields: [
      { control: 'slider', label: '圆角', path: ['footerImage', 'borderRadius'], step: 1, type: 'number' },
      { control: 'slider', label: '大小 (%)', path: ['footerImage', 'widthPercent'], step: 1, type: 'number' },
      { control: 'slider', label: '上边距', path: ['footerImage', 'marginTop'], step: 1, type: 'number' },
      { control: 'segmented', label: '位置', options: TEMPLATE_IMAGE_ALIGN_OPTIONS, path: ['footerImage', 'align'], type: 'select' },
      { control: 'stepper', label: '最大高度', path: ['footerImage', 'maxHeight'], step: 1, type: 'number' },
    ],
    id: 'footerGif',
    title: FIXED_LAYOUT_SLOT_META.footerGif.label,
  },
]

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
    return stripPreviewHeading(draftMarkdown)
  }

  return draftMarkdown
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

function resolveTemplatePreviewSample(sessions = []) {
  const latestSession = [...(Array.isArray(sessions) ? sessions : [])]
    .filter((session) => {
      const version = getActiveVersion(session)
      return Boolean((version?.draftMarkdown ?? '').trim())
    })
    .sort((left, right) => {
      const leftTimestamp = new Date(left?.updatedAt || left?.createdAt || 0).getTime()
      const rightTimestamp = new Date(right?.updatedAt || right?.createdAt || 0).getTime()
      return rightTimestamp - leftTimestamp
    })[0]

  if (!latestSession) {
    return ARTICLE_TEMPLATE_PREVIEW_SAMPLE
  }

  const topic = getSelectedTopic(latestSession)
  const version = getActiveVersion(latestSession)

  return {
    articleType: topic?.type || ARTICLE_TEMPLATE_PREVIEW_SAMPLE.articleType,
    bodyMarkdown: stripPreviewHeading(version?.draftMarkdown ?? '') || ARTICLE_TEMPLATE_PREVIEW_SAMPLE.bodyMarkdown,
    displayTitle:
      resolveVersionDisplayTitle(latestSession, version) || ARTICLE_TEMPLATE_PREVIEW_SAMPLE.displayTitle,
    penName: topic?.penName || ARTICLE_TEMPLATE_PREVIEW_SAMPLE.penName,
    wordCount: version?.wordCount ?? countReadableLength(version?.draftMarkdown ?? '') ?? ARTICLE_TEMPLATE_PREVIEW_SAMPLE.wordCount,
  }
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
    '> 很多关系的崩塌，不是因为一瞬间出了什么大事，而是一个人把失望忍得太久，久到连解释都懒得再说。',
    '',
    '有人总以为，真正让人离开的，是某一次争吵，是某一句狠话。可真正把心推远的，往往不是声量最大的那一下，而是无数次被忽视、被敷衍、被要求懂事的日常。',
    '',
    `这篇内容延续 ${topic.penName} 的叙述口吻，从一个具体人物进入，让读者先看见“那个人是怎么一步步寒下心来的”，再慢慢读懂：有些沉默不是不在乎，而是早就伤透了。`,
    '',
    '故事最好从一件很小的事开场。比如她深夜发来一句话，只是想确认一句“你到家了吗”，对方隔了很久才回复，语气平平，像完成任务一样。这样的细节不轰烈，却最能让读者代入，因为真实生活里的失望就是这么一点点堆起来的。',
    '',
    '接下来要把转折写清楚。不是突然决绝，而是在一次次自我劝说后，终于不想再替对方找理由。她会回想过去那些自己替别人圆回去的场面，也会意识到，原来被忽视久了，人最先失去的不是脾气，而是期待。',
    '',
    '文章中段可以加入一段更具体的动作感。比如他照例说“你别想太多”，她没有争，没有哭，只是把已经打好的长消息一个字一个字删掉。这个细节比任何指责都更有力，因为它让读者看到，一个人真正心冷时，反而会显得异常平静。',
    '',
    `在结尾部分，要把情绪从“委屈”收束到“清醒”。不是控诉谁坏，而是让读者明白：被反复忽略的人，最终离开的那一步，看起来很轻，背后却是很重的累积。${noteSummary}`.trim(),
    '',
    '所以这篇稿子的真正落点，不是教人立刻离开，而是提醒读者，任何关系里最危险的信号，从来不是争执，而是你已经越来越不想说话。',
  ].join('\n')

  const reportMarkdown = [
    '# 详细校验报告',
    '',
    '## 结论',
    '',
    `当前版本可直接进入下一节点，整体更贴近 ${topic.type} 的结构节奏，适合继续做配图与排版。`,
    '',
    '## 结构检查',
    '',
    '- 开篇：已用一句情绪钩子起势，有代入感。',
    '- 中段：有人物细节和动作转折，不是纯观点堆叠。',
    '- 结尾：回收到关系认知，情绪收束较稳。',
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
  const payload = await readJsonResponse(response, '固定内容配置接口返回异常，请刷新页面后重试。')

  if (!response.ok) {
    throw new Error(payload?.error || '读取固定内容配置失败')
  }

  return {
    ...createEmptyFixedLayoutConfig(),
    ...(payload ?? {}),
  }
}

async function requestFixedLayoutTextUpdate({ endingText = '' } = {}) {
  const response = await fetch('/api/fixed-layout-config', {
    body: JSON.stringify({ endingText }),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'PATCH',
  })
  const payload = await readJsonResponse(response, '固定文案配置接口返回异常，请稍后重试。')

  if (!response.ok) {
    throw new Error(payload?.error || '保存固定文案失败')
  }

  return {
    ...createEmptyFixedLayoutConfig(),
    ...(payload ?? {}),
  }
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

  return {
    ...createEmptyFixedLayoutConfig(),
    ...(payload ?? {}),
  }
}

async function requestFixedLayoutAssetDelete(slot) {
  const response = await fetch('/api/fixed-layout-config/asset', {
    body: JSON.stringify({ slot }),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'DELETE',
  })
  const payload = await readJsonResponse(response, '固定图片删除接口返回异常，请稍后重试。')

  if (!response.ok) {
    throw new Error(payload?.error || '删除固定图片失败')
  }

  return {
    ...createEmptyFixedLayoutConfig(),
    ...(payload ?? {}),
  }
}

async function requestArticleTemplateConfig() {
  const response = await fetch('/api/article-template-config')
  const payload = await readJsonResponse(response, '排版模板配置接口返回异常，请刷新页面后重试。')

  if (!response.ok) {
    throw new Error(payload?.error || '读取排版模板配置失败')
  }

  return normalizeArticleTemplateConfig(payload ?? createDefaultArticleTemplateConfig())
}

async function requestArticleTemplateConfigUpdate(config) {
  const response = await fetch('/api/article-template-config', {
    body: JSON.stringify(normalizeArticleTemplateConfig(config)),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'PUT',
  })
  const payload = await readJsonResponse(response, '排版模板配置写入接口返回异常，请稍后重试。')

  if (!response.ok) {
    throw new Error(payload?.error || '保存排版模板配置失败')
  }

  return normalizeArticleTemplateConfig(payload ?? createDefaultArticleTemplateConfig())
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
      setErrorMessage(error.message || '读取固定内容配置失败')
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
          setErrorMessage(error.message || '读取固定内容配置失败')
          setConfig(createEmptyFixedLayoutConfig())
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    loadConfig()

    return () => {
      cancelled = true
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

function useArticleTemplateConfigState() {
  const [config, setConfig] = useState(() => createDefaultArticleTemplateConfig())
  const [errorMessage, setErrorMessage] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  async function reloadConfig() {
    setIsLoading(true)

    try {
      const nextConfig = await requestArticleTemplateConfig()
      setConfig(nextConfig)
      setErrorMessage('')
      return nextConfig
    } catch (error) {
      setErrorMessage(error.message || '读取排版模板配置失败')
      setConfig(createDefaultArticleTemplateConfig())
      return createDefaultArticleTemplateConfig()
    } finally {
      setIsLoading(false)
    }
  }

  async function saveConfig(nextConfig) {
    const normalizedConfig = normalizeArticleTemplateConfig(nextConfig)
    const savedConfig = await requestArticleTemplateConfigUpdate(normalizedConfig)

    setConfig(savedConfig)
    setErrorMessage('')
    return savedConfig
  }

  useEffect(() => {
    let cancelled = false

    async function loadConfig() {
      setIsLoading(true)

      try {
        const nextConfig = await requestArticleTemplateConfig()

        if (!cancelled) {
          setConfig(nextConfig)
          setErrorMessage('')
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error.message || '读取排版模板配置失败')
          setConfig(createDefaultArticleTemplateConfig())
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    loadConfig()

    return () => {
      cancelled = true
    }
  }, [])

  return {
    config,
    errorMessage,
    isLoading,
    reloadConfig,
    saveConfig,
    setConfig,
    setErrorMessage,
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

function useRenderablePreviewSlots(session, version, templateConfig) {
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
        templateConfig,
        versionId: version?.id ?? '',
      }),
    [imageSelection, liveAssetMap, templateConfig, version?.id],
  )
}

function buildTemplateMatchSections(previewSections, templateConfig) {
  const normalizedTemplateConfig = normalizeArticleTemplateConfig(templateConfig)

  return normalizedTemplateConfig.bodyImageSlots.map((slot, index) => {
    const matchedSection =
      previewSections.find((section) => section.order === slot.sectionOrder) ??
      previewSections[Math.min(index, Math.max(previewSections.length - 1, 0))] ??
      previewSections[previewSections.length - 1] ??
      buildPreviewSections('', { fillTrailingSections: true })[index]

    return {
      ...matchedSection,
      order: index + 1,
      positionLabel: `第 ${slot.sectionOrder} 段后`,
      sectionOrder: slot.sectionOrder,
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

function PreviewWorkbench({ onSetDevice, onSetFontSize, session, templateConfig }) {
  const { device, fontSize } = session.layoutReview
  const [copyStatus, setCopyStatus] = useState('idle')
  const topic = getSelectedTopic(session)
  const version = getActiveVersion(session)
  const { config: fixedLayoutConfig } = useFixedLayoutConfigState()
  const previewSlots = useRenderablePreviewSlots(session, version, templateConfig)
  const bodyMarkdown = stripPreviewHeading(version?.draftMarkdown ?? '')
  const displayTitle = resolveVersionDisplayTitle(session, version)
  const previewRenderResult = useMemo(
    () =>
      renderArticlePreviewDocument({
        articleType: topic?.type || '',
        bodyMarkdown,
        device,
        displayTitle,
        fixedLayoutConfig,
        fontSize,
        imageSlots: previewSlots,
        origin: typeof window === 'undefined' ? '' : window.location.origin,
        penName: topic?.penName || '',
        templateConfig,
        wordCount: version?.wordCount ?? 0,
      }),
    [bodyMarkdown, device, displayTitle, fixedLayoutConfig, fontSize, previewSlots, templateConfig, topic?.penName, topic?.type, version?.wordCount],
  )

  async function handleCopyWechat() {
    if (!previewRenderResult.bodyHtml) {
      return
    }

    try {
      await copyHtmlToClipboard(previewRenderResult.bodyHtml, previewRenderResult.plainText)
      setCopyStatus('copied')
      window.setTimeout(() => {
        setCopyStatus('idle')
      }, 2000)
    } catch {
      setCopyStatus('error')
      window.setTimeout(() => {
        setCopyStatus('idle')
      }, 2000)
    }
  }

  return (
    <div className="benchmark-scroll-hidden h-full min-h-0 overflow-y-auto px-6 py-6">
      <div className="mx-auto flex w-full max-w-[980px] flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-1">
          <div className="flex flex-wrap gap-2">
            <div className="inline-flex rounded-full bg-secondary/70 p-1">
              {[
                { id: 'mobile', label: '移动端', icon: Smartphone },
                { id: 'desktop', label: 'PC端', icon: Monitor },
              ].map((item) => (
                <button
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full px-3 py-2 text-[12px] transition-colors',
                    device === item.id ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground',
                  )}
                  key={item.id}
                  onClick={() => onSetDevice(item.id)}
                  type="button"
                >
                  <item.icon size={13} />
                  {item.label}
                </button>
              ))}
            </div>

            <div className="inline-flex rounded-full bg-secondary/70 p-1">
              {[
                { id: 'small', label: '小' },
                { id: 'medium', label: '推荐' },
                { id: 'large', label: '大' },
              ].map((item) => (
                <button
                  className={cn(
                    'rounded-full px-3 py-2 text-[12px] transition-colors',
                    fontSize === item.id ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground',
                  )}
                  key={item.id}
                  onClick={() => onSetFontSize(item.id)}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button className="rounded-full" onClick={handleCopyWechat} size="sm" type="button" variant="outline">
              {copyStatus === 'copied' ? (
                <>
                  <Check size={13} className="mr-1.5" />
                  已复制
                </>
              ) : copyStatus === 'error' ? (
                <>
                  <X size={13} className="mr-1.5" />
                  复制失败
                </>
              ) : (
                <>
                  <Copy size={13} className="mr-1.5" />
                  复制微信样式
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="rounded-[22px] border border-border/70 bg-white px-5 py-4 shadow-[0_10px_28px_rgba(15,23,42,0.04)]">
          <div className="text-[11px] tracking-[0.08em] text-muted-foreground">文章标题</div>
          <div className="mt-2 text-[18px] font-semibold leading-[1.55] text-foreground">{displayTitle || '未命名标题'}</div>
          <div className="mt-2 text-[12px] leading-6 text-muted-foreground">
            标题单独展示在预览壳层里，不会进入右侧文章画布，也不会进入复制出来的微信内容。
          </div>
        </div>

        <div className="flex justify-center">
          <div className={cn('transition-all', device === 'mobile' ? 'w-[430px] max-w-full' : 'w-full max-w-[860px]')}>
            <div
              className={cn(
                device === 'mobile'
                  ? 'border border-[#ececf2] bg-white shadow-[0_8px_24px_rgba(18,20,38,0.08)]'
                  : '',
              )}
            >
              <ArticlePreviewFrame documentHtml={previewRenderResult.documentHtml} />
            </div>
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
  onSelectVersion,
  onSetDevice,
  onSetFontSize,
  session,
  templateConfig,
  tabs,
}) {
  const activeVersion = getActiveVersion(session)
  const [isFullscreen, setIsFullscreen] = useState(false)

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
        return <PreviewWorkbench onSetDevice={onSetDevice} onSetFontSize={onSetFontSize} session={session} templateConfig={templateConfig} />
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

function ArticlePreviewDrawer({ onClose, open, session, templateConfig }) {
  const availableTabs = session?.stageId === 'completed' ? ['draft', 'preview'] : ['draft']
  const [activeTab, setActiveTab] = useState(availableTabs[0] ?? 'draft')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [previewLayout, setPreviewLayout] = useState({
    device: session?.layoutReview?.device ?? 'mobile',
    fontSize: session?.layoutReview?.fontSize ?? 'medium',
  })

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
    setPreviewLayout({
      device: session.layoutReview?.device ?? 'mobile',
      fontSize: session.layoutReview?.fontSize ?? 'medium',
    })
  }, [session])

  if (!open || !session || typeof document === 'undefined') {
    return null
  }

  const activeVersion = getActiveVersion(session)
  const selectedTopic = getSelectedTopic(session)
  const displayTitle = resolveVersionDisplayTitle(session, activeVersion)
  const previewSession = {
    ...session,
    layoutReview: {
      ...session.layoutReview,
      device: previewLayout.device,
      fontSize: previewLayout.fontSize,
    },
  }

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
                onSetDevice={(device) =>
                  setPreviewLayout((current) => ({
                    ...current,
                    device,
                  }))
                }
                onSetFontSize={(fontSize) =>
                  setPreviewLayout((current) => ({
                    ...current,
                    fontSize,
                  }))
                }
                session={previewSession}
                templateConfig={templateConfig}
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
        {asset.path ? (
          <img
            alt={asset.label}
            className="max-h-full max-w-[calc(100vw-140px)] rounded-[18px] object-contain"
            src={asset.path}
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

function FixedLayoutAssetRow({ asset, deletingSlot, onDelete, onPreview, onUpload, slot, uploadingSlot }) {
  const fileInputRef = useRef(null)
  const slotMeta = FIXED_LAYOUT_SLOT_META[slot]
  const isUploading = uploadingSlot === slot
  const isDeleting = deletingSlot === slot

  async function handleFileChange(event) {
    const nextFile = event.target.files?.[0]

    if (nextFile) {
      await onUpload(slot, nextFile)
    }

    event.target.value = ''
  }

  return (
    <div className="flex flex-col gap-4 border-t border-border/70 px-2 py-5 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 items-center gap-4">
        <button
          className="group relative inline-flex h-[88px] w-[132px] shrink-0 items-center justify-center overflow-hidden rounded-[18px] border border-border/70 bg-secondary/25"
          disabled={!asset?.path}
          onClick={() => asset?.path && onPreview({ label: slotMeta.label, path: asset.path })}
          type="button"
        >
          {asset?.path ? (
            <img
              alt={slotMeta.label}
              className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
              src={asset.path}
            />
          ) : (
            <div className="px-4 text-center text-[12px] leading-5 text-muted-foreground">当前未上传</div>
          )}
        </button>

        <div className="min-w-0">
          <div className="text-[16px] font-medium text-foreground">{slotMeta.label}</div>
          <div className="mt-1 text-[13px] leading-6 text-muted-foreground">{slotMeta.description}</div>
          <div className="mt-2 text-[12px] text-muted-foreground">
            {asset?.filename ? (
              <>
                <span className="block truncate">{asset.filename}</span>
                <span className="mt-1 inline-flex rounded-full border border-border/70 px-2.5 py-1">
                  上传于 {formatLibraryAssetDate(asset.uploadedAt)}
                </span>
              </>
            ) : (
              '支持 gif、png、jpg、jpeg、webp'
            )}
          </div>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <input
          accept={FIXED_LAYOUT_FILE_ACCEPT}
          className="hidden"
          onChange={handleFileChange}
          ref={fileInputRef}
          type="file"
        />
        <Button
          className="rounded-full"
          disabled={isUploading || isDeleting}
          onClick={() => fileInputRef.current?.click()}
          size="sm"
          type="button"
          variant="outline"
        >
          {isUploading ? <LoaderCircle className="animate-spin" size={14} /> : <Paperclip size={14} />}
          {asset?.path ? '替换图片' : '上传图片'}
        </Button>
        {asset?.path ? (
          <Button
            className="rounded-full"
            disabled={isUploading || isDeleting}
            onClick={() => onDelete(slot, slotMeta.label)}
            size="sm"
            type="button"
            variant="outline"
          >
            {isDeleting ? <LoaderCircle className="animate-spin" size={14} /> : <Trash2 size={14} />}
            删除
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function FixedLayoutTextRow({ onSave, saving, value }) {
  const [draft, setDraft] = useState(value?.content ?? '')

  useEffect(() => {
    setDraft(value?.content ?? '')
  }, [value?.content])

  const isDirty = normalizeFixedLayoutTextContent(draft) !== normalizeFixedLayoutTextContent(value?.content ?? '')

  return (
    <div className="border-t border-border/70 px-2 py-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 lg:max-w-[320px]">
          <div className="text-[16px] font-medium text-foreground">{FIXED_LAYOUT_SLOT_META.endingText.label}</div>
          <div className="mt-1 text-[13px] leading-6 text-muted-foreground">{FIXED_LAYOUT_SLOT_META.endingText.description}</div>
          <div className="mt-2 text-[12px] text-muted-foreground">建议控制在 {FIXED_LAYOUT_ENDING_TEXT_MAX_LENGTH} 字以内。</div>
        </div>

        <div className="w-full max-w-[720px]">
          <Textarea
            className="min-h-[124px] resize-none rounded-[22px] border border-border/70 bg-white px-4 py-3 text-[14px] leading-7 shadow-none focus-visible:ring-0"
            maxLength={FIXED_LAYOUT_ENDING_TEXT_MAX_LENGTH}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="这里填写正文结束后的固定引导文案。"
            value={draft}
          />

          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="text-[12px] text-muted-foreground">
              {draft.length}/{FIXED_LAYOUT_ENDING_TEXT_MAX_LENGTH}
            </div>
            <Button className="rounded-full" disabled={saving || !isDirty} onClick={() => onSave(draft)} size="sm" type="button">
              {saving ? <LoaderCircle className="animate-spin" size={14} /> : <Check size={14} />}
              保存文案
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function FixedLayoutConfigCanvas() {
  const { config, errorMessage, isLoading, setConfig, setErrorMessage } = useFixedLayoutConfigState()
  const [savingText, setSavingText] = useState(false)
  const [uploadingSlot, setUploadingSlot] = useState('')
  const [deletingSlot, setDeletingSlot] = useState('')
  const [previewAsset, setPreviewAsset] = useState(null)
  const slotCount = FIXED_LAYOUT_SLOT_ORDER.length

  async function handleSaveEndingText(content) {
    setSavingText(true)
    setErrorMessage('')

    try {
      const nextConfig = await requestFixedLayoutTextUpdate({
        endingText: content,
      })
      setConfig(nextConfig)
    } catch (error) {
      setErrorMessage(error.message || '保存固定文案失败')
    } finally {
      setSavingText(false)
    }
  }

  async function handleUpload(slot, file) {
    setUploadingSlot(slot)
    setErrorMessage('')

    try {
      const nextConfig = await requestFixedLayoutAssetUpload({
        file,
        slot,
      })
      setConfig(nextConfig)
    } catch (error) {
      setErrorMessage(error.message || '上传固定图片失败')
    } finally {
      setUploadingSlot('')
    }
  }

  async function handleDelete(slot, label) {
    const confirmed = window.confirm(`确认清空“${label}”吗？对应图片文件也会从项目里移除。`)

    if (!confirmed) {
      return
    }

    setDeletingSlot(slot)
    setErrorMessage('')

    try {
      const nextConfig = await requestFixedLayoutAssetDelete(slot)
      setConfig(nextConfig)
    } catch (error) {
      setErrorMessage(error.message || '删除固定图片失败')
    } finally {
      setDeletingSlot('')
    }
  }

  return (
    <div className="benchmark-scroll-hidden min-h-0 flex-1 overflow-y-auto bg-white">
      <div className="mx-auto w-full max-w-[1320px] px-4 py-8 sm:px-5 lg:px-6">
        <div className="mb-8">
          <h1 className="text-[30px] font-semibold tracking-[-0.03em] text-foreground sm:text-[34px]">图片配置</h1>
          <div className="mt-4 inline-flex rounded-full bg-secondary px-3 py-1.5 text-[12px] text-muted-foreground">
            共 {slotCount} 个固定槽位
          </div>
        </div>

        {errorMessage ? (
          <div className="mb-5 rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-[13px] leading-6 text-red-700">
            {errorMessage}
          </div>
        ) : null}

        <section>
          <div className="mb-3 text-[12px] font-medium tracking-[0.08em] text-muted-foreground">固定内容配置</div>

          {isLoading ? (
            <div className="border-t border-border/70 py-16 text-center text-[14px] text-muted-foreground">
              <div className="inline-flex items-center gap-2">
                <LoaderCircle className="animate-spin" size={16} />
                正在读取固定内容配置
              </div>
            </div>
          ) : (
            <div className="border-t border-border/70">
              {FIXED_LAYOUT_SLOT_ORDER.map((slot) =>
                FIXED_LAYOUT_IMAGE_SLOT_IDS.includes(slot) ? (
                  <FixedLayoutAssetRow
                    asset={config?.[slot]}
                    deletingSlot={deletingSlot}
                    key={slot}
                    onDelete={handleDelete}
                    onPreview={setPreviewAsset}
                    onUpload={handleUpload}
                    slot={slot}
                    uploadingSlot={uploadingSlot}
                  />
                ) : (
                  <FixedLayoutTextRow
                    key={slot}
                    onSave={handleSaveEndingText}
                    saving={savingText}
                    value={config?.[slot]}
                  />
                ),
              )}
            </div>
          )}
        </section>
      </div>

      <FixedLayoutImageLightbox asset={previewAsset} onClose={() => setPreviewAsset(null)} />
    </div>
  )
}

function getValueAtPath(source, path) {
  return path.reduce((current, key) => (current == null ? undefined : current[key]), source)
}

function setValueAtPath(source, path, nextValue) {
  if (path.length === 0) {
    return nextValue
  }

  const [currentKey, ...restPath] = path

  if (Array.isArray(source)) {
    const nextArray = source.slice()
    nextArray[currentKey] = setValueAtPath(source[currentKey], restPath, nextValue)
    return nextArray
  }

  return {
    ...(source && typeof source === 'object' ? source : {}),
    [currentKey]: restPath.length > 0 ? setValueAtPath(source?.[currentKey], restPath, nextValue) : nextValue,
  }
}

function normalizeImageFocusedTemplateConfig(config) {
  const normalizedConfig = normalizeArticleTemplateConfig(config)

  return normalizeArticleTemplateConfig({
    ...normalizedConfig,
    body: {
      ...normalizedConfig.body,
      hrThickness: 0,
      sectionDividerThickness: 0,
    },
    bodyImageSlots: normalizedConfig.bodyImageSlots.map((slot) => ({
      ...slot,
      dividerMode: 'none',
    })),
    tail: {
      ...normalizedConfig.tail,
      dividerThickness: 0,
    },
  })
}

function formatTemplateFieldValue(value, step = 1) {
  const numericValue = Number(value)

  if (!Number.isFinite(numericValue)) {
    return '--'
  }

  const decimals = step < 1 ? String(step).split('.')[1]?.length ?? 2 : 0
  return numericValue.toFixed(decimals).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1')
}

function getTemplateNumberFieldRange(field, value) {
  const pathKey = Array.isArray(field.path) ? field.path.join('.') : ''
  const normalizedKey = pathKey.toLowerCase()
  const step = field.step ?? 1
  const numericValue = Number(value)

  if (typeof field.min === 'number' || typeof field.max === 'number') {
    return {
      max: typeof field.max === 'number' ? field.max : Math.max(Number.isFinite(numericValue) ? numericValue : 0, 100),
      min: typeof field.min === 'number' ? field.min : 0,
      step,
    }
  }

  if (normalizedKey.includes('lineheight')) {
    return { min: 1, max: 3.2, step }
  }

  if (normalizedKey.includes('letterspacing')) {
    return { min: 0, max: 0.4, step }
  }

  if (normalizedKey.includes('widthpercent')) {
    return { min: 20, max: 100, step }
  }

  if (normalizedKey.includes('thickness') || normalizedKey.includes('borderwidth')) {
    return { min: 0, max: 12, step }
  }

  if (normalizedKey.includes('fontsize') || normalizedKey.endsWith('bodysize')) {
    return { min: 10, max: 48, step }
  }

  if (normalizedKey.includes('radius')) {
    return { min: 0, max: 48, step }
  }

  if (normalizedKey.includes('desktopcontentmaxwidth') || normalizedKey.includes('endingtextmaxwidth') || normalizedKey.endsWith('title.maxwidth')) {
    return { min: 120, max: 1200, step }
  }

  if (normalizedKey === 'qrimage.width') {
    return { min: 80, max: 640, step }
  }

  if (normalizedKey.includes('maxheight')) {
    return { min: 80, max: 800, step }
  }

  if (normalizedKey.includes('padding') || normalizedKey.includes('margin')) {
    return { min: 0, max: 240, step }
  }

  if (normalizedKey.includes('listpaddingleft') || normalizedKey.includes('listitempaddingleft') || normalizedKey.includes('blockquotepaddingleft')) {
    return { min: 0, max: 120, step }
  }

  if (normalizedKey.includes('tablecellpadding')) {
    return { min: 0, max: 48, step }
  }

  if (normalizedKey.includes('minheight')) {
    return { min: 80, max: 560, step }
  }

  return {
    min: 0,
    max: step < 1 ? 4 : Math.max(Number.isFinite(numericValue) ? Math.ceil(numericValue / step) * step : 0, 160),
    step,
  }
}

function getTemplateFieldControl(field) {
  if (field.control) {
    return field.control
  }

  if (field.type === 'color') {
    return 'color'
  }

  if (field.type === 'select') {
    return Array.isArray(field.options) && field.options.length <= 3 ? 'segmented' : 'select'
  }

  if (field.type !== 'number') {
    return 'input'
  }

  const pathKey = Array.isArray(field.path) ? field.path.join('.').toLowerCase() : ''

  if (
    pathKey.includes('thickness') ||
    pathKey.includes('borderwidth') ||
    pathKey.includes('maxwidth') ||
    pathKey.includes('maxheight') ||
    pathKey.includes('minheight') ||
    pathKey === 'qrimage.width'
  ) {
    return 'stepper'
  }

  if (
    pathKey.includes('fontsize') ||
    pathKey.endsWith('bodysize') ||
    pathKey.includes('lineheight') ||
    pathKey.includes('margin') ||
    pathKey.includes('padding') ||
    pathKey.includes('gap') ||
    pathKey.includes('radius') ||
    pathKey.includes('widthpercent') ||
    pathKey.includes('letterspacing')
  ) {
    return 'slider'
  }

  return 'stepper'
}

function clampTemplateFieldNumber(field, rawValue, fallbackValue = 0) {
  const { min, max, step } = getTemplateNumberFieldRange(field, rawValue)
  const parsedValue = Number(rawValue)

  if (!Number.isFinite(parsedValue)) {
    return fallbackValue
  }

  const normalizedValue = Math.min(Math.max(parsedValue, min), max)

  if (!Number.isFinite(step) || step <= 0) {
    return normalizedValue
  }

  const decimals = step < 1 ? String(step).split('.')[1]?.length ?? 2 : 0
  const alignedValue = min + Math.round((normalizedValue - min) / step) * step

  return Number(alignedValue.toFixed(decimals))
}

function TemplateFieldInput({ field, value, onChange }) {
  const baseClassName =
    'h-10 w-full border border-[#d8d9e2] bg-white px-3 text-[12px] text-[#1a1b24] outline-none transition-colors focus:border-[#4285f4] font-mono'
  const control = getTemplateFieldControl(field)
  const numberFieldRange = field.type === 'number' ? getTemplateNumberFieldRange(field, value) : null
  const displayValue =
    field.type === 'number'
      ? formatTemplateFieldValue(value, numberFieldRange?.step ?? field.step ?? 1)
      : value

  return (
    <label className="block border border-[#d8d9e2] bg-white p-3">
      <div className="flex items-center justify-between gap-3 text-[12px]">
        <span className="text-[#5a5d6d]">{field.label}</span>
        {field.type === 'number' ? (
          <span className="shrink-0 rounded-full bg-[#eef3ff] px-2 py-0.5 font-mono text-[11px] text-[#2c5fd5]">
            {displayValue}
          </span>
        ) : null}
      </div>
      <div className="mt-2">
        {field.type === 'select' && control === 'segmented' ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {field.options.map((option) => {
              const isActive = value === option.value

              return (
                <button
                  className={cn(
                    'h-10 border px-3 text-[12px] transition-colors',
                    isActive
                      ? 'border-[#4285f4] bg-[#4285f4] text-white'
                      : 'border-[#d8d9e2] bg-white text-[#1a1b24] hover:border-[#4285f4]/45',
                  )}
                  key={option.value}
                  onClick={() => onChange(option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              )
            })}
          </div>
        ) : field.type === 'select' ? (
          <select className={baseClassName} onChange={(event) => onChange(event.target.value)} value={value}>
            {field.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        ) : field.type === 'color' ? (
          <div className="grid grid-cols-[64px_1fr] items-center gap-2">
            <input className="h-10 w-full border border-[#d8d9e2] bg-white p-1.5" onChange={(event) => onChange(event.target.value)} type="color" value={value} />
            <div className="h-10 border border-[#d8d9e2] bg-white px-3 font-mono text-[12px] leading-[38px] text-[#1a1b24]">
              {String(value).toUpperCase()}
            </div>
          </div>
        ) : control === 'slider' ? (
          <div className="space-y-2">
            <input
              className="h-2 w-full cursor-pointer accent-[#4285f4]"
              max={numberFieldRange?.max}
              min={numberFieldRange?.min}
              onChange={(event) => {
                onChange(clampTemplateFieldNumber(field, event.target.value, numberFieldRange?.min ?? 0))
              }}
              step={numberFieldRange?.step ?? field.step ?? 1}
              type="range"
              value={Number.isFinite(Number(value)) ? Number(value) : numberFieldRange?.min ?? 0}
            />
            <div className="flex items-center justify-between text-[10px] text-[#8b8ea1]">
              <span>{formatTemplateFieldValue(numberFieldRange?.min, numberFieldRange?.step ?? field.step ?? 1)}</span>
              <span>{formatTemplateFieldValue(numberFieldRange?.max, numberFieldRange?.step ?? field.step ?? 1)}</span>
            </div>
          </div>
        ) : control === 'stepper' ? (
          <div className="grid grid-cols-[40px_1fr_40px] items-center gap-2">
            <button
              className="h-10 border border-[#d8d9e2] bg-white text-[16px] text-[#1a1b24] transition-colors hover:border-[#4285f4]/45"
              onClick={() =>
                onChange(
                  clampTemplateFieldNumber(
                    field,
                    Number(value) - (numberFieldRange?.step ?? field.step ?? 1),
                    numberFieldRange?.min ?? 0,
                  ),
                )
              }
              type="button"
            >
              -
            </button>
            <input
              className={baseClassName}
              max={numberFieldRange?.max}
              min={numberFieldRange?.min}
              onChange={(event) => {
                const nextValue = Number.parseFloat(event.target.value)
                onChange(Number.isFinite(nextValue) ? clampTemplateFieldNumber(field, nextValue, 0) : 0)
              }}
              step={numberFieldRange?.step ?? field.step ?? 1}
              type="number"
              value={value}
            />
            <button
              className="h-10 border border-[#d8d9e2] bg-white text-[16px] text-[#1a1b24] transition-colors hover:border-[#4285f4]/45"
              onClick={() =>
                onChange(
                  clampTemplateFieldNumber(
                    field,
                    Number(value) + (numberFieldRange?.step ?? field.step ?? 1),
                    numberFieldRange?.min ?? 0,
                  ),
                )
              }
              type="button"
            >
              +
            </button>
          </div>
        ) : (
          <input
            className={baseClassName}
            onChange={(event) => {
              const nextValue = Number.parseFloat(event.target.value)
              onChange(Number.isFinite(nextValue) ? nextValue : 0)
            }}
            step={field.step ?? 1}
            type="number"
            value={value}
          />
        )}
      </div>
    </label>
  )
}

function TemplateBodyImageOrderEditor({ onMoveDown, onMoveUp, slots }) {
  return (
    <section>
      <div className="text-[12px] text-[#5a5d6d]">
        这里不是调样式，而是调 3 张正文图的出场顺序。上下箭头只负责换顺序。
      </div>
      <div className="mt-3 grid gap-3">
        {slots.map((slot, index) => (
          <div className="grid grid-cols-[1fr_auto] gap-3 border border-[#d8d9e2] bg-white p-3" key={slot.slotId || `template-body-slot-${index + 1}`}>
            <div>
              <div className="text-[12px] font-medium text-[#1a1b24]">正文第 {index + 1} 张图</div>
              <div className="mt-1 text-[11px] leading-[1.55] text-[#5a5d6d]">
                预览里写着“这里是正文第 {index + 1} 张图”的占位块，对应的就是它。
              </div>
              <div className="mt-2 inline-flex border border-[#d8d9e2] bg-[#f8f9fb] px-2 py-1 text-[11px] text-[#1a1b24]">
                当前排在第 {slot.sectionOrder} 个正文位置
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <button
                className="flex h-10 w-10 items-center justify-center border border-[#d8d9e2] bg-white text-[#1a1b24] transition-colors hover:border-[#4285f4]/45 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={index === 0}
                onClick={() => onMoveUp(index)}
                type="button"
              >
                <ArrowUp size={16} />
              </button>
              <button
                className="flex h-10 w-10 items-center justify-center border border-[#d8d9e2] bg-white text-[#1a1b24] transition-colors hover:border-[#4285f4]/45 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={index === slots.length - 1}
                onClick={() => onMoveDown(index)}
                type="button"
              >
                <ArrowDown size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function ArticleTemplateModuleCanvas({ previewSample, templateConfigState }) {
  const { config: savedConfig, errorMessage, isLoading, saveConfig, setErrorMessage } = templateConfigState
  const { config: fixedLayoutConfig } = useFixedLayoutConfigState()
  const [draftConfig, setDraftConfig] = useState(() => normalizeImageFocusedTemplateConfig(savedConfig))
  const [feedbackMessage, setFeedbackMessage] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)
  const [previewDevice, setPreviewDevice] = useState('mobile')
  const [previewFontSize, setPreviewFontSize] = useState('medium')

  useEffect(() => {
    setDraftConfig(normalizeImageFocusedTemplateConfig(savedConfig))
  }, [savedConfig])

  useEffect(() => {
    if (!feedbackMessage) {
      return undefined
    }

    const timerId = window.setTimeout(() => {
      setFeedbackMessage('')
    }, 2200)

    return () => {
      window.clearTimeout(timerId)
    }
  }, [feedbackMessage])

  const normalizedDraftConfig = useMemo(() => normalizeImageFocusedTemplateConfig(draftConfig), [draftConfig])
  const hasUnsavedChanges =
    createArticleTemplateConfigSignature(normalizedDraftConfig) !== createArticleTemplateConfigSignature(savedConfig)
  const previewRenderResult = useMemo(
    () =>
      renderArticlePreviewDocument({
        articleType: previewSample.articleType,
        bodyMarkdown: previewSample.bodyMarkdown,
        device: previewDevice === 'mobile' ? 'mobile' : 'desktop',
        displayTitle: previewSample.displayTitle,
        fixedLayoutConfig,
        fontSize: previewFontSize,
        imageSlots: createTemplatePreviewPlaceholderSlots(normalizedDraftConfig),
        origin: typeof window === 'undefined' ? '' : window.location.origin,
        penName: previewSample.penName,
        previewMode: 'template-editor',
        templateConfig: normalizedDraftConfig,
        wordCount: previewSample.wordCount,
      }),
    [fixedLayoutConfig, normalizedDraftConfig, previewDevice, previewFontSize, previewSample],
  )

  const statusMeta = useMemo(() => {
    if (errorMessage) {
      return {
        boxClassName: 'border-[#f0c4c4] text-[#8f2f2f]',
        dotClassName: 'bg-[#d14a4a]',
        text: errorMessage,
      }
    }

    if (hasUnsavedChanges) {
      return {
        boxClassName: 'border-[#f2d7bd] text-[#8f5c1f]',
        dotClassName: 'bg-[#f0883e]',
        text: '当前有未保存改动，正式排版还没有同步',
      }
    }

    if (feedbackMessage) {
      return {
        boxClassName: 'border-[#bde3d8] text-[#0f6d56]',
        dotClassName: 'bg-[#10a37f]',
        text: feedbackMessage,
      }
    }

    return {
      boxClassName: 'border-[#cfe5dc] text-[#0f6d56]',
      dotClassName: 'bg-[#10a37f]',
      text: '模板已同步，当前规则已用于正式排版与微信复制',
    }
  }, [errorMessage, feedbackMessage, hasUnsavedChanges])

  function handleFieldChange(path, nextValue) {
    setDraftConfig((current) => normalizeImageFocusedTemplateConfig(setValueAtPath(current, path, nextValue)))
  }

  function handleSectionOrderChange(slotIndex, nextSectionOrder) {
    setDraftConfig((current) => {
      const normalizedCurrent = normalizeImageFocusedTemplateConfig(current)
      const nextSlots = normalizedCurrent.bodyImageSlots.map((slot) => ({ ...slot }))
      const currentOrder = nextSlots[slotIndex]?.sectionOrder ?? slotIndex + 1
      const swapIndex = nextSlots.findIndex((slot, index) => index !== slotIndex && slot.sectionOrder === nextSectionOrder)

      if (swapIndex !== -1) {
        nextSlots[swapIndex] = {
          ...nextSlots[swapIndex],
          sectionOrder: currentOrder,
        }
      }

      nextSlots[slotIndex] = {
        ...nextSlots[slotIndex],
        sectionOrder: nextSectionOrder,
      }

      return normalizeImageFocusedTemplateConfig({
        ...normalizedCurrent,
        bodyImageSlots: nextSlots,
      })
    })
  }

  function handleMoveBodyImageUp(slotIndex) {
    const currentOrder = normalizedDraftConfig.bodyImageSlots[slotIndex]?.sectionOrder ?? slotIndex + 1
    if (currentOrder <= 1) {
      return
    }
    handleSectionOrderChange(slotIndex, currentOrder - 1)
  }

  function handleMoveBodyImageDown(slotIndex) {
    const currentOrder = normalizedDraftConfig.bodyImageSlots[slotIndex]?.sectionOrder ?? slotIndex + 1
    if (currentOrder >= 3) {
      return
    }
    handleSectionOrderChange(slotIndex, currentOrder + 1)
  }

  async function handleSaveTemplate() {
    setIsSaving(true)
    setErrorMessage('')

    try {
      const nextConfig = await saveConfig(normalizedDraftConfig)
      setDraftConfig(nextConfig)
      setFeedbackMessage('模板已保存，正式排版会直接使用这套规则。')
    } catch (saveError) {
      setErrorMessage(saveError.message || '保存排版模板失败')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleRestoreDefaults() {
    const confirmed = window.confirm('确认恢复排版模板默认值吗？恢复后会立即覆盖当前正式模板。')

    if (!confirmed) {
      return
    }

    setIsRestoring(true)
    setErrorMessage('')

    try {
      const nextConfig = await saveConfig(normalizeImageFocusedTemplateConfig(createDefaultArticleTemplateConfig()))
      setDraftConfig(nextConfig)
      setFeedbackMessage('已恢复默认模板。')
    } catch (restoreError) {
      setErrorMessage(restoreError.message || '恢复默认模板失败')
    } finally {
      setIsRestoring(false)
    }
  }

  return (
    <div className="benchmark-scroll-hidden min-h-0 flex-1 overflow-y-auto bg-[#f4f5f7] text-[#1a1b24]">
      <div className="mx-auto w-full max-w-[1280px] px-5 py-6">
        <div className="mb-4 flex flex-col gap-3 border-b border-[#d8d9e2] pb-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h1 className="m-0 text-[22px] tracking-[0.04em] text-[#1a1b24]">排版模板工作台</h1>
            <div className="mt-1 text-[12px] text-[#5a5d6d]">
              直接复用 Doocs 转换台的工作台结构来调模板。这里调的是整套模板，不是单篇文章。
            </div>
          </div>

          <div className={cn('flex items-center gap-2 border bg-white px-3 py-2 text-[12px]', statusMeta.boxClassName)}>
            <span className={cn('h-2 w-2 shrink-0', statusMeta.dotClassName)} />
            <span>{statusMeta.text}</span>
          </div>
        </div>

        <div className="grid gap-[14px] xl:grid-cols-[minmax(0,1.08fr)_380px]">
          <section className="border border-[#d8d9e2] bg-white p-[14px]">
            <div className="mb-[10px] flex flex-wrap items-center justify-between gap-[10px]">
              <div>
                <div className="text-[12px] tracking-[0.04em] text-[#5a5d6d]">预览</div>
                <div className="mt-1 text-[11px] leading-[1.5] text-[#5a5d6d]">
                  当前优先使用最近一篇真实生成稿来预览；正文 3 个图片占位会明确写对应的第 1 / 2 / 3 张图。
                </div>
                <div className="mt-3 rounded-[14px] border border-[#d8d9e2] bg-[#fafbfc] px-3 py-2">
                  <div className="text-[10px] tracking-[0.08em] text-[#5a5d6d]">当前预览标题</div>
                  <div className="mt-1 text-[14px] font-medium leading-[1.7] text-[#1a1b24]">
                    {previewSample.displayTitle || '未命名标题'}
                  </div>
                  <div className="mt-1 text-[11px] leading-[1.5] text-[#5a5d6d]">
                    标题只在这里单独看，不会进入右侧文章画布。
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex border border-[#d8d9e2] bg-white">
                  {[
                    { id: 'mobile', label: '移动端' },
                    { id: 'pc', label: 'PC' },
                  ].map((item) => (
                    <button
                      className={cn(
                        'border-r border-[#d8d9e2] px-[10px] py-[7px] text-[12px]',
                        item.id === previewDevice ? 'bg-[#4285f4] text-white' : 'bg-white text-[#5a5d6d]',
                        item.id === 'pc' && 'border-r-0',
                      )}
                      key={item.id}
                      onClick={() => setPreviewDevice(item.id)}
                      type="button"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <div className="inline-flex border border-[#d8d9e2] bg-white">
                  {[
                    { id: 'small', label: '小' },
                    { id: 'medium', label: '推荐' },
                    { id: 'large', label: '大' },
                  ].map((item) => (
                    <button
                      className={cn(
                        'border-r border-[#d8d9e2] px-[10px] py-[7px] text-[12px]',
                        previewFontSize === item.id ? 'bg-[#4285f4] text-white' : 'bg-white text-[#5a5d6d]',
                        item.id === 'large' && 'border-r-0',
                      )}
                      key={item.id}
                      onClick={() => setPreviewFontSize(item.id)}
                      type="button"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="relative flex items-start justify-center border border-[#d8d9e2] bg-white p-[14px]">
              {previewDevice === 'pc' ? (
                <div className="w-full max-w-[820px] bg-white">
                  <ArticlePreviewFrame documentHtml={previewRenderResult.documentHtml} title="排版模板预览-PC" />
                </div>
              ) : (
                <div className="w-[430px] max-w-full border border-[#ececf2] bg-white shadow-[0_8px_24px_rgba(18,20,38,0.08)]">
                  <ArticlePreviewFrame documentHtml={previewRenderResult.documentHtml} title="排版模板预览-移动端" />
                </div>
              )}
            </div>
          </section>

          <aside className="space-y-3">
            <section className="border border-[#d8d9e2] bg-white p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[12px] font-medium text-[#1a1b24]">配置</div>
                  <div className="mt-1 text-[11px] leading-[1.5] text-[#5a5d6d]">
                    这里只保留图片相关配置。名称和 `图片配置` 模块保持一一对应。
                  </div>
                </div>
                <div className="text-[11px] text-[#5a5d6d]">配置存储：`.local-data/article-template-config.json`</div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <Button className="h-10 rounded-none bg-[#4285f4] text-white hover:bg-[#3777dd]" disabled={isLoading || isSaving || !hasUnsavedChanges} onClick={handleSaveTemplate} type="button">
                  {isSaving ? <LoaderCircle className="animate-spin" size={14} /> : <Check size={14} />}
                  保存模板
                </Button>
                <Button className="h-10 rounded-none border-[#d8d9e2] bg-white text-[#1a1b24] hover:bg-[#f8f9fb]" disabled={isRestoring || isSaving} onClick={handleRestoreDefaults} type="button" variant="outline">
                  {isRestoring ? <LoaderCircle className="animate-spin" size={14} /> : null}
                  恢复默认
                </Button>
              </div>
            </section>

            <section className="border border-[#d8d9e2] bg-white p-3">
              <div className="mb-3">
                <div className="text-[12px] font-medium text-[#1a1b24]">正文配图顺序</div>
                <div className="mt-1 text-[11px] leading-[1.5] text-[#5a5d6d]">
                  默认没有分割线。这里只用上下箭头调 3 张正文图的顺序，不再放别的冗余选项。
                </div>
              </div>
              <TemplateBodyImageOrderEditor
                onMoveDown={handleMoveBodyImageDown}
                onMoveUp={handleMoveBodyImageUp}
                slots={normalizedDraftConfig.bodyImageSlots}
              />
            </section>

            <section className="border border-[#d8d9e2] bg-white p-3">
              <div className="mb-3">
                <div className="text-[12px] font-medium text-[#1a1b24]">正文三张图通用样式</div>
                <div className="mt-1 text-[11px] leading-[1.5] text-[#5a5d6d]">
                  这组参数同时作用在正文第 1 / 2 / 3 张图上，核心就是圆角、大小和位置。
                </div>
              </div>
              <div className="grid gap-3">
                {ARTICLE_TEMPLATE_BODY_IMAGE_STYLE_FIELDS.map((field) => (
                  <TemplateFieldInput
                    field={field}
                    key={field.path.join('.')}
                    onChange={(nextValue) => handleFieldChange(field.path, nextValue)}
                    value={getValueAtPath(normalizedDraftConfig, field.path)}
                  />
                ))}
              </div>
            </section>

            {ARTICLE_TEMPLATE_FIXED_IMAGE_GROUPS.map((group) => (
              <section className="border border-[#d8d9e2] bg-white p-3" key={group.id}>
                <div className="mb-3">
                  <div className="text-[12px] font-medium text-[#1a1b24]">{group.title}</div>
                  <div className="mt-1 text-[11px] leading-[1.5] text-[#5a5d6d]">{group.description}</div>
                </div>
                <div className="grid gap-3">
                  {group.fields.map((field) => (
                    <TemplateFieldInput
                      field={field}
                      key={field.path.join('.')}
                      onChange={(nextValue) => handleFieldChange(field.path, nextValue)}
                      value={getValueAtPath(normalizedDraftConfig, field.path)}
                    />
                  ))}
                </div>
              </section>
            ))}

            <section className="border border-[#d8d9e2] bg-white p-3">
              <div className="text-[12px] font-medium text-[#1a1b24]">{FIXED_LAYOUT_SLOT_META.endingText.label}</div>
              <div className="mt-2 text-[11px] leading-[1.6] text-[#5a5d6d]">
                文末这里仍用模拟文案展示节奏，但正文主体已经切到最近一篇真实生成稿。当前先把图片大小、圆角和位置调顺。
              </div>
            </section>
          </aside>
        </div>
      </div>
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
  const [rightPaneWidth, setRightPaneWidth] = useState(620)
  const articleTemplateConfigState = useArticleTemplateConfigState()

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
  const templatePreviewSample = useMemo(() => resolveTemplatePreviewSample(sessions), [sessions])

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
  const articleTemplateConfig = articleTemplateConfigState.config
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

  function updateCurrentSession(updater) {
    if (!currentSessionId) {
      return
    }

    updateSession(currentSessionId, updater)
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

    const previewSections = buildPreviewSections(stripPreviewHeading(currentVersion.draftMarkdown ?? ''))
    const matchSections = buildTemplateMatchSections(previewSections, articleTemplateConfig)

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
                templateConfig: articleTemplateConfig,
                versionId: nextVersion.id,
              })
            : current.imageSelection

        return {
          activeWorkbenchTab: 'preview',
          imageSelection: nextImageSelection,
          messages: updateMessageById(current.messages, messageId, (message) => ({
            content: appendMessageParagraph(
              message.content,
              '极简排版预览已经准备好了。右侧可以切换 PC、移动端和字号，确认后这轮内容创作就完成了。',
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
      summary: '文字稿确认完成，系统正在整理极简排版预览。',
      steps: [
        { label: '整理标题、正文和段落层级', seconds: 5, tabId: 'draft' },
        { label: '生成 PC 端排版预览', seconds: 6, tabId: 'preview' },
        { label: '生成移动端排版预览', seconds: 6, tabId: 'preview' },
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
        { label: '确认正文层级与段落间距', seconds: 4, tabId: 'preview' },
        { label: '写入最终字号与设备偏好', seconds: 4, tabId: 'preview' },
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
              ) : activeModule === 'layout-template' ? (
                <ArticleTemplateModuleCanvas previewSample={templatePreviewSample} templateConfigState={articleTemplateConfigState} />
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
                onOpenTab={handleSelectWorkbenchTab}
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
                onSetDevice={(device) =>
                  updateCurrentSession((current) => ({
                    ...current,
                    layoutReview: {
                      ...current.layoutReview,
                      device,
                    },
                  }))
                }
                onSetFontSize={(fontSize) =>
                  updateCurrentSession((current) => ({
                    ...current,
                    layoutReview: {
                      ...current.layoutReview,
                      fontSize,
                    },
                  }))
                }
                session={activeSession}
                templateConfig={articleTemplateConfig}
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
        open={activeModule === 'articles' && Boolean(activeArticleSession)}
        session={activeArticleSession}
        templateConfig={articleTemplateConfig}
      />
    </section>
  )
}
