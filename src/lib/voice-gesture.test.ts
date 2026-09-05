import { describe, expect, it } from 'vitest'

import { recordingTime, recordingWaveform, voiceGestureTarget, voiceOverlayLayout } from './voice-gesture'

describe('QQ 式录音手势', () => {
  for (const [width, height, inset] of [[360, 800, 24], [430, 932, 34], [820, 1180, 20]]) {
    it(`${width}×${height} 的取消、发送、编辑命中对应的可见按钮`, () => {
      const layout = voiceOverlayLayout(width, height, inset)
      for (const target of ['cancel', 'send', 'edit'] as const) {
        const point = layout[target]
        expect(voiceGestureTarget(point.x, point.y, layout)).toBe(target)
      }
      expect(voiceGestureTarget(width * 0.5, height - inset - 30, layout)).toBe('send')
    })
  }

  it('底部横向挪动不会误取消或误进编辑，上移后滑回中间恢复发送', () => {
    const layout = voiceOverlayLayout(400, 880, 24)
    expect(voiceGestureTarget(10, 850, layout)).toBe('send')
    expect(voiceGestureTarget(390, 850, layout)).toBe('send')
    expect(voiceGestureTarget(50, layout.cancel.y, layout)).toBe('cancel')
    expect(voiceGestureTarget(350, layout.edit.y, layout)).toBe('edit')
    expect(voiceGestureTarget(200, layout.edit.y, layout)).toBe('send')
    expect(voiceGestureTarget(350, 850, layout)).toBe('send')
  })

  it('计时按实际录音时长显示，跨分钟不溢出', () => {
    expect(recordingTime(0)).toBe('00 : 00')
    expect(recordingTime(1999)).toBe('00 : 01')
    expect(recordingTime(60_000)).toBe('01 : 00')
  })

  it('波形随真实输入音量变化，静音和缺失音量不制造振幅', () => {
    expect(recordingWaveform(undefined)).toEqual(Array(21).fill(5))
    expect(recordingWaveform(-160)).toEqual(Array(21).fill(5))
    expect(recordingWaveform(Number.NaN)).toEqual(Array(21).fill(5))
    const quiet = recordingWaveform(-45)
    const loud = recordingWaveform(-5)
    expect(loud.every((bar, i) => bar >= quiet[i])).toBe(true)
    expect(Math.max(...loud)).toBeGreaterThan(Math.max(...quiet))
    expect(Math.max(...recordingWaveform(50))).toBeLessThanOrEqual(33)
  })
})
