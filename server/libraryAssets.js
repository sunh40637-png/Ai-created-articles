import path from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { chatWithLlm } from './llm/index.js'
import { resolveActiveLlmProfile } from './runtimeConfig.js'
import {
  clampLibraryAssetScene,
  DEFAULT_LIBRARY_ASSET_SORT,
  isValidLibraryAssetEmotion,
  isValidLibraryAssetFigures,
  isValidLibraryAssetSort,
  isValidLibraryAssetTopic,
} from '../shared/libraryAssets.js'

export const LIBRARY_ASSETS_DIR = path.resolve(process.cwd(), 'public/assets/image-library')
export const LIBRARY_ASSETS_INDEX_PATH = path.join(LIBRARY_ASSETS_DIR, 'index.json')
const REQUIRED_MATCHED_ASSET_COUNT = 3
const ASSET_MATCH_ASSISTANT_NAME = '素材配图助手'
const SECTION_TEXT_LIMIT = 520
const EMOTION_KEYWORDS = {
  温情陪伴: ['陪伴', '搀扶', '照顾', '牵手', '并肩', '共读', '老伴', '祖孙', '母子', '父母', '家人', '守护', '温暖'],
  独处沉思: ['独处', '沉默', '清醒', '回望', '反思', '想明白', '醒悟', '克制', '独坐', '独行', '心静', '放下'],
  传道授业: ['教诲', '提醒', '点拨', '指路', '带着', '师长', '长者', '讲道理', '劝告', '开导'],
  离别远行: ['离开', '告别', '远行', '转身', '目送', '送别', '走散', '分别', '归途'],
  自然意境: ['山', '风', '月', '雨', '雾', '树', '水', '远山', '江边', '桥', '云', '自然', '清晨'],
  生活日常: ['日常', '饭桌', '厨房', '院子', '家里', '过日子', '缝衣', '喝茶', '做饭', '灯下'],
}
const FIGURES_KEYWORDS = {
  双人互动: ['两个人', '两口子', '夫妻', '伴侣', '母子', '父子', '父母', '长者和晚辈', '两人', '对方', '彼此', '并肩', '搀扶'],
  独处人物: ['一个人', '独自', '自己', '独处', '独坐', '独行', '一个人想', '独自面对'],
  群体场景: ['一家人', '众人', '三个人', '几个人', '大家', '一起', '围坐', '多人', '孩子们'],
  纯风景: ['山色', '远山', '院景', '江边', '风景', '自然', '晨雾', '晚霞', '桥边', '亭台', '原野'],
}
const TOPIC_KEYWORDS = {
  做人处世: ['做人', '处世', '关系', '脾气', '分寸', '边界', '体面', '尊重', '清醒', '相处'],
  家庭关系: ['家庭', '家里', '家人', '母子', '父母', '夫妻', '亲人', '孩子', '老人', '亲情'],
  晚年自处: ['晚年', '老了', '退休', '年纪大了', '余生', '到了一定年纪', '老伴', '暮年'],
  孝道父母: ['孝顺', '父母', '老人', '照顾', '陪伴', '尽孝', '搀扶', '养老'],
  健康生命: ['身体', '健康', '生病', '养生', '寿命', '生命', '气血', '作息'],
  通用: [],
}

function normalizePlainText(value = '') {
  return String(value)
    .replace(/\s+/g, '')
    .trim()
}

function limitText(value = '', maxLength = SECTION_TEXT_LIMIT) {
  const normalized = String(value || '').trim()

  if (normalized.length <= maxLength) {
    return normalized
  }

  return `${normalized.slice(0, maxLength)}...`
}

function createLibraryAssetError(message, status = 400) {
  const error = new Error(message)
  error.status = status
  return error
}

