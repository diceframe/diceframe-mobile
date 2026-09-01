import * as React from 'react'
import { Image, type ImageRef } from 'expo-image'

import { apiAssetDataUri, type AssetSource } from '@/api/assets'

import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Text } from '@/components/ui/text'

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

  // effect 只依赖 key：source 每次渲染都是新对象，键控内容不变时不重新加载
  React.useEffect(() => {
    let cancelled = false
    if (!source) return () => { cancelled = true }

    async function loadImage(asset: AssetSource) {
      try {
        const uri = await loadSourceUri(asset)
        const loaded = await Image.loadAsync({ uri })
        if (!cancelled) {
          setFailed(false)
          setImage(loaded)
        }
      } catch {
        if (!cancelled) setFailed(true)
      }
    }
    void loadImage(source)

    return () => {
      cancelled = true
    }
  }, [key])

  if (!source || failed || !image) {
    const initial = name.trim().charAt(0).toUpperCase() || '?'
    return (
      <Avatar alt={name} className={className}>
        <AvatarFallback>
          <Text className="font-semibold text-muted-foreground">{initial}</Text>
        </AvatarFallback>
      </Avatar>
    )
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
