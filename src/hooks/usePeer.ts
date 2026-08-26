import type { Peer } from '@/types'

const UNSUPPORTED_MESSAGE = '当前服务器未提供 P2P 设备发现与连接接口'

/**
 * 保留给旧路由的兼容边界。服务端提供真实接口前，不生成模拟设备或连接状态。
 */
export function usePeer() {
  const peers: Peer[] = []

  async function unsupported(): Promise<never> {
    throw new Error(UNSUPPORTED_MESSAGE)
  }

  return {
    peers,
    loading: false,
    error: UNSUPPORTED_MESSAGE,
    refreshPeers: unsupported,
    connectPeer: unsupported,
    disconnectPeer: unsupported,
  }
}