function normalizeLibraryAssetRecord(asset, index = 0) {
  const fallbackId = `img_${String(index + 1).padStart(3, '0')}`
  const normalizedPath = typeof asset?.path === 'string' ? asset.path.trim() : ''
  const scene = clampLibraryAssetScene(asset?.scene ?? '')

  return {
    id: typeof asset?.id === 'string' && asset.id.trim() ? asset.id.trim() : fallbackId,
    filename: typeof asset?.filename === 'string' ? asset.filename.trim() : '',
    path: normalizedPath.startsWith('/assets/image-library/') ? normalizedPath : '',
    emotion: isValidLibraryAssetEmotion(asset?.emotion) ? asset.emotion : '生活日常',
    topic: isValidLibraryAssetTopic(asset?.topic) ? asset.topic : '通用',
    figures: isValidLibraryAssetFigures(asset?.figures) ? asset.figures : '独处人物',
    scene: scene || '未命名场景',
    usedCount: Number.isFinite(Number(asset?.usedCount)) ? Math.max(0, Number(asset.usedCount)) : 0,
    lastUsedAt: typeof asset?.lastUsedAt === 'string' && asset.lastUsedAt.trim() ? asset.lastUsedAt.trim() : null,
    createdAt: typeof asset?.createdAt === 'string' && asset.createdAt.trim() ? asset.createdAt.trim() : new Date().toISOString(),
  }
}

function sortLibraryAssets(assets, sort = DEFAULT_LIBRARY_ASSET_SORT) {
  const sortValue = isValidLibraryAssetSort(sort) ? sort : DEFAULT_LIBRARY_ASSET_SORT
  const items = [...assets]

  switch (sortValue) {
    case 'createdAtAsc':
      return items.sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)))
    case 'usedCountAsc':
      return items.sort((left, right) => left.usedCount - right.usedCount || String(right.createdAt).localeCompare(String(left.createdAt)))
    case 'usedCountDesc':
      return items.sort((left, right) => right.usedCount - left.usedCount || String(right.createdAt).localeCompare(String(left.createdAt)))
    case 'createdAtDesc':
    default:
      return items.sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
  }
}

function filterLibraryAssets(assets, filters = {}) {
  return assets.filter((asset) => {
    if (filters.emotion && asset.emotion !== filters.emotion) {
      return false
    }

    if (filters.topic && asset.topic !== filters.topic) {
      return false
    }

    if (filters.figures && asset.figures !== filters.figures) {
      return false
    }

    return true
  })
}

function compareLibraryAssetPriority(left, right) {
  if (left.usedCount !== right.usedCount) {
    return left.usedCount - right.usedCount
  }

  if (!left.lastUsedAt && right.lastUsedAt) {
    return -1
  }

  if (left.lastUsedAt && !right.lastUsedAt) {
    return 1
  }

  if (left.lastUsedAt && right.lastUsedAt) {
    const lastUsedComparison = String(left.lastUsedAt).localeCompare(String(right.lastUsedAt))

    if (lastUsedComparison !== 0) {
      return lastUsedComparison
    }
  }

  const createdAtComparison = String(left.createdAt).localeCompare(String(right.createdAt))

  if (createdAtComparison !== 0) {
    return createdAtComparison
  }

  return String(left.id).localeCompare(String(right.id))
}

function dedupeById(assets = []) {
  const seen = new Set()
  const uniqueAssets = []

  for (const asset of assets) {
    if (!asset?.id || seen.has(asset.id)) {
      continue
    }

    seen.add(asset.id)
    uniqueAssets.push(asset)
  }

  return uniqueAssets
}

function buildLibraryAssetSlots(referenceAssets = []) {
  return referenceAssets.slice(0, REQUIRED_MATCHED_ASSET_COUNT).map((asset, index) => ({
    assetId: asset.id,
    order: index + 1,
    paragraphIndex: index,
    positionLabel: `第 ${index + 1} 段后`,
    slotId: `slot_${index + 1}`,
    status: 'matched',
  }))
}

function stripCodeFence(content = '') {
  const trimmed = String(content || '').trim()
  const matched = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return matched ? matched[1].trim() : trimmed
}

