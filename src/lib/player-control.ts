/**
 * 席位控制方式（上游 Player Control Contract 的客户端读法）。
 *
 * 权威状态全在服务端：`players[uid].control.mode` 是 human / ai / unclaimed，
 * `control.temporary` 表示这次 AI 接管来自「暂离交给 AI」而不是 GM 的显式托管。
 * 客户端只做归一化与判断，不自己造 AI 状态，也不碰 control.revision。
 *
 * 支持的服务器（见 APP_MIN_SERVER_VERSION）一定下发这些字段：服务端在实例载入与
 * put_player 时都会 ensure_control，旧存档也会被补齐。所以这里的归一化是对非法值
 * 的防御，不是对旧服务器的降级——版本不匹配在连接入口就已经拦掉了。
 *
 * 房间级 `away_control_policy` 决定玩家点暂离时的语义：
 * pause（默认，角色留在原地）/ ai_takeover（交给 AI 临时托管）。
 */
import type { GameDetail, Multiplayer, Player } from '@/api/types'

export const PLAYER_CONTROL_MODES = ['human', 'ai', 'unclaimed'] as const
export type PlayerControlMode = (typeof PLAYER_CONTROL_MODES)[number]

export const AWAY_CONTROL_POLICIES = ['pause', 'ai_takeover'] as const
export type AwayControlPolicy = (typeof AWAY_CONTROL_POLICIES)[number]

/** 非法或缺失的 mode 归一到 human，绝不凭空造出一个 AI 控制器。 */
export function playerControlMode(player?: Player | null): PlayerControlMode {
  const mode = String(player?.control?.mode ?? '')
  return mode === 'ai' || mode === 'unclaimed' ? mode : 'human'
}

/** 「AI 临时托管」（暂离触发）与「AI 托管」（GM 决定）是两种状态，展示与可操作性都不同。 */
export function isTemporaryHost(player?: Player | null): boolean {
  return playerControlMode(player) === 'ai' && Boolean(player?.control?.temporary)
}

/**
 * GM 在这个席位上能做的托管切换：
 * - 已是 GM 显式托管 → 只能停止（交回玩家）；
 * - 暂离带来的临时托管 → 不给按钮：它跟着暂离状态走，该点的是「回来」；
 * - 其余（玩家 / 等待认领）→ 可以设为 AI。
 * 服务端只接受 'ai' 与 'human' 两个目标模式。
 */
export function controlToggleFor(player?: Player | null): 'ai' | 'human' | null {
  const mode = playerControlMode(player)
  if (mode === 'ai') return isTemporaryHost(player) ? null : 'human'
  return 'ai'
}

/** 任意来源的暂离语义取值（详情字段、设置草稿）；只有显式 ai_takeover 才算，其余按服务端默认的 pause。 */
export function normalizeAwayPolicy(value: unknown): AwayControlPolicy {
  return value === 'ai_takeover' ? 'ai_takeover' : 'pause'
}

/** 房间暂离语义（服务端默认 pause）。 */
export function awayControlPolicy(detail?: GameDetail | null): AwayControlPolicy {
  return normalizeAwayPolicy(detail?.away_control_policy)
}

/**
 * 「N/M 已就绪」的分子分母。
 *
 * 服务端的 ready / waiting 只统计真人活跃席位：AI 托管与未认领席位既不进
 * waiting_players、也不阻塞推进。拿 player_count 当分母，一桌 1 真人 + 3 AI
 * 会永远显示「1/4 已就绪」，看起来像还差三个人没交行动。
 */
export function readyProgress(multiplayer?: Multiplayer | null): { ready: number; total: number } {
  const ready = Number(multiplayer?.ready_count ?? 0)
  return { ready, total: ready + (multiplayer?.waiting_players?.length ?? 0) }
}
