import { getT } from '@/i18n/t'
import type { Peer } from '@/types'

/** 兼容边界的用户可见错误（调用时取即时语言） */
function unsupportedMessage(): string {
  return getT()('dfPeerHookUnsupported')
}

/**
 * 保留给旧路由的兼容边界。服务端提供真实接口前，不生成模拟设备或连接状态。
 */
export function usePeer() {
  const peers: Peer[] = []

  async function unsupported(): Promise<never> {
    throw new Error(unsupportedMessage())
  }

  return {
    peers,
    loading: false,
    error: unsupportedMessage(),
    refreshPeers: unsupported,
    connectPeer: unsupported,
    disconnectPeer: unsupported,
  }
}