function extractJsonObject(content = '') {
  const normalized = stripCodeFence(content)

  try {
    return JSON.parse(normalized)
  } catch {
    const start = normalized.indexOf('{')
    const end = normalized.lastIndexOf('}')

    if (start === -1 || end === -1 || end <= start) {
      return null
    }

    try {
      return JSON.parse(normalized.slice(start, end + 1))
    } catch {
      return null
    }
  }
}

function scoreKeywordMatches(text = '', keywordGroups = []) {
  const normalizedText = normalizePlainText(text)

  return keywordGroups.reduce((score, keyword) => {
    const normalizedKeyword = normalizePlainText(keyword)

    if (!normalizedKeyword) {
      return score
    }

    return normalizedText.includes(normalizedKeyword) ? score + Math.max(4, normalizedKeyword.length * 3) : score
  }, 0)
}

function scoreSceneAgainstSection(sectionText = '', scene = '') {
  const normalizedSectionText = normalizePlainText(sectionText)
  const normalizedScene = normalizePlainText(scene)

  if (!normalizedSectionText || !normalizedScene) {
    return 0
  }

  let score = 0

  if (normalizedSectionText.includes(normalizedScene)) {
    score += normalizedScene.length * 8
  }

  for (let index = 0; index < normalizedScene.length - 1; index += 1) {
    const pair = normalizedScene.slice(index, index + 2)

    if (pair.length === 2 && normalizedSectionText.includes(pair)) {
      score += 12
    }
  }

  const uniqueCharacters = Array.from(new Set(normalizedScene.split(''))).filter((char) => /[\u4e00-\u9fff]/.test(char))

  uniqueCharacters.forEach((char) => {
    if (normalizedSectionText.includes(char)) {
      score += 3
    }
  })

  return score
}

function scoreAssetForSection(asset, section, articleTopic = '') {
  const sectionText = `${section?.title ?? ''}\n${section?.text ?? ''}`
  let score = 0

  score += scoreSceneAgainstSection(sectionText, asset.scene) * 4
  score += scoreKeywordMatches(sectionText, EMOTION_KEYWORDS[asset.emotion] ?? []) * 2
  score += scoreKeywordMatches(sectionText, FIGURES_KEYWORDS[asset.figures] ?? [])
  score += scoreKeywordMatches(sectionText, TOPIC_KEYWORDS[asset.topic] ?? []) * 0.7

  if (articleTopic && asset.topic === articleTopic) {
    score += 6
  } else if (asset.topic === '通用') {
    score += 2
  }

  score += Math.max(0, 12 - asset.usedCount * 2)

  if (!asset.lastUsedAt) {
    score += 4
  }

  return score
}

function buildHeuristicAssignments(candidates = [], sections = [], articleTopic = '') {
  const usedIds = new Set()
  const usedScenes = new Set()
  const assignments = []
  const usedFigures = new Set()

  sections.forEach((section, sectionIndex) => {
    const rankedCandidates = [...candidates]
      .filter((candidate) => !usedIds.has(candidate.id) && !usedScenes.has(candidate.scene))
      .map((candidate) => ({
        assetId: candidate.id,
        figures: candidate.figures,
        scene: candidate.scene,
        score: scoreAssetForSection(candidate, section, articleTopic),
      }))
      .sort((left, right) => right.score - left.score || String(left.assetId).localeCompare(String(right.assetId)))

    if (rankedCandidates.length === 0) {
      return
    }

    let selected = rankedCandidates[0]

    if (sectionIndex < 2 && usedFigures.size > 0 && usedFigures.has(selected.figures)) {
      const alternative = rankedCandidates.find((candidate) => !usedFigures.has(candidate.figures))

      if (alternative && alternative.score >= selected.score - 18) {
        selected = alternative
      }
    }

    assignments.push({
      assetId: selected.assetId,
      reason: 'heuristic',
      sectionOrder: section.order,
    })
    usedIds.add(selected.assetId)
    usedScenes.add(selected.scene)
    usedFigures.add(selected.figures)
  })

  return assignments
}

