import { ActivityIndicator, View } from 'react-native'

import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/patterns/sheet'
import { Text } from '@/components/ui/text'
import type { CharacterCard } from '@/api/types'
import { useT } from '@/i18n/t'

interface JoinCardPickerSheetProps {
  open: boolean
  cards: CharacterCard[]
  loading: boolean
  onClose: () => void
  onSelect: (card: CharacterCard) => void
}

/**
 * 加入建卡的共享卡库选择抽屉（列表形态对齐 Web JoinView 的「从共享卡库选择」下拉，
 * 底部抽屉交互复用 play 区 CharacterCardsModal 的模式）。
 */
export function JoinCardPickerSheet({
  open,
  cards,
  loading,
  onClose,
  onSelect,
}: JoinCardPickerSheetProps) {
  const t = useT()
  return (
    <Sheet open={open} onClose={onClose} className="h-[70%]" scrollable={false}>
      <View className="flex-1 gap-4 pt-1">
        <Text variant="h3">{t('chooseFromSharedLibrary')}</Text>
        {loading ? (
          <View className="items-center py-8">
            <ActivityIndicator />
          </View>
        ) : (
          // 卡库为空时入口在 join 页已整体隐藏，这里理论到不了空态，仍兜底防呆
          <View className="flex-1 gap-3 pb-6">
            {cards.length === 0 ? (
              <Text variant="muted" className="text-center">{t('dfCharacterCardsEmpty')}</Text>
            ) : (
              cards.map((card, index) => {
                const id = String(card.card_id || card.id || `card-${index}`)
                return (
                  <Button
                    key={id}
                    variant="outline"
                    className="items-start gap-1 p-4"
                    onPress={() => onSelect(card)}
                  >
                    <View className="gap-1">
                      <Text className="font-medium">
                        {card.character_name || t('dfCharacterCardUnnamed')}
                      </Text>
                      <Text variant="small" className="text-muted-foreground">
                        {[card.race, card.class].filter(Boolean).join(' · ') || t('dfCharacterCardNoIdentity')}
                      </Text>
                      {card.background ? (
                        <Text variant="small" numberOfLines={2} className="text-muted-foreground">
                          {String(card.background).slice(0, 100)}
                        </Text>
                      ) : null}
                    </View>
                  </Button>
                )
              })
            )}
          </View>
        )}
      </View>
    </Sheet>
  )
}
