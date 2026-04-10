import { readFileSync } from 'node:fs'

const TEMPLATE_PATHS = {
  auditUser: new URL('./prompts/content/stages/audit.user.md', import.meta.url),
  draftUser: new URL('./prompts/content/stages/draft.user.md', import.meta.url),
  revisionUser: new URL('./prompts/content/stages/revision.user.md', import.meta.url),
}

const templateCache = new Map()

function readPromptTemplate(templateName) {
  if (templateCache.has(templateName)) {
    return templateCache.get(templateName)
  }

  const templateUrl = TEMPLATE_PATHS[templateName]

  if (!templateUrl) {
    throw new Error(`未知的内容 prompt 模板：${templateName}`)
  }

  const template = readFileSync(templateUrl, 'utf8')
  templateCache.set(templateName, template)
  return template
}

function normalizeTemplateValue(value) {
  if (value === null || value === undefined) {
    return ''
  }

  if (typeof value === 'string') {
    return value.trim()
  }

  return String(value).trim()
}

export function renderContentPromptTemplate(templateName, variables = {}) {
  const template = readPromptTemplate(templateName)

  return template
    .replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, variableName) =>
      normalizeTemplateValue(variables[variableName]),
    )
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