function normalizeAiAssignments(parsed) {
  const assignments = Array.isArray(parsed?.assignments) ? parsed.assignments : []

  return assignments
    .map((assignment) => ({
      assetId: typeof assignment?.assetId === 'string' ? assignment.assetId.trim() : '',
      reason: typeof assignment?.reason === 'string' ? assignment.reason.trim() : '',
      sectionOrder: Number.isFinite(Number(assignment?.sectionOrder)) ? Number(assignment.sectionOrder) : null,
    }))
    .filter((assignment) => assignment.assetId && assignment.sectionOrder != null)
}

async function requestAiAssetAssignments({ articleTopic = '', sections = [], sortedAssets = [] }) {
  const { apiKey, model } = resolveActiveLlmProfile()

  if (!apiKey) {
    return []
  }

  const result = await chatWithLlm({
    apiKey,
    assistantName: ASSET_MATCH_ASSISTANT_NAME,
    model,
    responseFormat: 'json_object',
    systemPrompt: [
      '你是一个公众号文章配图助手，只负责为每个正文段落选择最匹配的素材图片。',
      '选择优先级必须是：1.scene 画面描述；2.emotion 情绪；3.figures 人物构成；4.topic 母题只做弱约束。',
      '不要按母题强行先筛图，不要为了 topic 牺牲段落画面匹配。',
      '必须从给定素材列表中选择，不能编造素材 id，不能重复使用同一素材。',
      '三张图必须尽量覆盖至少两种不同的 figures，且 scene 不能完全相同。',
      '如果某一段最适合纯风景或自然意境图片，可以优先选择纯风景；不要机械追求有人物。',
      '你的最终回复必须是 JSON，且只输出 JSON，不要添加解释。',
      'JSON 格式：{"assignments":[{"sectionOrder":1,"assetId":"img_001","reason":"一句简短理由"}]}',
    ].join('\n'),
    temperature: 0.15,
    thinkingType: 'disabled',
    timeoutMs: 120000,
    messages: [
      {
        role: 'user',
        content: [
          '请为下面 3 个正文段落各选 1 张最匹配的素材图。',
          `文章母题：${articleTopic || '未提供'}`,
          '',
          '正文段落：',
          ...sections.map(
            (section) =>
              `- 段落 ${section.order}：${limitText(`${section.title ? `${section.title}\n` : ''}${section.text || ''}`)}`,
          ),
          '',
          '可选素材：',
          ...sortedAssets.map(
            (asset) =>
              `- ${asset.id} | scene=${asset.scene} | emotion=${asset.emotion} | figures=${asset.figures} | topic=${asset.topic}`,
          ),
        ].join('\n'),
      },
    ],
  })

  const rawContent = result?.choices?.[0]?.message?.content ?? ''
  const parsed = extractJsonObject(rawContent)
  return normalizeAiAssignments(parsed)
}

function finalizeAssignments({ assignments = [], candidates = [], sections = [] }) {
  const assetMap = new Map(candidates.map((candidate) => [candidate.id, candidate]))
  const usedIds = new Set()
  const usedScenes = new Set()
  const usedFigures = new Set()
  const finalized = []

  for (const section of sections) {
    const matchedAssignment = assignments.find((assignment) => assignment.sectionOrder === section.order)
    const asset = matchedAssignment?.assetId ? assetMap.get(matchedAssignment.assetId) ?? null : null

    if (!asset || usedIds.has(asset.id) || usedScenes.has(asset.scene)) {
      return []
    }

    finalized.push({
      ...section,
      asset,
    })
    usedIds.add(asset.id)
    usedScenes.add(asset.scene)
    usedFigures.add(asset.figures)
  }

  if (finalized.length !== REQUIRED_MATCHED_ASSET_COUNT || usedFigures.size < 2) {
    return []
  }

  return finalized
}

