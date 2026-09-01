import { describe, expect, it } from 'vitest'

import { chunkSpeechText, ttsAvailableOf } from './tts-options'

describe('ttsAvailableOf', () => {
  it('系统引擎始终可用', () => {
    expect(ttsAvailableOf('system', false)).toBe(true)
    expect(ttsAvailableOf('system', true)).toBe(true)
  })

  it('服务器引擎跟随服务器 TTS 配置', () => {
    expect(ttsAvailableOf('server', true)).toBe(true)
    expect(ttsAvailableOf('server', false)).toBe(false)
  })
})

describe('chunkSpeechText', () => {
  it('短文本与非法上限不分块', () => {
    const text = '短叙事'
    expect(chunkSpeechText(text, 4000)).toEqual([text])
    expect(chunkSpeechText(text, 0)).toEqual([text])
  })

  it('恰好达到上限不切', () => {
    const text = 'a'.repeat(10)
    expect(chunkSpeechText(text, 10)).toEqual([text])
  })

  it('优先在段落换行处切，且各块拼回原文', () => {
    const text = '第一段。' + '\n第二段开头' + 'x'.repeat(20) + '\n第三段。'
    const chunks = chunkSpeechText(text, 24)
    expect(chunks.join('')).toBe(text)
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(24)
    // 边界含在块尾：换行切块后首块带 \n，块数与切点符合「段落优先」
    expect(chunks[0]).toBe('第一段。\n')
    expect(chunks).toHaveLength(3)
  })

  it('无换行时在句末标点处切', () => {
    const text = '第一句。' + 'y'.repeat(18) + '。第二句。'
    const chunks = chunkSpeechText(text, 22)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.join('')).toBe(text)
    expect(chunks[0].endsWith('。')).toBe(true)
    expect(chunks[0].length).toBeLessThanOrEqual(22)
  })

  it('完全无边界时硬切兜底', () => {
    const text = 'z'.repeat(25)
    const chunks = chunkSpeechText(text, 10)
    expect(chunks).toEqual(['z'.repeat(10), 'z'.repeat(10), 'z'.repeat(5)])
  })

  it('切点不落在窗口末尾之外（边界在最前也能推进）', () => {
    const chunks = chunkSpeechText('。' + 'w'.repeat(30), 10)
    expect(chunks.join('')).toBe('。' + 'w'.repeat(30))
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(10)
  })
})
