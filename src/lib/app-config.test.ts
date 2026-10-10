import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * 原生配置的安全底线：settings 里存着访问密码、设备令牌、会话与分享凭证
 * （AsyncStorage 明文），不能随 Android 云备份/adb backup 被带离设备。
 */
describe('app.json 安全配置', () => {
  const config = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../app.json'), 'utf-8'))

  it('Android 关闭应用数据备份', () => {
    expect(config.expo.android.allowBackup).toBe(false)
  })
})
