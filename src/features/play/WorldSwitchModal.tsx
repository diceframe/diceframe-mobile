import * as React from 'react'
import { ActivityIndicator, ScrollView, View } from 'react-native'
import { Check } from 'lucide-react-native'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Sheet } from '@/components/patterns/sheet'
import { Text } from '@/components/ui/text'
import type { WorldCandidate } from '@/api/types'
import { useT } from '@/i18n/t'

interface WorldSwitchModalProps {
  open: boolean
  currentWorldId?: string
  candidates: WorldCandidate[]
  loading: boolean
  busy: boolean
  onClose: () => void
  onSwitch: (worldId: string) => void
}

/**
 * 世界观切换弹窗（对齐 Web PlayView 的世界切换模态框）。
 */
export function WorldSwitchModal({
  open,
  currentWorldId,
  candidates,
  loading,
  busy,
  onClose,
  onSwitch,
}: WorldSwitchModalProps) {
  const t = useT()
  return (
    <Sheet open={open} onClose={onClose} className="h-[75%]" scrollable={false}>
      <View className="flex-1 gap-4 pt-1">
        <Text variant="h3">{t('dfPlaySwitchWorldTitle')}</Text>
        <Text variant="muted">
          {t('dfPlayCurrentWorld')}: {currentWorldId || t('dfPlayWorldUnbound')}
        </Text>

        <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerClassName="gap-3 pb-6">
          {loading ? (
            <View className="items-center py-8">
              <ActivityIndicator />
            </View>
          ) : candidates.length === 0 ? (
            <Text variant="muted" className="text-center">
              {t('dfPlayNoWorldCandidates')}
            </Text>
          ) : (
            candidates.map((world) => {
              const isActive = world.id === currentWorldId
              return (
                <Button
                  key={world.id}
                  variant={isActive ? 'default' : 'outline'}
                  className="gap-2 p-4"
                  disabled={busy || isActive}
                  onPress={() => onSwitch(world.id)}
                >
                  <View className="flex-row items-center gap-2">
                    <View className="flex-1 gap-1">
                      <View className="flex-row items-center gap-2">
                        <Text className="font-medium">{world.name}</Text>
                        {isActive && (
                          <Icon as={Check} size={14} className="text-primary-foreground" />
                        )}
                      </View>
                      {world.source && (
                        <Text variant="small" className="text-muted-foreground">
                          {world.source}
                          {world.default_rule ? ` · ${world.default_rule}` : ''}
                          {world.entry_count !== undefined
                            ? ` · ${t('dfPlayEntryCount', { count: world.entry_count })}`
                            : ''}
                        </Text>
                      )}
                      {world.description && (
                        <Text variant="small" numberOfLines={2} className="text-muted-foreground">
                          {world.description}
                        </Text>
                      )}
                    </View>
                  </View>
                </Button>
              )
            })
          )}
        </ScrollView>
      </View>
    </Sheet>
  )
}
