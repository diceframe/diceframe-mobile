/**
 * 扫码配对：把一次性配对码兑换成本机的设备令牌。
 *
 * 兑换必须匿名发起（此刻手机还没有任何凭据），因此走 client 的 anonymous 通道，
 * 绝不携带当前实例的 Owner token 或玩家分享身份——调用方负责先把 baseUrl
 * 指向候选服务器（对齐 login/join 的候选探测流程）。
 *
 * 同时上报本安装的 install id（内容同步契约：配对设备只能以自己的 install id 推送），
 * 调用方必须经 stores/local-library 的 resolveInstallId() 取得（Web 端为 null，不上报）。
 * - 同一 install id 重新配对：服务端吊销旧配对、接管绑定，返回 replaced_device_id（#495）；
 * - 400 INSTALL_ID_INVALID / 409 INSTALL_ID_IN_USE（#495 之前的服务端）：配对码未被消耗，
 *   不带 install id 再兑换一次，保证能登录；之后推送时首次使用会绑定或给出明确错误。
 */
import { ApiError, api } from '@/api/client'
import type { PairingClaimResponse } from './types'

export interface PairingClaimResult {
  deviceToken: string
  /** 被接管（吊销）的旧设备记录 id；没有接管为 undefined */
  replacedDeviceId?: string
  /** install id 被拒、改为不带 install id 完成配对时给出原因码 */
  installIdRejected?: 'INSTALL_ID_INVALID' | 'INSTALL_ID_IN_USE'
}

async function claim(code: string, label: string, installId: string | null): Promise<PairingClaimResponse> {
  const body: Record<string, string> = { code, label }
  if (installId) body.install_id = installId
  return api<PairingClaimResponse>('/pairing/claim', { method: 'POST', body: JSON.stringify(body) }, { anonymous: true })
}

export async function claimPairingCode(code: string, label: string, installId: string | null): Promise<PairingClaimResult> {
  try {
    const result = await claim(code, label, installId)
    return {
      deviceToken: result.device_token,
      ...(result.replaced_device_id ? { replacedDeviceId: result.replaced_device_id } : {}),
    }
  } catch (error) {
    const rejected = error instanceof ApiError && installId
      && ((error.status === 400 && error.code === 'INSTALL_ID_INVALID') || (error.status === 409 && error.code === 'INSTALL_ID_IN_USE'))
    if (!rejected) throw error
    const result = await claim(code, label, null)
    return { deviceToken: result.device_token, installIdRejected: (error as ApiError).code as PairingClaimResult['installIdRejected'] }
  }
}
