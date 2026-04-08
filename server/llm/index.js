import {
  DEEPSEEK_PROVIDER,
  DEFAULT_LLM_PROVIDER,
  MINIMAX_PROVIDER,
  OPENAI_COMPATIBLE_PROVIDER,
} from './constants.js'
import { resolveActiveLlmProfile } from '../runtimeConfig.js'
import { chatWithGlmProvider } from './providers/glm.js'
import { chatWithOpenAiCompatibleProvider } from './providers/openaiCompatible.js'

function serializeAttachments(attachments = []) {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return ''
  }

  return attachments
    .map((attachment, index) => `${index + 1}. ${attachment.name}（${attachment.sizeLabel}）`)
    .join('\n')
}

function normalizeTextContent(content) {
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') {
          return item
        }

        if (typeof item?.text === 'string') {
          return item.text
        }

        return ''
      })
      .filter(Boolean)
      .join('\n')
  }

  return ''
}

function normalizeMessage(message) {
  const role = ['assistant', 'system', 'user'].includes(message?.role) ? message.role : 'user'
  const baseContent = normalizeTextContent(message?.content).trim()

  if (role !== 'user') {
    return {
      role,
      content: baseContent,
    }
  }

  const attachmentSummary = serializeAttachments(message?.attachments)
  const content = [baseContent, attachmentSummary ? `附件：\n${attachmentSummary}` : '']
    .filter(Boolean)
    .join('\n\n')

  return {
    role: 'user',
    content,
  }
}

function buildMessages({ messages = [], systemPrompt = '' }) {
  const normalizedMessages = messages
    .map((message) => normalizeMessage(message))
    .filter((message) => typeof message.content === 'string' && message.content.trim())

  return [
    ...(systemPrompt.trim()
      ? [
          {
            role: 'system',
            content: systemPrompt,
          },
        ]
      : []),
    ...normalizedMessages,
  ]
}

function normalizeThinkingValue({ thinking, thinkingType }) {
  if (typeof thinking === 'boolean') {
    return thinking
  }

  if (thinkingType === 'enabled') {
    return true
  }

  if (thinkingType === 'disabled') {
    return false
  }

  return null
}

const PROVIDER_HANDLERS = {
  [DEFAULT_LLM_PROVIDER]: chatWithGlmProvider,
  [DEEPSEEK_PROVIDER]: chatWithOpenAiCompatibleProvider,
  [MINIMAX_PROVIDER]: chatWithOpenAiCompatibleProvider,
  [OPENAI_COMPATIBLE_PROVIDER]: chatWithOpenAiCompatibleProvider,
}

export async function chatWithLlm({
  apiKey,
  assistantName = 'AI 助手',
  baseUrl,
  maxTokens,
  messages = [],
  model,
  profile = null,
  provider,
  responseFormat = null,
  systemPrompt = '',
  temperature = 0.2,
  thinking = null,
  thinkingType = null,
  timeoutMs = 300000,
  topP = 0.95,
}) {
  void assistantName

  const activeProfile = resolveActiveLlmProfile({ profile })
  const resolvedProfile = {
    apiKey: apiKey || activeProfile.apiKey,
    baseUrl: baseUrl ?? activeProfile.baseUrl,
    model: model || activeProfile.model,
    provider: provider || activeProfile.provider || DEFAULT_LLM_PROVIDER,
  }

  if (!resolvedProfile.apiKey) {
    const error = new Error('当前模型未配置 API Key')
    error.status = 400
    throw error
  }

  const handler = PROVIDER_HANDLERS[resolvedProfile.provider]

  if (!handler) {
    const error = new Error(`暂不支持的模型提供方：${resolvedProfile.provider}`)
    error.status = 400
    throw error
  }

  return handler({
    apiKey: resolvedProfile.apiKey,
    baseUrl: resolvedProfile.baseUrl,
    maxTokens,
    messages: buildMessages({ messages, systemPrompt }),
    model: resolvedProfile.model,
    responseFormat,
    temperature,
    thinking: normalizeThinkingValue({ thinking, thinkingType }),
    timeoutMs,
    topP,
  })
}
