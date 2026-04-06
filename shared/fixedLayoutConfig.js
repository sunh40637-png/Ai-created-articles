export const FIXED_LAYOUT_IMAGE_SLOT_IDS = ['heroGif', 'guideFollow', 'qrImage', 'footerGif']
export const FIXED_LAYOUT_SPACING_PRESETS = [
  { id: 'none', label: '无' },
  { id: 'small', label: '小' },
  { id: 'medium', label: '中' },
  { id: 'large', label: '大' },
]
export const FIXED_LAYOUT_QR_WIDTH_PX = 200

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
    qrImage: createEmptyFixedLayoutImageSlotConfig('qrImage'),
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
