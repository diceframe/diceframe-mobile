import { describe, expect, it, vi } from 'vitest'

import { createGameLifecycle, gameLifecycleAction } from './game-lifecycle'

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

describe('合并锁屏与焦点通知', () => {
  it('Android / Web 只有 blur/focus 时也会恢复，重复焦点通知不会重复重连', () => {
    const handlers = { pause: vi.fn(), resume: vi.fn() }
    const lifecycle = createGameLifecycle('active', handlers)
    lifecycle.blur()
    lifecycle.blur()
    lifecycle.focus()
    lifecycle.focus()
    expect(handlers.pause).toHaveBeenCalledOnce()
    expect(handlers.resume).toHaveBeenCalledOnce()
  })

  it.each(['focus-first', 'active-first'])('解锁时 %s 顺序均只恢复一次', (order) => {
    const handlers = { pause: vi.fn(), resume: vi.fn() }
    const lifecycle = createGameLifecycle('active', handlers)
    lifecycle.blur()
    lifecycle.change('background')
    if (order === 'focus-first') lifecycle.focus()
    expect(handlers.resume).not.toHaveBeenCalled()
    lifecycle.change('active')
    lifecycle.focus()
    expect(handlers.resume).toHaveBeenCalledOnce()
  })

  it('没有 background 的 inactive → active 仍会主动恢复', () => {
    const handlers = { pause: vi.fn(), resume: vi.fn() }
    const lifecycle = createGameLifecycle('active', handlers)
    lifecycle.change('inactive')
    lifecycle.change('active')
    expect(handlers.pause).not.toHaveBeenCalled()
    expect(handlers.resume).toHaveBeenCalledOnce()
  })

  it('在后台挂载对局页立即暂停，获得焦点也要等到可见再恢复', () => {
    const handlers = { pause: vi.fn(), resume: vi.fn() }
    const lifecycle = createGameLifecycle('background', handlers)
    expect(handlers.pause).toHaveBeenCalledOnce()
    lifecycle.blur()
    lifecycle.focus()
    expect(handlers.resume).not.toHaveBeenCalled()
    lifecycle.change('active')
    expect(handlers.resume).toHaveBeenCalledOnce()
  })
})
