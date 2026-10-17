import * as React from 'react'
import { Pressable, View } from 'react-native'
import { Minus, Plus, X } from 'lucide-react-native'

import { ApiError, errorMessage } from '@/api/client'
import { updateCharacterSheet } from '@/api/games'
import type { Player } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Input } from '@/components/ui/input'
import { Text } from '@/components/ui/text'
import { useT } from '@/i18n/t'
import {
  currencyAmountToInputText,
  currencyEditableUnitLabel,
  formatCurrencyAmount,
  parseCurrencyInput,
} from '@/lib/currency'
import {
  clampHp,
  currencyOf,
  currencyPatch,
  hpOf,
  hpPatch,
  inventoryWithAdded,
  inventoryWithRemoved,
} from '@/lib/quick-adjust'
import { useGameStore } from '@/stores/game'

const HP_STEPS = [-5, -1, 1, 5]

/**
 * GM 的「快速调整」（成员卡里就地展开，不再叠一层面板）：纠正 AI 漏记的 HP、余额，
 * 增减物品。HP 与余额先改草稿、点保存一次提交；物品增减点了就提交。每次提交前都取
 * store 里最新的角色卡构造补丁（服务端整字段覆盖，不能拿打开面板时的旧卡去合并）。
 */
export function QuickAdjustPanel({ gameKey, player }: { gameKey: string; player: Player }) {
  const t = useT()
  const currencySystem = useGameStore((s) => s.ruleMeta?.currency_system ?? null)
  const sheet = player.character_sheet
  const initialHp = hpOf(sheet)
  const [hpDraft, setHpDraft] = React.useState(initialHp)
  const [moneyDraft, setMoneyDraft] = React.useState(() => currencyAmountToInputText(currencyOf(sheet), currencySystem))
  const [itemName, setItemName] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [message, setMessage] = React.useState('')
  const [error, setError] = React.useState('')

  const parsedMoney = parseCurrencyInput(moneyDraft, currencySystem, { allowZero: true })
  const hpChanged = hpDraft.hp !== initialHp.hp || hpDraft.max !== initialHp.max
  const moneyChanged = parsedMoney !== null && parsedMoney !== currencyOf(sheet)

  function latestSheet() {
    return useGameStore.getState().players.find((item) => item.user_id === player.user_id)?.character_sheet ?? sheet
  }

  async function submit(patch: Record<string, unknown>, after?: () => void) {
    if (busy) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await updateCharacterSheet(gameKey, player.user_id, patch)
      after?.()
      setMessage(t('dfAdjustSaved'))
      if (useGameStore.getState().gameKey === gameKey) await useGameStore.getState().refresh()
    } catch (cause) {
      const code = cause instanceof ApiError ? (cause.code ?? '').toUpperCase() : ''
      setError(code === 'RULESET_CHARACTER_OPERATION_REQUIRED'
        ? t('dfAdjustUnsupported')
        : code === 'REWRITE_IN_PROGRESS' ? t('dfAdjustBusy') : errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }

  function saveValues() {
    const current = latestSheet()
    if (!current) return
    void submit({
      ...(hpChanged ? hpPatch(current, hpDraft) : {}),
      ...(moneyChanged && parsedMoney !== null ? currencyPatch(current, parsedMoney) : {}),
    })
  }

  const items = sheet?.inventory ?? []
  const unit = currencyEditableUnitLabel(currencySystem)

  return (
    <View className="gap-3 rounded-md border border-border bg-muted/30 p-2.5">
      <Text variant="small" className="text-muted-foreground">{t('dfAdjustHint')}</Text>

      <View className="gap-1.5">
        <Text variant="small" className="font-semibold">
          {t('dfAdjustHp')} {hpDraft.hp} / {hpDraft.max}
        </Text>
        <View className="flex-row flex-wrap gap-1.5">
          {HP_STEPS.map((step) => (
            <Button
              key={step}
              size="sm"
              variant="outline"
              disabled={busy}
              onPress={() => setHpDraft((value) => clampHp(value.hp + step, value.max))}
            >
              <Text variant="small">{step > 0 ? `+${step}` : step}</Text>
            </Button>
          ))}
          <View className="flex-row items-center gap-1">
            <Text variant="small" className="text-muted-foreground">{t('dfAdjustMaxHp')}</Text>
            <Pressable
              disabled={busy}
              onPress={() => setHpDraft((value) => clampHp(value.hp, value.max - 1))}
              className="h-8 w-8 items-center justify-center rounded-md border border-border active:bg-accent"
              accessibilityLabel={`${t('dfAdjustMaxHp')} -1`}
            >
              <Icon as={Minus} size={14} />
            </Pressable>
            <Pressable
              disabled={busy}
              onPress={() => setHpDraft((value) => clampHp(value.hp, value.max + 1))}
              className="h-8 w-8 items-center justify-center rounded-md border border-border active:bg-accent"
              accessibilityLabel={`${t('dfAdjustMaxHp')} +1`}
            >
              <Icon as={Plus} size={14} />
            </Pressable>
          </View>
        </View>
      </View>

      <View className="gap-1.5">
        <Text variant="small" className="font-semibold">
          {t('dfAdjustMoney')} · {formatCurrencyAmount(currencyOf(sheet), currencySystem)}
        </Text>
        <View className="flex-row items-center gap-2">
          <Input
            value={moneyDraft}
            onChangeText={setMoneyDraft}
            keyboardType="decimal-pad"
            editable={!busy}
            className="flex-1"
            accessibilityLabel={t('dfAdjustMoney')}
          />
          {unit ? <Text variant="small" className="text-muted-foreground">{unit}</Text> : null}
        </View>
        {parsedMoney === null ? <Text variant="small" className="text-destructive">{t('dfAdjustMoneyInvalid')}</Text> : null}
      </View>

      <Button size="sm" disabled={busy || (!hpChanged && !moneyChanged)} onPress={saveValues}>
        <Text>{t('dfAdjustSave')}</Text>
      </Button>

      <View className="gap-1.5">
        <Text variant="small" className="font-semibold">{t('dfAdjustItems')}</Text>
        {!items.length ? <Text variant="small" className="text-muted-foreground">{t('dfAdjustItemsEmpty')}</Text> : null}
        {items.map((item, index) => (
          <View key={`${item.name}-${index}`} className="flex-row items-center gap-2">
            <Text variant="small" className="min-w-0 flex-1" numberOfLines={1}>
              {item.name}{Number(item.qty) > 1 ? ` ×${item.qty}` : ''}
            </Text>
            <Pressable
              disabled={busy}
              onPress={() => {
                const current = latestSheet()
                if (current) void submit({ inventory: inventoryWithRemoved(current, index) })
              }}
              className="h-8 w-8 items-center justify-center rounded-md active:bg-accent"
              accessibilityLabel={t('dfAdjustRemoveOne', { name: String(item.name ?? '') })}
            >
              <Icon as={X} size={14} className="text-destructive" />
            </Pressable>
          </View>
        ))}
        <View className="flex-row items-center gap-2">
          <Input
            value={itemName}
            onChangeText={setItemName}
            placeholder={t('dfAdjustItemName')}
            editable={!busy}
            className="flex-1"
            maxLength={80}
            accessibilityLabel={t('dfAdjustItemName')}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !itemName.trim()}
            onPress={() => {
              const current = latestSheet()
              if (current) void submit({ inventory: inventoryWithAdded(current, itemName) }, () => setItemName(''))
            }}
          >
            <Text>{t('dfAdjustAddItem')}</Text>
          </Button>
        </View>
      </View>

      {message ? <Text variant="small" className="text-success" accessibilityLiveRegion="polite">{message}</Text> : null}
      {error ? <Text variant="small" className="text-destructive" accessibilityRole="alert">{error}</Text> : null}
    </View>
  )
}
