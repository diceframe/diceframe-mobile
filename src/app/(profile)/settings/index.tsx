import { useEffect } from 'react'
import { useRouter } from 'expo-router'

/** 设置菜单已并入「我的」页，设置根路由回个人页。 */
export default function SettingsIndexScreen() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/profile')
  }, [router])

  return null
}
