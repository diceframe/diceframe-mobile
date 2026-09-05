import { describe, expect, it } from 'vitest'

import { gameLifecycleAction } from './game-lifecycle'

describe('gameLifecycleAction', () => {
  it('权限弹窗的短暂失焦不会暂停连接', () => {
    expect(gameLifecycleAction('active', 'inactive')).toBeNull()
    expect(gameLifecycleAction('inactive', 'active')).toBe('resume')
  })

  it('iOS 经 inactive 进入后台仍然暂停，回前台再恢复', () => {
    expect(gameLifecycleAction('active', 'inactive')).toBeNull()
    expect(gameLifecycleAction('inactive', 'background')).toBe('pause')
    expect(gameLifecycleAction('background', 'inactive')).toBeNull()
    expect(gameLifecycleAction('inactive', 'active')).toBe('resume')
  })

  it('Android 直接切换前后台时暂停和恢复', () => {
    expect(gameLifecycleAction('active', 'background')).toBe('pause')
    expect(gameLifecycleAction('background', 'active')).toBe('resume')
  })

  it('重复状态通知不重复暂停或恢复', () => {
    for (const state of ['active', 'inactive', 'background'] as const) {
      expect(gameLifecycleAction(state, state)).toBeNull()
    }
  })

  it('启动时尚未确定状态，仍能按后续状态处理', () => {
    expect(gameLifecycleAction('unknown', 'active')).toBe('resume')
    expect(gameLifecycleAction('unknown', 'background')).toBe('pause')
  })
})
