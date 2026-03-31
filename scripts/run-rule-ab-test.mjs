import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInitialContentPipeline } from '../server/contentCreation.js'
import { resolveContentRuleProfile } from '../server/contentRuleProfiles.js'
import { resolveMiniMaxConfig } from '../server/runtimeConfig.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const defaultTopicFile = path.join(projectRoot, 'content-style', 'ab-test-topics.json')

function parseArgs(argv) {
  const args = {
    profile: 'both',
    topicFile: defaultTopicFile,
    limit: null,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index]

    if (current === '--profile') {
      args.profile = argv[index + 1] ?? args.profile
      index += 1
      continue
    }

    if (current === '--topic-file') {
      args.topicFile = argv[index + 1] ?? args.topicFile
      index += 1
      continue
    }

    if (current === '--limit') {
      const parsedLimit = Number.parseInt(argv[index + 1] ?? '', 10)
      args.limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : null
      index += 1
    }
  }

  return args
}

function normalizeProfileArg(value) {
  const normalized = typeof value === 'string' ? value.trim().toUpperCase() : 'BOTH'

  if (normalized === 'A' || normalized === 'B') {
    return [normalized]
  }

  return ['A', 'B']
}

function countReadableLength(content = '') {
  return content
    .replace(/[#>*`\-\[\]\(\)\|]/g, '')
    .replace(/\s+/g, '')
    .trim().length
}

function slugify(value = '') {
  return value
    .replace(/[^\p{Script=Han}\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

function formatTimestamp(date = new Date()) {
  const parts = [
    date.getFullYear(),
    `${date.getMonth() + 1}`.padStart(2, '0'),
    `${date.getDate()}`.padStart(2, '0'),
    '-',
    `${date.getHours()}`.padStart(2, '0'),
    `${date.getMinutes()}`.padStart(2, '0'),
    `${date.getSeconds()}`.padStart(2, '0'),
  ]

  return parts.join('')
}

function buildResultMarkdown({ result, topic }) {
  const readableLength = countReadableLength(result.draftMarkdown)

  return [
    `# ${topic.title}`,
    '',
    `- 规则版本：${result.ruleProfileLabel}`,
    `- 类型：${topic.type}`,
    `- 笔名：${topic.penName}`,
    `- 母题：${topic.theme ?? '未填写'}`,
    `- 判定结果：${result.decision ?? '未返回'}`,
    `- 字数估算：${readableLength} 字`,
    '',
    '## 模型摘要',
    '',
    result.summary || '无',
    '',
    '## 正文',
    '',
    result.draftMarkdown || '',
    '',
    '## 审核报告',
    '',
    result.reportMarkdown || '',
  ].join('\n')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const profileIds = normalizeProfileArg(args.profile)
  const minimaxConfig = resolveMiniMaxConfig({})
  const topicFileContent = await readFile(args.topicFile, 'utf8')
  const rawTopics = JSON.parse(topicFileContent)
  const topics = Array.isArray(rawTopics) ? rawTopics : []

  if (topics.length === 0) {
    throw new Error('测试题单为空，无法执行 A/B 测试。')
  }

  const selectedTopics = args.limit ? topics.slice(0, args.limit) : topics
  const outputDir = path.join(projectRoot, 'ab-test-results', formatTimestamp())
  await mkdir(outputDir, { recursive: true })

  const summaryRows = []
  const jsonResults = []

  for (const topic of selectedTopics) {
    for (const profileId of profileIds) {
      const ruleProfile = resolveContentRuleProfile(profileId)
      console.log(`Running ${ruleProfile.label} -> ${topic.title}`)

      try {
        const result = await runInitialContentPipeline({
          apiKey: minimaxConfig.apiKey,
          deepThinkingEnabled: true,
          model: minimaxConfig.model,
          ruleProfileId: ruleProfile.id,
          supplement: '',
          topic,
        })

        const readableLength = countReadableLength(result.draftMarkdown)
        const fileName = `${topic.id}-${ruleProfile.id}-${slugify(topic.title)}.md`

        await writeFile(
          path.join(outputDir, fileName),
          buildResultMarkdown({ result, topic }),
          'utf8',
        )

        summaryRows.push(
          `| ${topic.id} | ${ruleProfile.label} | ${topic.type} | ${result.decision ?? '未返回'} | ${readableLength} | ${result.summary || '无'} |`,
        )
        jsonResults.push({
          decision: result.decision ?? null,
          fileName,
          profileId: ruleProfile.id,
          profileLabel: ruleProfile.label,
          summary: result.summary || '',
          title: topic.title,
          type: topic.type,
          wordCount: readableLength,
        })
      } catch (error) {
        summaryRows.push(`| ${topic.id} | ${ruleProfile.label} | ${topic.type} | 失败 | - | ${error.message} |`)
        jsonResults.push({
          error: error.message,
          profileId: ruleProfile.id,
          profileLabel: ruleProfile.label,
          title: topic.title,
          type: topic.type,
        })
      }
    }
  }

  const summaryMarkdown = [
    '# 规则 A/B 测试结果',
    '',
    `- 测试时间：${new Date().toLocaleString('zh-CN', { hour12: false })}`,
    `- 使用模型：${minimaxConfig.model}`,
    `- 题目数量：${selectedTopics.length}`,
    `- 规则版本：${profileIds.map((profileId) => resolveContentRuleProfile(profileId).label).join(' / ')}`,
    '',
    '| 题目 ID | 规则版本 | 类型 | 审核结论 | 字数 | 摘要 |',
    '| --- | --- | --- | --- | --- | --- |',
    ...summaryRows,
    '',
    '## 输出目录说明',
    '',
    '- 每个测试结果会单独输出为一个 Markdown 文件。',
    '- `results.json` 汇总了便于后续比对的结构化字段。',
  ].join('\n')

  await writeFile(path.join(outputDir, 'summary.md'), summaryMarkdown, 'utf8')
  await writeFile(path.join(outputDir, 'results.json'), JSON.stringify(jsonResults, null, 2), 'utf8')

  console.log(`A/B test completed. Output directory: ${outputDir}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
