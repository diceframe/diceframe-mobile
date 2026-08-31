import * as React from 'react'
import { Pressable, View } from 'react-native'
import { Check, CircleAlert, Pencil, Plus, Trash2, UserRoundPlus } from 'lucide-react-native'

import { libraryAvatarSource } from '@/api/assets'
import type { CharacterCard } from '@/api/types'
import { RemoteAvatar } from '@/components/patterns/remote-avatar'
import { Sheet } from '@/components/patterns/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Text } from '@/components/ui/text'
import { CharacterCardEditor } from '@/features/characters/CharacterCardEditor'
import type { CreateCharacter } from '@/features/create/payload'
import { useT } from '@/i18n/t'
import type { CharacterCardPatch } from '@/lib/character-card'
import { cn } from '@/lib/utils'

/** 卡库角色 → players 元素（对齐 Web legacyCharacterFromCard 的字段裁剪） */
function characterFromCard(card: CharacterCard, fallbackName: string, professional: boolean): CreateCharacter {
  const character: CreateCharacter = {
    character_name: String(card.character_name || fallbackName),
    background: card.background || '',
    identity: JSON.parse(JSON.stringify(card.identity ?? {})),
    attributes: JSON.parse(JSON.stringify(card.attributes ?? {})),
    skills: JSON.parse(JSON.stringify(card.skills ?? [])),
    equipment: JSON.parse(JSON.stringify(card.equipment ?? [])),
    inventory: JSON.parse(JSON.stringify(card.inventory ?? [])),
    key_items: JSON.parse(JSON.stringify(card.key_items ?? [])),
    gold: card.gold ?? 0,
    race: card.race,
    class: card.class,
    portrait: card.portrait,
  }
  // 专业规则的规范角色蓝图原样透传，由服务端做兼容校验
  const canonical = card.ruleset_character
  const binding = card.rule_binding
  if (professional && canonical && typeof canonical === 'object' && !Array.isArray(canonical)) {
    character.ruleset_character = JSON.parse(JSON.stringify(canonical))
    if (binding && typeof binding === 'object' && !Array.isArray(binding)) {
      character.rule_binding = JSON.parse(JSON.stringify(binding))
    }
  }
  return character
}

function cardKey(card: CharacterCard): string {
  return String(card.card_id || card.id || card.character_name)
}

