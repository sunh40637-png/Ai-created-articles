export const FIXED_LAYOUT_IMAGE_SLOT_IDS = ['heroGif', 'guideFollow', 'qrImage', 'footerGif']
export const FIXED_LAYOUT_TEXT_SLOT_IDS = ['endingText']
export const FIXED_LAYOUT_SLOT_ORDER = ['heroGif', 'guideFollow', 'endingText', 'qrImage', 'footerGif']
export const FIXED_LAYOUT_IMAGE_SLOT_DEFAULT_ORDER = {
  heroGif: 1,
  guideFollow: 2,
  qrImage: 3,
  footerGif: 4,
}
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
    description: '固定图片区块，可调整在模板中的出现顺序。',
    label: '开头动图',
    type: 'image',
  },
  guideFollow: {
    accent: '#dcfce7',
    description: '固定图片区块，可调整在模板中的出现顺序。',
    label: '引导关注图',
    type: 'image',
  },
  endingText: {
    description: '显示在正文结束后的固定引导文案，会以加粗形式展示。',
    label: '文末固定文案',
    type: 'text',
  },
  qrImage: {
    accent: '#ede9fe',
    description: '固定图片区块，可调整顺序，二维码宽度固定为 200px。',
    label: '二维码图片',
    type: 'image',
  },
  footerGif: {
    accent: '#fee2e2',
    description: '固定图片区块，可调整在模板中的出现顺序。',
    label: '底部动图',
    type: 'image',
  },
}

export const FIXED_LAYOUT_ALLOWED_MIME_TYPES = ['image/gif', 'image/png', 'image/jpeg']
export const FIXED_LAYOUT_FILE_ACCEPT = '.gif,.png,.jpg,.jpeg'
export const FIXED_LAYOUT_ENDING_TEXT_MAX_LENGTH = 280

export function normalizeFixedLayoutTextContent(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export function normalizeFixedLayoutSpacingPreset(value) {
  return FIXED_LAYOUT_SPACING_PRESETS.some((preset) => preset.id === value) ? value : 'medium'
}

export function normalizeFixedLayoutQrWidthPx(value) {
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : FIXED_LAYOUT_QR_WIDTH_PX
}

export function normalizeFixedLayoutDisplayOrder(slot, value) {
  const fallback = FIXED_LAYOUT_IMAGE_SLOT_DEFAULT_ORDER[slot] ?? 1
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

export function createEmptyFixedLayoutImageSlotConfig(slot) {
  return {
    asset: null,
    displayOrder: FIXED_LAYOUT_IMAGE_SLOT_DEFAULT_ORDER[slot] ?? 1,
    spacingPreset: 'medium',
    widthPx: slot === 'qrImage' ? FIXED_LAYOUT_QR_WIDTH_PX : null,
  }
}

export function createEmptyFixedLayoutConfig() {
  return {
    endingText: {
      content: '',
      updatedAt: null,
    },
    footerGif: createEmptyFixedLayoutImageSlotConfig('footerGif'),
    guideFollow: createEmptyFixedLayoutImageSlotConfig('guideFollow'),
    heroGif: createEmptyFixedLayoutImageSlotConfig('heroGif'),
    qrImage: createEmptyFixedLayoutImageSlotConfig('qrImage'),
  }
}

export function isValidFixedLayoutImageSlot(slot) {
  return FIXED_LAYOUT_IMAGE_SLOT_IDS.includes(slot)
}

export function isValidFixedLayoutTextSlot(slot) {
  return FIXED_LAYOUT_TEXT_SLOT_IDS.includes(slot)
}

export function resolveFixedLayoutSlotAsset(slotConfig) {
  if (!slotConfig || typeof slotConfig !== 'object') {
    return null
  }

  return slotConfig.asset && typeof slotConfig.asset === 'object' ? slotConfig.asset : null
}

export function normalizeFixedLayoutImageOrdering(config) {
  const nextConfig = {
    ...config,
  }

  const orderedSlotIds = FIXED_LAYOUT_IMAGE_SLOT_IDS.slice().sort((leftSlot, rightSlot) => {
    const leftOrder = normalizeFixedLayoutDisplayOrder(leftSlot, nextConfig?.[leftSlot]?.displayOrder)
    const rightOrder = normalizeFixedLayoutDisplayOrder(rightSlot, nextConfig?.[rightSlot]?.displayOrder)

    if (leftOrder === rightOrder) {
      return FIXED_LAYOUT_IMAGE_SLOT_DEFAULT_ORDER[leftSlot] - FIXED_LAYOUT_IMAGE_SLOT_DEFAULT_ORDER[rightSlot]
    }

    return leftOrder - rightOrder
  })

  orderedSlotIds.forEach((slot, index) => {
    nextConfig[slot] = {
      ...createEmptyFixedLayoutImageSlotConfig(slot),
      ...(nextConfig?.[slot] ?? {}),
      displayOrder: index + 1,
      spacingPreset: normalizeFixedLayoutSpacingPreset(nextConfig?.[slot]?.spacingPreset),
      widthPx: slot === 'qrImage' ? normalizeFixedLayoutQrWidthPx(nextConfig?.[slot]?.widthPx) : null,
    }
  })

  return nextConfig
}

export function getFixedLayoutImageDisplaySlots(config) {
  return FIXED_LAYOUT_IMAGE_SLOT_IDS.map((slot) => ({
    slot,
    ...FIXED_LAYOUT_SLOT_META[slot],
    ...createEmptyFixedLayoutImageSlotConfig(slot),
    ...(config?.[slot] ?? {}),
    asset: resolveFixedLayoutSlotAsset(config?.[slot]),
  })).sort((left, right) => {
    if (left.displayOrder === right.displayOrder) {
      return FIXED_LAYOUT_IMAGE_SLOT_DEFAULT_ORDER[left.slot] - FIXED_LAYOUT_IMAGE_SLOT_DEFAULT_ORDER[right.slot]
    }

    return left.displayOrder - right.displayOrder
  })
}
