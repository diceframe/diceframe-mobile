import * as React from 'react'
import { View } from 'react-native'
import { Image as ExpoImage } from 'expo-image'

import { useT } from '@/i18n/t'
import { useAssetUri } from './useAssetUri'
import type { AssetSource } from '@/api/assets'

/**
 * 对局时间线的沉浸式背景：数据源是 detail.scene_image（服务端最新场景图引用，
 * 自动生图完成后由 set_scene_image 更新，经 SSE 刷新到端上），因此每次生图
 * 结束背景会自动切换为最新那张。图上叠一层高透明度背景色，时间线卡片均为
 * 不透明底色，仅卡片间隙透出场景氛围（对齐 Web 沉浸式对局页）。
 */
export function SceneBackdrop({ source }: { source: AssetSource | null }) {
  const t = useT()
  const uri = useAssetUri(source)
  // 新图下载期间短暂无背景（局域网加载很快），避免在渲染期持有过期 uri 引用
  if (!uri) return null
  return (
    <View pointerEvents="none" className="absolute inset-0">
      <ExpoImage
        source={{ uri }}
        className="h-full w-full"
        contentFit="cover"
        accessibilityLabel={t('dfPlaySceneBackdropA11y')}
      />
      <View className="absolute inset-0 bg-background opacity-70" />
    </View>
  )
}