/** 第 3 步：角色（卡库多选 / 快速建卡 / 编辑移除，至少 1 名） */
export function StepCharacters({
  players,
  setPlayers,
  cards,
  usesProfessionalBuilder,
  fallbackName,
}: {
  players: CreateCharacter[]
  setPlayers: (players: CreateCharacter[]) => void
  cards: CharacterCard[]
  usesProfessionalBuilder: boolean
  /** 新建角色时为空名称兜底的默认名 */
  fallbackName: string
}) {
  const t = useT()
  const [pickOpen, setPickOpen] = React.useState(false)
  const [pickedIds, setPickedIds] = React.useState<Set<string>>(new Set())
  const [editIndex, setEditIndex] = React.useState<number | null>(null)
  const [editorOpen, setEditorOpen] = React.useState(false)

  function openEditor(index: number | null) {
    setEditIndex(index)
    setEditorOpen(true)
  }

  function removePlayer(index: number) {
    const next = players.filter((_, i) => i !== index)
    setPlayers(next)
  }

  async function handleEditorSubmit(patch: CharacterCardPatch) {
    const base = editIndex !== null ? players[editIndex] : {}
    const character: CreateCharacter = { ...base, ...patch } as CreateCharacter
    if (!character.character_name) character.character_name = fallbackName
    const next = [...players]
    if (editIndex !== null) next[editIndex] = character
    else next.push(character)
    setPlayers(next)
    setEditorOpen(false)
    setEditIndex(null)
  }

  function togglePicked(key: string) {
    setPickedIds((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function confirmPick() {
    const additions = cards
      .filter((card) => pickedIds.has(cardKey(card)))
      .map((card) => characterFromCard(card, fallbackName, usesProfessionalBuilder))
    setPlayers([...players, ...additions])
    setPickedIds(new Set())
    setPickOpen(false)
  }

  return (
    <View className="gap-3">
      <View className="flex-row flex-wrap gap-2">
        <Button size="sm" onPress={() => openEditor(null)}>
          <Icon as={UserRoundPlus} size={15} />
          <Text>{t('dfCreateQuickCreate')}</Text>
        </Button>
        <Button size="sm" variant="outline" onPress={() => setPickOpen(true)}>
          <Icon as={Plus} size={15} />
          <Text>{t('pickFromLibrary')}</Text>
        </Button>
      </View>

      {usesProfessionalBuilder && players.length === 0 ? (
        <View className="flex-row items-start gap-2 rounded-lg border border-border bg-muted/50 p-3">
          <Icon as={CircleAlert} size={16} className="mt-0.5 text-muted-foreground" />
          <Text variant="small" className="flex-1 text-muted-foreground">
            {t('atLeastOneCharacter')} · {t('pickFromLibrary')}
          </Text>
        </View>
      ) : null}

      <View className="gap-2">
        {players.map((player, index) => (
          <View key={`${player.character_name}-${index}`} className="flex-row items-center gap-3 rounded-lg border border-border bg-card p-3">
            <RemoteAvatar
              source={libraryAvatarSource(player.portrait)}
              name={String(player.character_name || '?')}
              className="h-11 w-11 rounded-full border border-border bg-muted"
            />
            <View className="min-w-0 flex-1 gap-0.5">
              <Text className="font-semibold" numberOfLines={1}>
                {player.character_name || t('unnamed')}
              </Text>
              <View className="flex-row flex-wrap items-center gap-x-1.5">
                {[player.race, player.class].filter(Boolean).length ? (
                  <Text variant="small" className="text-muted-foreground" numberOfLines={1}>
                    {[player.race, player.class].filter(Boolean).join(' · ')}
                  </Text>
                ) : null}
                <Text variant="small" className="text-muted-foreground">
                  {(player.skills as unknown[] | undefined)?.length ?? 0} {t('skills')}
                </Text>
              </View>
            </View>
            <View className="flex-row gap-1">
              <Button size="sm" variant="ghost" onPress={() => openEditor(index)} accessibilityLabel={t('edit')}>
                <Icon as={Pencil} size={15} />
              </Button>
              <Button size="sm" variant="ghost" onPress={() => removePlayer(index)} accessibilityLabel={t('remove')}>
                <Icon as={Trash2} size={15} className="text-destructive" />
              </Button>
            </View>
          </View>
        ))}
      </View>

      {/* 空列表校验提示由向导统一渲染（第 3 步不合法时红色文案） */}

      {/* 快速建卡 / 编辑：复用角色卡编辑器（85% 高 Sheet，保证长表单底部按钮可达） */}
      {editorOpen ? (
        <Sheet open onClose={() => { setEditorOpen(false); setEditIndex(null) }} className="h-[85%]">
          <CharacterCardEditor
            card={editIndex !== null ? (players[editIndex] as unknown as CharacterCard) : null}
            onSubmit={handleEditorSubmit}
            onClose={() => { setEditorOpen(false); setEditIndex(null) }}
          />
        </Sheet>
      ) : null}

      {/* 卡库多选 */}
      <Sheet open={pickOpen} onClose={() => { setPickOpen(false); setPickedIds(new Set()) }} className="h-[85%]">
        <View className="gap-3 pb-4">
          <Text variant="h3">{t('pickFromLibrary')}</Text>
          {cards.length === 0 ? (
            <Text variant="small" className="text-muted-foreground">{t('dfCharacterEmptyDesc')}</Text>
          ) : (
            <View className="gap-1">
              {cards.map((card) => {
                const key = cardKey(card)
                const picked = pickedIds.has(key)
                return (
                  <Pressable
                    key={key}
                    onPress={() => togglePicked(key)}
                    className={cn('flex-row items-center gap-3 rounded-lg border p-2.5', picked ? 'border-primary bg-primary/10' : 'border-border bg-card')}
                    accessibilityState={{ selected: picked }}
                  >
                    <RemoteAvatar
                      source={libraryAvatarSource(card.portrait)}
                      name={String(card.character_name || '?')}
                      className="h-10 w-10 rounded-full border border-border bg-muted"
                    />
                    <View className="min-w-0 flex-1 gap-0.5">
                      <Text className="font-semibold" numberOfLines={1}>{card.character_name || t('unnamed')}</Text>
                      <View className="flex-row items-center gap-1.5">
                        <Badge variant="outline" className="px-1.5 py-0">
                          <Text className="text-[10px]" numberOfLines={1}>{String(card.rule_name || card.rule_id || '')}</Text>
                        </Badge>
                        {[card.race, card.class].filter(Boolean).length ? (
                          <Text variant="small" className="text-muted-foreground" numberOfLines={1}>
                            {[card.race, card.class].filter(Boolean).join(' · ')}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                    {picked ? <Check size={18} className="text-primary" /> : null}
                  </Pressable>
                )
              })}
            </View>
          )}
          <Button disabled={pickedIds.size === 0} onPress={confirmPick}>
            <Text>{t('dfCommonConfirm')} · {pickedIds.size}</Text>
          </Button>
        </View>
      </Sheet>
    </View>
  )
}
