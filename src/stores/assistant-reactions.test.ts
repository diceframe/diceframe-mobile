import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createReactionStore, type ReactionPreferences } from './assistant-reactions'

vi.mock('@/stores/settings', async () => {
  const { create } = await import('zustand')
  return { useSettingsStore: create(() => ({ assistantReactions: true, disabledReactionCategories: [] })) }
})

describe('骰灵反应 store', () => {
  let clock = 0
  let prefs: ReactionPreferences
  beforeEach(() => {
    vi.useFakeTimers()
    clock = 0
    prefs = { enabled: true, disabledCategories: [] }
  })
  afterEach(() => vi.useRealTimers())

  it('按时长自动消失；被新反应顶替后旧计时不会清掉新反应', () => {
    const store = createReactionStore(() => prefs, () => clock)
    store.getState().report('success')
    expect(store.getState().current?.kind).toBe('success')
    clock = 2000
    store.getState().report('failure')
    vi.advanceTimersByTime(2200)
    expect(store.getState().current?.kind).toBe('failure')
    vi.advanceTimersByTime(300)
    expect(store.getState().current).toBeNull()
  })

  it('高优先级刚开始时不被低优先级打断', () => {
    const store = createReactionStore(() => prefs, () => clock)
    store.getState().report('attackCrit')
    clock = 100
    store.getState().report('attackHit')
    expect(store.getState().current?.kind).toBe('attackCrit')
  })

  it('总开关关闭或该类别关闭时不上报', () => {
    const store = createReactionStore(() => prefs, () => clock)
    prefs = { enabled: false, disabledCategories: [] }
    store.getState().report('critical')
    expect(store.getState().current).toBeNull()
    prefs = { enabled: true, disabledCategories: ['check'] }
    store.getState().report('critical')
    expect(store.getState().current).toBeNull()
    store.getState().report('newRound', { amount: 3 })
    expect(store.getState().current).toMatchObject({ kind: 'newRound', detail: { amount: 3 } })
  })
})
