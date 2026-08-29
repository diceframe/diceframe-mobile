import { useState } from 'react'
import Constants from 'expo-constants'
import * as Application from 'expo-application'
import * as Device from 'expo-device'

import { fetchLatestRelease } from '@/api/updates'
import { parseGitHubRelease, type AppUpdateInfo } from '@/lib/updates'
import { strings } from '@/lib/strings'

interface CheckUpdatesState {
  checking: boolean
  result: AppUpdateInfo | null
  error: string | null
}

/** app.json 的 expo.version 是发版比较基准；构建号取原生侧（Expo Go 里为 null） */
function getCurrentAppVersion() {
  return {
    version: Constants.expoConfig?.version ?? '0.0.0',
    buildVersion: Application.nativeBuildVersion,
  }
}

export function useAppUpdates() {
  const [state, setState] = useState<CheckUpdatesState>({ checking: false, result: null, error: null })

  const check = async () => {
    setState((current) => ({ ...current, checking: true, error: null }))

    try {
      const payload = await fetchLatestRelease()
      // supportedAbis 按优先级排序，parse 内按序匹配拆分包（arm64 优先于 armeabi-v7a）
      const result = parseGitHubRelease(
        payload,
        getCurrentAppVersion(),
        { supportedAbis: Device.supportedCpuArchitectures },
      )
      setState({ checking: false, result, error: null })
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : strings.updates.checkFailed
      setState((current) => ({ ...current, checking: false, error: message }))
      return null
    }
  }

  return {
    ...state,
    current: getCurrentAppVersion(),
    check,
  }
}
