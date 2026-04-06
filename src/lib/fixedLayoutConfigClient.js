import { useEffect, useState } from 'react'
import {
  createEmptyFixedLayoutConfig,
  FIXED_LAYOUT_IMAGE_SLOT_IDS,
  resolveFixedLayoutSlotAsset,
} from '../../shared/fixedLayoutConfig.js'

export const FIXED_LAYOUT_CONFIG_UPDATED_EVENT = 'fixed-layout-config-updated'

async function readJsonResponse(response, fallbackMessage) {
  const contentType = response.headers.get('content-type') || ''
  const payload = await response.json().catch(() => null)

  if (!contentType.includes('application/json')) {
    throw new Error(fallbackMessage)
  }

  return payload
}

export async function requestFixedLayoutConfig() {
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

export async function requestFixedLayoutConfigUpdate({ imageSlots } = {}) {
  const response = await fetch('/api/fixed-layout-config', {
    body: JSON.stringify({ imageSlots }),
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

export async function requestFixedLayoutAssetUpload({ file, slot }) {
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

export function cloneFixedLayoutConfig(config) {
  return JSON.parse(JSON.stringify(config ?? createEmptyFixedLayoutConfig()))
}

function serializeFixedLayoutConfigForComparison(config) {
  const normalized = config ?? createEmptyFixedLayoutConfig()

  return JSON.stringify({
    imageSlots: FIXED_LAYOUT_IMAGE_SLOT_IDS.map((slot) => {
      const slotConfig = normalized?.[slot] ?? {}
      const asset = resolveFixedLayoutSlotAsset(slotConfig)

      return {
        assetPath: asset?.path || '',
        slot,
        spacingPreset: slotConfig?.spacingPreset || 'medium',
        widthPx: Number(slotConfig?.widthPx || 0),
      }
    }),
  })
}

export function areFixedLayoutConfigsEqual(leftConfig, rightConfig) {
  return serializeFixedLayoutConfigForComparison(leftConfig) === serializeFixedLayoutConfigForComparison(rightConfig)
}

export function useFixedLayoutConfigState() {
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
