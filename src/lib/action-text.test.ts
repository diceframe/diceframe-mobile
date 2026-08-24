import { describe, expect, it } from 'vitest'

import { appendActionText } from './action-text'

describe('appendActionText', () => {
  it('空草稿直接使用新增内容', () => {
    expect(appendActionText('', '  观察门锁  ')).toBe('观察门锁')
  })

  it('语音分段与已有草稿之间补一个空格', () => {
    expect(appendActionText('我走到门边', '仔细听里面的声音')).toBe(
      '我走到门边 仔细听里面的声音',
    )
  })

  it('不会累积尾部空格', () => {
    expect(appendActionText('准备战斗   ', '拔剑')).toBe('准备战斗 拔剑')
  })
})
