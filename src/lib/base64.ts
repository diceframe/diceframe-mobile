/**
 * Uint8Array → base64。RN 环境没有全局 btoa，RN 的 FileReader.readAsDataURL
 * 又依赖 react-native Blob 的内部 blobId 结构，无法用于 fetch 直接读出的字节，
 * 因此在 JS 侧自行编码。
 */
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** 分块拼接避免超大字符串；取 3 的倍数保证主循环只处理完整三元组 */
const CHUNK_BYTES = 3 * 4096

export function bytesToBase64(bytes: Uint8Array): string {
  const chunks: string[] = []
  const fullGroupsEnd = bytes.length - (bytes.length % 3)
  let groupStart = 0
  while (groupStart < fullGroupsEnd) {
    const groupEnd = Math.min(groupStart + CHUNK_BYTES, fullGroupsEnd)
    let text = ''
    for (let i = groupStart; i < groupEnd; i += 3) {
      const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]
      text +=
        BASE64_ALPHABET[(n >> 18) & 63] +
        BASE64_ALPHABET[(n >> 12) & 63] +
        BASE64_ALPHABET[(n >> 6) & 63] +
        BASE64_ALPHABET[n & 63]
    }
    chunks.push(text)
    groupStart = groupEnd
  }

  const remaining = bytes.length - fullGroupsEnd
  if (remaining === 1) {
    const n = bytes[fullGroupsEnd] << 16
    chunks.push(BASE64_ALPHABET[(n >> 18) & 63] + BASE64_ALPHABET[(n >> 12) & 63] + '==')
  } else if (remaining === 2) {
    const n = (bytes[fullGroupsEnd] << 16) | (bytes[fullGroupsEnd + 1] << 8)
    chunks.push(
      BASE64_ALPHABET[(n >> 18) & 63] + BASE64_ALPHABET[(n >> 12) & 63] + BASE64_ALPHABET[(n >> 6) & 63] + '=',
    )
  }
  return chunks.join('')
}
