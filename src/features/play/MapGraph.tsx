import * as React from 'react'
import { Pressable, View } from 'react-native'
import { Image as ExpoImage } from 'expo-image'
import { Crosshair } from 'lucide-react-native'
import { GestureDetector, Gesture } from 'react-native-gesture-handler'
import { useSharedValue, type SharedValue } from 'react-native-reanimated'
import Svg, { Circle, G, Line, Path, Text as SvgText, Image as SvgImage } from 'react-native-svg'

import { mapAssetSource } from '@/api/assets'
import type { MapData, MapLocation } from '@/api/types'
import { Text } from '@/components/ui/text'
import { Icon } from '@/components/ui/icon'
import { useT } from '@/i18n/t'
import { useThemeToken } from '@/lib/theme'
import { forceLayout, type MapNode } from './mapLayout'
import {
  hasSize,
  hitTestNode,
  mapViewBox,
  panView,
  type MapViewState,
  type Size,
  zoomAtPoint,
} from './mapView'
import { useAssetUri } from './useAssetUri'

export interface MapGraphProps {
  map?: MapData | null
  currentScene?: string
  /** 选中地点 id（高亮节点） */
  selectedLocationId?: string
  showHeader?: boolean
  onSelectLocation?: (location: MapLocation) => void
}

const TAP_SLOP = 8 // px：总位移不超过此值视为点击
const RESET_DURATION = 260 // ms，与 Web resetView 动画一致
// lucide Star 的标准路径；直接画入地图现有 SVG，避免嵌套 Svg 的坐标偏移和裁切。
const STAR_ICON_PATH = 'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z'

