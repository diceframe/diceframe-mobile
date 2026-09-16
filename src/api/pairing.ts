/**
 * 扫码配对：把一次性配对码兑换成本机的设备令牌。
 *
 * 兑换必须匿名发起（此刻手机还没有任何凭据），因此走 client 的 anonymous 通道，
 * 绝不携带当前实例的 Owner token 或玩家分享身份——调用方负责先把 baseUrl
 * 指向候选服务器（对齐 login/join 的候选探测流程）。
 */
import { api } from '@/api/client'
import type { PairingClaimResponse } from './types'

export async function claimPairingCode(code: string, label: string): Promise<string> {
  const result = await api<PairingClaimResponse>(
    '/pairing/claim',
    { method: 'POST', body: JSON.stringify({ code, label }) },
    { anonymous: true },
  )
  return result.device_token
}
