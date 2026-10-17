import * as React from 'react'
import { Pressable, View } from 'react-native'
import { Check, ChevronDown } from 'lucide-react-native'

import { Sheet } from '@/components/patterns/sheet'
import { Icon } from '@/components/ui/icon'
import { Text } from '@/components/ui/text'
import { useT } from '@/i18n/t'
import { cn } from '@/lib/utils'

/**
 * 「本次技能」选择（对齐上游 ActionCheckOptions）：行动区的小标签，点开底部面板选技能；
 * 空值 = 自动判断。角色卡没有技能时不渲染。
 */
export function ActionSkillPicker({
  skills,
  value,
  disabled,
  onChange,
}: {
  skills: string[]
  value: string
  disabled?: boolean
  onChange: (skill: string) => void
}) {
  const t = useT()
  const [open, setOpen] = React.useState(false)
  if (!skills.length) return null

  const options = [{ key: '', label: t('dfActionSkillAuto') }, ...skills.map((skill) => ({ key: skill, label: skill }))]

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        disabled={disabled}
        className={cn(
          'flex-row items-center gap-1 self-start rounded-full border border-border px-2.5 py-1 active:bg-accent',
          value ? 'border-primary bg-primary/10' : null,
          disabled && 'opacity-50',
        )}
        accessibilityRole="button"
        accessibilityLabel={`${t('dfActionSkillTitle')} · ${value || t('dfActionSkillAuto')}`}
      >
        <Text variant="small" className="text-muted-foreground">{t('dfActionSkillShort')}</Text>
        <Text variant="small" className={value ? 'font-semibold text-primary' : 'text-muted-foreground'} numberOfLines={1}>
          {value || t('dfActionSkillAuto')}
        </Text>
        <Icon as={ChevronDown} size={12} className="text-muted-foreground" />
      </Pressable>
      <Sheet open={open} onClose={() => setOpen(false)} scrollable>
        <View className="gap-3 pb-2">
          <View className="gap-1">
            <Text variant="h4">{t('dfActionSkillTitle')}</Text>
            <Text variant="muted">{t('dfActionSkillHint')}</Text>
          </View>
          <View className="gap-1" accessibilityRole="radiogroup">
            {options.map((option) => {
              const selected = option.key === value
              return (
                <Pressable
                  key={option.key || '__auto__'}
                  onPress={() => {
                    onChange(option.key)
                    setOpen(false)
                  }}
                  className={cn(
                    'min-h-11 flex-row items-center gap-2 rounded-md px-3 py-2 active:bg-accent',
                    selected ? 'bg-accent' : null,
                  )}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                >
                  <Text className="flex-1">{option.label}</Text>
                  {selected ? <Icon as={Check} size={16} className="text-primary" /> : null}
                </Pressable>
              )
            })}
          </View>
        </View>
      </Sheet>
    </>
  )
}
