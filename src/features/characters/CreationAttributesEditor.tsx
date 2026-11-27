import { View } from 'react-native'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Text } from '@/components/ui/text'
import { useT } from '@/i18n/t'
import { creationAttributeBudget, suggestedCreationAttributes, type CreationSchema } from '@/lib/character-creation'

export function CreationAttributesEditor({ schema, attributes, onChange, disabled }: {
  schema: CreationSchema
  attributes: Record<string, number>
  onChange: (attributes: Record<string, number>) => void
  disabled?: boolean
}) {
  const t = useT()
  const { sum, total, overspent } = creationAttributeBudget(schema, attributes)
  return (
    <View className="gap-2">
      <Text variant="small" className="font-semibold">{t('attributes')}</Text>
      <Text variant="small" className="text-muted-foreground">{schema.rule_meta?.attr_hint || t('attrHintDefault')}</Text>
      {total !== undefined ? (
        <Text variant="small" className={overspent ? 'font-medium text-destructive' : 'text-muted-foreground'}>
          {t('attrTotalRemaining', { sum, total, remaining: Math.max(0, total - sum) })}
        </Text>
      ) : null}
      <View className="flex-row flex-wrap justify-between gap-y-2">
        {schema.rule_attrs?.map((attr) => {
          const label = attr.display_name || attr.name || attr.name_en || attr.key
          const value = attributes[attr.key]
          const invalid = value !== undefined && (!Number.isSafeInteger(value) || value < attr.min || value > attr.max)
          return (
            <View key={attr.key} className="w-[48%] gap-1">
              <Text variant="small" className={invalid ? 'text-destructive' : 'text-muted-foreground'}>
                {label} · {attr.min}–{attr.max}
              </Text>
              <Input
                accessibilityLabel={label}
                editable={!disabled}
                inputMode="numeric"
                value={value === undefined ? '' : String(value)}
                onChangeText={(text) => {
                  if (!/^\d*$/.test(text) || !Number.isSafeInteger(Number(text))) return
                  const next = { ...attributes }
                  if (text) next[attr.key] = Number(text)
                  else delete next[attr.key]
                  onChange(next)
                }}
              />
            </View>
          )
        })}
      </View>
      <Button variant="outline" size="sm" className="self-start" disabled={disabled}
        onPress={() => onChange({ ...attributes, ...suggestedCreationAttributes(schema) })}>
        <Text>{t('fillSuggestedValues')}</Text>
      </Button>
    </View>
  )
}
