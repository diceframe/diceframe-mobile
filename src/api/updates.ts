/**
 * GitHub Releases 检查更新（发版通道见 README「构建 APK」一节）。
 *
 * 刻意不走 client.ts：GitHub 是外部公开服务，注入 DiceFrame 的 baseUrl、
 * 会话 Cookie 或 X-TRPG-Confirm 头都是错的。这里只发匿名 GET，失败仅影响
 * 手动检查结果，不适用 ApiError 会话语义——属于规则 2 的显式例外。
 */
import { getT } from '@/i18n/t'
import { getGitHubLatestReleaseUrl, type GitHubReleasePayload } from '@/lib/updates'

export const GITHUB_RELEASE_REPO = 'diceframe/diceframe-mobile'

export async function fetchLatestRelease(): Promise<GitHubReleasePayload> {
  const response = await fetch(getGitHubLatestReleaseUrl(GITHUB_RELEASE_REPO), {
    headers: { Accept: 'application/vnd.github+json' },
  })

  if (response.status === 404) throw new Error(getT()('dfUpdatesNoReleases'))
  // 未认证配额按 IP 限流，403 几乎总是这个原因
  if (response.status === 403) throw new Error(getT()('dfUpdatesRateLimited'))
  if (!response.ok) throw new Error(`GitHub ${response.status}`)

  try {
    return (await response.json()) as GitHubReleasePayload
  } catch {
    throw new Error(getT()('dfUpdatesBadPayload'))
  }
}
