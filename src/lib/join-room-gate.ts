/**
 * 加入页拉本局可选卡失败时，是否其实是房间访问失效（GM 改了房间密码、令牌过期）：
 * - 服务端明确 403 needs_room_password；
 * - 或者这一局有房间密码、而本机的房间令牌已经没了（client 收到拒绝时会先清掉它）。
 * 是就回到房间密码步骤，不能照常展示建卡表单——否则玩家填完表单提交才发现进不去。
 */
export function cardsFailureNeedsRoomGate(
  error: unknown,
  hasRoomPassword: boolean,
  holdsRoomToken: boolean,
): boolean {
  if ((error as { needsRoomPassword?: unknown } | null)?.needsRoomPassword === true) return true
  return hasRoomPassword && !holdsRoomToken
}
