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
  const stableSource = React.useMemo(() => source, [key])

  React.useEffect(() => {
    let cancelled = false
    if (!stableSource) return () => {
      cancelled = true
    }

    const load = stableSource.apiPath
      ? apiAssetDataUri(stableSource.apiPath).catch(() => null)
      : Promise.resolve(stableSource.uri)

    void load.then((value) => {
      if (!cancelled && value) setLoaded({ key, uri: value })
    })

    return () => {
      cancelled = true
    }
  }, [key, stableSource])

  return loaded?.key === key ? loaded.uri : null
}
