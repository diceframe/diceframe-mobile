import * as React from 'react'
import { useLocalSearchParams } from 'expo-router'

import { CreateWizard } from '@/features/create/CreateWizard'

/** 创建冒险向导（全屏推入页；世界图鉴「用它开团」经 world 参数预选模板） */
export default function CreateScreen() {
  const params = useLocalSearchParams<{ world?: string }>()
  const preselectedWorldId = params.world ? String(params.world) : null
  return <CreateWizard preselectedWorldId={preselectedWorldId} />
}
