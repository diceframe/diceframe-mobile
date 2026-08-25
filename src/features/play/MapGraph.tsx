import * as React from 'react'
import {
  Pressable,
  View,
  type GestureResponderEvent,
  type NativeTouchEvent,
} from 'react-native'
import { Image as ExpoImage } from 'expo-image'
import { Crosshair } from 'lucide-react-native'
import Svg, { Circle, G, Line, Path, Text as SvgText, Image as SvgImage } from 'react-native-svg'

import { mapAssetSource } from '@/api/assets'
import type { MapData, MapLocation } from '@/api/types'
import { Text } from '@/components/ui/text'
import { Icon } from '@/components/ui/icon'
import { strings } from '@/lib/strings'
import { useThemeToken } from '@/lib/theme'
import { forceLayout, type MapNode } from './mapLayout'
import {
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

interface TouchPoint {
  x: number
  y: number
}

interface GestureState {
  points: Map<string, TouchPoint>
  /** 累计位移（px），超过阈值视为拖拽而非点击 */
  moved: number
  /** 本次手势出现过的最大触点数 */
  maxTouches: number
  /** page 坐标 → 视图内坐标的偏移（grant 时从 locationX/pageX 推出） */
  offset: TouchPoint | null
}

const TAP_SLOP = 8 // px：总位移不超过此值视为点击
const RESET_DURATION = 260 // ms，与 Web resetView 动画一致
// lucide Star 的标准路径；直接画入地图现有 SVG，避免嵌套 Svg 的坐标偏移和裁切。
const STAR_ICON_PATH = 'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z'

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
  const locations = React.useMemo(() => map?.locations ?? [], [map])
  const locationIndex = React.useMemo(
    () =>
      new Map(
        locations.map((location) => [String(location.id ?? location.name ?? ''), location]),
      ),
    [locations],
  )
  const nodes = React.useMemo<MapNode[]>(
    () =>
      forceLayout(locations, {
        anchorId: String(map?.current_location_id || currentScene || '') || undefined,
      }),
    [locations, map?.current_location_id, currentScene],
  )
  const currentNode = nodes.find((node) => node.current) ?? null

  const backgroundUri = useAssetUri(mapAssetSource(map?.active_map?.background?.url))

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

  const mapName = map?.active_map?.name || strings.map.title
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
  const gestureRef = React.useRef<GestureState>({
    points: new Map(),
    moved: 0,
    maxTouches: 0,
    offset: null,
  })

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
    const target = resetTargetView()
    const start = view
    const startTime = performance.now()
    const step = (now: number) => {
      const p = Math.min(1, (now - startTime) / RESET_DURATION)
      const ease = 1 - Math.pow(1 - p, 3)
      commitView({
        zoom: start.zoom + (target.zoom - start.zoom) * ease,
        centerX: start.centerX + (target.centerX - start.centerX) * ease,
        centerY: start.centerY + (target.centerY - start.centerY) * ease,
      })
      resetAnimRef.current = p < 1 ? requestAnimationFrame(step) : 0
    }
    resetAnimRef.current = requestAnimationFrame(step)
  }

  // ---- 手势：单指拖拽 / 双指捏合 / 点击命中 ----
  /** locationX 在部分平台/事件里缺失，grant 时记录 page→view 偏移做兜底 */
  function viewPoint(touch: NativeTouchEvent): TouchPoint | null {
    const gesture = gestureRef.current
    if (typeof touch.locationX === 'number') {
      return { x: touch.locationX, y: touch.locationY }
    }
    if (!gesture.offset) return null
    return { x: touch.pageX - gesture.offset.x, y: touch.pageY - gesture.offset.y }
  }

  function onResponderGrant(event: GestureResponderEvent) {
    const gesture = gestureRef.current
    gesture.points.clear()
    gesture.moved = 0
    gesture.maxTouches = event.nativeEvent.changedTouches.length
    gesture.offset = null
    for (const touch of event.nativeEvent.changedTouches) {
      const point = viewPoint(touch)
      if (!point) continue
      if (!gesture.offset) {
        gesture.offset = { x: touch.pageX - point.x, y: touch.pageY - point.y }
      }
      gesture.points.set(String(touch.identifier), point)
    }
  }

  function onResponderMove(event: GestureResponderEvent) {
    const gesture = gestureRef.current
    const current: TouchPoint[] = []
    const byId = new Map<string, TouchPoint>()
    for (const touch of event.nativeEvent.touches) {
      const point = viewPoint(touch)
      if (!point) continue
      current.push(point)
      byId.set(String(touch.identifier), point)
    }
    if (!current.length) return
    gesture.maxTouches = Math.max(gesture.maxTouches, current.length)

    const previous = [...gesture.points.values()]
    if (current.length >= 2 && previous.length >= 2) {
      // 双指捏合：以中点为锚缩放（锚点世界坐标不动），并跟随中点平移
      const [a, b] = current
      const [pa, pb] = previous
      const prevDist = Math.hypot(pa.x - pb.x, pa.y - pb.y)
      const curDist = Math.hypot(a.x - b.x, a.y - b.y)
      const prevMid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 }
      const curMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      if (prevDist > 0 && curDist > 0) {
        let next = zoomAtPoint(
          view,
          size,
          curDist / prevDist,
          curMid.x - size.width / 2,
          curMid.y - size.height / 2,
        )
        next = panView(next, curMid.x - prevMid.x, curMid.y - prevMid.y, size)
        commitView(next)
        gesture.moved +=
          Math.abs(curDist - prevDist) + Math.hypot(curMid.x - prevMid.x, curMid.y - prevMid.y)
      }
    } else if (current.length === 1 && previous.length >= 1) {
      // 单指拖拽：内容跟手
      const point = current[0]
      const prev = previous[previous.length - 1]
      const dx = point.x - prev.x
      const dy = point.y - prev.y
      gesture.moved += Math.abs(dx) + Math.abs(dy)
      commitView(panView(view, dx, dy, size))
    }
    gesture.points = byId
  }

  function onResponderRelease(event: GestureResponderEvent) {
    const gesture = gestureRef.current
    // 单指且几乎未移动 → 尝试命中节点
    if (gesture.maxTouches === 1 && gesture.moved <= TAP_SLOP && onSelectLocation) {
      const touch = event.nativeEvent.changedTouches[0]
      const point = touch ? viewPoint(touch) : null
      if (point) {
        const node = hitTestNode(
          nodes,
          view,
          size,
          point.x - size.width / 2,
          point.y - size.height / 2,
        )
        if (node) {
          const location =
            locationIndex.get(node.id) ??
            locations.find((item) => item.name === node.name)
          if (location) onSelectLocation(location)
        }
      }
    }
    for (const touch of event.nativeEvent.changedTouches) {
      gesture.points.delete(String(touch.identifier))
    }
    if (gesture.points.size === 0) gesture.offset = null
  }

  // 连线：connected_to 可引用 id 或 name，按节点对去重（对齐 Web edges）
  const edges = React.useMemo(() => {
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
  }, [nodes, locations])

  const viewBox = mapViewBox(view, size)

  if (nodes.length === 0) {
    return (
      <View className="items-center py-8">
        <Text variant="muted">{strings.map.noMapData}</Text>
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
            accessibilityLabel={strings.map.recenter}
            onPress={resetView}
          >
            <Icon as={Crosshair} size={14} className="text-primary" />
            <Text variant="small" className="text-primary">
              {strings.map.recenter}
            </Text>
          </Pressable>
        </View>
      )}

      <View
        className="relative min-h-[220px] flex-1 overflow-hidden rounded-md border border-border"
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout
          setSize((prev) =>
            prev.width === width && prev.height === height ? prev : { width, height },
          )
        }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={onResponderGrant}
        onResponderMove={onResponderMove}
        onResponderRelease={onResponderRelease}
        onResponderTerminate={() => {
          gestureRef.current.points.clear()
          gestureRef.current.offset = null
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
