import { afterEach, describe, expect, it, vi } from 'vitest'

import appConfig from '../../app.json'
import { fetchLatestRelease } from '@/api/updates'
import { getT } from '@/i18n/t'
import { createAppUpdatesStore } from '@/stores/app-updates'
import { parseGitHubRelease, resolveAppVersion } from './updates'

const payload = {
  tag_name: `v${appConfig.expo.version}`,
  body: '优化错误提示',
  assets: ['DiceFrame-android.apk', 'DiceFrame-android-arm64-v8a.apk', 'DiceFrame-android-armeabi-v7a.apk'].map((name) => ({
    name, browser_download_url: `https://github.com/diceframe/diceframe-mobile/releases/download/v${appConfig.expo.version}/${name}`,
  })),
}

afterEach(() => vi.unstubAllGlobals())

describe('0.5.0 到当前补丁版更新流程', () => {
  it('旧包发现新版、匹配设备包，失败保留提醒，安装后取消提醒', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(payload)))
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockResolvedValueOnce(new Response(JSON.stringify(payload)))
    vi.stubGlobal('fetch', fetchMock)
    let nativeVersion = '0.5.0'
    let nativeBuildVersion = '7'
    const store = createAppUpdatesStore(async () => parseGitHubRelease(await fetchLatestRelease(), resolveAppVersion({
      configVersion: appConfig.expo.version, nativeVersion, nativeBuildVersion, isExpoGo: false,
    }), { supportedAbis: ['arm64-v8a', 'armeabi-v7a'] }))

    expect(appConfig.expo.android.versionCode).toBeGreaterThan(7)
    await store.getState().check({ automatic: true })
    expect(store.getState().result).toMatchObject({ latestVersion: appConfig.expo.version, isNewer: true, apkName: 'DiceFrame-android-arm64-v8a.apk' })
    await store.getState().check()
    expect(store.getState().result?.isNewer).toBe(true)
    expect(store.getState().error).toBe(getT()('dfUpdatesCheckFailed'))

    nativeVersion = appConfig.expo.version
    nativeBuildVersion = String(appConfig.expo.android.versionCode)
    await store.getState().check()
    expect(store.getState()).toMatchObject({ checking: false, result: { isNewer: false }, error: null })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
