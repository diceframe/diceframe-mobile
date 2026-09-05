import { UserFacingError } from './user-facing-error'

export interface GitHubReleaseAsset {
  name?: unknown
  browser_download_url?: unknown
}

export interface GitHubReleasePayload {
  tag_name?: unknown
  name?: unknown
  body?: unknown
  html_url?: unknown
  assets?: unknown
  prerelease?: unknown
  draft?: unknown
}

export interface AppVersionInfo {
  version: string
  buildVersion?: string | null
}

/** Release 里的一个可下载 APK（拆分包或 universal） */
export interface AppUpdateApk {
  name: string
  url: string
}

export interface AppUpdateInfo {
  latestVersion: string
  releaseName: string
  releaseNotes: string
  releaseUrl: string
  /** Release 里全部可下载的 APK，设置页列出供手动挑选架构 */
  apks: AppUpdateApk[]
  /** 推荐下载项：按设备 ABI 匹配的最小拆分包，匹配不到时回退 universal */
  apkUrl: string
  apkName: string
  isNewer: boolean
}

/** APK 升级必须比较已安装二进制的版本；开发宿主的版本不能当成 DiceFrame 版本。 */
export function resolveAppVersion(current: {
  configVersion?: string | null
  nativeVersion?: string | null
  nativeBuildVersion?: string | null
  isExpoGo: boolean
}): AppVersionInfo {
  return {
    version: (!current.isExpoGo && current.nativeVersion) || current.configVersion || '0.0.0',
    buildVersion: current.isExpoGo ? null : current.nativeBuildVersion ?? null,
  }
}

export function normalizeReleaseVersion(value: string): string {
  return value.trim().replace(/^v/i, '')
}

export function compareVersions(left: string, right: string): number {
  const leftParts = normalizeReleaseVersion(left).split(/[.+-]/).map((part) => Number.parseInt(part, 10))
  const rightParts = normalizeReleaseVersion(right).split(/[.+-]/).map((part) => Number.parseInt(part, 10))
  const length = Math.max(leftParts.length, rightParts.length)

  for (let index = 0; index < length; index += 1) {
    const leftPart = Number.isFinite(leftParts[index]) ? leftParts[index] : 0
    const rightPart = Number.isFinite(rightParts[index]) ? rightParts[index] : 0
    if (leftPart > rightPart) return 1
    if (leftPart < rightPart) return -1
  }

  return 0
}

export function getGitHubLatestReleaseUrl(repo: string): string {
  return `https://api.github.com/repos/${repo}/releases/latest`
}

/**
 * 「检查更新」的兜底下载包名（发布工作流产物，README 发版节有说明）。
 * Release 页还挂 arm64-v8a / armeabi-v7a 拆分包，但下载项不能依赖 asset 顺序，
 * 兜底必须按名字锁定，避免将不兼容架构的拆分包推荐给设备。
 */
export const CANONICAL_APK_ASSET = 'diceframe-android.apk'

function isApkAsset(asset: GitHubReleaseAsset): boolean {
  if (!asset || typeof asset !== 'object') return false
  const name = typeof asset.name === 'string' ? asset.name : ''
  const url = typeof asset.browser_download_url === 'string' ? asset.browser_download_url : ''
  return name.toLowerCase().endsWith('.apk') && url.startsWith('https://')
}

/**
 * 推荐下载项：supportedAbis 是按优先级排序的设备 ABI 列表
 * （expo-device supportedCpuArchitectures = Build.SUPPORTED_ABIS），逐个匹配拆分包
 * 文件名（arm64-v8a 设备的列表靠后也含 armeabi-v7a，按序取即不会错配）。
 * 匹配不到或拿不到架构（Expo Go/Web）时仅回退 canonical universal，否则不推荐。
 */
export function recommendApk(apks: AppUpdateApk[], supportedAbis?: string[] | null): AppUpdateApk | null {
  for (const abi of supportedAbis ?? []) {
    const needle = String(abi).toLowerCase()
    if (!needle) continue
    const match = apks.find((apk) => apk.name.toLowerCase().includes(needle))
    if (match) return match
  }
  const canonical = apks.find((apk) => apk.name.toLowerCase() === CANONICAL_APK_ASSET)
  return canonical ?? null
}

export function parseGitHubRelease(
  payload: GitHubReleasePayload,
  current: AppVersionInfo,
  device?: { supportedAbis?: string[] | null },
): AppUpdateInfo {
  if (!payload || typeof payload !== 'object') throw new UserFacingError('dfUpdatesBadPayload')
  if (payload.draft === true || payload.prerelease === true) throw new UserFacingError('dfUpdatesNoReleases')

  const rawVersion = typeof payload.tag_name === 'string' ? payload.tag_name : ''
  const latestVersion = normalizeReleaseVersion(rawVersion)
  if (!/^\d+\.\d+\.\d+$/.test(latestVersion)) throw new UserFacingError('dfUpdatesBadPayload')

  const assets = Array.isArray(payload.assets) ? payload.assets as GitHubReleaseAsset[] : []
  const apks: AppUpdateApk[] = assets
    .filter(isApkAsset)
    .map((asset) => ({ name: String(asset.name), url: String(asset.browser_download_url) }))
  const apk = recommendApk(apks, device?.supportedAbis)

  if (!apk) {
    throw new UserFacingError('dfUpdatesNoApk')
  }

  return {
    latestVersion,
    releaseName: typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : `v${latestVersion}`,
    releaseNotes: typeof payload.body === 'string' ? payload.body.trim() : '',
    releaseUrl: typeof payload.html_url === 'string' ? payload.html_url : apk.url,
    apks,
    apkUrl: apk.url,
    apkName: apk.name,
    isNewer: compareVersions(latestVersion, current.version) > 0,
  }
}
