import crypto from 'node:crypto'
import path from 'node:path'
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises'

const JOBS_ROOT = path.resolve(process.cwd(), '.cache/benchmark-workbench')

function sanitizeSegment(value) {
  return String(value)
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'file'
}

export function createBenchmarkJobId() {
  return `${new Date().toISOString().slice(0, 10)}-${crypto.randomUUID()}`
}

export function getBenchmarkJobsRoot() {
  return JOBS_ROOT
}

export async function ensureBenchmarkJobDir(jobId) {
  const jobDir = path.join(JOBS_ROOT, sanitizeSegment(jobId))
  await mkdir(jobDir, { recursive: true })
  return jobDir
}

export function resolveBenchmarkJobPath(jobId, relativePath = '.') {
  const jobDir = path.resolve(JOBS_ROOT, sanitizeSegment(jobId))
  const resolvedPath = path.resolve(jobDir, relativePath)

  if (resolvedPath !== jobDir && !resolvedPath.startsWith(`${jobDir}${path.sep}`)) {
    throw new Error('非法的工作区文件路径')
  }

  return resolvedPath
}

export async function saveUploadedFile({ file, jobId, relativeDir = 'user_input_files' }) {
  const jobDir = await ensureBenchmarkJobDir(jobId)
  const outputDir = path.join(jobDir, relativeDir)
  const fileName = sanitizeSegment(file.name)
  const outputPath = path.join(outputDir, fileName)
  const fileBuffer = Buffer.from(await file.arrayBuffer())

  await mkdir(outputDir, { recursive: true })
  await writeFile(outputPath, fileBuffer)

  return {
    mimeType: file.type || 'application/octet-stream',
    name: file.name,
    relativePath: path.relative(jobDir, outputPath),
    size: fileBuffer.byteLength,
    sizeLabel: formatFileSize(fileBuffer.byteLength),
  }
}

export async function copyAssetIntoJob({ absoluteSourcePath, jobId, relativePath }) {
  const targetPath = resolveBenchmarkJobPath(jobId, relativePath)
  await mkdir(path.dirname(targetPath), { recursive: true })

  if (path.resolve(absoluteSourcePath) !== path.resolve(targetPath)) {
    await copyFile(absoluteSourcePath, targetPath)
  }

  const fileStat = await stat(targetPath)
  return {
    name: path.basename(targetPath),
    relativePath,
    size: fileStat.size,
    sizeLabel: formatFileSize(fileStat.size),
  }
}

export async function writeArtifactText({ content, jobId, relativePath }) {
  const targetPath = resolveBenchmarkJobPath(jobId, relativePath)
  await mkdir(path.dirname(targetPath), { recursive: true })
  await writeFile(targetPath, content, 'utf8')

  const fileStat = await stat(targetPath)
  return {
    content,
    name: path.basename(targetPath),
    relativePath,
    size: fileStat.size,
    sizeLabel: formatFileSize(fileStat.size),
  }
}

export async function writeArtifactJson({ data, jobId, relativePath }) {
  return writeArtifactText({
    content: JSON.stringify(data, null, 2),
    jobId,
    relativePath,
  })
}

export async function readJobAsset({ jobId, relativePath }) {
  const assetPath = resolveBenchmarkJobPath(jobId, relativePath)
  const fileBuffer = await readFile(assetPath)

  return {
    buffer: fileBuffer,
    contentType: guessContentType(assetPath),
    fileName: path.basename(assetPath),
  }
}

export async function getJobAssetInfo({ jobId, relativePath }) {
  const assetPath = resolveBenchmarkJobPath(jobId, relativePath)
  const fileStat = await stat(assetPath)

  return {
    absolutePath: assetPath,
    contentType: guessContentType(assetPath),
    fileName: path.basename(assetPath),
    size: fileStat.size,
  }
}

export async function readJobAssetText({ jobId, relativePath }) {
  const assetPath = resolveBenchmarkJobPath(jobId, relativePath)
  return readFile(assetPath, 'utf8')
}

export async function readJobAssetJson({ jobId, relativePath }) {
  const content = await readJobAssetText({ jobId, relativePath })
  return JSON.parse(content)
}

export function buildBenchmarkAssetUrl({ jobId, relativePath }) {
  const params = new URLSearchParams({
    jobId,
    path: relativePath,
  })

  return `/api/benchmark-asset?${params.toString()}`
}

export function formatFileSize(size) {
  if (!Number.isFinite(size) || size <= 0) {
    return '0 KB'
  }

  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function guessContentType(filePath) {
  const extension = path.extname(filePath).toLowerCase()

  switch (extension) {
    case '.md':
    case '.txt':
      return 'text/markdown; charset=utf-8'
    case '.json':
      return 'application/json; charset=utf-8'
    case '.mp3':
      return 'audio/mpeg'
    case '.wav':
      return 'audio/wav'
    case '.m4a':
      return 'audio/mp4'
    case '.mp4':
      return 'video/mp4'
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    default:
      return 'application/octet-stream'
  }
}
