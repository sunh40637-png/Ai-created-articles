export const ARTICLE_TEMPLATE_CONFIG_VERSION = 1
export const ARTICLE_TEMPLATE_BODY_IMAGE_SLOT_COUNT = 3
export const ARTICLE_TEMPLATE_IMAGE_ALIGN_OPTIONS = ['left', 'center', 'right']
export const ARTICLE_TEMPLATE_BODY_IMAGE_DIVIDER_MODE_OPTIONS = ['inherit', 'before', 'after', 'none']

function clampNumber(value, { fallback = 0, min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } = {}) {
  const parsedValue = Number(value)

  if (!Number.isFinite(parsedValue)) {
    return fallback
  }

  return Math.min(Math.max(parsedValue, min), max)
}

function normalizeColor(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function normalizeImageAlign(value, fallback = 'center') {
  return ARTICLE_TEMPLATE_IMAGE_ALIGN_OPTIONS.includes(value) ? value : fallback
}

function normalizeBodyImageDividerMode(value, fallback = 'inherit') {
  return ARTICLE_TEMPLATE_BODY_IMAGE_DIVIDER_MODE_OPTIONS.includes(value) ? value : fallback
}

function createDefaultBodyImageSlots() {
  return Array.from({ length: ARTICLE_TEMPLATE_BODY_IMAGE_SLOT_COUNT }, (_, index) => ({
    dividerMode: 'none',
    sectionOrder: index + 1,
    slotId: `body-image-${index + 1}`,
  }))
}

function normalizeBodyImageSlots(slots = []) {
  const normalizedSlots = []
  const usedSectionOrders = new Set()
  const fallbackSectionOrders = [1, 2, 3]

  for (let index = 0; index < ARTICLE_TEMPLATE_BODY_IMAGE_SLOT_COUNT; index += 1) {
    const incomingSlot = Array.isArray(slots) ? slots[index] : null
    const preferredSectionOrder = clampNumber(incomingSlot?.sectionOrder, {
      fallback: index + 1,
      min: 1,
      max: ARTICLE_TEMPLATE_BODY_IMAGE_SLOT_COUNT,
    })
    const availableSectionOrder = fallbackSectionOrders.find((order) => !usedSectionOrders.has(order)) ?? index + 1
    const sectionOrder = usedSectionOrders.has(preferredSectionOrder) ? availableSectionOrder : preferredSectionOrder

    usedSectionOrders.add(sectionOrder)
    normalizedSlots.push({
      dividerMode: normalizeBodyImageDividerMode(incomingSlot?.dividerMode, 'none'),
      sectionOrder,
      slotId:
        typeof incomingSlot?.slotId === 'string' && incomingSlot.slotId.trim()
          ? incomingSlot.slotId.trim()
          : `body-image-${index + 1}`,
    })
  }

  return normalizedSlots
}

export function createDefaultArticleTemplateConfig() {
  return {
    version: ARTICLE_TEMPLATE_CONFIG_VERSION,
    body: {
      blockquoteBorderWidth: 2,
      blockquoteFontSize: 13,
      blockquoteLineHeight: 2,
      blockquoteMarginTop: 18,
      blockquotePaddingLeft: 16,
      heading2FontSize: 22,
      heading2LineHeight: 1.6,
      heading2MarginTop: 28,
      heading3FontSize: 18,
      heading3LineHeight: 1.7,
      heading3MarginTop: 22,
      hrThickness: 0,
      hrMarginY: 28,
      listItemMarginBottom: 6,
      listItemPaddingLeft: 4,
      listMarginTop: 14,
      listPaddingLeft: 20,
      paragraphMarginTop: 14,
      sectionDividerThickness: 0,
      sectionDividerMarginTop: 24,
      sectionDividerPaddingTop: 24,
      tableBorderRadius: 12,
      tableBodyFontSize: 14,
      tableBodyLineHeight: 1.85,
      tableCellPaddingX: 14,
      tableCellPaddingY: 12,
      tableHeaderFontSize: 13,
      tableHeaderLineHeight: 1.7,
      tableMarginTop: 20,
    },
    bodyImage: {
      dividerPlacement: 'after',
      align: 'center',
      borderRadius: 10,
      marginBottom: 0,
      marginTop: 22,
      minHeight: 220,
      widthPercent: 100,
    },
    bodyImageSlots: createDefaultBodyImageSlots(),
    colors: {
      blockquoteBorder: '#D1D5DB',
      blockquoteText: '#4B5563',
      border: '#E5E7EB',
      endingText: '#6B7280',
      pageBackground: '#FFFFFF',
      tableHeaderBackground: '#F3F4F6',
      textMuted: '#6B7280',
      textPrimary: '#111111',
    },
    fontProfiles: {
      large: {
        bodyLineHeight: 1.8,
        bodySize: 17,
      },
      medium: {
        bodyLineHeight: 1.8,
        bodySize: 16,
      },
      small: {
        bodyLineHeight: 1.8,
        bodySize: 15,
      },
    },
    footerImage: {
      align: 'center',
      borderRadius: 10,
      marginTop: 24,
      maxHeight: 360,
      widthPercent: 100,
    },
    heroImage: {
      align: 'center',
      borderRadius: 10,
      marginTop: 24,
      maxHeight: 360,
      widthPercent: 100,
    },
    meta: {
      fontSize: 12,
      gap: 12,
      letterSpacing: 0.08,
      marginTop: 16,
    },
    page: {
      desktopContentMaxWidth: 784,
      desktopPaddingBottom: 18,
      desktopPaddingTop: 18,
      desktopPaddingX: 18,
      mobilePaddingBottom: 18,
      mobilePaddingTop: 18,
      mobilePaddingX: 18,
    },
    qrImage: {
      align: 'center',
      borderRadius: 10,
      marginTop: 24,
      width: 320,
    },
    tail: {
      dividerThickness: 0,
      dividerMarginTop: 32,
      dividerPaddingTop: 0,
      endingTextFontSize: 13,
      endingTextLineHeight: 1.9,
      endingTextMaxWidth: 520,
    },
    title: {
      fontSize: 24,
      lineHeight: 1.45,
      maxWidth: 640,
    },
  }
}

export function normalizeArticleTemplateConfig(config) {
  const fallback = createDefaultArticleTemplateConfig()

  return {
    version: ARTICLE_TEMPLATE_CONFIG_VERSION,
    body: {
      blockquoteBorderWidth: clampNumber(config?.body?.blockquoteBorderWidth, {
        fallback: fallback.body.blockquoteBorderWidth,
        max: 12,
        min: 0,
      }),
      blockquoteFontSize: clampNumber(config?.body?.blockquoteFontSize, {
        fallback: fallback.body.blockquoteFontSize,
        max: 28,
        min: 10,
      }),
      blockquoteLineHeight: clampNumber(config?.body?.blockquoteLineHeight, {
        fallback: fallback.body.blockquoteLineHeight,
        max: 3.2,
        min: 1,
      }),
      blockquoteMarginTop: clampNumber(config?.body?.blockquoteMarginTop, {
        fallback: fallback.body.blockquoteMarginTop,
        max: 120,
        min: 0,
      }),
      blockquotePaddingLeft: clampNumber(config?.body?.blockquotePaddingLeft, {
        fallback: fallback.body.blockquotePaddingLeft,
        max: 120,
        min: 0,
      }),
      heading2FontSize: clampNumber(config?.body?.heading2FontSize, {
        fallback: fallback.body.heading2FontSize,
        max: 42,
        min: 12,
      }),
      heading2LineHeight: clampNumber(config?.body?.heading2LineHeight, {
        fallback: fallback.body.heading2LineHeight,
        max: 3.2,
        min: 1,
      }),
      heading2MarginTop: clampNumber(config?.body?.heading2MarginTop, {
        fallback: fallback.body.heading2MarginTop,
        max: 160,
        min: 0,
      }),
      heading3FontSize: clampNumber(config?.body?.heading3FontSize, {
        fallback: fallback.body.heading3FontSize,
        max: 36,
        min: 12,
      }),
      heading3LineHeight: clampNumber(config?.body?.heading3LineHeight, {
        fallback: fallback.body.heading3LineHeight,
        max: 3.2,
        min: 1,
      }),
      heading3MarginTop: clampNumber(config?.body?.heading3MarginTop, {
        fallback: fallback.body.heading3MarginTop,
        max: 160,
        min: 0,
      }),
      hrThickness: clampNumber(config?.body?.hrThickness, {
        fallback: fallback.body.hrThickness,
        max: 12,
        min: 0,
      }),
      hrMarginY: clampNumber(config?.body?.hrMarginY, {
        fallback: fallback.body.hrMarginY,
        max: 160,
        min: 0,
      }),
      listItemMarginBottom: clampNumber(config?.body?.listItemMarginBottom, {
        fallback: fallback.body.listItemMarginBottom,
        max: 80,
        min: 0,
      }),
      listItemPaddingLeft: clampNumber(config?.body?.listItemPaddingLeft, {
        fallback: fallback.body.listItemPaddingLeft,
        max: 80,
        min: 0,
      }),
      listMarginTop: clampNumber(config?.body?.listMarginTop, {
        fallback: fallback.body.listMarginTop,
        max: 120,
        min: 0,
      }),
      listPaddingLeft: clampNumber(config?.body?.listPaddingLeft, {
        fallback: fallback.body.listPaddingLeft,
        max: 120,
        min: 0,
      }),
      paragraphMarginTop: clampNumber(config?.body?.paragraphMarginTop, {
        fallback: fallback.body.paragraphMarginTop,
        max: 120,
        min: 0,
      }),
      sectionDividerThickness: clampNumber(config?.body?.sectionDividerThickness, {
        fallback: fallback.body.sectionDividerThickness,
        max: 12,
        min: 0,
      }),
      sectionDividerMarginTop: clampNumber(config?.body?.sectionDividerMarginTop, {
        fallback: fallback.body.sectionDividerMarginTop,
        max: 160,
        min: 0,
      }),
      sectionDividerPaddingTop: clampNumber(config?.body?.sectionDividerPaddingTop, {
        fallback: fallback.body.sectionDividerPaddingTop,
        max: 160,
        min: 0,
      }),
      tableBorderRadius: clampNumber(config?.body?.tableBorderRadius, {
        fallback: fallback.body.tableBorderRadius,
        max: 48,
        min: 0,
      }),
      tableBodyFontSize: clampNumber(config?.body?.tableBodyFontSize, {
        fallback: fallback.body.tableBodyFontSize,
        max: 28,
        min: 10,
      }),
      tableBodyLineHeight: clampNumber(config?.body?.tableBodyLineHeight, {
        fallback: fallback.body.tableBodyLineHeight,
        max: 3.2,
        min: 1,
      }),
      tableCellPaddingX: clampNumber(config?.body?.tableCellPaddingX, {
        fallback: fallback.body.tableCellPaddingX,
        max: 48,
        min: 0,
      }),
      tableCellPaddingY: clampNumber(config?.body?.tableCellPaddingY, {
        fallback: fallback.body.tableCellPaddingY,
        max: 48,
        min: 0,
      }),
      tableHeaderFontSize: clampNumber(config?.body?.tableHeaderFontSize, {
        fallback: fallback.body.tableHeaderFontSize,
        max: 28,
        min: 10,
      }),
      tableHeaderLineHeight: clampNumber(config?.body?.tableHeaderLineHeight, {
        fallback: fallback.body.tableHeaderLineHeight,
        max: 3.2,
        min: 1,
      }),
      tableMarginTop: clampNumber(config?.body?.tableMarginTop, {
        fallback: fallback.body.tableMarginTop,
        max: 120,
        min: 0,
      }),
    },
    bodyImage: {
      dividerPlacement: config?.bodyImage?.dividerPlacement === 'before' ? 'before' : fallback.bodyImage.dividerPlacement,
      align: normalizeImageAlign(config?.bodyImage?.align, fallback.bodyImage.align),
      borderRadius: clampNumber(config?.bodyImage?.borderRadius, {
        fallback: fallback.bodyImage.borderRadius,
        max: 48,
        min: 0,
      }),
      marginBottom: clampNumber(config?.bodyImage?.marginBottom, {
        fallback: fallback.bodyImage.marginBottom,
        max: 120,
        min: 0,
      }),
      marginTop: clampNumber(config?.bodyImage?.marginTop, {
        fallback: fallback.bodyImage.marginTop,
        max: 120,
        min: 0,
      }),
      minHeight: clampNumber(config?.bodyImage?.minHeight, {
        fallback: fallback.bodyImage.minHeight,
        max: 560,
        min: 80,
      }),
      widthPercent: clampNumber(config?.bodyImage?.widthPercent, {
        fallback: fallback.bodyImage.widthPercent,
        max: 100,
        min: 20,
      }),
    },
    bodyImageSlots: normalizeBodyImageSlots(config?.bodyImageSlots),
    colors: {
      blockquoteBorder: normalizeColor(config?.colors?.blockquoteBorder, fallback.colors.blockquoteBorder),
      blockquoteText: normalizeColor(config?.colors?.blockquoteText, fallback.colors.blockquoteText),
      border: normalizeColor(config?.colors?.border, fallback.colors.border),
      endingText: normalizeColor(config?.colors?.endingText, fallback.colors.endingText),
      pageBackground: normalizeColor(config?.colors?.pageBackground, fallback.colors.pageBackground),
      tableHeaderBackground: normalizeColor(config?.colors?.tableHeaderBackground, fallback.colors.tableHeaderBackground),
      textMuted: normalizeColor(config?.colors?.textMuted, fallback.colors.textMuted),
      textPrimary: normalizeColor(config?.colors?.textPrimary, fallback.colors.textPrimary),
    },
    fontProfiles: {
      large: {
        bodyLineHeight: clampNumber(config?.fontProfiles?.large?.bodyLineHeight, {
          fallback: fallback.fontProfiles.large.bodyLineHeight,
          max: 3.2,
          min: 1,
        }),
        bodySize: clampNumber(config?.fontProfiles?.large?.bodySize, {
          fallback: fallback.fontProfiles.large.bodySize,
          max: 32,
          min: 10,
        }),
      },
      medium: {
        bodyLineHeight: clampNumber(config?.fontProfiles?.medium?.bodyLineHeight, {
          fallback: fallback.fontProfiles.medium.bodyLineHeight,
          max: 3.2,
          min: 1,
        }),
        bodySize: clampNumber(config?.fontProfiles?.medium?.bodySize, {
          fallback: fallback.fontProfiles.medium.bodySize,
          max: 32,
          min: 10,
        }),
      },
      small: {
        bodyLineHeight: clampNumber(config?.fontProfiles?.small?.bodyLineHeight, {
          fallback: fallback.fontProfiles.small.bodyLineHeight,
          max: 3.2,
          min: 1,
        }),
        bodySize: clampNumber(config?.fontProfiles?.small?.bodySize, {
          fallback: fallback.fontProfiles.small.bodySize,
          max: 32,
          min: 10,
        }),
      },
    },
    footerImage: {
      align: normalizeImageAlign(config?.footerImage?.align, fallback.footerImage.align),
      borderRadius: clampNumber(config?.footerImage?.borderRadius, {
        fallback: fallback.footerImage.borderRadius,
        max: 48,
        min: 0,
      }),
      marginTop: clampNumber(config?.footerImage?.marginTop, {
        fallback: fallback.footerImage.marginTop,
        max: 160,
        min: 0,
      }),
      maxHeight: clampNumber(config?.footerImage?.maxHeight, {
        fallback: fallback.footerImage.maxHeight,
        max: 800,
        min: 80,
      }),
      widthPercent: clampNumber(config?.footerImage?.widthPercent, {
        fallback: fallback.footerImage.widthPercent,
        max: 100,
        min: 20,
      }),
    },
    heroImage: {
      align: normalizeImageAlign(config?.heroImage?.align, fallback.heroImage.align),
      borderRadius: clampNumber(config?.heroImage?.borderRadius, {
        fallback: fallback.heroImage.borderRadius,
        max: 48,
        min: 0,
      }),
      marginTop: clampNumber(config?.heroImage?.marginTop, {
        fallback: fallback.heroImage.marginTop,
        max: 160,
        min: 0,
      }),
      maxHeight: clampNumber(config?.heroImage?.maxHeight, {
        fallback: fallback.heroImage.maxHeight,
        max: 800,
        min: 80,
      }),
      widthPercent: clampNumber(config?.heroImage?.widthPercent, {
        fallback: fallback.heroImage.widthPercent,
        max: 100,
        min: 20,
      }),
    },
    meta: {
      fontSize: clampNumber(config?.meta?.fontSize, {
        fallback: fallback.meta.fontSize,
        max: 24,
        min: 10,
      }),
      gap: clampNumber(config?.meta?.gap, {
        fallback: fallback.meta.gap,
        max: 48,
        min: 0,
      }),
      letterSpacing: clampNumber(config?.meta?.letterSpacing, {
        fallback: fallback.meta.letterSpacing,
        max: 0.4,
        min: 0,
      }),
      marginTop: clampNumber(config?.meta?.marginTop, {
        fallback: fallback.meta.marginTop,
        max: 120,
        min: 0,
      }),
    },
    page: {
      desktopContentMaxWidth: clampNumber(config?.page?.desktopContentMaxWidth, {
        fallback: fallback.page.desktopContentMaxWidth,
        max: 1200,
        min: 320,
      }),
      desktopPaddingBottom: clampNumber(config?.page?.desktopPaddingBottom, {
        fallback: fallback.page.desktopPaddingBottom,
        max: 240,
        min: 0,
      }),
      desktopPaddingTop: clampNumber(config?.page?.desktopPaddingTop, {
        fallback: fallback.page.desktopPaddingTop,
        max: 240,
        min: 0,
      }),
      desktopPaddingX: clampNumber(config?.page?.desktopPaddingX, {
        fallback: fallback.page.desktopPaddingX,
        max: 240,
        min: 0,
      }),
      mobilePaddingBottom: clampNumber(config?.page?.mobilePaddingBottom, {
        fallback: fallback.page.mobilePaddingBottom,
        max: 160,
        min: 0,
      }),
      mobilePaddingTop: clampNumber(config?.page?.mobilePaddingTop, {
        fallback: fallback.page.mobilePaddingTop,
        max: 160,
        min: 0,
      }),
      mobilePaddingX: clampNumber(config?.page?.mobilePaddingX, {
        fallback: fallback.page.mobilePaddingX,
        max: 80,
        min: 0,
      }),
    },
    qrImage: {
      align: normalizeImageAlign(config?.qrImage?.align, fallback.qrImage.align),
      borderRadius: clampNumber(config?.qrImage?.borderRadius, {
        fallback: fallback.qrImage.borderRadius,
        max: 48,
        min: 0,
      }),
      marginTop: clampNumber(config?.qrImage?.marginTop, {
        fallback: fallback.qrImage.marginTop,
        max: 160,
        min: 0,
      }),
      width: clampNumber(config?.qrImage?.width, {
        fallback: fallback.qrImage.width,
        max: 640,
        min: 80,
      }),
    },
    tail: {
      dividerThickness: clampNumber(config?.tail?.dividerThickness, {
        fallback: fallback.tail.dividerThickness,
        max: 12,
        min: 0,
      }),
      dividerMarginTop: clampNumber(config?.tail?.dividerMarginTop, {
        fallback: fallback.tail.dividerMarginTop,
        max: 240,
        min: 0,
      }),
      dividerPaddingTop: clampNumber(config?.tail?.dividerPaddingTop, {
        fallback: fallback.tail.dividerPaddingTop,
        max: 240,
        min: 0,
      }),
      endingTextFontSize: clampNumber(config?.tail?.endingTextFontSize, {
        fallback: fallback.tail.endingTextFontSize,
        max: 28,
        min: 10,
      }),
      endingTextLineHeight: clampNumber(config?.tail?.endingTextLineHeight, {
        fallback: fallback.tail.endingTextLineHeight,
        max: 3.2,
        min: 1,
      }),
      endingTextMaxWidth: clampNumber(config?.tail?.endingTextMaxWidth, {
        fallback: fallback.tail.endingTextMaxWidth,
        max: 1000,
        min: 120,
      }),
    },
    title: {
      fontSize: clampNumber(config?.title?.fontSize, {
        fallback: fallback.title.fontSize,
        max: 42,
        min: 12,
      }),
      lineHeight: clampNumber(config?.title?.lineHeight, {
        fallback: fallback.title.lineHeight,
        max: 3.2,
        min: 1,
      }),
      maxWidth: clampNumber(config?.title?.maxWidth, {
        fallback: fallback.title.maxWidth,
        max: 1000,
        min: 120,
      }),
    },
  }
}

export function createArticleTemplateConfigSignature(config) {
  return JSON.stringify(normalizeArticleTemplateConfig(config))
}

export function getArticleTemplateBodyImageSlotOrders(config) {
  return normalizeArticleTemplateConfig(config).bodyImageSlots.map((slot) => slot.sectionOrder)
}
