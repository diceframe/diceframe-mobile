import * as React from 'react'
import { Pressable, View } from 'react-native'
import { Check, Pencil, Plus, Trash2 } from 'lucide-react-native'

import { Sheet } from '@/components/patterns/sheet'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Input } from '@/components/ui/input'
import { Text } from '@/components/ui/text'
import { useT } from '@/i18n/t'
import { confirmDestructive } from '@/lib/confirm'
import { cn } from '@/lib/utils'
import { useAssistantStore } from '@/stores/assistant'

/**
 * 会话记录（对齐上游 PR #549）：新建、切换、重命名、删除。进行中（流式或确认中）
 * 不允许切换或删除当前会话，避免把一半的回复写进别的会话。
 */
export function ConversationSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT()
  const conversations = useAssistantStore((s) => s.conversations)
  const activeId = useAssistantStore((s) => s.activeId)
  const hasMessages = useAssistantStore((s) => s.messages.length > 0)
  const busy = useAssistantStore((s) => s.streaming || s.actionBusy)
  const [renaming, setRenaming] = React.useState<{ id: string; title: string } | null>(null)

  async function remove(id: string) {
    const accepted = await confirmDestructive({
      title: t('dfAgentRemoveConversation'),
      message: t('dfAgentRemoveConfirm'),
      confirmText: t('dfAgentRemoveConversation'),
      cancelText: t('cancel'),
    })
    if (accepted) await useAssistantStore.getState().removeConversation(id)
  }

  async function saveRename() {
    if (!renaming) return
    await useAssistantStore.getState().renameConversation(renaming.id, renaming.title)
    setRenaming(null)
  }

  return (
    <Sheet open={open} onClose={onClose} scrollable>
      <View className="gap-3 pb-2">
        <Text variant="h4">{t('dfAgentHistory')}</Text>
        <Button
          variant="outline"
          className="self-start"
          disabled={busy || !hasMessages}
          onPress={async () => {
            if (await useAssistantStore.getState().startNew()) onClose()
          }}
        >
          <Icon as={Plus} size={16} />
          <Text>{t('dfAgentNewConversation')}</Text>
        </Button>
        {!conversations.length ? <Text variant="muted">{t('dfAgentHistoryEmpty')}</Text> : null}
        {conversations.map((item) => {
          const current = item.id === activeId
          if (renaming?.id === item.id) {
            return (
              <View key={item.id} className="flex-row items-center gap-2">
                <Input
                  value={renaming.title}
                  onChangeText={(title) => setRenaming({ id: item.id, title })}
                  maxLength={60}
                  autoFocus
                  className="flex-1"
                  onSubmitEditing={() => void saveRename()}
                  accessibilityLabel={t('dfAgentRename')}
                />
                <Button size="icon" onPress={() => void saveRename()} accessibilityLabel={t('saveAction')}>
                  <Icon as={Check} size={16} />
                </Button>
              </View>
            )
          }
          return (
            <View
              key={item.id}
              className={cn('flex-row items-center gap-1 rounded-lg border px-2 py-1', current ? 'border-primary bg-primary/10' : 'border-border')}
            >
              <Pressable
                className="min-h-11 flex-1 justify-center px-1 active:opacity-70"
                disabled={busy || current}
                onPress={async () => {
                  if (await useAssistantStore.getState().openConversation(item.id)) onClose()
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: current, disabled: busy && !current }}
              >
                <Text numberOfLines={1}>{item.title || t('dfAgentUntitled')}</Text>
                <Text variant="small" className="text-muted-foreground">
                  {current ? t('dfAgentCurrent') : new Date(item.updatedAt).toLocaleString()}
                </Text>
              </Pressable>
              <Button
                variant="ghost"
                size="icon"
                onPress={() => setRenaming({ id: item.id, title: item.title })}
                accessibilityLabel={t('dfAgentRename')}
              >
                <Icon as={Pencil} size={15} className="text-muted-foreground" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                disabled={busy && current}
                onPress={() => void remove(item.id)}
                accessibilityLabel={t('dfAgentRemoveConversation')}
              >
                <Icon as={Trash2} size={15} className="text-destructive" />
              </Button>
            </View>
          )
        })}
      </View>
    </Sheet>
  )
}
