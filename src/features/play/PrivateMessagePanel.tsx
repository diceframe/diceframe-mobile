import { ScrollView, View } from 'react-native'

import { Card } from '@/components/ui/card'
import { Text } from '@/components/ui/text'
import type { PrivateMessage } from '@/api/types'

/** GM 私信记录面板（对齐 Web 端 private-log 区块） */
export function PrivateMessagePanel({ messages }: { messages: PrivateMessage[] }) {
  if (messages.length === 0) {
    return (
      <View className="flex-1 items-center justify-center py-12">
        <Text variant="muted">暂无私信</Text>
      </View>
    )
  }

  return (
    <ScrollView
      className="flex-1"
      showsVerticalScrollIndicator={false}
      contentContainerClassName="gap-3 p-4 pb-8"
    >
      {messages.map((msg, index) => (
        <Card key={index} className="gap-1 p-3">
          <View className="flex-row items-baseline justify-between gap-2">
            <Text className="text-sm font-semibold">
              {msg.character_name || msg.user_id || '未知'}
            </Text>
            {msg.round != null && (
              <Text variant="small" className="font-mono text-muted-foreground">
                第 {msg.round} 回合
              </Text>
            )}
          </View>
          <Text className="leading-5">{msg.text}</Text>
        </Card>
      ))}
    </ScrollView>
  )
}
