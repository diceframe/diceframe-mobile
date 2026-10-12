/**
 * 多局玩家身份的纯逻辑：槽位增删、当前身份解析、启动分流判定。
 *
 * 按 gameKey 分槽位保存（对齐 Web 端 trpg_play_user_<gameKey> 的每局缓存语义），
 * 这里只放可测纯函数；store 与 API 注入见 src/stores/settings.ts。
 */
import type { ShareIdentity } from '@/api/client'
import type { GameDetail } from '@/api/types'

/** 移动端按局保存的玩家身份：ShareIdentity + 加入时的展示快照 */
export interface PlayerIdentity extends ShareIdentity {
  /** 加入时的服务器地址（跨服务器多局时供身份列表区分展示） */
  server?: string
  /** 加入时获取的对局（世界）名，供启动分流与身份列表展示 */
  worldName?: string
}

/** 身份槽位：键 = gameKey。对象插入序 = 加入顺序，persist JSON 保序 */
export type IdentitySlots = Record<string, PlayerIdentity>

/** 槽位列表（供 UI 遍历；插入序即展示序） */
export function listIdentities(shares: IdentitySlots): PlayerIdentity[] {
  return Object.values(shares)
}

/** 写入/覆盖一局身份；缺 gameKey 的脏数据直接忽略（返回原引用，不产生假槽位） */
export function upsertIdentity(shares: IdentitySlots, identity: PlayerIdentity): IdentitySlots {
  if (!identity.game) return shares
  return { ...shares, [identity.game]: identity }
}

/** 只移除某一局的身份；槽位不存在时返回原引用（幂等） */
export function removeIdentity(shares: IdentitySlots, gameKey: string): IdentitySlots {
  if (!shares[gameKey]) return shares
  const next = { ...shares }
  delete next[gameKey]
  return next
}

/**
 * 当前注入 api client 的身份。activeGameKey 指向已删除的槽位（悬挂 key）
 * 视为无身份，调用方必须据此把注入清空，避免把过期身份拼进请求。
 */
export function resolveActiveIdentity(
  shares: IdentitySlots,
  activeGameKey: string | null,
): PlayerIdentity | null {
  if (!activeGameKey) return null
  return shares[activeGameKey] ?? null
}

export type StartupRoute = 'login' | 'play' | 'selector' | 'owner'

/**
 * 启动分流判定（index.tsx 消费）：
 * - 未配置服务器 → 登录；
 * - 恰好一份身份 → 直接进该局（保持既有行为）；
 * - 多份身份 → 停留本页渲染身份选择；
 * - 零身份 → Owner 路径（token 直进大厅，开放服务器经 /me 探测）。
 */
export function resolveStartupRoute(input: {
  baseUrl: string
  identities: readonly PlayerIdentity[]
}): StartupRoute {
  if (!input.baseUrl) return 'login'
  if (input.identities.length === 1) return 'play'
  if (input.identities.length > 1) return 'selector'
  return 'owner'
}

/**
 * 本地保存的玩家 uid 是否仍是该局成员（对齐主仓库 frontend-v2/src/utils/joinIdentity.ts）。
 *
 * 服务端在 detail.viewer 里明确说明这次详情是按谁投影的：只有它说「你就是这个席位」
 * 才算成员。访客（被踢、席位链接被 GM 重新签发、本设备没有该席位凭证）只拿到大厅视图
 * （viewer.kind = outsider，且没有任何玩家名单）。没有 viewer 的负载（席位凭证上线前的
 * 旧服务端）才回退到 multiplayer 名单。
 */
export function isStoredPlayerMember(detail: Partial<GameDetail>, uid: string): boolean {
  if (!uid) return false
  const viewer = detail.viewer
  if (viewer) return viewer.kind === 'seat' && viewer.uid === uid
  const m = detail.multiplayer
  const members = [
    ...(m?.ready_players ?? []),
    ...(m?.waiting_players ?? []),
    ...(m?.away_players ?? []),
  ]
  return members.some((player) => player.user_id === uid)
}

/** 本次请求所坐席位的角色名（凭席位凭证访问时），找不到名字退回 uid；不是席位返回空串 */
export function seatCharacterNameOf(detail: Partial<GameDetail> | null | undefined): string {
  const uid = seatUidOf(detail)
  if (!uid) return ''
  const m = detail?.multiplayer
  const players = [...(m?.ready_players ?? []), ...(m?.waiting_players ?? []), ...(m?.away_players ?? [])]
  return players.find((player) => player.user_id === uid)?.character_name || uid
}

/** 服务端认定的本次请求所坐席位 uid（凭席位凭证访问时）；访客/GM/旧服务端返回空串 */
export function seatUidOf(detail: Partial<GameDetail> | null | undefined): string {
  const viewer = detail?.viewer
  return viewer?.kind === 'seat' && viewer.uid ? viewer.uid : ''
}
