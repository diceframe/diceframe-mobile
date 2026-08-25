import { describe, expect, it } from 'vitest'
import { forceLayout } from './mapLayout'
import type { MapLocation } from '@/api/types'

function loc(id: string, connected_to: string[] = []): MapLocation {
  return { id, name: id, connected_to }
}

describe('forceLayout', () => {
  it('空地图返回空数组', () => {
    expect(forceLayout([])).toEqual([])
  })

  it('锚点（当前场景）节点固定在中心 (0,0)', () => {
    const nodes = forceLayout(
      [loc('a', ['b', 'c']), loc('b', ['a']), loc('c', ['a'])],
      { anchorId: 'a' },
    )
    const anchor = nodes.find((n) => n.id === 'a')
    expect(anchor).toBeDefined()
    expect(anchor!.x).toBeCloseTo(0, 1)
    expect(anchor!.y).toBeCloseTo(0, 1)
    expect(anchor!.current).toBe(true)
  })

  it('相连的节点比不相连的节点更靠近', () => {
    const nodes = forceLayout(
      [
        loc('a', ['b', 'c', 'd']),
        loc('b', ['a']),
        loc('c', ['a']),
        loc('d', ['a']),
      ],
      { anchorId: 'a', iterations: 400 },
    )
    const pos = Object.fromEntries(nodes.map((n) => [n.id, n]))
    const dist = (p: { x: number; y: number }, q: { x: number; y: number }) =>
      Math.hypot(p.x - q.x, p.y - q.y)
    const connected = dist(pos.a, pos.b)
    expect(connected).toBeLessThan(60) // 弹簧力使相连节点聚拢在画布内
    expect(nodes.every((n) => Math.abs(n.x) <= 50.001 && Math.abs(n.y) <= 50.001)).toBe(true)
  })

  it('节点数很多（几百）时仍收敛在画布内', () => {
    const many: MapLocation[] = []
    for (let i = 0; i < 300; i++) {
      const neighbors = [String((i + 1) % 300)]
      if (i > 0) neighbors.push(String(i - 1))
      many.push(loc(String(i), neighbors))
    }
    const nodes = forceLayout(many, { anchorId: '150' })
    expect(nodes).toHaveLength(300)
    const anchor = nodes.find((n) => n.id === '150')!
    expect(anchor.x).toBeCloseTo(0, 1)
    expect(nodes.every((n) => Math.abs(n.x) <= 50.001 && Math.abs(n.y) <= 50.001)).toBe(true)
  })

  it('无连接（孤立图）回落为网格而不是挤成环', () => {
    const isolated: MapLocation[] = []
    for (let i = 0; i < 16; i++) isolated.push(loc(String(i)))
    const nodes = forceLayout(isolated)
    const xs = new Set(nodes.map((n) => n.x.toFixed(1)))
    expect(xs.size).toBeGreaterThan(4)
  })

  it('地图定义提供的显式坐标覆盖自动布局', () => {
    const nodes = forceLayout(
      [
        { ...loc('a', ['b']), x: -24, y: 18 },
        { ...loc('b', ['a']), x: 27, y: -11 },
        loc('c'),
      ],
      { anchorId: 'a' },
    )
    expect(nodes.find((node) => node.id === 'a')).toMatchObject({ x: -24, y: 18, current: true })
    expect(nodes.find((node) => node.id === 'b')).toMatchObject({ x: 27, y: -11 })
  })

  it('当前场景没有匹配地点时不会误标当前节点', () => {
    const nodes = forceLayout([loc('a'), loc('b')], { anchorId: 'missing' })
    expect(nodes.every((node) => !node.current)).toBe(true)
  })
})
