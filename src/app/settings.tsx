import { Redirect } from 'expo-router'

/** 设置已并入“我的”，保留旧路由用于书签和历史链接兼容。 */
export default function SettingsRedirect() {
  return <Redirect href="/(tabs)/profile" />
}
