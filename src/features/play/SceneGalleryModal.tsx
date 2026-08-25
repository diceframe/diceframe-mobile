import * as React from 'react'
import { ActivityIndicator, ScrollView, View } from 'react-native'
import { Image as ExpoImage } from 'expo-image'

import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/patterns/sheet'
import { Text } from '@/components/ui/text'
import type { GeneratedImageItem } from '@/api/types'
import { apiAssetDataUri } from '@/api/assets'
import { strings } from '@/lib/strings'

function GalleryImage({ item, gameKey }: { item: GeneratedImageItem; gameKey: string }) {
  const [uri, setUri] = React.useState<string | null>(null)

  React.useEffect(() => {
    let active = true
    const path = `/games/${encodeURIComponent(gameKey)}/generated-images/${encodeURIComponent(item.asset_id)}`
    apiAssetDataUri(path)
      .then((dataUri) => {
        if (active) setUri(dataUri)
      })
      .catch(() => {
        // 加载失败时保持 null，显示占位
      })
    return () => {
      active = false
    }
  }, [item.asset_id, gameKey])

  return (
    <View className="rounded-lg border border-border overflow-hidden gap-2">
      {uri ? (
        <ExpoImage
          source={{ uri }}
          className="w-full h-40"
          contentFit="cover"
          alt={item.prompt || ''}
        />
      ) : (
        <View className="w-full h-40 items-center justify-center bg-muted">
          <ActivityIndicator />
        </View>
      )}
      {item.prompt && (
        <Text variant="small" numberOfLines={2} className="px-2 pb-2 text-muted-foreground">
          {item.prompt}
        </Text>
      )}
      {item.round != null && (
        <Text variant="small" className="px-2 pb-2">
          第 {item.round} 回合
        </Text>
      )}
    </View>
  )
}

interface SceneGalleryModalProps {
  open: boolean
  gameKey: string
  images: GeneratedImageItem[]
  loading: boolean
  onClose: () => void
}

/**
 * 场景图集弹窗（对齐 Web SceneGalleryModal：展示对局中生成的场景图）。
 */
export function SceneGalleryModal({
  open,
  gameKey,
  images,
  loading,
  onClose,
}: SceneGalleryModalProps) {
  return (
    <Sheet open={open} onClose={onClose} className="h-[80%]" scrollable={false}>
      <View className="flex-1 gap-4 pt-1">
        <Text variant="h3">{strings.play.sceneGallery}</Text>

        <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerClassName="gap-4 pb-6">
          {loading ? (
            <View className="items-center py-8">
              <ActivityIndicator />
            </View>
          ) : images.length === 0 ? (
            <Text variant="muted" className="text-center">
              暂无场景图
            </Text>
          ) : (
            images.map((item) => (
              <GalleryImage key={item.asset_id} item={item} gameKey={gameKey} />
            ))
          )}
        </ScrollView>
      </View>
    </Sheet>
  )
}
