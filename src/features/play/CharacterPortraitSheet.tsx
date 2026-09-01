import * as React from 'react'
import { View } from 'react-native'

import { Sheet } from '@/components/patterns/sheet'
import { Button } from '@/components/ui/button'
import { Text } from '@/components/ui/text'
import type { CharacterPortrait } from '@/api/types'
import { PortraitPickerSection } from '@/features/characters/PortraitPickerSection'
import { useT } from '@/i18n/t'

/**
 * 编辑器主体：只在抽屉打开时挂载（见 CharacterPortraitSheet），草稿状态
 * 以「打开那一刻的当前头像」初始化，上次未保存的改动不会跨会话残留。
 */
function PortraitEditorContent({
  onClose,
  ruleId,
  name,
  value,
  busy,
  onSave,
}: {
  onClose: () => void
  ruleId: string
  name: string
  value: CharacterPortrait | null
  busy: boolean
  onSave: (portrait: CharacterPortrait | null) => Promise<void>
}) {
  const t = useT()
  const [draft, setDraft] = React.useState<CharacterPortrait | null>(value)
  const [saving, setSaving] = React.useState(false)

  async function save() {
    setSaving(true)
    try {
      await onSave(draft)
      onClose()
    } catch {
      // 失败保持抽屉打开让玩家重试；错误已由 store 写入顶栏横幅
    } finally {
      setSaving(false)
    }
  }

  return (
    <View className="gap-4 pb-2">
      <Text variant="h4">{t('changeAvatar')}</Text>
      <PortraitPickerSection
        value={draft}
        onChange={setDraft}
        ruleId={ruleId}
        name={name}
      />
      <View className="flex-row gap-2">
        <Button variant="outline" className="flex-1" onPress={onClose}>
          <Text>{t('cancel')}</Text>
        </Button>
        <Button
          className="flex-1"
          disabled={busy || saving}
          onPress={() => void save()}
        >
          <Text>{saving || busy ? t('savingAvatar') : t('saveAction')}</Text>
        </Button>
      </View>
    </View>
  )
}

/**
 * 对局内换头像抽屉（对齐 Web PlayView 的 showPortraitEditor 模态）：
 * PortraitPicker 的五种头像来源复用角色卡编辑器的实现，改动先进本地草稿，
 * 点保存才提交（避免每种来源一次请求），失败时抽屉保持打开、错误走顶栏横幅。
 */
export function CharacterPortraitSheet({
  open,
  onClose,
  ruleId,
  name,
  value,
  busy,
  onSave,
}: {
  open: boolean
  onClose: () => void
  ruleId: string
  name: string
  value: CharacterPortrait | null
  busy: boolean
  onSave: (portrait: CharacterPortrait | null) => Promise<void>
}) {
  // 内容条件挂载：每次打开都是全新草稿（setState-in-effect 会被 compiler 规则拦下）
  return (
    <Sheet open={open} onClose={onClose}>
      {open ? (
        <PortraitEditorContent
          onClose={onClose}
          ruleId={ruleId}
          name={name}
          value={value}
          busy={busy}
          onSave={onSave}
        />
      ) : null}
    </Sheet>
  )
}
