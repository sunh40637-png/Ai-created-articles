export const LIBRARY_ASSET_EMOTIONS = [
  '温情陪伴',
  '独处沉思',
  '传道授业',
  '离别远行',
  '自然意境',
  '生活日常',
]

export const LIBRARY_ASSET_TOPICS = [
  '做人处世',
  '家庭关系',
  '晚年自处',
  '孝道父母',
  '健康生命',
  '通用',
]

export const LIBRARY_ASSET_FIGURES = [
  '双人互动',
  '独处人物',
  '群体场景',
  '纯风景',
]

export const LIBRARY_ASSET_SORT_OPTIONS = [
  { value: 'createdAtDesc', label: '最新入库' },
  { value: 'createdAtAsc', label: '最早入库' },
  { value: 'usedCountAsc', label: '使用最少' },
  { value: 'usedCountDesc', label: '使用最多' },
]

export const DEFAULT_LIBRARY_ASSET_SORT = 'createdAtDesc'
export const LIBRARY_ASSET_SCENE_MAX_LENGTH = 10

export function isValidLibraryAssetEmotion(value) {
  return LIBRARY_ASSET_EMOTIONS.includes(value)
}

export function isValidLibraryAssetTopic(value) {
  return LIBRARY_ASSET_TOPICS.includes(value)
}

export function isValidLibraryAssetFigures(value) {
  return LIBRARY_ASSET_FIGURES.includes(value)
}

export function clampLibraryAssetScene(value = '') {
  return Array.from(String(value).trim())
    .slice(0, LIBRARY_ASSET_SCENE_MAX_LENGTH)
    .join('')
}

export function isValidLibraryAssetSort(value) {
  return LIBRARY_ASSET_SORT_OPTIONS.some((option) => option.value === value)
}
