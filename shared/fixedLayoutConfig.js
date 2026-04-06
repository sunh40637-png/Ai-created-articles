export const FIXED_LAYOUT_IMAGE_SLOT_IDS = ['heroGif', 'guideFollow', 'sectionAvatar', 'qrImage', 'footerGif']
export const FIXED_LAYOUT_SPACING_PRESETS = [
  { id: 'none', label: '无' },
  { id: 'small', label: '小' },
  { id: 'medium', label: '中' },
  { id: 'large', label: '大' },
]
export const FIXED_LAYOUT_QR_WIDTH_PX = 200
export const FIXED_LAYOUT_DEFAULT_METRICS = {
  endingGuideGapPx: 16,
  endingMetaGapPx: 12,
  endingSymbolGapPx: 72,
  firstSectionTopGapPx: 72,
  guideFollowMarkerGapPx: 12,
  guideFollowToBodyGapPx: 72,
  qrGuideGapPx: 4,
  qrSectionTopGapPx: 8,
  sectionAvatarToTitleGapPx: 28,
  sectionAvatarToOrderGapPx: 16,
  sectionImageBottomGapPx: 72,
  sectionOrderToTitleGapPx: 14,
  sectionTitleBlockBottomGapPx: 20,
}

export const FIXED_LAYOUT_SLOT_META = {
  heroGif: {
    accent: '#dbeafe',
    description: '固定图片区块。',
    label: '开头动图',
    type: 'image',
  },
  guideFollow: {
    accent: '#dcfce7',
    description: '固定图片区块。',
    label: '引导关注图',
    type: 'image',
  },
  sectionAvatar: {
    accent: '#e4f0dc',
    description: '会重复显示在 3 个正文标题上方。',
    label: '段落头像',
    type: 'image',
  },
  qrImage: {
    accent: '#ede9fe',
    description: '固定图片区块，二维码宽度固定为 200px。',
    label: '二维码图片',
    type: 'image',
  },
  footerGif: {
    accent: '#fee2e2',
    description: '固定图片区块。',
    label: '底部动图',
    type: 'image',
  },
}

export const FIXED_LAYOUT_ALLOWED_MIME_TYPES = ['image/gif', 'image/png', 'image/jpeg']
export const FIXED_LAYOUT_FILE_ACCEPT = '.gif,.png,.jpg,.jpeg'

export function normalizeFixedLayoutSpacingPreset(value) {
  return FIXED_LAYOUT_SPACING_PRESETS.some((preset) => preset.id === value) ? value : 'medium'
}

export function normalizeFixedLayoutQrWidthPx(value) {
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : FIXED_LAYOUT_QR_WIDTH_PX
}

export function normalizeFixedLayoutMetricPx(value, fallback) {
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback
}

export function normalizeFixedLayoutMetrics(value) {
  const source = value && typeof value === 'object' ? value : {}

  return {
    endingGuideGapPx: normalizeFixedLayoutMetricPx(source.endingGuideGapPx, FIXED_LAYOUT_DEFAULT_METRICS.endingGuideGapPx),
    endingMetaGapPx: normalizeFixedLayoutMetricPx(source.endingMetaGapPx, FIXED_LAYOUT_DEFAULT_METRICS.endingMetaGapPx),
    endingSymbolGapPx: normalizeFixedLayoutMetricPx(source.endingSymbolGapPx, FIXED_LAYOUT_DEFAULT_METRICS.endingSymbolGapPx),
    firstSectionTopGapPx: normalizeFixedLayoutMetricPx(source.firstSectionTopGapPx, FIXED_LAYOUT_DEFAULT_METRICS.firstSectionTopGapPx),
    guideFollowMarkerGapPx: normalizeFixedLayoutMetricPx(source.guideFollowMarkerGapPx, FIXED_LAYOUT_DEFAULT_METRICS.guideFollowMarkerGapPx),
    guideFollowToBodyGapPx: normalizeFixedLayoutMetricPx(source.guideFollowToBodyGapPx, FIXED_LAYOUT_DEFAULT_METRICS.guideFollowToBodyGapPx),
    qrGuideGapPx: normalizeFixedLayoutMetricPx(source.qrGuideGapPx, FIXED_LAYOUT_DEFAULT_METRICS.qrGuideGapPx),
    qrSectionTopGapPx: normalizeFixedLayoutMetricPx(source.qrSectionTopGapPx, FIXED_LAYOUT_DEFAULT_METRICS.qrSectionTopGapPx),
    sectionAvatarToTitleGapPx: normalizeFixedLayoutMetricPx(
      source.sectionAvatarToTitleGapPx,
      FIXED_LAYOUT_DEFAULT_METRICS.sectionAvatarToTitleGapPx,
    ),
    sectionAvatarToOrderGapPx: normalizeFixedLayoutMetricPx(source.sectionAvatarToOrderGapPx, FIXED_LAYOUT_DEFAULT_METRICS.sectionAvatarToOrderGapPx),
    sectionImageBottomGapPx: normalizeFixedLayoutMetricPx(source.sectionImageBottomGapPx, FIXED_LAYOUT_DEFAULT_METRICS.sectionImageBottomGapPx),
    sectionOrderToTitleGapPx: normalizeFixedLayoutMetricPx(source.sectionOrderToTitleGapPx, FIXED_LAYOUT_DEFAULT_METRICS.sectionOrderToTitleGapPx),
    sectionTitleBlockBottomGapPx: normalizeFixedLayoutMetricPx(
      source.sectionTitleBlockBottomGapPx,
      FIXED_LAYOUT_DEFAULT_METRICS.sectionTitleBlockBottomGapPx,
    ),
  }
}

export function createEmptyFixedLayoutImageSlotConfig(slot) {
  return {
    asset: null,
    spacingPreset: 'medium',
    widthPx: slot === 'qrImage' ? FIXED_LAYOUT_QR_WIDTH_PX : null,
  }
}

export function createEmptyFixedLayoutConfig() {
  return {
    footerGif: createEmptyFixedLayoutImageSlotConfig('footerGif'),
    guideFollow: createEmptyFixedLayoutImageSlotConfig('guideFollow'),
    heroGif: createEmptyFixedLayoutImageSlotConfig('heroGif'),
    metrics: normalizeFixedLayoutMetrics(),
    qrImage: createEmptyFixedLayoutImageSlotConfig('qrImage'),
    sectionAvatar: createEmptyFixedLayoutImageSlotConfig('sectionAvatar'),
  }
}

export function isValidFixedLayoutImageSlot(slot) {
  return FIXED_LAYOUT_IMAGE_SLOT_IDS.includes(slot)
}

export function resolveFixedLayoutSlotAsset(slotConfig) {
  if (!slotConfig || typeof slotConfig !== 'object') {
    return null
  }

  return slotConfig.asset && typeof slotConfig.asset === 'object' ? slotConfig.asset : null
}

export function getFixedLayoutImageDisplaySlots(config) {
  return FIXED_LAYOUT_IMAGE_SLOT_IDS.map((slot) => ({
    slot,
    ...FIXED_LAYOUT_SLOT_META[slot],
    ...createEmptyFixedLayoutImageSlotConfig(slot),
    ...(config?.[slot] ?? {}),
    asset: resolveFixedLayoutSlotAsset(config?.[slot]),
  }))
}
