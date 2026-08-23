/**
 * 玩家标识色 —— 与 Web frontend-v2/src/utils/play.ts 的 playerColor 同算法，
 * 同一 uid 在两端颜色一致。RN 的颜色解析用逗号语法（hsl/hsla）。
 */
export function playerColor(userId: string): string {
  let hash = 0
  String(userId || 'player')
    .split('')
    .forEach((ch) => {
      hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0
    })
  return `hsl(${Math.abs(hash) % 360}, 68%, 66%)`
}

/** 同色 12% 透明度（气泡底色） */
export function playerColorSoft(userId: string): string {
  let hash = 0
  String(userId || 'player')
    .split('')
    .forEach((ch) => {
      hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0
    })
  return `hsla(${Math.abs(hash) % 360}, 68%, 66%, 0.12)`
}
