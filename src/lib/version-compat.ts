/**
 * 服务器 ↔ App 双向版本兼容判定（纯逻辑）。
 *
 * 契约与上游对齐：
 * - 服务器经公开的 GET /api/config 下发 `server_version` 与
 *   `min_client_version`（见上游 web_server.py `_public_config`）。
 * - App 自身要求服务器的最低版本（APP_MIN_SERVER_VERSION）。
 * - 两条版本线独立（服务器 2.x、App 0.x），不比大小，只比"是否低于对方
 *   声明的最低兼容版本"：
 *   - App 版本 < 服务器的 min_client_version → 服务器较新，提示升级 App；
 *   - 服务器版本 < App 的最低服务器版本 → 服务器较旧，提示升级服务器。
 * - 旧服务器不下发版本字段（或字段不可解析）→ `unknown`，调用方必须放行，
 *   否则会把所有存量服务器用户锁在门外。
 *
 * 比较语义与上游 src/version.py `version_below` 一致：点分数字段逐段比较、
 * 短侧补 0；beta/rc 后缀按主版本号（"1.9.12-beta.1" 视为满足 "1.9.12"）。
 */

/** 本 App 能正确对接的最低服务器版本（低于它提示升级服务器） */
export const APP_MIN_SERVER_VERSION = '2.0.0'

export type ServerCompatStatus = 'ok' | 'app-too-old' | 'server-too-old' | 'unknown'

/** 服务器在 /api/config 里下发的版本元数据（AppConfig 的相关子集） */
export interface ServerVersionMeta {
  server_version?: unknown
  min_client_version?: unknown
}

/** 与上游 version_below 同语义：非数字段按 0，beta/rc 后缀不参与比较 */
export function parseVersionParts(value: string): number[] {
  return String(value)
    .trim()
    .replace(/^[vV]/, '')
    .split('.')
    .map((chunk) => {
      const n = Number.parseInt(chunk.split('-')[0] ?? '', 10)
      return Number.isFinite(n) && n >= 0 ? n : 0
    })
}

/** 语义化比较：current 是否低于 minimum（等号视为满足） */
export function versionBelow(minimum: string, current: string): boolean {
  const min = parseVersionParts(minimum)
  const cur = parseVersionParts(current)
  const len = Math.max(min.length, cur.length)
  for (let i = 0; i < len; i++) {
    const a = min[i] ?? 0
    const b = cur[i] ?? 0
    if (a !== b) return a > b
  }
  return false
}

/**
 * 双向兼容判定。仅当服务器下发了可解析的 server_version 时才产出结论；
 * 单独缺失 min_client_version 时跳过"App 过旧"检查（旧服务器只有这一半
 * 字段也应尽量工作）。两边阈值同时不满足时优先报 App 过旧（升级 App 总是
 * 用户能自己完成的那条路）。
 */
export function serverCompatibility(
  meta: ServerVersionMeta,
  appVersion: string,
  appMinServerVersion: string = APP_MIN_SERVER_VERSION,
): ServerCompatStatus {
  const serverVersion = typeof meta.server_version === 'string' ? meta.server_version.trim() : ''
  // 解析不出任何非零数字段（缺失/"unknown" 之类占位）→ 版本未知，放行
  if (!serverVersion || parseVersionParts(serverVersion).every((n) => n === 0)) return 'unknown'

  const minClient = typeof meta.min_client_version === 'string' ? meta.min_client_version.trim() : ''
  if (minClient && appVersion && versionBelow(minClient, appVersion)) return 'app-too-old'
  if (versionBelow(appMinServerVersion, serverVersion)) return 'server-too-old'
  return 'ok'
}
