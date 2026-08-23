import * as React from 'react'
import { Pressable, View } from 'react-native'

import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'

export type TabOption = { value: string; label: string }

type TabsProps = {
  options: TabOption[]
  value: string
  onValueChange: (value: string) => void
  className?: string
}

/** 分段式选项卡（受控） */
export function Tabs({ options, value, onValueChange, className }: TabsProps) {
  return (
    <View className={cn('flex-row rounded-md bg-muted p-1 gap-1', className)}>
      {options.map((option) => {
        const active = option.value === value
        return (
          <Pressable
            key={option.value}
            onPress={() => onValueChange(option.value)}
            className={cn(
              'flex-1 items-center justify-center rounded-sm px-3 py-1.5',
              active && 'bg-background shadow-sm',
            )}
          >
            <Text className={cn('text-sm font-medium', active ? 'text-foreground' : 'text-muted-foreground')}>
              {option.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}
