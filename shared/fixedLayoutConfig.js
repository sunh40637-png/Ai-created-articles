export const FIXED_LAYOUT_IMAGE_SLOT_IDS = ['heroGif', 'qrImage', 'footerGif']
export const FIXED_LAYOUT_TEXT_SLOT_IDS = ['endingText']
export const FIXED_LAYOUT_SLOT_ORDER = ['heroGif', 'endingText', 'qrImage', 'footerGif']

export const FIXED_LAYOUT_SLOT_META = {
  heroGif: {
    description: '显示在标题和作者信息下方、正文开始前。',
    label: '开头动图',
    type: 'image',
  },
  endingText: {
    description: '显示在正文结束后、二维码图片上方。',
    label: '文末固定文案',
    type: 'text',
  },
  qrImage: {
    description: '显示在文末固定文案下方，通常用于二维码。',
    label: '二维码图片',
    type: 'image',
  },
  footerGif: {
    description: '显示在二维码下方、整篇文章最底部。',
    label: '底部动图',
    type: 'image',
  },
}

export const FIXED_LAYOUT_ALLOWED_MIME_TYPES = ['image/gif', 'image/png', 'image/jpeg', 'image/webp']
export const FIXED_LAYOUT_FILE_ACCEPT = '.gif,.png,.jpg,.jpeg,.webp'
export const FIXED_LAYOUT_ENDING_TEXT_MAX_LENGTH = 280

export function createEmptyFixedLayoutConfig() {
  return {
    endingText: {
      content: '',
      updatedAt: null,
    },
    footerGif: null,
    heroGif: null,
    qrImage: null,
  }
}

export function isValidFixedLayoutImageSlot(slot) {
  return FIXED_LAYOUT_IMAGE_SLOT_IDS.includes(slot)
}

export function isValidFixedLayoutTextSlot(slot) {
  return FIXED_LAYOUT_TEXT_SLOT_IDS.includes(slot)
}

export function normalizeFixedLayoutTextContent(value) {
  return typeof value === 'string' ? value.trim() : ''
}
