import * as React from 'react'

import { apiAssetDataUri, type AssetSource } from '@/api/assets'

function sourceKey(source: AssetSource | null): string {
  return source ? `${source.uri}|${source.apiPath ?? ''}` : ''
}

/**
 * 把 AssetSource 解析成可渲染的 uri：鉴权 /api 资源经 apiBlob 转 data URI
 * （会话级缓存），静态资源直接返回直链。加载中/失败返回 null。
 * 结果按 source key 键控，key 变化时自动回到未加载态。
 */
export function useAssetUri(source: AssetSource | null): string | null {
  const key = sourceKey(source)
  const [loaded, setLoaded] = React.useState<{ key: string; uri: string } | null>(null)

  // effect 只依赖 key：source 每次渲染都是新对象，键控内容不变时不重新加载
  React.useEffect(() => {
    let cancelled = false
    if (!source) return () => {
      cancelled = true
    }

    async function resolveUri(asset: AssetSource) {
      try {
        const value = asset.apiPath ? await apiAssetDataUri(asset.apiPath) : asset.uri
        if (!cancelled && value) setLoaded({ key, uri: value })
      } catch {
        // 失败保持未加载态（本 hook 对外返回 null）
      }
    }
    void resolveUri(source)

    return () => {
      cancelled = true
    }
  }, [key])

  return loaded?.key === key ? loaded.uri : null
}