function ensureAssetDiversity(candidates = []) {
  if (candidates.length < REQUIRED_MATCHED_ASSET_COUNT) {
    return []
  }

  const firstPass = []
  const usedIds = new Set()
  const usedScenes = new Set()
  const usedFigures = new Set()

  for (const candidate of candidates) {
    if (firstPass.length >= REQUIRED_MATCHED_ASSET_COUNT) {
      break
    }

    if (!candidate?.id || usedIds.has(candidate.id) || usedScenes.has(candidate.scene)) {
      continue
    }

    if (firstPass.length < 2 && usedFigures.has(candidate.figures)) {
      continue
    }

    firstPass.push(candidate)
    usedIds.add(candidate.id)
    usedScenes.add(candidate.scene)
    usedFigures.add(candidate.figures)
  }

  if (firstPass.length < REQUIRED_MATCHED_ASSET_COUNT) {
    for (const candidate of candidates) {
      if (firstPass.length >= REQUIRED_MATCHED_ASSET_COUNT) {
        break
      }

      if (!candidate?.id || usedIds.has(candidate.id) || usedScenes.has(candidate.scene)) {
        continue
      }

      firstPass.push(candidate)
      usedIds.add(candidate.id)
      usedScenes.add(candidate.scene)
      usedFigures.add(candidate.figures)
    }
  }

  if (firstPass.length < REQUIRED_MATCHED_ASSET_COUNT || usedFigures.size < 2) {
    return []
  }

  return firstPass
}

export async function ensureLibraryAssetsDir() {
  await mkdir(LIBRARY_ASSETS_DIR, { recursive: true })
}

export async function readLibraryAssetsIndex() {
  await ensureLibraryAssetsDir()

  try {
    const raw = await readFile(LIBRARY_ASSETS_INDEX_PATH, 'utf8')
    const parsed = JSON.parse(raw)
    const assets = Array.isArray(parsed) ? parsed : []
    return assets.map((asset, index) => normalizeLibraryAssetRecord(asset, index))
  } catch (error) {
    if (error.code === 'ENOENT') {
      return []
    }

    throw error
  }
}

export async function writeLibraryAssetsIndex(assets = []) {
  await ensureLibraryAssetsDir()

  const normalizedAssets = (Array.isArray(assets) ? assets : []).map((asset, index) => normalizeLibraryAssetRecord(asset, index))
  await writeFile(LIBRARY_ASSETS_INDEX_PATH, `${JSON.stringify(normalizedAssets, null, 2)}\n`, 'utf8')
  return normalizedAssets
}

export async function listLibraryAssets(options = {}) {
  const assets = await readLibraryAssetsIndex()
  const filtered = filterLibraryAssets(assets, options)
  return sortLibraryAssets(filtered, options.sort)
}

export async function matchLibraryAssetsForArticle({ topic = '', type = '', wordCount = 0, sections = [] } = {}) {
  const assets = await readLibraryAssetsIndex()

  if (assets.length < REQUIRED_MATCHED_ASSET_COUNT) {
    throw createLibraryAssetError('素材库可用图片不足 3 张，暂时无法生成排版配图。', 400)
  }

  const sortedAssets = [...assets].sort(compareLibraryAssetPriority)
  const normalizedSections = (Array.isArray(sections) ? sections : [])
    .map((section, index) => ({
      order: Number.isFinite(Number(section?.order)) ? Number(section.order) : index + 1,
      text: limitText(section?.text || ''),
      title: typeof section?.title === 'string' ? section.title.trim() : '',
    }))
    .slice(0, REQUIRED_MATCHED_ASSET_COUNT)

  if (normalizedSections.length < REQUIRED_MATCHED_ASSET_COUNT) {
    throw createLibraryAssetError('正文结构不足以完成自动配图，请先确认文字稿结构。', 400)
  }

  const candidatePool = dedupeById(sortedAssets)
  let assignments = []

  try {
    assignments = await requestAiAssetAssignments({
      articleTopic: topic,
      sections: normalizedSections,
      sortedAssets: candidatePool,
    })
  } catch {
    assignments = []
  }

  let finalized = finalizeAssignments({
    assignments,
    candidates: candidatePool,
    sections: normalizedSections,
  })

  if (finalized.length === 0) {
    finalized = finalizeAssignments({
      assignments: buildHeuristicAssignments(candidatePool, normalizedSections, topic),
      candidates: candidatePool,
      sections: normalizedSections,
    })
  }

  if (finalized.length === 0) {
    throw createLibraryAssetError('素材库无法匹配出 3 张满足规则的配图，请补充更多不同场景的素材。', 400)
  }

  const referenceAssets = finalized.map((item) => item.asset)

  return {
    referenceAssets,
    slots: finalized.map((item, index) => ({
      assetId: item.asset.id,
      order: index + 1,
      paragraphIndex: index,
      positionLabel: `第 ${index + 1} 段后`,
      sectionOrder: index + 1,
      slotId: `slot_${index + 1}`,
      status: 'matched',
    })),
    summary: {
      matchedFromAllLibrary: referenceAssets.some((asset) => asset.topic !== topic && asset.topic !== '通用'),
      topic,
      type,
      wordCount,
    },
  }
}

