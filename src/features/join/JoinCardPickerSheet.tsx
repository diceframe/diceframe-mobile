import { ActivityIndicator, View } from 'react-native'

import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/patterns/sheet'
import { Text } from '@/components/ui/text'
import type { CharacterCard } from '@/api/types'
import { useT } from '@/i18n/t'

interface JoinCardPickerSheetProps {
  open: boolean
  cards: CharacterCard[]
  /** 本机角色库里可用于加入的卡（离线内容库；Web 端为空） */
  localCards: CharacterCard[]
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
  localCards,
  loading,
  onClose,
  onSelect,
}: JoinCardPickerSheetProps) {
  const t = useT()
  const renderCard = (card: CharacterCard, key: string) => (
    <Button
      key={key}
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
            {cards.length === 0 && localCards.length === 0 ? (
              <Text variant="muted" className="text-center">{t('dfCharacterCardsEmpty')}</Text>
            ) : null}
            {/* 本机角色在前：玩家自己的卡；本局共享卡库在后 */}
            {localCards.length > 0 ? (
              <Text variant="small" className="font-semibold">{t('dfJoinLocalCards')}</Text>
            ) : null}
            {localCards.map((card, index) => renderCard(card, `local-${index}`))}
            {localCards.length > 0 && cards.length > 0 ? (
              <Text variant="small" className="font-semibold">{t('dfJoinSharedCards')}</Text>
            ) : null}
            {cards.map((card, index) => renderCard(card, String(card.card_id || card.id || `card-${index}`)))}
          </View>
        )}
      </View>
    </Sheet>
  )
}
