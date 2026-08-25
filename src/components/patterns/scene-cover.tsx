import * as React from 'react'
import { View } from 'react-native'
import { Image, type ImageRef } from 'expo-image'

import { apiAssetDataUri, type AssetSource } from '@/api/assets'
import { cn } from '@/lib/utils'

function sourceKey(source: AssetSource | null): string {
  return source ? `${source.uri}|${source.apiPath ?? ''}` : ''
}

/** 鉴权封面经 apiBlob 转 data URI；失败时回退静态直链（规则内置场景） */
function loadSourceUri(source: AssetSource): Promise<string> {
  return source.apiPath
    ? apiAssetDataUri(source.apiPath).catch(() => source.uri)
    : Promise.resolve(source.uri)
}

/**
 * 冒险封面图（对齐 Web OverviewView 的 game-card-cover：
 * /games/{key}/scene-image 封面 + 失败回退规则内置场景）。
 */
export function SceneCover({
  source,
  className,
  accessibilityLabel,
}: {
  source: AssetSource | null
  className?: string
  accessibilityLabel?: string
}) {
  const [image, setImage] = React.useState<ImageRef | null>(null)
  const [failed, setFailed] = React.useState(false)
  const key = sourceKey(source)
  const stableSource = React.useMemo(() => source, [key])

  React.useEffect(() => {
    let cancelled = false
    if (!stableSource) return () => { cancelled = true }

    void loadSourceUri(stableSource)
      .then((uri) => Image.loadAsync({ uri }))
      .then((loaded) => {
        if (!cancelled) {
          setFailed(false)
          setImage(loaded)
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })

    return () => {
      cancelled = true
    }
  }, [key, stableSource])

  if (!stableSource || failed || !image) {
    // 加载中/失败：占位底色，保持卡片布局稳定
    return <View className={cn('bg-muted', className)} accessibilityLabel={accessibilityLabel} />
  }

  return (
    <Image
      source={image}
      className={className}
      contentFit="cover"
      accessibilityLabel={accessibilityLabel}
    />
  )
}
