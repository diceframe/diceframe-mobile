/**
 * 本机内容库的 Web 版入口：Web 端不提供本机库（expo-sqlite 的 Web 支持仍是 alpha，
 * 且需要 COOP/COEP 响应头）。导出与原生版 local-library.ts 相同的 API，一律返回 null。
 *
 * 不得引入 expo-sqlite / Drizzle 的运行时代码：Metro 按 .web.ts 解析，原生版一旦被
 * Web bundle 引用就会拖进 wa-sqlite 与 wasm（local-library.web.test.ts 兜底）。
 */
import type { LocalLibraryRepository } from '@/lib/local-library/repository'

export const LOCAL_LIBRARY_DB_NAME = 'diceframe-library.db'

export async function localLibrary(): Promise<LocalLibraryRepository | null> {
  return null
}

export async function resolveInstallId(): Promise<string | null> {
  return null
}
