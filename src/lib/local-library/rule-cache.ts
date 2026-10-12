/**
 * 离线建卡用的规则缓存策略：在线时总取服务器最新的并写回缓存，取不到（离线、服务器
 * 不可达）才用缓存。缓存只是「上次见过的规则」，不是权威：服务端导入时会按规则重新校正。
 */
export interface RuleCacheAccess<T> {
  fetch: () => Promise<T>
  read: () => T | null
  write: (value: T) => void
}

export async function withRuleCache<T>(access: RuleCacheAccess<T>): Promise<{ value: T; fromCache: boolean }> {
  try {
    const value = await access.fetch()
    try {
      access.write(value)
    } catch {
      // 缓存写失败不影响这次在线结果
    }
    return { value, fromCache: false }
  } catch (error) {
    const cached = access.read()
    if (cached === null) throw error
    return { value: cached, fromCache: true }
  }
}
