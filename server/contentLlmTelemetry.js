import path from 'node:path'
import { appendFile, mkdir } from 'node:fs/promises'

export const CONTENT_LLM_TELEMETRY_DIR = path.resolve(process.cwd(), '.local-data')
export const CONTENT_LLM_TELEMETRY_PATH = path.join(CONTENT_LLM_TELEMETRY_DIR, 'content-llm-telemetry.ndjson')

async function ensureContentLlmTelemetryDir() {
  await mkdir(CONTENT_LLM_TELEMETRY_DIR, { recursive: true })
}

export async function appendContentLlmTelemetryEvent(event = {}) {
  if (!event || typeof event !== 'object') {
    return null
  }

  await ensureContentLlmTelemetryDir()

  const payload = {
    ...event,
    loggedAt: new Date().toISOString(),
  }

  await appendFile(CONTENT_LLM_TELEMETRY_PATH, `${JSON.stringify(payload)}\n`, 'utf8')
  return payload
}
