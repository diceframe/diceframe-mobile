import { useEffect } from 'react'
import { useLocalSearchParams, useRouter } from 'expo-router'

import { isSection } from '@/features/settings/config'

/** 旧深链兼容：/settings?section=x 转到对应子路由；裸 /settings（菜单已并入「我的」页）回个人页 */
export default function SettingsIndexScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ section?: string }>()

  useEffect(() => {
    router.replace(isSection(params.section) ? `/settings/${params.section}` : '/profile')
  }, [params.section, router])

  return null
}
