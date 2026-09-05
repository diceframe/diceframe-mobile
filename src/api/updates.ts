/**
 * GitHub Releases 检查更新（发版通道见 README「构建 APK」一节）。
 *
 * 刻意不走 client.ts：GitHub 是外部公开服务，注入 DiceFrame 的 baseUrl、
 * 会话 Cookie 或 X-TRPG-Confirm 头都是错的。这里只发匿名 GET，失败仅影响
 * 更新检查结果，不适用 ApiError 会话语义——属于规则 2 的显式例外。
 */
import { UserFacingError } from '@/lib/user-facing-error'
import { getGitHubLatestReleaseUrl, type GitHubReleasePayload } from '@/lib/updates'

export const GITHUB_RELEASE_REPO = 'diceframe/diceframe-mobile'
export const GITHUB_RELEASE_PAGE = `https://github.com/${GITHUB_RELEASE_REPO}/releases/latest`

export async function fetchLatestRelease(): Promise<GitHubReleasePayload> {
  // 自动检查和手动检查共用请求，必须设超时，避免弱网让检查状态一直锁住。
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  try {
    const response = await fetch(getGitHubLatestReleaseUrl(GITHUB_RELEASE_REPO), {
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller.signal,
    })

    if (response.status === 404) throw new UserFacingError('dfUpdatesNoReleases')
    // 未认证配额按 IP 限流，403 几乎总是这个原因
    if (response.status === 403 || response.status === 429) throw new UserFacingError('dfUpdatesRateLimited')
    if (!response.ok) throw new UserFacingError('dfUpdatesCheckFailed')

    try {
      return (await response.json()) as GitHubReleasePayload
    } catch {
      throw new UserFacingError('dfUpdatesBadPayload')
    }
  } catch (error) {
    if (error instanceof UserFacingError) throw error
    throw new UserFacingError('dfUpdatesCheckFailed')
  } finally {
    clearTimeout(timeout)
  }
}
