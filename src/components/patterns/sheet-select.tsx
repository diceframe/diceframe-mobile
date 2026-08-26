import * as React from 'react'
import { Pressable, View } from 'react-native'
import { Check } from 'lucide-react-native'

import { Sheet } from '@/components/patterns/sheet'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'

export type SheetSelectOption = {
  value: string
  label: string
}

type SheetSelectProps = {
  options: SheetSelectOption[]
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  className?: string
}

/** 项目自定义的滑入式选择器：触发器 + Sheet + 可滚动选项列表。 */
export function SheetSelect({
  options,
  value,
  onValueChange,
  placeholder,
  className,
}: SheetSelectProps) {
  const [open, setOpen] = React.useState(false)
  const selected = options.find((option) => option.value === value)

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

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        className="max-h-[60%]"
        stickyHeaderIndices={[0]}
      >
        <View className="bg-card pb-2">
          <Text variant="h3">{placeholder ?? '选择'}</Text>
        </View>
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
      </Sheet>
    </>
  )
}
