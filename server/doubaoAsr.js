import crypto from 'node:crypto'
import { readFile } from 'node:fs/promises'

const DOUBAO_FLASH_URL =
  'https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash'
const DEFAULT_RESOURCE_ID = 'volc.bigasr.auc_turbo'

function toMilliseconds(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export async function transcribeWithDoubao({
  accessKey,
  appId,
  audioPath,
  resourceId = DEFAULT_RESOURCE_ID,
}) {
  if (!appId || !accessKey) {
    throw new Error('未配置豆包 ASR 凭据')
  }

  const fileBuffer = await readFile(audioPath)
  const payload = {
    user: {
      uid: String(appId),
    },
    audio: {
      data: fileBuffer.toString('base64'),
    },
    request: {
      model_name: 'bigmodel',
      enable_speaker_info: true,
    },
  }

  const response = await fetch(DOUBAO_FLASH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Access-Key': accessKey,
      'X-Api-App-Key': String(appId),
      'X-Api-Request-Id': crypto.randomUUID(),
      'X-Api-Resource-Id': resourceId,
      'X-Api-Sequence': '-1',
    },
    body: JSON.stringify(payload),
  })

  const data = await response.json().catch(() => ({}))
  const apiStatusCode = response.headers.get('X-Api-Status-Code')
  const apiMessage = response.headers.get('X-Api-Message')

  if (!response.ok || (apiStatusCode && apiStatusCode !== '20000000')) {
    let message = apiMessage || data?.message || '豆包识别失败'

    if (String(apiMessage).includes('requested resource not granted')) {
      message =
        resourceId === 'volc.bigasr.auc_turbo'
          ? '当前豆包应用还没有开通录音文件极速版权限（volc.bigasr.auc_turbo）'
          : `当前豆包应用没有开通 ${resourceId} 权限`
    }

    const error = new Error(message)
    error.status = response.status || 500
    error.payload = data
    throw error
  }

  const utterances = Array.isArray(data?.result?.utterances) ? data.result.utterances : []
  const normalizedUtterances = utterances.map((utterance, index) => ({
    endTimeMs: toMilliseconds(utterance.end_time),
    id: `utterance-${index + 1}`,
    speaker: utterance.speaker || null,
    startTimeMs: toMilliseconds(utterance.start_time),
    text: utterance.text || '',
    words: Array.isArray(utterance.words)
      ? utterance.words.map((word, wordIndex) => ({
          confidence: Number(word.confidence) || 0,
          endTimeMs: toMilliseconds(word.end_time),
          id: `word-${index + 1}-${wordIndex + 1}`,
          startTimeMs: toMilliseconds(word.start_time),
          text: word.text || '',
        }))
      : [],
  }))

  return {
    durationMs:
      toMilliseconds(data?.audio_info?.duration) ||
      toMilliseconds(data?.result?.additions?.duration),
    raw: data,
    text:
      data?.result?.text ||
      normalizedUtterances.map((utterance) => utterance.text).join('\n'),
    utterances: normalizedUtterances,
  }
}
