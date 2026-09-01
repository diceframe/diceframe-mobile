import * as React from 'react'
import { Pressable, View } from 'react-native'
import { X } from 'lucide-react-native'

import { libraryAvatarSource } from '@/api/assets'
import type { CharacterCard, CharacterPortrait } from '@/api/types'
import { RemoteAvatar } from '@/components/patterns/remote-avatar'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Input } from '@/components/ui/input'
import { Text } from '@/components/ui/text'
import { Textarea } from '@/components/ui/textarea'
import { PortraitPickerSection } from '@/features/characters/PortraitPickerSection'
import { JoinCardPickerSheet } from '@/features/join/JoinCardPickerSheet'
import { JOIN_BACKGROUND_LIMIT, JOIN_NAME_LIMIT } from '@/lib/join-form'
import { useT } from '@/i18n/t'

interface JoinCharacterFormProps {
  /** 提交中冻结整个表单（与房间密码/找回分支共用 busy 态） */
  disabled: boolean
  characterName: string
  background: string
  portrait: CharacterPortrait | null | undefined
  selectedCard: CharacterCard | null
  cards: CharacterCard[]
  cardsLoading: boolean
  onChangeCharacterName: (name: string) => void
  onChangeBackground: (background: string) => void
  onChangePortrait: (portrait: CharacterPortrait | null) => void
  /** 传 null 表示清除所选卡，回到纯手填 */
  onSelectCard: (card: CharacterCard | null) => void
}

/**
 * 新玩家建卡表单（对局加入页 identity 步骤的 join_as_new 分支）。
 * 范围对齐任务红线：姓名 + 背景 + 头像 + 从共享卡库选卡四项；
 * 属性/技能没有编辑入口，只能随所选库卡整卡带入（对齐 Web JoinView 简化版）。
 */
export function JoinCharacterForm({
  disabled,
  characterName,
  background,
  portrait,
  selectedCard,
  cards,
  cardsLoading,
  onChangeCharacterName,
  onChangeBackground,
  onChangePortrait,
  onSelectCard,
}: JoinCharacterFormProps) {
  const t = useT()
  const [pickerOpen, setPickerOpen] = React.useState(false)

  return (
    <View className="gap-4">
      <View className="gap-1">
        <Text variant="h3">{t('createYourCharacter')}</Text>
        <Text variant="muted">{t('createCharacterHelp')}</Text>
      </View>

      {cards.length > 0 ? (
        selectedCard ? (
          // 选中后的卡面摘要：点卡片可换选，X 清除回到纯手填
          <View className="gap-2 rounded-xl border border-border p-3">
            <View className="flex-row items-start gap-3">
              <RemoteAvatar
                source={libraryAvatarSource(selectedCard.portrait)}
                name={selectedCard.character_name}
                className="h-12 w-12 rounded-full border border-border bg-muted"
              />
              <View className="flex-1 gap-0.5">
                <Text variant="small" className="text-muted-foreground">{t('dfJoinCardSelectedTitle')}</Text>
                <Text className="font-medium" numberOfLines={1}>
                  {selectedCard.character_name || t('dfCharacterCardUnnamed')}
                </Text>
                <Text variant="small" className="text-muted-foreground" numberOfLines={1}>
                  {[selectedCard.race, selectedCard.class].filter(Boolean).join(' · ') || t('dfCharacterCardNoIdentity')}
                </Text>
                {selectedCard.background ? (
                  <Text variant="small" numberOfLines={2} className="text-muted-foreground">
                    {String(selectedCard.background).slice(0, 120)}
                  </Text>
                ) : null}
              </View>
              <Pressable
                onPress={() => onSelectCard(null)}
                className="rounded-md p-1.5 active:opacity-60"
                accessibilityRole="button"
                accessibilityLabel={t('dfJoinCardClear')}
              >
                <Icon as={X} size={16} className="text-muted-foreground" />
              </Pressable>
            </View>
            <Button size="sm" variant="ghost" onPress={() => setPickerOpen(true)} disabled={disabled}>
              <Text>{t('chooseFromSharedLibrary')}</Text>
            </Button>
          </View>
        ) : (
          <Button variant="outline" onPress={() => setPickerOpen(true)} disabled={disabled}>
            <Text>{t('chooseFromSharedLibrary')}</Text>
          </Button>
        )
      ) : null}

      <View className="gap-1.5">
        <Text variant="small" className="font-semibold">{t('dfJoinNameLabel')}</Text>
        <Input
          value={characterName}
          onChangeText={onChangeCharacterName}
          placeholder={t('dfJoinNamePlaceholder')}
          maxLength={JOIN_NAME_LIMIT}
          editable={!disabled}
        />
      </View>

      <View className="gap-1.5">
        {/* 字数统计与 Web 一致是纯数字展示（{{n}} / 8000），不需要文案 key */}
        <View className="flex-row items-center justify-between">
          <Text variant="small" className="font-semibold">{t('characterBackground')}</Text>
          <Text variant="small" className="text-muted-foreground">
            {background.length} / {JOIN_BACKGROUND_LIMIT}
          </Text>
        </View>
        <Textarea
          value={background}
          onChangeText={onChangeBackground}
          placeholder={t('characterBackgroundLongHint')}
          maxLength={JOIN_BACKGROUND_LIMIT}
          editable={!disabled}
        />
      </View>

      {/* 头像选择复用角色卡编辑的同款组件（相册上传/AI 生成/内置库/我的头像），
          上传立即走全局 /avatars 端点，表单只持有 portrait 引用随 join payload 提交 */}
      <PortraitPickerSection
        value={portrait ?? null}
        onChange={onChangePortrait}
        name={characterName}
      />

      <JoinCardPickerSheet
        open={pickerOpen}
        cards={cards}
        loading={cardsLoading}
        onClose={() => setPickerOpen(false)}
        onSelect={(card) => {
          onSelectCard(card)
          setPickerOpen(false)
        }}
      />
    </View>
  )
}
