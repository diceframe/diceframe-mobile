/**
 * 地图背景选择值与契约类型互转：下拉控件的字符串值 ↔ MapBackgroundSelection。
 * 取值约定与 Web api/mapBackgrounds 的 mapBackgroundChoice/Selection 一致。
 */
import type { MapBackgroundSelection } from '@/api/types'

/** 服务端内置地图背景（与上游 BUILTIN_MAP_BACKGROUNDS 同源） */
export const BUILTIN_MAP_BACKGROUNDS = ['fantasy-region-v1', 'occult-town-v1', 'cyber-city-v1'] as const

export function mapBackgroundValue(selection?: MapBackgroundSelection | null): string {
  if (!selection || selection.kind === 'auto') return 'auto'
  if (selection.kind === 'none') return 'none'
  if (selection.kind === 'builtin') return `builtin:${selection.id || ''}`
  if (selection.kind === 'upload') return `upload:${selection.asset_id || ''}`
  return 'auto'
}

export function mapBackgroundOf(value: string): MapBackgroundSelection {
  if (value === 'none') return { kind: 'none' }
  if (value.startsWith('builtin:')) return { kind: 'builtin', id: value.slice('builtin:'.length) }
  if (value.startsWith('upload:')) return { kind: 'upload', asset_id: value.slice('upload:'.length) }
  return { kind: 'auto' }
}
