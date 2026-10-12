/**
 * 接管链接（带 seat= 的邀请链接）里的席位凭证什么时候写入本机。
 *
 * 任何网页都能用深链 `diceframe://join?link=…&seat=…` 把加入页拉起来，而输入框只显示剥掉
 * seat= 的链接，用户看到的是一条普通邀请。若点「解析链接」就把隐藏的凭证写进本机：
 * - 垃圾凭证会顶掉本机这一局原有的席位凭证，服务端随即拒绝，玩家丢了自己的席位；
 * - 攻击者自己的凭证会让玩家坐进攻击者控制的席位。
 * 所以深链带来的凭证解析时只记在内存，等用户在「找回」步骤看清要接管的角色并明确确认后才用；
 * 本机已有不同的席位凭证时还要再确认一次替换。用户自己粘贴 / 扫码的链接保持原行为。
 */
import { linkToParse } from './share-link'

/**
 * 解析时怎么处理链接里的席位凭证：
 * - store：用户自己给的链接（粘贴、扫码，或改过输入框）——照旧解析时写入；
 * - defer：输入框仍是深链预填（凭证对用户不可见）——只记住，确认找回时才用；
 * - none：链接不带凭证。
 */
export function seatHandlingOnParse(input: {
  /** 直接传给解析的链接（扫码结果、自动解析）；点按钮时为 undefined */
  rawLink: string | undefined
  /** 输入框当前内容 */
  fieldText: string
  /** 深链带来的原始链接（含 seat=）；没有深链时为空 */
  incomingLink: string
  /** 解析出的席位凭证 */
  seat: string
}): 'store' | 'defer' | 'none' {
  if (!input.seat) return 'none'
  if (input.rawLink !== undefined) return 'store'
  // 与 linkToParse 同一判定：输入框仍是深链的预填内容
  return linkToParse(input.fieldText, input.incomingLink) === input.incomingLink && !!input.incomingLink ? 'defer' : 'store'
}

/**
 * 用户在找回步骤确认后执行接管：本机已有不同的席位凭证时先确认替换（取消则什么都不动），
 * 再凭链接里的凭证找回席位；成功后才写入服务端返回的凭证（失败不写，原凭证保留）。
 */
export async function runTakeover<T extends { seat_token?: unknown }>(deps: {
  pendingSeat: string
  storedSeat: string
  confirmReplace: () => Promise<boolean>
  join: (seatToken: string) => Promise<T>
  store: (seatToken: unknown) => void
}): Promise<T | 'cancelled'> {
  if (deps.storedSeat && deps.storedSeat !== deps.pendingSeat && !(await deps.confirmReplace())) return 'cancelled'
  const result = await deps.join(deps.pendingSeat)
  deps.store(result.seat_token ?? deps.pendingSeat)
  return result
}