export async function recordLibraryAssetUsage({ assetIds = [], usedAt = new Date().toISOString() } = {}) {
  const normalizedAssetIds = Array.from(
    new Set(
      (Array.isArray(assetIds) ? assetIds : [])
        .map((assetId) => (typeof assetId === 'string' ? assetId.trim() : ''))
        .filter(Boolean),
    ),
  )

  if (normalizedAssetIds.length === 0) {
    return { updatedIds: [] }
  }

  const assets = await readLibraryAssetsIndex()
  const updatedIds = []
  let hasChanges = false
  const nextAssets = assets.map((asset) => {
    if (!normalizedAssetIds.includes(asset.id)) {
      return asset
    }

    hasChanges = true
    updatedIds.push(asset.id)
    return {
      ...asset,
      lastUsedAt: usedAt,
      usedCount: asset.usedCount + 1,
    }
  })

  if (!hasChanges) {
    return { updatedIds: [] }
  }

  await writeLibraryAssetsIndex(nextAssets)
  return { updatedIds }
}

export async function updateLibraryAsset(assetId, patch = {}) {
  if (!assetId) {
    throw createLibraryAssetError('缺少素材 id')
  }

  const assets = await readLibraryAssetsIndex()
  const targetIndex = assets.findIndex((asset) => asset.id === assetId)

  if (targetIndex === -1) {
    throw createLibraryAssetError('素材不存在', 404)
  }

  if (!isValidLibraryAssetEmotion(patch.emotion)) {
    throw createLibraryAssetError('emotion 标签无效')
  }

  if (!isValidLibraryAssetTopic(patch.topic)) {
    throw createLibraryAssetError('topic 标签无效')
  }

  if (!isValidLibraryAssetFigures(patch.figures)) {
    throw createLibraryAssetError('figures 标签无效')
  }

  const nextScene = clampLibraryAssetScene(patch.scene ?? '')

  if (!nextScene) {
    throw createLibraryAssetError('scene 不能为空')
  }

  assets[targetIndex] = {
    ...assets[targetIndex],
    emotion: patch.emotion,
    figures: patch.figures,
    scene: nextScene,
    topic: patch.topic,
  }

  const nextAssets = await writeLibraryAssetsIndex(assets)
  return nextAssets[targetIndex]
}

export async function deleteLibraryAsset(assetId) {
  if (!assetId) {
    throw createLibraryAssetError('缺少素材 id')
  }

  const assets = await readLibraryAssetsIndex()
  const nextAssets = assets.filter((asset) => asset.id !== assetId)

  if (nextAssets.length === assets.length) {
    throw createLibraryAssetError('素材不存在', 404)
  }

  await writeLibraryAssetsIndex(nextAssets)
  return { id: assetId, removed: true }
}
