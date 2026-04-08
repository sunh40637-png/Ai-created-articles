import path from 'node:path'

export const DEFAULT_GLM_MODEL = 'glm-5.1'
export const DEFAULT_LLM_PROVIDER = 'glm'
export const DEEPSEEK_PROVIDER = 'deepseek'
export const DEFAULT_LLM_PROFILE_ID = 'glm-main'
export const DEFAULT_LLM_PROFILE_NAME = 'GLM 5.1 主账号'
export const LLM_CONFIG_STORAGE_KEY = 'llm-config-v1'
export const LLM_CONFIG_STORAGE_VERSION = 1
export const LLM_CONFIG_PERSISTENCE_DIR = path.resolve(process.cwd(), '.local-data')
export const LLM_CONFIG_PERSISTENCE_PATH = path.join(LLM_CONFIG_PERSISTENCE_DIR, 'llm-config.json')
export const MINIMAX_PROVIDER = 'minimax'
export const OPENAI_COMPATIBLE_PROVIDER = 'openai-compatible'
