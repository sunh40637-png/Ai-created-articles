export function countReadableLength(content = '') {
  return String(content ?? '')
    .replace(/\r/g, '')
    .replace(/^#\s+.+?(?:\n+|$)/, '')
    .replace(/\[IMAGE_[123]\]|\[ENDING\]/g, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\(([^)]+)\)/g, ' ')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, ' ')
    .replace(/^>\s?/gm, ' ')
    .replace(/^([-*_]){3,}$/gm, ' ')
    .replace(/^\s*[-+*]\s+/gm, ' ')
    .replace(/^\s*\d+\.\s+/gm, ' ')
    .replace(/[*_~`#>\-\[\]\(\)|]/g, ' ')
    .replace(/[^\p{Script=Han}\p{Letter}\p{Number}]+/gu, '')
    .trim().length
}