/** 连线：connected_to 可引用 id 或 name，按节点对去重（对齐 Web edges） */
function buildEdges(
  nodes: MapNode[],
  locations: MapLocation[],
): { x1: number; y1: number; x2: number; y2: number }[] {
  const indexById = new Map<string, number>()
  nodes.forEach((node, i) => indexById.set(node.id, i))
  const indexByNameOrId = new Map<string, number>()
  nodes.forEach((node, i) => {
    indexByNameOrId.set(node.name, i)
    indexByNameOrId.set(node.id, i)
  })
  const seen = new Set<string>()
  const out: { x1: number; y1: number; x2: number; y2: number }[] = []
  locations.forEach((loc) => {
    const ai = indexById.get(String(loc.id ?? loc.name ?? ''))
    if (ai === undefined) return
    for (const target of loc.connected_to || []) {
      const bi = indexByNameOrId.get(String(target))
      if (bi === undefined) continue
      const key = ai < bi ? `${ai}-${bi}` : `${bi}-${ai}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ x1: nodes[ai].x, y1: nodes[ai].y, x2: nodes[bi].x, y2: nodes[bi].y })
    }
  })
  return out
}

/**
 * 复位镜头动画：三次 ease-out 缓动（时长 RESET_DURATION，与 Web resetView 一致）。
 * 每帧把最新动画句柄写回 handleRef，调用方据此中途取消；动画结束写 0。
 * 独立于组件定义：内部用 performance.now/requestAnimationFrame，React Compiler
 * 的 purity 检查不允许这类非纯调用出现在组件渲染作用域内。
 */
function animateReset(
  start: MapViewState,
  target: MapViewState,
  commit: (next: MapViewState) => void,
  handleRef: { current: number },
): void {
  const startTime = performance.now()
  const step = (now: number) => {
    const p = Math.min(1, (now - startTime) / RESET_DURATION)
    const ease = 1 - Math.pow(1 - p, 3)
    commit({
      zoom: start.zoom + (target.zoom - start.zoom) * ease,
      centerX: start.centerX + (target.centerX - start.centerX) * ease,
      centerY: start.centerY + (target.centerY - start.centerY) * ease,
    })
    handleRef.current = p < 1 ? requestAnimationFrame(step) : 0
  }
  handleRef.current = requestAnimationFrame(step)
}

// ---- 手势换算（模块级，JS 线程）----
// 回调体集中在模块函数：React Compiler 把组件内创建的函数视为渲染期代码，
// 在其中触碰 ref / setState 会被拒绝；sharedValue 是不透明对象，可安全穿透。
// 连续性由 viewSV 承载（事件间隔可能早于 React 重渲染），提交经 commit 进
// React 状态驱动 viewBox，与旧 responder 数据流一致。

/** 单指拖拽：增量位移 → 视野平移 */
function applyPanGesture(
  e: { changeX: number; changeY: number },
  viewSV: SharedValue<MapViewState>,
  sizeSV: SharedValue<Size>,
  commit: (view: MapViewState) => void,
) {
  const size = sizeSV.value
  if (!hasSize(size)) return
  const next = panView(viewSV.value, e.changeX, e.changeY, size)
  viewSV.value = next
  commit(next)
}

function beginPinchGesture(e: { focalX: number; focalY: number }, lastFocalSV: SharedValue<{ x: number; y: number }>) {
  lastFocalSV.value = { x: e.focalX, y: e.focalY }
}

/** 双指捏合：以中点为锚缩放，再跟随中点位移（与旧 responder 实现逐帧等价） */
function applyPinchGesture(
  e: { scaleChange: number; focalX: number; focalY: number },
  viewSV: SharedValue<MapViewState>,
  sizeSV: SharedValue<Size>,
  lastFocalSV: SharedValue<{ x: number; y: number }>,
  commit: (view: MapViewState) => void,
) {
  const size = sizeSV.value
  if (!hasSize(size)) return
  const focal = { x: e.focalX, y: e.focalY }
  let next = zoomAtPoint(
    viewSV.value,
    size,
    e.scaleChange,
    focal.x - size.width / 2,
    focal.y - size.height / 2,
  )
  next = panView(next, focal.x - lastFocalSV.value.x, focal.y - lastFocalSV.value.y, size)
  lastFocalSV.value = focal
  viewSV.value = next
  commit(next)
}

/** 点击命中：屏幕点 → 最近节点 */
function applyTapGesture(
  e: { x: number; y: number },
  nodes: MapNode[],
  locationIndex: Map<string, MapLocation>,
  locations: MapLocation[],
  viewSV: SharedValue<MapViewState>,
  sizeSV: SharedValue<Size>,
  onSelectLocation?: (location: MapLocation) => void,
) {
  if (!onSelectLocation) return
  const size = sizeSV.value
  const node = hitTestNode(
    nodes,
    viewSV.value,
    size,
    e.x - size.width / 2,
    e.y - size.height / 2,
  )
  if (!node) return
  const location =
    locationIndex.get(node.id) ?? locations.find((item) => item.name === node.name)
  if (location) onSelectLocation(location)
}

/**
 * 力导向地图图（移植自 Web MapGraph）：节点/连线/当前场景★/内容包底图与图标，
 * 支持单指拖拽、双指捏合缩放（以双指中点为锚）、点击节点选中。
 * 底图固定不随节点层平移缩放（对齐 Web 行为）。
 */
export function MapGraph({
  map,
  currentScene,
  selectedLocationId = '',
  showHeader = true,
  onSelectLocation,
}: MapGraphProps) {
  const t = useT()
  const locations = map?.locations ?? []
  const locationIndex = new Map(
    locations.map((location) => [String(location.id ?? location.name ?? ''), location]),
  )
  const nodes = forceLayout(locations, {
    anchorId: String(map?.current_location_id || currentScene || '') || undefined,
  })
  const currentNode = nodes.find((node) => node.current) ?? null

  const backgroundUri = useAssetUri(mapAssetSource(map?.active_map?.background?.url))

  // 容器尺寸经 onLayout 进入 React 状态，驱动手势换算与 viewBox
  const [size, setSize] = React.useState<Size>({ width: 0, height: 0 })
  // 视图状态按地图身份键控：地图/当前地点变化时自动回到复位视角（★ 是布局锚点，
  // 必在世界原点）；场景文本随剧情每轮变化，不因此抢用户视角（对齐 Web 逻辑）
  const mapIdentity = `${map?.active_map?.id || ''}:${map?.current_location_id || ''}:${locations.length}`
  const [viewRecord, setViewRecord] = React.useState<{
    key: string
    view: MapViewState
  } | null>(null)

  const gold = useThemeToken('gold')
  const foreground = useThemeToken('foreground')
  const card = useThemeToken('card')
  const background = useThemeToken('background')
  const border = useThemeToken('border')

  const mapName = map?.active_map?.name || t('mapTitle')
  const view = viewRecord?.key === mapIdentity ? viewRecord.view : resetTargetView()

  function resetTargetView(): MapViewState {
    const defaultZoom = Number(map?.active_map?.default_view?.zoom)
    const defaultX = Number(map?.active_map?.default_view?.x)
    const defaultY = Number(map?.active_map?.default_view?.y)
    return {
      zoom: Number.isFinite(defaultZoom) ? Math.min(8, Math.max(0.25, defaultZoom)) : 1,
      centerX: currentNode?.x ?? (Number.isFinite(defaultX) ? defaultX : 0),
      centerY: currentNode?.y ?? (Number.isFinite(defaultY) ? defaultY : 0),
    }
  }

  function commitView(next: MapViewState) {
    setViewRecord({ key: mapIdentity, view: next })
  }

  const resetAnimRef = React.useRef(0)

  // ---- 手势（RNGH Gesture API）：只借它的手势识别与多点触控簿记。
  // viewSV 是事件间连续性的真相源（渲染态经 effect 反向同步），每次手势事件
  // 都 commit 进 React 状态驱动 viewBox，与旧 responder 数据流一致 ----
  const viewSV = useSharedValue(view)
  const sizeSV = useSharedValue<Size>({ width: 0, height: 0 })
  const lastFocalSV = useSharedValue({ x: 0, y: 0 })

  React.useEffect(() => {
    // 渲染态是提交真相：地图切换/复位动画逐帧/onLayout 都经这里同步给手势换算
    viewSV.value = view
    sizeSV.value = size
  })

  const pan = Gesture.Pan()
    .maxPointers(1)
    .runOnJS(true)
    .onChange((e) => applyPanGesture(e, viewSV, sizeSV, commitView))

  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onBegin((e) => beginPinchGesture(e, lastFocalSV))
    .onChange((e) => applyPinchGesture(e, viewSV, sizeSV, lastFocalSV, commitView))

  const tap = Gesture.Tap()
    .maxDistance(TAP_SLOP)
    .runOnJS(true)
    .onEnd((e) =>
      applyTapGesture(e, nodes, locationIndex, locations, viewSV, sizeSV, onSelectLocation),
    )

  const mapGesture = Gesture.Simultaneous(pan, pinch, tap)

  React.useEffect(
    () => () => {
      if (resetAnimRef.current) cancelAnimationFrame(resetAnimRef.current)
    },
    [],
  )

  /** 回到当前场景：复位镜头，同时恢复当前位置的选中圆环与详情。 */
  function resetView() {
    if (currentNode && onSelectLocation) {
      const currentLocation =
        locationIndex.get(currentNode.id) ??
        locations.find((location) => location.name === currentNode.name)
      if (currentLocation) onSelectLocation(currentLocation)
    }

    if (resetAnimRef.current) cancelAnimationFrame(resetAnimRef.current)
    animateReset(view, resetTargetView(), commitView, resetAnimRef)
  }

  const edges = buildEdges(nodes, locations)
  const viewBox = mapViewBox(view, size)

  if (nodes.length === 0) {
    return (
      <View className="items-center py-8">
        <Text variant="muted">{t('dfMapNoData')}</Text>
      </View>
    )
  }

  return (
    <View className="flex-1 gap-2">
      {showHeader && (
        <View className="flex-row items-center justify-between gap-2">
          <View className="min-w-0 flex-1">
            <Text variant="muted" className="text-xs font-extrabold tracking-widest">
              MAP
            </Text>
            <Text variant="h4" numberOfLines={1} className="mt-0.5">
              {mapName}
            </Text>
          </View>
          <Pressable
            className="flex-row items-center gap-1.5 rounded-md border border-border px-3 py-2 active:bg-accent"
            accessibilityLabel={t('mapRecenter')}
            onPress={resetView}
          >
            <Icon as={Crosshair} size={14} className="text-primary" />
            <Text variant="small" className="text-primary">
              {t('mapRecenter')}
            </Text>
          </Pressable>
        </View>
      )}

      <GestureDetector gesture={mapGesture}>
        <View
          className="relative min-h-[220px] flex-1 overflow-hidden rounded-md border border-border"
          onLayout={(event) => {
            const { width, height } = event.nativeEvent.layout
            setSize((prev) =>
              prev.width === width && prev.height === height ? prev : { width, height },
            )
          }}
        >
          {/* 底图固定，不随节点层平移缩放（对齐 Web：background 在 svg 外层） */}
          {backgroundUri ? (
            <>
              <ExpoImage
                source={{ uri: backgroundUri }}
                className="absolute inset-0"
                style={{ width: '100%', height: '100%', opacity: 0.78 }}
                contentFit="cover"
              />
              <View
                className="absolute inset-0"
                style={{ backgroundColor: background, opacity: 0.42 }}
              />
            </>
          ) : null}

          <View className="absolute inset-0">
            <Svg
              style={{ width: '100%', height: '100%' }}
              viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
              preserveAspectRatio="xMidYMid meet"
            >
              {edges.map((edge, i) => (
                <Line
                  key={`edge-${i}`}
                  x1={edge.x1}
                  y1={edge.y1}
                  x2={edge.x2}
                  y2={edge.y2}
                  stroke={gold}
                  strokeOpacity={0.5}
                  strokeWidth={0.7}
                  strokeLinecap="round"
                />
              ))}
              {nodes.map((node) => (
                <MapNodeShape
                  key={node.id}
                  node={node}
                  location={locationIndex.get(node.id)}
                  selected={selectedLocationId === node.id}
                  colors={{ gold, foreground, card, background, border }}
                />
              ))}
            </Svg>
          </View>
        </View>
      </GestureDetector>
    </View>
  )
}

/** 单个节点：图标异步解析（鉴权 /api 资源转 data URI），未就绪时回落为圆点 */
function MapNodeShape({
  node,
  location,
  selected,
  colors,
}: {
  node: MapNode
  location?: MapLocation
  selected: boolean
  colors: { gold: string; foreground: string; card: string; background: string; border: string }
}) {
  const iconUri = useAssetUri(mapAssetSource(location?.icon_url))
  return (
    <G transform={`translate(${node.x},${node.y})`}>
      <Circle
        r={4.6}
        fill={colors.card}
        fillOpacity={0.88}
        stroke={selected ? colors.gold : colors.border}
        strokeOpacity={selected ? 1 : 0.82}
        strokeWidth={selected ? 1.1 : 0.55}
      />
      {iconUri ? (
        <SvgImage
          href={{ uri: iconUri }}
          x={-3.2}
          y={-3.2}
          width={6.4}
          height={6.4}
          preserveAspectRatio="xMidYMid meet"
        />
      ) : (
        <Circle r={3.2} fill={colors.gold} />
      )}
      {/* react-native-svg 没有 Web paint-order: stroke；单层文字会让描边覆盖
          填充，尤其小字号下看起来像黑字。先画底色轮廓，再画无描边前景。 */}
      <SvgText
        y={8}
        textAnchor="middle"
        fontSize={3.2}
        fill={colors.background}
        stroke={colors.background}
        strokeWidth={1.1}
        fontWeight={node.current ? '800' : '400'}
      >
        {node.name}
      </SvgText>
      <SvgText
        y={8}
        textAnchor="middle"
        fontSize={3.2}
        fill={node.current ? colors.gold : colors.foreground}
        fontWeight={node.current ? '800' : '400'}
      >
        {node.name}
      </SvgText>
      {node.current ? (
        <G transform="translate(-2.28,-9.3) scale(.19)">
          <Path
            d={STAR_ICON_PATH}
            fill={colors.background}
            stroke={colors.background}
            strokeWidth={4.2}
            strokeLinejoin="round"
          />
          <Path
            d={STAR_ICON_PATH}
            fill="none"
            stroke={colors.gold}
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </G>
      ) : null}
    </G>
  )
}
