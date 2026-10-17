import { afterEach, describe, expect, it, vi } from 'vitest'

import appConfig from '../../app.json'
import { fetchLatestRelease } from '@/api/updates'
import { getT } from '@/i18n/t'
import { createAppUpdatesStore } from '@/stores/app-updates'
import { parseGitHubRelease, resolveAppVersion } from './updates'

/**
 * GitHub latest 端点只返回正式版：当前包是预发布（如 0.6.0-beta.1）时，用它的主版本号（0.6.0）
 * 充当「最新正式版」；当前就是正式包时即它自己。
 */
const releaseVersion = appConfig.expo.version.split('-')[0]

const payload = {
  tag_name: `v${releaseVersion}`,
  body: '优化错误提示',
  assets: ['DiceFrame-android.apk', 'DiceFrame-android-arm64-v8a.apk', 'DiceFrame-android-armeabi-v7a.apk'].map((name) => ({
    name, browser_download_url: `https://github.com/diceframe/diceframe-mobile/releases/download/v${releaseVersion}/${name}`,
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
    expect(store.getState().result).toMatchObject({ latestVersion: releaseVersion, isNewer: true, apkName: 'DiceFrame-android-arm64-v8a.apk' })
    await store.getState().check()
    expect(store.getState().result?.isNewer).toBe(true)
    expect(store.getState().error).toBe(getT()('dfUpdatesCheckFailed'))

    nativeVersion = releaseVersion
    nativeBuildVersion = String(appConfig.expo.android.versionCode)
    await store.getState().check()
    expect(store.getState()).toMatchObject({ checking: false, result: { isNewer: false }, error: null })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('装着预发布包时，同号正式版算新版（beta 用户能收到正式版更新）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(payload))))
    const result = parseGitHubRelease(await fetchLatestRelease(), resolveAppVersion({
      configVersion: appConfig.expo.version, nativeVersion: `${releaseVersion}-beta.1`, nativeBuildVersion: '1', isExpoGo: false,
    }), { supportedAbis: ['arm64-v8a'] })
    expect(result).toMatchObject({ latestVersion: releaseVersion, isNewer: true })
  })
})
