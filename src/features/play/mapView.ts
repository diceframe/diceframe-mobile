import type { MapNode } from './mapLayout'

/**
 * 地图视图状态与手势换算（对齐 Web MapGraph 的 viewBox 模型）。
 *
 * 世界坐标落在 [-50, 50]，zoom=1 时视野较短边跨 100 个世界单位；
 * centerX/Y 是视野正中所指的世界坐标（力导向把当前场景★锚定在原点）。
 */

export interface MapViewState {
  zoom: number
  centerX: number
  centerY: number
}

export interface Size {
  width: number
  height: number
}

export const MAP_MIN_ZOOM = 0.25
export const MAP_MAX_ZOOM = 8
/** zoom=1 时视野较短边跨的世界单位数 */
export const MAP_WORLD_SPAN = 100

export function clampZoom(zoom: number): number {
  return Math.min(MAP_MAX_ZOOM, Math.max(MAP_MIN_ZOOM, zoom))
}

/** 尺寸未就绪时返回 0，调用方应跳过手势处理 */
export function hasSize(size: Size): boolean {
  return size.width > 0 && size.height > 0
}

/** 每世界单位对应的屏幕像素数（viewBox 较短边贴齐容器较短边，与 meet 语义一致） */
export function pxPerUnit(view: MapViewState, size: Size): number {
  if (!hasSize(size)) return 0
  const span = MAP_WORLD_SPAN / view.zoom
  return Math.min(size.width, size.height) / span
}

/** 视野矩形（宽高按容器纵横比展开，中心对准 centerX/Y） */
export function mapViewBox(view: MapViewState, size: Size) {
  const span = MAP_WORLD_SPAN / view.zoom
  const wide = size.width >= size.height
  const w = wide ? span * (size.width / Math.max(1, size.height)) : span
  const h = wide ? span : span * (size.height / Math.max(1, size.width))
  return { x: view.centerX - w / 2, y: view.centerY - h / 2, w, h }
}

/** 拖拽平移：dx/dy 为屏幕像素位移，内容跟手（与 Web centerX -= dx*worldPerPixel 一致） */
export function panView(view: MapViewState, dx: number, dy: number, size: Size): MapViewState {
  const k = pxPerUnit(view, size)
  if (k <= 0) return view
  return { ...view, centerX: view.centerX - dx / k, centerY: view.centerY - dy / k }
}

/** 屏幕点（相对视野中心的像素坐标）→ 世界坐标 */
export function screenToWorld(
  view: MapViewState,
  size: Size,
  xPx: number,
  yPx: number,
): { x: number; y: number } {
  const k = pxPerUnit(view, size) || 1
  return { x: view.centerX + xPx / k, y: view.centerY + yPx / k }
}

/**
 * 以 focal（相对视野中心的像素坐标）为锚点缩放：
 * 缩放后 focal 处的世界坐标保持不变（对齐 Web 滚轮以光标为锚点的语义）。
 */
export function zoomAtPoint(
  view: MapViewState,
  size: Size,
  factor: number,
  fxPx: number,
  fyPx: number,
): MapViewState {
  const next: MapViewState = { ...view, zoom: clampZoom(view.zoom * factor) }
  const k = pxPerUnit(next, size)
  if (k <= 0) return view
  const world = screenToWorld(view, size, fxPx, fyPx)
  return { ...next, centerX: world.x - fxPx / k, centerY: world.y - fyPx / k }
}

/**
 * 点击命中测试：返回距离触点 radiusPx 像素内最近的节点。
 * 半径按屏幕像素换算成世界单位，保证缩放后依然好点。
 */
export function hitTestNode(
  nodes: MapNode[],
  view: MapViewState,
  size: Size,
  xPx: number,
  yPx: number,
  radiusPx = 26,
): MapNode | null {
  const k = pxPerUnit(view, size)
  if (k <= 0) return null
  const point = screenToWorld(view, size, xPx, yPx)
  const radius = radiusPx / k
  let best: MapNode | null = null
  let bestDist = radius
  for (const node of nodes) {
    const dist = Math.hypot(node.x - point.x, node.y - point.y)
    if (dist <= bestDist) {
      best = node
      bestDist = dist
    }
  }
  return best
}
