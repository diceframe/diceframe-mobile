import type { RecordingTarget } from './hold-recording'

/** 浮层按钮与手势命中共享同一套屏幕坐标，避免视觉位置和实际响应区域错开。 */
export function voiceOverlayLayout(width: number, height: number, bottomInset: number) {
  const baseHeight = Math.min(150, height * 0.15) + bottomInset
  const radius = Math.min(34, width * 0.085)
  const sideY = height - baseHeight - radius - 28
  return {
    baseHeight,
    radius,
    cancel: { x: width * 0.21, y: sideY },
    send: { x: width * 0.5, y: sideY - radius * 1.1 },
    edit: { x: width * 0.79, y: sideY },
  }
}

export function voiceGestureTarget(
  x: number,
  y: number,
  layout: ReturnType<typeof voiceOverlayLayout>,
): RecordingTarget {
  const width = layout.send.x * 2
  // 上移到操作区后按左右分区选择，允许滑回中间/底部恢复松手发送。
  if (y <= layout.cancel.y + layout.radius * 1.6) {
    if (x < width * 0.36) return 'cancel'
    if (x > width * 0.64) return 'edit'
  }
  return 'send'
}

export function recordingTime(durationMillis: number): string {
  const seconds = Math.max(0, Math.floor(durationMillis / 1000))
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')} : ${String(seconds % 60).padStart(2, '0')}`
}

/** expo-audio 音量为 dBFS；静音保留短柱，有声时按音量展开，不伪造声波。 */
export function recordingWaveform(metering: number | undefined): number[] {
  const level = Number.isFinite(metering) ? Math.max(0, Math.min(1, ((metering ?? -60) + 60) / 60)) : 0
  return Array.from({ length: 21 }, (_, index) => {
    const envelope = 0.25 + 0.75 * Math.sin((index / 20) * Math.PI)
    const texture = index % 3 === 0 ? 1 : index % 3 === 1 ? 0.55 : 0.8
    return 5 + Math.round(level * 28 * envelope * texture)
  })
}
