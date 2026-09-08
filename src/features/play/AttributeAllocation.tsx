import * as React from 'react'
import { View } from 'react-native'

import type { CharacterSheet, RuleAttribute } from '@/api/types'
import { errorMessage } from '@/api/client'
import { Button } from '@/components/ui/button'
import { Text } from '@/components/ui/text'
import { useT } from '@/i18n/t'
import { buildLevelUpAttributes, levelUpAttributes, levelUpPoints } from '@/lib/level-up'

import { characterAttributeRows } from './characterAttributes'

/** 角色面板属性区的原地加点编辑器，取消只丢弃本次增量。 */
export function AttributeAllocation({
  sheet, rules, busy, onSave, onClose,
}: {
  sheet: CharacterSheet
  rules: RuleAttribute[]
  busy: boolean
  onSave: (additions: Record<string, number>) => Promise<void>
  onClose: () => void
}) {
  const t = useT()
  const [additions, setAdditions] = React.useState<Record<string, number>>({})
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState('')
  const submitting = React.useRef(false)
  const attributes = levelUpAttributes(sheet, rules)
  const labels = new Map(characterAttributeRows(sheet.attributes, attributes).map((row) => [row.key, row.label]))
  const remaining = levelUpPoints(sheet) - Object.values(additions).reduce((sum, value) => sum + value, 0)
  const disabled = busy || saving
  const valid = !!buildLevelUpAttributes(sheet, rules, additions)

  async function save() {
    if (submitting.current || disabled || !valid) return
    submitting.current = true
    setSaving(true)
    setError('')
    try {
      await onSave(additions)
      onClose()
    } catch (reason) {
      setError(errorMessage(reason))
    } finally {
      submitting.current = false
      setSaving(false)
    }
  }

  return (
    <View className="gap-4 pb-2">
      <Text className="font-semibold text-primary">{t('pointsRemaining', { points: remaining })}</Text>
      {attributes.map((attribute) => {
        const original = sheet.attributes![attribute.key]
        const added = additions[attribute.key] ?? 0
        const value = original + added
        const label = labels.get(attribute.key) ?? attribute.key
        return (
          <View key={attribute.key} className="flex-row items-center gap-2">
            <View className="min-w-0 flex-1">
              <Text>{label}</Text>
              <Text variant="small" className="text-muted-foreground">{attribute.min}–{attribute.max}</Text>
            </View>
            <Text className="font-mono text-lg">{value}{added > 0 ? ` (+${added})` : ''}</Text>
            <Button
              variant="outline"
              size="icon"
              disabled={disabled || added <= 0}
              accessibilityLabel={t('dfPlayAttributeDecrease', { name: label })}
              onPress={() => setAdditions((current) => ({ ...current, [attribute.key]: Math.max(0, (current[attribute.key] ?? 0) - 1) }))}
            >
              <Text>−</Text>
            </Button>
            <Button
              variant="outline"
              size="icon"
              disabled={disabled || remaining <= 0 || value >= attribute.max}
              accessibilityLabel={t('dfPlayAttributeIncrease', { name: label })}
              onPress={() => setAdditions((current) => {
                const next = { ...current, [attribute.key]: (current[attribute.key] ?? 0) + 1 }
                return buildLevelUpAttributes(sheet, rules, next) ? next : current
              })}
            >
              <Text>+</Text>
            </Button>
          </View>
        )
      })}
      <Text variant="small" className="text-muted-foreground">{t('levelUpPointsHint')}</Text>
      {error ? <Text className="text-destructive" accessibilityRole="alert">{error}</Text> : null}
      <View className="flex-row gap-2">
        <Button variant="outline" className="flex-1" disabled={disabled} onPress={onClose}>
          <Text>{t('cancel')}</Text>
        </Button>
        <Button className="flex-1" disabled={disabled || !valid} onPress={() => void save()}>
          <Text>{disabled ? t('saving') : t('confirmAllocation')}</Text>
        </Button>
      </View>
    </View>
  )
}
