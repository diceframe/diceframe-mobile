import * as React from 'react'
import { View } from 'react-native'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet } from '@/components/patterns/sheet'
import { Text } from '@/components/ui/text'

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
        <Text variant="h3">{hasPassword ? '修改房间密码' : '设置房间密码'}</Text>
        <Text variant="muted">
          设置后玩家加入需要输入密码。留空保存则清除密码。
        </Text>
        <Input
          value={password}
          onChangeText={setPassword}
          placeholder="新密码（留空清除）"
          secureTextEntry
          autoCapitalize="none"
          editable={!busy}
        />
        <Button disabled={busy} onPress={save}>
          <Text>{busy ? '保存中…' : '保存'}</Text>
        </Button>
      </View>
    </Sheet>
  )
}
