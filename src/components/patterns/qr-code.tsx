import * as React from 'react'
import Svg, { Path, Rect } from 'react-native-svg'

import { qrMatrix, qrPath } from '@/lib/qr-matrix'

/** 规范要求的静区宽度（模块数），少于 4 部分扫码器会认不出 */
const QUIET_ZONE = 4

/**
 * 二维码。颜色固定黑码白底、不跟主题走：深色主题下反色二维码很多扫码器（含系统相机）认不出，
 * 扫码可靠性优先于配色统一。
 */
export function QrCode({ value, size = 200 }: { value: string; size?: number }) {
  const matrix = qrMatrix(value)
  if (!matrix.length) return null
  const span = matrix.length + QUIET_ZONE * 2
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${span} ${span}`} accessibilityRole="image">
      <Rect x={0} y={0} width={span} height={span} fill="#ffffff" />
      <Path d={qrPath(matrix, QUIET_ZONE)} fill="#000000" />
    </Svg>
  )
}
