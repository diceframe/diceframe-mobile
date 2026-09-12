import { describe, expect, expectTypeOf, it } from 'vitest'

import {
  APP_MIN_SERVER_VERSION,
  parseVersionParts,
  serverCompatibility,
  versionBelow,
  type ServerCompatStatus,
} from './version-compat'

describe('parseVersionParts', () => {
  it('按点分数字段解析并忽略 v 前缀', () => {
    expect(parseVersionParts('2.5.7')).toEqual([2, 5, 7])
    expect(parseVersionParts('v2.5.7')).toEqual([2, 5, 7])
    expect(parseVersionParts('V0.5.4')).toEqual([0, 5, 4])
  })

  it('beta/rc 后缀按主版本号（对齐上游 version_below 语义：后缀数字成为尾段）', () => {
    expect(parseVersionParts('2.5.7-beta.1')).toEqual([2, 5, 7, 1])
    expect(parseVersionParts('1.9.12-beta.1')).toEqual([1, 9, 12, 1])
  })

  it('非数字段按 0', () => {
    expect(parseVersionParts('unknown')).toEqual([0])
    expect(parseVersionParts('2.x')).toEqual([2, 0])
  })
})

describe('versionBelow', () => {
  it('等号视为满足', () => {
    expect(versionBelow('2.5.7', '2.5.7')).toBe(false)
    expect(versionBelow('2.5', '2.5.0')).toBe(false)
  })

  it('逐段比较、短侧补 0', () => {
    expect(versionBelow('2.5.7', '2.5.6')).toBe(true)
    expect(versionBelow('2.5.7', '2.6.0')).toBe(false)
    expect(versionBelow('2.10.0', '2.9.99')).toBe(true)
  })

  it('beta 后缀视为满足同号正式版', () => {
    expect(versionBelow('1.9.12', '1.9.12-beta.1')).toBe(false)
    expect(versionBelow('1.9.13', '1.9.12-beta.1')).toBe(true)
  })
})

describe('serverCompatibility', () => {
  const APP = '0.5.4'

  it('服务器未下发版本字段 → unknown（放行旧服务器）', () => {
    expect(serverCompatibility({}, APP)).toBe('unknown')
    expect(serverCompatibility({ server_version: '' }, APP)).toBe('unknown')
    expect(serverCompatibility({ server_version: 'unknown' }, APP)).toBe('unknown')
  })

  it('双向都在区间内 → ok', () => {
    expect(
      serverCompatibility({ server_version: '2.5.7-beta.1', min_client_version: '0.5.0' }, APP),
    ).toBe('ok')
    expect(serverCompatibility({ server_version: APP_MIN_SERVER_VERSION }, APP)).toBe('ok')
  })

  it('App 低于服务器声明的 min_client_version → app-too-old', () => {
    expect(
      serverCompatibility({ server_version: '2.5.7', min_client_version: '0.6.0' }, APP),
    ).toBe('app-too-old')
  })

  it('服务器低于 App 要求的最低版本 → server-too-old', () => {
    expect(serverCompatibility({ server_version: '1.9.13' }, APP)).toBe('server-too-old')
  })

  it('服务器只下发 server_version 时跳过 App 侧检查', () => {
    expect(serverCompatibility({ server_version: '2.5.7' }, APP)).toBe('ok')
  })

  it('两侧同时不满足时优先报 App 过旧', () => {
    expect(
      serverCompatibility({ server_version: '1.9.0', min_client_version: '0.6.0' }, APP),
    ).toBe('app-too-old')
  })

  it('阈值可注入（测试隔离，不依赖全局常量）', () => {
    expect(serverCompatibility({ server_version: '3.0.0' }, APP, '2.9.0')).toBe('ok')
    expect(serverCompatibility({ server_version: '2.8.0' }, APP, '2.9.0')).toBe('server-too-old')
  })

  it('status 类型收窄为四种结论', () => {
    expectTypeOf<ServerCompatStatus>().toEqualTypeOf<'ok' | 'app-too-old' | 'server-too-old' | 'unknown'>()
  })
})
