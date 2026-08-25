import * as React from 'react'
import { View, type ViewProps } from 'react-native'
import { ChevronLeft } from 'lucide-react-native'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Text } from '@/components/ui/text'
import { strings } from '@/lib/strings'
import { cn } from '@/lib/utils'

/** 统一页头：衬线标题 + 可选返回 + 右侧动作区 */
export function PageHeader({
  title,
  subtitle,
  onBack,
  right,
  className,
  ...props
}: ViewProps & {
  title: string
  subtitle?: string
  onBack?: () => void
  right?: React.ReactNode
}) {
  return (
    <View className={cn('flex-row items-center gap-2 px-4 py-3', className)} {...props}>
      {onBack ? (
        <Button
          variant="ghost"
          size="icon"
          onPress={onBack}
          accessibilityLabel={strings.common.back}
          hitSlop={8}
        >
          <Icon as={ChevronLeft} size={22} />
        </Button>
      ) : null}
      <View className="flex-1 gap-0">
        <Text variant="h2" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="small" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  )
}
