import * as React from 'react'
import { View } from 'react-native'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet } from '@/components/patterns/sheet'
import { Text } from '@/components/ui/text'
import { useT } from '@/i18n/t'

interface RoomPasswordModalProps {
  open: boolean
  hasPassword: boolean
  busy: boolean
  onClose: () => void
  onSave: (password: string) => void
}

/**
 * 房间密码设置弹窗（对齐 Web PlayView 的房间密码模态框）。
 */
export function RoomPasswordModal({
  open,
  hasPassword,
  busy,
  onClose,
  onSave,
}: RoomPasswordModalProps) {
  const [password, setPassword] = React.useState('')
  const t = useT()

  function close() {
    setPassword('')
    onClose()
  }

  function save() {
    onSave(password)
    setPassword('')
  }

  return (
    <Sheet open={open} onClose={close}>
      <View className="gap-4 pb-4">
        <Text variant="h3">{hasPassword ? t('dfPlayRoomPasswordEdit') : t('dfPlayRoomPasswordSet')}</Text>
        <Text variant="muted">
          {t('dfPlayRoomPasswordHint')}
        </Text>
        <Input
          value={password}
          onChangeText={setPassword}
          placeholder={t('dfPlayRoomPasswordPlaceholder')}
          secureTextEntry
          autoCapitalize="none"
          editable={!busy}
        />
        <Button disabled={busy} onPress={save}>
          <Text>{busy ? t('dfCommonSaving') : t('dfCommonSave')}</Text>
        </Button>
      </View>
    </Sheet>
  )
}
