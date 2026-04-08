import { writePersistedLlmConfigPayloadToLocal } from '../llmConfigPersistence.js'
import {
  LLM_CONFIG_STORAGE_KEY,
  LLM_CONFIG_STORAGE_VERSION,
} from './constants.js'
import {
  listLlmProfiles,
  normalizeLlmConfig,
  normalizeLlmProfile,
  resolveActiveLlmProfile,
  resolveLlmConfig,
} from '../runtimeConfig.js'

export { listLlmProfiles, normalizeLlmProfile, resolveActiveLlmProfile, resolveLlmConfig }

export async function saveLlmConfig(config) {
  const normalizedConfig = normalizeLlmConfig(config)

  await writePersistedLlmConfigPayloadToLocal({
    item: {
      state: normalizedConfig,
      version: LLM_CONFIG_STORAGE_VERSION,
    },
    name: LLM_CONFIG_STORAGE_KEY,
  })

  return {
    activeProfile: resolveActiveLlmProfile(),
    config: resolveLlmConfig(),
  }
}
