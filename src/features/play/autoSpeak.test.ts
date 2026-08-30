import { describe, expect, it } from 'vitest'

import type { LogEntry } from '@/api/types'

import { pickAutoSpeak } from './autoSpeak'

function round(roundNumber: number, gmResponse?: string): LogEntry {
  return { round: roundNumber, gm_response: gmResponse }
}

describe('pickAutoSpeak', () => {
  it('空日志不触发', () => {
    expect(pickAutoSpeak([], '')).toBeNull()
  })

  it('最新回合没有 GM 叙事时不触发', () => {
    expect(pickAutoSpeak([round(1, '旧叙事'), round(2)], '1:旧叙事')).toBeNull()
  })

  it('首次拿到日志只记基线不发声', () => {
    expect(pickAutoSpeak([round(1, '开场白')], '')).toEqual({
      signature: '1:开场白',
      text: '开场白',
      baseline: true,
    })
  })

  it('新 GM 叙事到达时触发朗读', () => {
    const log = [round(1, '开场白'), round(2, '骰出了大成功')]
    expect(pickAutoSpeak(log, '1:开场白')).toEqual({
      signature: '2:骰出了大成功',
      text: '骰出了大成功',
      baseline: false,
    })
  })

  it('签名未变（SSE 刷新/加载更早回合）不重复触发', () => {
    const log = [round(1, '开场白'), round(2, '骰出了大成功')]
    expect(pickAutoSpeak(log, '2:骰出了大成功')).toBeNull()
  })

  it('同回合叙事被改写（重生成）时重新触发', () => {
    const pick = pickAutoSpeak([round(2, '改写后的叙事')], '2:旧叙事')
    expect(pick?.baseline).toBe(false)
    expect(pick?.text).toBe('改写后的叙事')
  })
})
