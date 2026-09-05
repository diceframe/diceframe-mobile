import { describe, expect, it } from 'vitest'

import { compareVersions, getGitHubLatestReleaseUrl, parseGitHubRelease, recommendApk, resolveAppVersion } from './updates'

describe('GitHub APK 更新检查', () => {
  it('以已安装 APK 的版本为准，避免开发配置提前升级导致漏报', () => {
    expect(resolveAppVersion({
      configVersion: '0.5.0', nativeVersion: '0.4.0', nativeBuildVersion: '6', isExpoGo: false,
    })).toEqual({ version: '0.4.0', buildVersion: '6' })
  })

  it('Expo Go 不使用宿主版本和构建号，Web 回退应用配置', () => {
    expect(resolveAppVersion({
      configVersion: '0.5.0', nativeVersion: '57.0.0', nativeBuildVersion: '570', isExpoGo: true,
    })).toEqual({ version: '0.5.0', buildVersion: null })
    expect(resolveAppVersion({ configVersion: '0.5.0', isExpoGo: false }))
      .toEqual({ version: '0.5.0', buildVersion: null })
    expect(resolveAppVersion({ isExpoGo: false })).toEqual({ version: '0.0.0', buildVersion: null })
  })

  it('按语义版本判断新版', () => {
    expect(compareVersions('1.2.0', '1.1.9')).toBe(1)
    expect(compareVersions('v1.2.0', '1.2')).toBe(0)
    expect(compareVersions('1.2.0', '1.2.1')).toBe(-1)
  })

  it('非数字段按 0 处理：rc/beta 后缀与正式版视为相等（latest 端点不返回预发布版）', () => {
    expect(compareVersions('1.2.0-rc1', '1.2.0')).toBe(0)
    expect(compareVersions('1.2.0-beta', '1.2.0')).toBe(0)
  })

  it('从 GitHub Release 中提取 APK 下载信息', () => {
    const result = parseGitHubRelease({
      tag_name: 'v0.2.0',
      name: 'DiceFrame Android 0.2.0',
      body: '更新说明',
      html_url: 'https://github.com/diceframe/diceframe-mobile/releases/tag/v0.2.0',
      assets: [
        { name: 'DiceFrame-android.apk.sha256', browser_download_url: 'https://example.com/DiceFrame-android.apk.sha256' },
        { name: 'DiceFrame-android.apk', browser_download_url: 'https://example.com/DiceFrame-android.apk' },
      ],
    }, { version: '0.1.0' })

    expect(result).toMatchObject({
      latestVersion: '0.2.0',
      releaseName: 'DiceFrame Android 0.2.0',
      releaseNotes: '更新说明',
      apkUrl: 'https://example.com/DiceFrame-android.apk',
      apkName: 'DiceFrame-android.apk',
      isNewer: true,
    })
  })

  it('多 APK 时按设备 ABI 优先序匹配拆分包，而不是下载 universal', () => {
    const apks = [
      { name: 'DiceFrame-android.apk', url: 'https://example.com/universal.apk' },
      { name: 'DiceFrame-android-arm64-v8a.apk', url: 'https://example.com/armv8.apk' },
      { name: 'DiceFrame-android-armeabi-v7a.apk', url: 'https://example.com/armv7.apk' },
    ]

    // Build.SUPPORTED_ABIS 按优先级排序：arm64 设备的列表靠后也含 armeabi-v7a
    expect(recommendApk(apks, ['arm64-v8a', 'armeabi-v7a', 'armeabi'])?.url).toBe('https://example.com/armv8.apk')
    expect(recommendApk(apks, ['armeabi-v7a', 'armeabi'])?.url).toBe('https://example.com/armv7.apk')
    expect(recommendApk(apks, null)?.url).toBe('https://example.com/universal.apk')
    expect(recommendApk(apks, ['x86_64'])?.url).toBe('https://example.com/universal.apk')
  })

  it('缺 canonical 且 ABI 不匹配时不推荐任意历史 APK', () => {
    const apks = [
      { name: 'DiceFrame-0.1.0-armeabi-v7a-release.apk', url: 'https://example.com/armv7.apk' },
      { name: 'diceframe-arm64-v8a.apk', url: 'https://example.com/armv8.apk' },
      { name: 'custom-universal.apk', url: 'https://example.com/custom.apk' },
    ]

    expect(recommendApk(apks)).toBeNull()
    expect(recommendApk(apks, null)).toBeNull()
    expect(recommendApk(apks, [])).toBeNull()
    expect(recommendApk(apks, ['x86_64'])).toBeNull()
    expect(recommendApk(apks, [''])).toBeNull()
    expect(recommendApk([], ['arm64-v8a'])).toBeNull()
    expect(recommendApk(apks, ['arm64-v8a'])).toBe(apks[1])
  })

  it('只有不匹配架构的拆分包时更新解析明确报错', () => {
    const payload = {
      tag_name: 'v0.1.0',
      assets: [
        { name: 'notes.txt', browser_download_url: 'https://example.com/notes.txt' },
        { name: 'diceframe-arm64-v8a.apk', browser_download_url: 'https://example.com/armv8.apk' },
      ],
    }
    expect(() => parseGitHubRelease(payload, { version: '0.1.0' })).toThrow('dfUpdatesNoApk')
    expect(() => parseGitHubRelease(payload, { version: '0.1.0' }, { supportedAbis: ['x86_64'] })).toThrow('dfUpdatesNoApk')
  })

  it('parseGitHubRelease 透传设备 ABI 并携带全部 APK 列表', () => {
    const result = parseGitHubRelease({
      tag_name: 'v0.2.0',
      assets: [
        { name: 'DiceFrame-android.apk', browser_download_url: 'https://example.com/universal.apk' },
        { name: 'DiceFrame-android-arm64-v8a.apk', browser_download_url: 'https://example.com/armv8.apk' },
      ],
    }, { version: '0.1.0' }, { supportedAbis: ['arm64-v8a'] })

    expect(result.apkUrl).toBe('https://example.com/armv8.apk')
    expect(result.apkName).toBe('DiceFrame-android-arm64-v8a.apk')
    expect(result.apks).toHaveLength(2)
  })

  it('没有 APK 时给出明确错误', () => {
    expect(() => parseGitHubRelease({ tag_name: 'v0.2.0', assets: [] }, { version: '0.1.0' })).toThrow('dfUpdatesNoApk')
  })

  // /releases/latest 正常不会返回草稿或预览版；保留防御分支并在测试中固定契约
  it('拒绝草稿与预览版', () => {
    const apk = { name: 'DiceFrame-android.apk', browser_download_url: 'https://example.com/a.apk' }
    expect(() => parseGitHubRelease({ tag_name: 'v0.2.0', draft: true, assets: [apk] }, { version: '0.1.0' })).toThrow('dfUpdatesNoReleases')
    expect(() => parseGitHubRelease({ tag_name: 'v0.2.0', prerelease: true, assets: [apk] }, { version: '0.1.0' })).toThrow('dfUpdatesNoReleases')
  })

  it.each([null, {}, { tag_name: 'latest' }, { tag_name: 'v0.5.1-rc1' }])('异常版本数据使用友好错误：%s', (payload) => {
    expect(() => parseGitHubRelease(payload as Parameters<typeof parseGitHubRelease>[0], { version: '0.5.0' })).toThrow('dfUpdatesBadPayload')
  })

  it('忽略损坏的附件条目，仍能推荐有效安装包', () => {
    expect(parseGitHubRelease({ tag_name: 'v0.5.1', assets: [null, 123, {}, {
      name: 'DiceFrame-android.apk', browser_download_url: 'https://example.com/app.apk',
    }] }, { version: '0.5.0' }).isNewer).toBe(true)
  })

  it('生成 GitHub latest release API 地址', () => {
    expect(getGitHubLatestReleaseUrl('diceframe/diceframe-mobile')).toBe('https://api.github.com/repos/diceframe/diceframe-mobile/releases/latest')
  })
})
