import { describe, expect, it } from 'vitest'
import {
  MAP_MAX_ZOOM,
  MAP_MIN_ZOOM,
  type MapViewState,
  type Size,
  clampZoom,
  hitTestNode,
  mapViewBox,
  panView,
  pxPerUnit,
  screenToWorld,
  zoomAtPoint,
} from './mapView'

const size: Size = { width: 600, height: 300 }
const view: MapViewState = { zoom: 1, centerX: 0, centerY: 0 }

describe('mapView', () => {
  it('初始视野以世界原点为中心，较短边跨 100 世界单位', () => {
    const vb = mapViewBox(view, size)
    expect(vb.h).toBe(100)
    expect(vb.w).toBe(200) // 600x300 容器按纵横比展开
    expect(vb.x + vb.w / 2).toBeCloseTo(0, 6)
    expect(vb.y + vb.h / 2).toBeCloseTo(0, 6)
  })

  it('每世界单位像素数 = 较短边 / (100/zoom)', () => {
    expect(pxPerUnit(view, size)).toBe(3)
    expect(pxPerUnit({ ...view, zoom: 2 }, size)).toBe(6)
  })

  it('向右拖拽 → 视野中心 x 减小（内容跟手右移）', () => {
    const next = panView(view, 60, 0, size)
    expect(next.centerX).toBeCloseTo(-20, 6)
    expect(next.centerY).toBe(0)
  })

  it('屏幕点 → 世界坐标换算与缩放锚点', () => {
    const point = screenToWorld(view, size, 150, -75) // 视野中心右侧 150px、上方 75px
    expect(point.x).toBeCloseTo(50, 6)
    expect(point.y).toBeCloseTo(-25, 6)
  })

  it('双指缩放保持锚点下的世界坐标不动', () => {
    const focal = { x: 120, y: -30 }
    const world = screenToWorld(view, size, focal.x, focal.y)
    const next = zoomAtPoint(view, size, 2, focal.x, focal.y)
    expect(next.zoom).toBe(2)
    const after = screenToWorld(next, size, focal.x, focal.y)
    expect(after.x).toBeCloseTo(world.x, 6)
    expect(after.y).toBeCloseTo(world.y, 6)
  })

  it('缩放钳制在 [0.25, 8]', () => {
    expect(zoomAtPoint(view, size, 100, 0, 0).zoom).toBe(MAP_MAX_ZOOM)
    expect(zoomAtPoint(view, size, 0.001, 0, 0).zoom).toBe(MAP_MIN_ZOOM)
    expect(clampZoom(3)).toBe(3)
  })

  it('命中测试返回触点附近最近的节点，且缩放后半径按屏幕像素换算', () => {
    const nodes = [
      { id: 'a', name: 'a', x: 0, y: 0, current: true },
      { id: 'b', name: 'b', x: 40, y: 0, current: false },
    ]
    // a 在视野中心：点中心偏右 10px（= 3.33 世界单位）命中 a
    expect(hitTestNode(nodes, view, size, 10, 0)?.id).toBe('a')
    // b 在世界 x=40（= 屏幕中心右侧 120px）：点它右侧 20px 仍在 26px 命中半径内
    expect(hitTestNode(nodes, view, size, 140, 0)?.id).toBe('b')
    // 远离所有节点
    expect(hitTestNode(nodes, view, size, 0, 140)).toBeNull()
  })

  it('尺寸未就绪时所有手势换算为 no-op', () => {
    const empty: Size = { width: 0, height: 0 }
    expect(pxPerUnit(view, empty)).toBe(0)
    expect(panView(view, 100, 100, empty)).toBe(view)
    expect(zoomAtPoint(view, empty, 2, 0, 0)).toBe(view)
    expect(hitTestNode([], view, empty, 0, 0)).toBeNull()
  })
})
