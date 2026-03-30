import { execFile } from 'node:child_process'
import { copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { performance } from 'node:perf_hooks'

import {
  buildBenchmarkAssetUrl,
  copyAssetIntoJob,
  createBenchmarkJobId,
  formatFileSize,
  readJobAssetJson,
  saveUploadedFile,
  writeArtifactJson,
  writeArtifactText,
} from './benchmarkAssets.js'
import { transcribeWithDoubao } from './doubaoAsr.js'
import { chatWithMiniMax } from './minimax.js'

const execFileAsync = promisify(execFile)
const FFMPEG_BINARY = process.env.FFMPEG_PATH || '/opt/homebrew/bin/ffmpeg'
const PIPELINE_STATE_PATH = path.join('meta', 'pipeline_state.json')

function detectAttachmentKind({ mimeType = '', name = '' }) {
  if (mimeType.startsWith('video/') || /\.(mp4|mov|m4v|avi)$/i.test(name)) {
    return 'video'
  }

  if (mimeType.startsWith('audio/') || /\.(mp3|wav|m4a|ogg|opus)$/i.test(name)) {
    return 'audio'
  }

  return 'unknown'
}

function formatDurationLabel(durationMs) {
  const safeSeconds = Math.max(0, Math.round(durationMs / 1000))
  return `${safeSeconds < 10 ? safeSeconds.toFixed(2) : `${safeSeconds.toFixed(1)}`}s`
}

function toSeconds(value) {
  return Number((value / 1000).toFixed(3))
}

function buildTranscriptMarkdown(transcription) {
  const lines = ['# 逐句识别稿', '']

  if (transcription.utterances.length === 0) {
    lines.push('当前没有拿到逐句结果。')
    return lines.join('\n')
  }

  transcription.utterances.forEach((utterance) => {
    const start = formatTimestamp(utterance.startTimeMs)
    const end = formatTimestamp(utterance.endTimeMs)

    lines.push(`- [${start} - ${end}] ${utterance.text}`)
  })

  return lines.join('\n')
}

function buildPendingAnalysisWorkflowMessage({ asrDuration, audioDuration, jobId }) {
  return {
    createdAt: new Date().toISOString(),
    id: `workflow-${jobId}`,
    role: 'workflow',
    steps: [
      {
        durationLabel: '已接收',
        id: `workflow-received-${jobId}`,
        label: '已接收素材',
        status: 'done',
      },
      {
        durationLabel: formatDurationLabel(audioDuration),
        id: `workflow-audio-${jobId}`,
        label: '已提取 MP3',
        previewId: 'audio',
        status: 'done',
      },
      {
        durationLabel: formatDurationLabel(asrDuration),
        id: `workflow-asr-${jobId}`,
        label: '已完成豆包识别',
        previewId: 'transcript',
        status: 'done',
      },
      {
        id: `workflow-analysis-${jobId}`,
        label: '正在生成 MiniMax 拆解',
        previewId: 'analysis',
        status: 'running',
      },
    ],
    title: '豆包识别已经完成，现在开始生成 MiniMax 拆解。',
  }
}

function buildCompletedWorkflowMessage({ analysisDuration, asrDuration, audioDuration, jobId }) {
  return {
    createdAt: new Date().toISOString(),
    id: `workflow-${jobId}`,
    role: 'workflow',
    steps: [
      {
        durationLabel: '已接收',
        id: `workflow-received-${jobId}`,
        label: '已接收素材',
        status: 'done',
      },
      {
        durationLabel: formatDurationLabel(audioDuration),
        id: `workflow-audio-${jobId}`,
        label: '已提取 MP3',
        previewId: 'audio',
        status: 'done',
      },
      {
        durationLabel: formatDurationLabel(asrDuration),
        id: `workflow-asr-${jobId}`,
        label: '已完成豆包识别',
        previewId: 'transcript',
        status: 'done',
      },
      {
        durationLabel: formatDurationLabel(analysisDuration),
        id: `workflow-analysis-${jobId}`,
        label: '已生成 MiniMax 拆解',
        previewId: 'analysis',
        status: 'done',
      },
    ],
    title: '这轮素材已经按“上传 -> 抽音频 -> 豆包识别 -> MiniMax 拆解”跑完了。',
  }
}

function buildMiniMaxPrompt({ prompt, transcription }) {
  const transcriptBody = transcription.utterances.length
    ? transcription.utterances
        .map((utterance) => {
          return `[${formatTimestamp(utterance.startTimeMs)} - ${formatTimestamp(utterance.endTimeMs)}] ${utterance.text}`
        })
        .join('\n')
    : transcription.text

  return [
    '请你作为直播对标拆解助手，基于下面的逐句识别稿，输出一份结构化 Markdown 拆解报告。',
    '要求：',
    '1. 只基于识别稿判断，不要假装看到了视频画面。',
    '2. 用中文输出，直接、具体、可执行。',
    '3. 固定包含这些一级标题：',
    '   - # 话术拆解报告',
    '   - ## 一、任务理解',
    '   - ## 二、话术结构分布',
    '   - ## 三、关键话术拆解',
    '   - ## 四、可复用模板',
    '   - ## 五、下一步建议',
    '4. “可复用模板”部分至少给 3 条可直接改写的模板句。',
    '5. 如果识别稿信息不足，要明确指出信息不足的地方。',
    '',
    `用户原始诉求：${prompt}`,
    '',
    '逐句识别稿：',
    transcriptBody,
  ].join('\n')
}

function extractTemplateMarkdown(reportMarkdown) {
  const match = reportMarkdown.match(
    /(^##\s+四、可复用模板[\s\S]*?)(?=^##\s+五、下一步建议|^---|\Z)/m,
  )

  if (match?.[1]) {
    return ['# 可复用模板', '', match[1].trim()].join('\n')
  }

  return ['# 可复用模板', '', '- 当前报告里没有抽取到模板段落。'].join('\n')
}

function buildWorkbenchPayload({
  analysisMarkdown,
  analysisReportArtifact,
  audioArtifact,
  jobId,
  sourceAsset,
  templateArtifact,
  templateMarkdown,
  transcriptArtifact,
  transcription,
}) {
  const sourceKind = detectAttachmentKind(sourceAsset)
  const sourcePreviewId = sourceKind === 'video' ? 'video' : 'audio-source'

  const files = [
    {
      id: `source-file-${jobId}`,
      label: sourceKind === 'video' ? '原始视频' : '原始音频',
      meta: sourceAsset.sizeLabel,
      previewId: sourcePreviewId,
      type: 'file',
    },
    {
      id: `audio-file-${jobId}`,
      label: '识别音频',
      meta: audioArtifact.sizeLabel,
      previewId: 'audio',
      type: 'file',
    },
    {
      id: `transcript-file-${jobId}`,
      label: '逐句识别稿',
      meta: transcriptArtifact.sizeLabel,
      previewId: 'transcript',
      type: 'file',
    },
    {
      id: `report-file-${jobId}`,
      label: '拆解报告',
      meta: analysisReportArtifact.sizeLabel,
      previewId: 'analysis',
      type: 'file',
    },
    {
      id: `template-file-${jobId}`,
      label: '可复用模板',
      meta: templateArtifact.sizeLabel,
      previewId: 'template',
      type: 'file',
    },
  ]

  const views = {
    [sourcePreviewId]: {
      assetUrl: buildBenchmarkAssetUrl({ jobId, relativePath: sourceAsset.relativePath }),
      body: sourceKind === 'video' ? 'video' : 'audio',
      content: '',
      subtitle: '用户上传的原始素材',
      title: sourceKind === 'video' ? '原始视频' : '原始音频',
    },
    audio: {
      assetUrl: buildBenchmarkAssetUrl({ jobId, relativePath: audioArtifact.relativePath }),
      body: 'audio',
      content: '',
      subtitle: '送入豆包识别的 MP3 音频',
      title: '识别音频',
    },
    transcript: {
      body: 'transcript',
      content: transcriptArtifact.content,
      subtitle: '豆包识别后的逐句稿',
      title: '逐句识别稿',
    },
    analysis: {
      body: 'analysis',
      content: analysisMarkdown,
      subtitle: 'MiniMax 生成的主分析结果',
      title: '拆解报告',
    },
    template: {
      body: 'template',
      content: templateMarkdown,
      subtitle: '从分析结果中提炼的话术模板',
      title: '可复用模板',
    },
  }

  return {
    activeWorkbenchItemId: 'analysis',
    audioRecognitionSegments: transcription.utterances.map((utterance) => ({
      end: toSeconds(utterance.endTimeMs),
      id: utterance.id,
      speaker: utterance.speaker || null,
      text: utterance.text,
      start: toSeconds(utterance.startTimeMs),
      words: utterance.words.map((word) => ({
        confidence: word.confidence,
        end: toSeconds(word.endTimeMs),
        id: word.id,
        start: toSeconds(word.startTimeMs),
        text: word.text,
      })),
    })),
    files,
    views,
  }
}

function buildTranscriptionWorkbenchPayload({
  audioArtifact,
  jobId,
  sourceAsset,
  transcriptArtifact,
  transcription,
}) {
  const sourceKind = detectAttachmentKind(sourceAsset)
  const sourcePreviewId = sourceKind === 'video' ? 'video' : 'audio-source'

  return {
    activeWorkbenchItemId: 'transcript',
    audioRecognitionSegments: transcription.utterances.map((utterance) => ({
      end: toSeconds(utterance.endTimeMs),
      id: utterance.id,
      speaker: utterance.speaker || null,
      text: utterance.text,
      start: toSeconds(utterance.startTimeMs),
      words: utterance.words.map((word) => ({
        confidence: word.confidence,
        end: toSeconds(word.endTimeMs),
        id: word.id,
        start: toSeconds(word.startTimeMs),
        text: word.text,
      })),
    })),
    files: [
      {
        id: `source-file-${jobId}`,
        label: sourceKind === 'video' ? '原始视频' : '原始音频',
        meta: sourceAsset.sizeLabel,
        previewId: sourcePreviewId,
        type: 'file',
      },
      {
        id: `audio-file-${jobId}`,
        label: '识别音频',
        meta: audioArtifact.sizeLabel,
        previewId: 'audio',
        type: 'file',
      },
      {
        id: `transcript-file-${jobId}`,
        label: '逐句识别稿',
        meta: transcriptArtifact.sizeLabel,
        previewId: 'transcript',
        type: 'file',
      },
    ],
    views: {
      [sourcePreviewId]: {
        assetUrl: buildBenchmarkAssetUrl({ jobId, relativePath: sourceAsset.relativePath }),
        body: sourceKind === 'video' ? 'video' : 'audio',
        content: '',
        subtitle: '用户上传的原始素材',
        title: sourceKind === 'video' ? '原始视频' : '原始音频',
      },
      audio: {
        assetUrl: buildBenchmarkAssetUrl({ jobId, relativePath: audioArtifact.relativePath }),
        body: 'audio',
        content: '',
        subtitle: '送入豆包识别的 MP3 音频',
        title: '识别音频',
      },
      transcript: {
        body: 'transcript',
        content: transcriptArtifact.content,
        subtitle: '豆包识别后的逐句文稿',
        title: '逐句识别稿',
      },
    },
  }
}

function formatTimestamp(valueMs) {
  const totalSeconds = Math.max(0, Math.floor(valueMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

async function prepareAudioAsset({ jobId, sourceAsset }) {
  const sourceKind = detectAttachmentKind(sourceAsset)
  const sourceAbsolutePath = path.resolve(
    process.cwd(),
    '.cache/benchmark-workbench',
    jobId,
    sourceAsset.relativePath,
  )

  if (sourceKind === 'audio' && /\.mp3$/i.test(sourceAsset.name)) {
    return copyAssetIntoJob({
      absoluteSourcePath: sourceAbsolutePath,
      jobId,
      relativePath: path.join('audio', 'source.mp3'),
    })
  }

  const outputRelativePath = path.join('audio', 'source.mp3')
  const outputAbsolutePath = path.resolve(
    process.cwd(),
    '.cache/benchmark-workbench',
    jobId,
    outputRelativePath,
  )

  await mkdir(path.dirname(outputAbsolutePath), { recursive: true })
  await execFileAsync(FFMPEG_BINARY, [
    '-y',
    '-i',
    sourceAbsolutePath,
    '-vn',
    '-ac',
    '1',
    '-ar',
    '16000',
    '-codec:a',
    'libmp3lame',
    outputAbsolutePath,
  ])

  return copyAssetIntoJob({
    absoluteSourcePath: outputAbsolutePath,
    jobId,
    relativePath: outputRelativePath,
  })
}

export async function runBenchmarkTranscription({
  attachments = [],
  doubaoAccessKey,
  doubaoAppId,
  doubaoResourceId,
}) {
  const mediaAttachment =
    attachments.find((attachment) => detectAttachmentKind(attachment) !== 'unknown') ?? attachments[0]

  if (!mediaAttachment) {
    throw new Error('请先上传一份音频或视频素材')
  }

  const jobId = createBenchmarkJobId()
  const savedSourceAsset = await saveUploadedFile({
    file: mediaAttachment,
    jobId,
  })

  const timings = {}

  const audioStartedAt = performance.now()
  const audioArtifact = await prepareAudioAsset({
    jobId,
    sourceAsset: savedSourceAsset,
  })
  timings.audio = performance.now() - audioStartedAt

  const asrStartedAt = performance.now()
  const transcription = await transcribeWithDoubao({
    accessKey: doubaoAccessKey,
    appId: doubaoAppId,
    audioPath: path.resolve(
      process.cwd(),
      '.cache/benchmark-workbench',
      jobId,
      audioArtifact.relativePath,
    ),
    resourceId: doubaoResourceId,
  })
  timings.asr = performance.now() - asrStartedAt

  const transcriptMarkdown = buildTranscriptMarkdown(transcription)
  const transcriptArtifact = await writeArtifactText({
    content: transcriptMarkdown,
    jobId,
    relativePath: path.join('output', 'transcript_raw.md'),
  })

  await writeArtifactJson({
    data: {
      audioArtifact,
      sourceAsset: savedSourceAsset,
      transcription,
      timings,
    },
    jobId,
    relativePath: PIPELINE_STATE_PATH,
  })

  return {
    jobId,
    sourceAsset: {
      ...savedSourceAsset,
      kind: detectAttachmentKind(savedSourceAsset),
    },
    transcription: {
      durationMs: transcription.durationMs,
      text: transcription.text,
      utterances: transcription.utterances,
    },
    workflowMessage: buildPendingAnalysisWorkflowMessage({
      asrDuration: timings.asr,
      audioDuration: timings.audio,
      jobId,
    }),
    workbench: buildTranscriptionWorkbenchPayload({
      audioArtifact,
      jobId,
      sourceAsset: savedSourceAsset,
      transcriptArtifact,
      transcription,
    }),
  }
}

export async function runBenchmarkAnalysis({
  jobId,
  minimaxApiKey,
  minimaxModel,
  prompt,
}) {
  if (!jobId) {
    throw new Error('缺少任务标识，无法继续生成拆解结果')
  }

  const pipelineState = await readJobAssetJson({
    jobId,
    relativePath: PIPELINE_STATE_PATH,
  })

  const { audioArtifact, sourceAsset, timings, transcription } = pipelineState

  const analysisStartedAt = performance.now()
  const minimaxResult = await chatWithMiniMax({
    apiKey: minimaxApiKey,
    messages: [
      {
        role: 'user',
        content: buildMiniMaxPrompt({
          prompt,
          transcription,
        }),
      },
    ],
    model: minimaxModel,
  })
  const analysisMarkdown = minimaxResult?.choices?.[0]?.message?.content?.trim() || '模型没有返回内容。'
  const analysisDuration = performance.now() - analysisStartedAt

  const analysisReportArtifact = await writeArtifactText({
    content: analysisMarkdown,
    jobId,
    relativePath: path.join('output', 'report_full.md'),
  })

  const templateMarkdown = extractTemplateMarkdown(analysisMarkdown)
  const templateArtifact = await writeArtifactText({
    content: templateMarkdown,
    jobId,
    relativePath: path.join('output', 'templates.md'),
  })

  const transcriptArtifact = await writeArtifactText({
    content: buildTranscriptMarkdown(transcription),
    jobId,
    relativePath: path.join('output', 'transcript_raw.md'),
  })

  return {
    analysisMarkdown,
    jobId,
    model: minimaxResult?.model || minimaxModel || 'MiniMax-M2.7',
    sourceAsset: {
      ...sourceAsset,
      kind: detectAttachmentKind(sourceAsset),
    },
    usage: minimaxResult?.usage ?? null,
    workflowMessage: buildCompletedWorkflowMessage({
      analysisDuration,
      asrDuration: timings.asr,
      audioDuration: timings.audio,
      jobId,
    }),
    workbench: buildWorkbenchPayload({
      analysisMarkdown,
      analysisReportArtifact,
      audioArtifact,
      jobId,
      sourceAsset,
      templateArtifact,
      templateMarkdown,
      transcriptArtifact,
      transcription,
    }),
  }
}
