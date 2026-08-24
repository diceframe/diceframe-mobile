import * as React from 'react'
import { Image, type ImageRef } from 'expo-image'

import { apiAssetDataUri, type AssetSource } from '@/api/assets'

import { Avatar } from './avatar'

function sourceKey(source: AssetSource | null): string {
  return source ? `${source.uri}|${source.apiPath ?? ''}` : ''
}

function loadSourceUri(source: AssetSource): Promise<string> {
  // 鉴权资源经 fetch 管道拿字节（Bearer/cookie/分享参数由 apiBlob 统一携带），
  // 静态资源直链加载。
  return source.apiPath ? apiAssetDataUri(source.apiPath) : Promise.resolve(source.uri)
}

export function RemoteAvatar({
  source,
  name,
  className,
  accessibilityLabel,
}: {
  source: AssetSource | null
  name: string
  className: string
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
    return <Avatar name={name} className={className} />
  }

  return (
    <Image
      source={image}
      className={className}
      contentFit="cover"
      accessibilityLabel={accessibilityLabel ?? name}
    />
  )
}
