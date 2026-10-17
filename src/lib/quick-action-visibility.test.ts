import { describe, expect, it } from 'vitest'

import {
  quickActionsVisible,
  quickActionVisibilityKey,
  rememberQuickActionVisibility,
} from './quick-action-visibility'

describe('快捷建议个人显隐', () => {
  it('个人选择优先，否则跟随桌面默认（缺省显示）', () => {
    expect(quickActionsVisible(undefined, undefined)).toBe(true)
    expect(quickActionsVisible(undefined, false)).toBe(false)
    expect(quickActionsVisible(true, false)).toBe(true)
    expect(quickActionsVisible(false, true)).toBe(false)
  })

  it('键区分服务器、对局与角色', () => {
    const a = quickActionVisibilityKey('http://a', 'g', 'u')
    expect(a).not.toBe(quickActionVisibilityKey('http://b', 'g', 'u'))
    expect(a).not.toBe(quickActionVisibilityKey('http://a', 'g', 'v'))
  })

  it('重写的键移到末尾，超过上限丢最早的', () => {
    let memory = rememberQuickActionVisibility({}, 'a', true, 2)
    memory = rememberQuickActionVisibility(memory, 'b', false, 2)
    memory = rememberQuickActionVisibility(memory, 'a', false, 2)
    memory = rememberQuickActionVisibility(memory, 'c', true, 2)
    expect(memory).toEqual({ a: false, c: true })
  })
})
