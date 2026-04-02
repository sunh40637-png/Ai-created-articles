import path from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createDefaultArticleTemplateConfig, normalizeArticleTemplateConfig } from '../shared/articleTemplateConfig.js'

export const ARTICLE_TEMPLATE_CONFIG_DIR = path.resolve(process.cwd(), '.local-data')
export const ARTICLE_TEMPLATE_CONFIG_PATH = path.join(ARTICLE_TEMPLATE_CONFIG_DIR, 'article-template-config.json')

async function ensureArticleTemplateConfigDir() {
  await mkdir(ARTICLE_TEMPLATE_CONFIG_DIR, { recursive: true })
}

export async function readArticleTemplateConfig() {
  await ensureArticleTemplateConfigDir()

  try {
    const raw = await readFile(ARTICLE_TEMPLATE_CONFIG_PATH, 'utf8')
    return normalizeArticleTemplateConfig(JSON.parse(raw))
  } catch (error) {
    if (error.code === 'ENOENT') {
      return createDefaultArticleTemplateConfig()
    }

    throw error
  }
}

export async function writeArticleTemplateConfig(config) {
  await ensureArticleTemplateConfigDir()
  const normalizedConfig = normalizeArticleTemplateConfig(config)
  await writeFile(ARTICLE_TEMPLATE_CONFIG_PATH, `${JSON.stringify(normalizedConfig, null, 2)}\n`, 'utf8')
  return normalizedConfig
}
