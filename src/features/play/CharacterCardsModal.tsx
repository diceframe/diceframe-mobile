import * as React from 'react'
import { ActivityIndicator, ScrollView, View } from 'react-native'

import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/patterns/sheet'
import { Text } from '@/components/ui/text'
import type { CharacterCard } from '@/api/types'
import { strings } from '@/lib/strings'

interface CharacterCardsModalProps {
  open: boolean
  cards: CharacterCard[]
  loading: boolean
  busy: boolean
  onClose: () => void
  onSelect: (card: CharacterCard) => void
}

/**
 * 角色卡选择弹窗（对齐 Web PlayView 的角色卡库模态框）。
 */
export function CharacterCardsModal({
  open,
  cards,
  loading,
  busy,
  onClose,
  onSelect,
}: CharacterCardsModalProps) {
  return (
    <Sheet open={open} onClose={onClose} className="h-[75%]" scrollable={false}>
      <View className="flex-1 gap-4 pt-1">
        <Text variant="h3">{strings.play.characterCards}</Text>
        <Text variant="muted">选择一张角色卡应用到你当前的角色</Text>

        <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerClassName="gap-3 pb-6">
          {loading ? (
            <View className="items-center py-8">
              <ActivityIndicator />
            </View>
          ) : cards.length === 0 ? (
            <Text variant="muted" className="text-center">
              暂无角色卡
            </Text>
          ) : (
            cards.map((card) => {
              const id = String(card.card_id || card.id || '')
              return (
                <Button
                  key={id}
                  variant="outline"
                  className="gap-2 p-4"
                  disabled={busy}
                  onPress={() => onSelect(card)}
                >
                  <View className="gap-1">
                    <Text className="font-medium">
                      {card.character_name || '未命名'}
                    </Text>
                    <Text variant="small" className="text-muted-foreground">
                      {[card.race, card.class].filter(Boolean).join(' · ') || '未设定身份'}
                    </Text>
                    {card.background && (
                      <Text variant="small" numberOfLines={2} className="text-muted-foreground">
                        {String(card.background).slice(0, 100)}
                      </Text>
                    )}
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
