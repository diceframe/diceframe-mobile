/**
 * 回合场景图的展示判定（纯逻辑，供时间线内嵌图与对局背景共用）。
 * 契约见 types.ts 的 RoundSceneImage / SceneImageRef：服务端在回合落地后
 * 异步生图，完成前 status 非 ready、reference 为空。
 */
import { sceneImageSource, type AssetSource } from '@/api/assets'
import type { RoundSceneImage } from '@/api/types'

/**
 * 回合内嵌场景图：status=ready 且引用能解析出资源才展示
 * （对齐 Web GameTimeline.sceneImageAsset 的 ready 门槛）。
 */
export function roundSceneImageSource(
  gameKey: string,
  scene?: RoundSceneImage | null,
): AssetSource | null {
  if (!scene || scene.status !== 'ready') return null
  return sceneImageSource(gameKey, scene.reference)
}
