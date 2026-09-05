import { describe, expect, it } from 'vitest'
import { voicePresentation } from './voice-presentation'

const idle = { recording: false, preparing: false, busy: false, sending: false, reviewText: null }

describe('语音浮层的发送状态', () => {
  it('录音准备、录音和转写期间显示浮层', () => {
    expect(voicePresentation({ ...idle, preparing: true })).toBe('recording')
    expect(voicePresentation({ ...idle, recording: true })).toBe('recording')
    expect(voicePresentation({ ...idle, busy: true })).toBe('recording')
  })

  it('直接发送开始后收起转写浮层，不等整个行动请求返回', () => {
    expect(voicePresentation({ ...idle, busy: true, sending: true })).toBe('hidden')
  })

  it('编辑确认发送后立即收起编辑浮层，即使保留了待发送文字', () => {
    expect(voicePresentation({ ...idle, busy: true, sending: true, reviewText: '打开门' })).toBe('hidden')
  })

  it('发送失败恢复文字编辑，不退回转写转圈', () => {
    expect(voicePresentation({ ...idle, busy: true, reviewText: '打开门' })).toBe('review')
    expect(voicePresentation({ ...idle, reviewText: '打开门' })).toBe('review')
  })

  it('发送完成保持收起，清空文字仍允许留在编辑态', () => {
    expect(voicePresentation(idle)).toBe('hidden')
    expect(voicePresentation({ ...idle, reviewText: '' })).toBe('review')
  })
})
