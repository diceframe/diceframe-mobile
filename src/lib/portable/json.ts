/**
 * 可移植文档的通用小工具：深拷贝、规范化 JSON、UTF-8 字节数与本地摘要。
 */

export type JsonObject = Record<string, unknown>

export function isJsonObject(value: unknown): value is JsonObject {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/** 文档都是 JSON：用 JSON 往返做深拷贝，顺带丢掉 undefined（与发给服务端的形状一致） */
export function cloneJson<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T)
}

/** 键排序后的 JSON：同一内容不论键序得到同一字符串（摘要与比较用） */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item === undefined ? null : item)).join(',')}]`
  if (isJsonObject(value)) {
    const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort()
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

/**
 * UTF-8 字节数（服务端按字节计 8MB 请求体 / 32KB 条目上限）。不依赖 TextEncoder：
 * Hermes 与各测试环境的可用性不一致，手算更稳。
 */
export function utf8ByteLength(text: string): number {
  let bytes = 0
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    if (code < 0x80) bytes += 1
    else if (code < 0x800) bytes += 2
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length) {
      const next = text.charCodeAt(index + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4
        index += 1
      } else {
        bytes += 3
      }
    } else bytes += 3
  }
  return bytes
}

/**
 * 本地内容摘要（server_links.synced_digest 用）：判断「编辑后是否与上次同步的内容
 * 实质相同」。只在本机比较，不是安全用途，所以用无依赖的 53 位哈希（cyrb53），
 * 不与服务端的 sha256 digest 比较。
 */
export function localDigest(value: unknown): string {
  const text = canonicalJson(value)
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    h1 = Math.imul(h1 ^ code, 2654435761)
    h2 = Math.imul(h2 ^ code, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  const hash = 4294967296 * (2097151 & h2) + (h1 >>> 0)
  return `local:${hash.toString(16).padStart(14, '0')}`
}
