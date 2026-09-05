import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AppUpdateInfo } from '@/lib/updates'
import { getT } from '@/i18n/t'
import { createAppUpdatesStore } from './app-updates'

const release: AppUpdateInfo = {
  latestVersion: '0.6.0',
  releaseName: 'v0.6.0',
  releaseNotes: '新版说明',
  releaseUrl: 'https://github.com/diceframe/diceframe-mobile/releases/tag/v0.6.0',
  apks: [{ name: 'DiceFrame-android.apk', url: 'https://example.com/app.apk' }],
  apkUrl: 'https://example.com/app.apk',
  apkName: 'DiceFrame-android.apk',
  isNewer: true,
}

const automatic = { automatic: true }

describe('共享更新检查状态', () => {
  afterEach(() => vi.useRealTimers())

  it('首页和设置页同时检查时复用请求，并共享新版结果', async () => {
    const load = vi.fn().mockResolvedValue(release)
    const store = createAppUpdatesStore(load)
    const first = store.getState().check(automatic)
    const second = store.getState().check()

    expect(second).toBe(first)
    expect(store.getState().checking).toBe(true)
    await expect(first).resolves.toEqual(release)
    expect(load).toHaveBeenCalledTimes(1)
    expect(store.getState()).toMatchObject({ checking: false, result: release, error: null })
  })

  it('成功后六小时内自动检查使用缓存，期满重新拉取', async () => {
    vi.useFakeTimers()
    const load = vi.fn().mockResolvedValue(release)
    const store = createAppUpdatesStore(load)
    await store.getState().check(automatic)

    vi.advanceTimersByTime(6 * 60 * 60 * 1000 - 1)
    await expect(store.getState().check(automatic)).resolves.toEqual(release)
    expect(load).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(1)
    await store.getState().check(automatic)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('自动检查失败后十五分钟再试，恢复后清除错误', async () => {
    vi.useFakeTimers()
    const load = vi.fn().mockRejectedValueOnce(new Error('断网')).mockResolvedValue(release)
    const store = createAppUpdatesStore(load)
    await expect(store.getState().check(automatic)).resolves.toBeNull()
    expect(store.getState()).toMatchObject({ checking: false, result: null, error: getT()('dfUpdatesCheckFailed') })

    vi.advanceTimersByTime(15 * 60 * 1000 - 1)
    await store.getState().check(automatic)
    expect(load).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    await store.getState().check(automatic)
    expect(load).toHaveBeenCalledTimes(2)
    expect(store.getState()).toMatchObject({ result: release, error: null })
  })

  it('手动检查绕过成功与失败冷却，断网不清除已发现的新版', async () => {
    const load = vi.fn()
      .mockResolvedValueOnce(release)
      .mockRejectedValueOnce(new Error('断网'))
      .mockResolvedValueOnce({ ...release, isNewer: false })
    const store = createAppUpdatesStore(load)
    await store.getState().check(automatic)
    await store.getState().check()
    expect(store.getState()).toMatchObject({ checking: false, result: release, error: getT()('dfUpdatesCheckFailed') })

    await store.getState().check()
    expect(load).toHaveBeenCalledTimes(3)
    expect(store.getState()).toMatchObject({ result: { isNewer: false }, error: null })
  })

  it('加载器同步抛错也能结束检查并允许重试', async () => {
    const store = createAppUpdatesStore(() => { throw new Error('加载失败') })
    await expect(store.getState().check()).resolves.toBeNull()
    expect(store.getState()).toMatchObject({ checking: false, error: getT()('dfUpdatesCheckFailed') })
    await expect(store.getState().check()).resolves.toBeNull()
  })
})
