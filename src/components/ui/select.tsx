import * as React from 'react'
import { Pressable, ScrollView, View } from 'react-native'
import { Check } from 'lucide-react-native'

import { Sheet } from '@/components/ui/sheet'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'

export type SelectOption = { value: string; label: string }

type SelectProps = {
  options: SelectOption[]
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  className?: string
}

/** 底部抽屉式选择器（受控）：触发器 + 选项列表 */
export function Select({ options, value, onValueChange, placeholder, className }: SelectProps) {
  const [open, setOpen] = React.useState(false)
  const selected = options.find((o) => o.value === value)

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        className={cn(
          'h-11 flex-row items-center justify-between rounded-md border border-input bg-background px-4',
          className,
        )}
      >
        <Text className={selected ? 'text-foreground' : 'text-muted-foreground'} numberOfLines={1}>
          {selected?.label ?? placeholder ?? '请选择'}
        </Text>
      </Pressable>
      <Sheet open={open} onClose={() => setOpen(false)}>
        <Text variant="h3" className="mb-2">
          {placeholder ?? '选择'}
        </Text>
        <ScrollView className="max-h-[60%]" showsVerticalScrollIndicator={false}>
          <View className="gap-1 pb-4">
            {options.map((option) => {
              const active = option.value === value
              return (
                <Pressable
                  key={option.value}
                  onPress={() => {
                    onValueChange(option.value)
                    setOpen(false)
                  }}
                  className="flex-row items-center justify-between rounded-md px-3 py-3 active:bg-accent"
                >
                  <Text className={cn('text-base', active && 'font-semibold text-foreground')}>
                    {option.label}
                  </Text>
                  {active && <Check size={18} className="text-primary" />}
                </Pressable>
              )
            })}
          </View>
        </ScrollView>
      </Sheet>
    </>
  )
}

/** 触发器按钮（单独使用，用于自定义布局） */
export function SelectTrigger({
  children,
  onPress,
  className,
}: {
  children: React.ReactNode
  onPress: () => void
  className?: string
}) {
  return (
    <Pressable
      onPress={onPress}
      className={cn(
        'h-11 flex-row items-center justify-between rounded-md border border-input bg-background px-4',
        className,
      )}
    >
      {children}
    </Pressable>
  )
}
