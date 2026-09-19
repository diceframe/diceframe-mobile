/**
 * 启动后台检查：已连接服务器与当前 App 的双向版本兼容。
 *
 * 覆盖「连接建立之后服务器才升级」的场景——登录/切换/加入三个入口都有
 * 阻断检查，但用户下次打开 App 时往往直接进大厅/对局，不经过任何入口。
 * 探测失败（离线/网络抖动）一律静默：这是补充提醒，不能变成正常启动的阻碍；
 * 探测成功但版本不匹配则提示，其中"拿不到版本号"按服务器过旧处理。
 */
import * as React from 'react'
import { Alert } from 'react-native'

import { getT } from '@/i18n/t'
import { fetchServerCompat, serverCompatErrorText } from '@/lib/server-compat'
import { useSettingsStore } from '@/stores/settings'

// App 生命周期内只主动检查一次；入口处的阻断检查是同步强校验，无需重复
let checkedThisLaunch = false

export function useServerCompatCheck(): void {
  const hydrated = useSettingsStore((s) => s.hydrated)
  const baseUrl = useSettingsStore((s) => s.baseUrl)

  React.useEffect(() => {
    if (!hydrated || checkedThisLaunch || !baseUrl) return
    checkedThisLaunch = true
    let active = true
    fetchServerCompat()
      .then((probe) => {
        if (!active) return
        if (probe.status === 'ok') return
        const t = getT()
        Alert.alert(t('dfServerCompatTitle'), serverCompatErrorText(probe.status, probe.config), [
          { text: t('dfServerCompatConfirm') },
        ])
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [hydrated, baseUrl])
}
