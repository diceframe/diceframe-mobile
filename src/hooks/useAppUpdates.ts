import { useEffect } from 'react'
import { AppState } from 'react-native'
import Constants, { ExecutionEnvironment } from 'expo-constants'
import * as Application from 'expo-application'
import * as Device from 'expo-device'

import { fetchLatestRelease } from '@/api/updates'
import { parseGitHubRelease, resolveAppVersion } from '@/lib/updates'
import { createAppUpdatesStore } from '@/stores/app-updates'

function getCurrentAppVersion() {
  return resolveAppVersion({
    configVersion: Constants.expoConfig?.version,
    nativeVersion: Application.nativeApplicationVersion,
    nativeBuildVersion: Application.nativeBuildVersion,
    isExpoGo: Constants.executionEnvironment === ExecutionEnvironment.StoreClient,
  })
}

// 首页提醒和设置页共享检查结果，点击铃铛即可看到已发现的版本与下载入口。
const useAppUpdatesStore = createAppUpdatesStore(async () => {
  const payload = await fetchLatestRelease()
  // supportedAbis 按优先级排序，parse 内按序匹配拆分包（arm64 优先于 armeabi-v7a）。
  return parseGitHubRelease(payload, getCurrentAppVersion(), {
    supportedAbis: Device.supportedCpuArchitectures,
  })
})

export function useAppUpdates({ autoCheck = false }: { autoCheck?: boolean } = {}) {
  const state = useAppUpdatesStore()
  const { check } = state

  useEffect(() => {
    if (!autoCheck) return
    void check({ automatic: true })
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') void check({ automatic: true })
    })
    return () => subscription.remove()
  }, [autoCheck, check])

  return {
    ...state,
    current: getCurrentAppVersion(),
  }
}
