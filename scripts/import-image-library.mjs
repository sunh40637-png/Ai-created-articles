import path from 'node:path'
import { promisify } from 'node:util'
import { access } from 'node:fs/promises'
import { execFile as execFileCallback } from 'node:child_process'
import { ensureLibraryAssetsDir, writeLibraryAssetsIndex } from '../server/libraryAssets.js'
import manifest from './libraryAssetSeedManifest.mjs'

const execFile = promisify(execFileCallback)
const DEFAULT_SOURCE_DIR = '/Users/shh/Downloads/suciaku '
const SIPS_PATH = '/usr/bin/sips'

function slugifyBaseName(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

async function ensureReadableFile(filePath) {
  try {
    await access(filePath)
  } catch {
    throw new Error(`找不到源图片：${filePath}`)
  }
}

async function convertImageToJpeg(sourcePath, targetPath) {
  await execFile(SIPS_PATH, ['-s', 'format', 'jpeg', '-s', 'formatOptions', '82', sourcePath, '--out', targetPath])
}

async function run() {
  const sourceDir = process.argv[2] || DEFAULT_SOURCE_DIR
  const targetDir = path.resolve(process.cwd(), 'public/assets/image-library')
  const createdAt = new Date().toISOString()

  await ensureLibraryAssetsDir()

  const nextAssets = []

  for (const [index, item] of manifest.entries()) {
    const id = `img_${String(index + 1).padStart(3, '0')}`
    const sourcePath = path.join(sourceDir, item.sourceFilename)
    const importedFilename = `${id}-${slugifyBaseName(path.parse(item.sourceFilename).name)}.jpg`
    const targetPath = path.join(targetDir, importedFilename)

    await ensureReadableFile(sourcePath)
    await convertImageToJpeg(sourcePath, targetPath)

    nextAssets.push({
      id,
      filename: importedFilename,
      path: `/assets/image-library/${importedFilename}`,
      emotion: item.emotion,
      topic: item.topic,
      figures: item.figures,
      scene: item.scene,
      usedCount: 0,
      lastUsedAt: null,
      createdAt,
    })
  }

  await writeLibraryAssetsIndex(nextAssets)

  console.log(`Imported ${nextAssets.length} assets into public/assets/image-library/`)
}

run().catch((error) => {
  console.error(error.message || error)
  process.exitCode = 1
})
