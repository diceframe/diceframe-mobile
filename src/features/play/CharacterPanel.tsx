import * as React from 'react'
import { Image } from 'expo-image'
import { Pressable, ScrollView, View } from 'react-native'

import { RemoteAvatar } from '@/components/patterns/remote-avatar'
import { StatusBadge } from '@/components/patterns/status-badge'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Text } from '@/components/ui/text'
import type { CharacterItem, CharacterSheet, Player, RuleAttribute, RuleMeta } from '@/api/types'
import { assetSource, avatarSource } from '@/api/assets'
import { useT, type T } from '@/i18n/t'
import {
  characterItemDetail,
  characterItemGroups,
  characterItemImageAssetId,
  characterItemName,
  characterItemQty,
  type CharacterItemGroup,
  type CharacterItemLabels,
} from '@/lib/character-items'
import { characterStatusFlags, deathSaveCounts } from '@/lib/character-status'

import { characterAttributeRows } from './characterAttributes'
import { useAssetUri } from './useAssetUri'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-2">
      <Text variant="small" className="font-semibold text-muted-foreground">
        {title}
      </Text>
      {children}
    </View>
  )
}

function PanelCard({ children }: { children: React.ReactNode }) {
  return (
    <View
      className="rounded-md border border-border bg-muted px-3 py-2"
      style={{ flexBasis: '30%', flexGrow: 1 }}
    >
      {children}
    </View>
  )
}

function ResourceRow({
  label,
  current,
  max,
}: {
  label: string
  current?: number
  max?: number
}) {
  const value = Number(current ?? 0)
  const maxValue = Number(max ?? 0)
  const percent = maxValue > 0 ? (value / maxValue) * 100 : 0
  // 三档变色（对齐 Web HP 档位）：>50% 常绿 / ≤50% 警示 / ≤25% 危险
  const tier = percent <= 25 ? 'bg-destructive' : percent <= 50 ? 'bg-warning' : 'bg-success'
  return (
    <View className="gap-1">
      <View className="flex-row items-center justify-between">
        <Text className="text-sm">{label}</Text>
        <Text className="text-sm font-mono">
          {value}
          {maxValue ? ` / ${maxValue}` : ''}
        </Text>
      </View>
      <Progress value={percent} indicatorClassName={tier} />
    </View>
  )
}

function skillList(sheet: CharacterSheet | null): string[] {
  if (!sheet?.skills) return []
  return sheet.skills.map((skill) =>
    typeof skill === 'string' ? skill : `${skill.name}${skill.value != null ? ` ${skill.value}` : ''}`,
  )
}

/** 物品详情里需要本地化的词（组合逻辑在 lib/character-items，这里只供 t 值） */
function itemLabels(t: T): CharacterItemLabels {
  return {
    weapon: t('itemTypeWeapon'),
    armor: t('itemTypeArmor'),
    item: t('itemTypeItem'),
    mainHand: t('itemSlotMainHand'),
    offHand: t('itemSlotOffHand'),
    armorSlot: t('itemSlotArmor'),
    head: t('itemSlotHead'),
    noSlot: t('itemSlotNone'),
    damage: t('damage'),
    effect: t('effect'),
  }
}

/**
 * 条目生成图缩略图：与 Web GeneratedImageThumbnail 同一资源端点，经 apiBlob
 * 鉴权下载转 data URI；加载中/失败返回 null（整图兜底隐藏，不留占位框）。
 */
function ItemThumbnail({ gameKey, assetId, name }: { gameKey: string; assetId: string; name: string }) {
  const uri = useAssetUri(
    assetSource(`/games/${encodeURIComponent(gameKey)}/generated-images/${encodeURIComponent(assetId)}`),
  )
  if (!uri) return null
  return (
    <Image
      source={{ uri }}
      className="h-10 w-10 rounded-md border border-border"
      contentFit="cover"
      accessibilityLabel={name}
    />
  )
}

/** 物品条目行：名称×数量，点击展开类型/槽位/伤害/效果等详情（无详情的条目不可展开） */
function ItemRow({
  item,
  group,
  gameKey,
  labels,
}: {
  item: CharacterItem
  group: CharacterItemGroup
  gameKey: string
  labels: CharacterItemLabels
}) {
  const [expanded, setExpanded] = React.useState(false)
  const name = characterItemName(item)
  const qty = characterItemQty(item)
  const assetId = characterItemImageAssetId(item)
  const detail = characterItemDetail(item, group, labels)

  return (
    <View className="gap-0.5">
      <Pressable
        onPress={detail ? () => setExpanded(!expanded) : undefined}
        className="flex-row items-center gap-2 rounded-md py-0.5 active:opacity-60"
        accessibilityRole="button"
        accessibilityLabel={name}
      >
        {assetId ? <ItemThumbnail gameKey={gameKey} assetId={assetId} name={name} /> : null}
        <Text className="flex-1 text-sm" numberOfLines={2}>
          {name}
          {qty ? ` ×${qty}` : ''}
        </Text>
      </Pressable>
      {expanded && detail ? (
        <Text variant="small" className="pl-12 text-muted-foreground">
          {detail}
        </Text>
      ) : null}
    </View>
  )
}

/**
 * 角色面板（对齐 Web CharacterPanel）：状态徽章只读展示，物品按 装备/背包/
 * 关键物品 分组并可展开详情；头像经 onEditPortrait 走对局内更换。
 */
export function CharacterPanel({
  gameKey,
  player,
  ruleAttrs,
  ruleMeta,
  onEditPortrait,
}: {
  gameKey: string
  player: Player | null
  ruleAttrs: RuleAttribute[]
  ruleMeta: RuleMeta | null
  onEditPortrait?: () => void
}) {
  const sheet = player?.character_sheet ?? null
  const avatar = avatarSource(gameKey, sheet?.portrait)
  const specialStats = ruleMeta?.rule_special_stats ?? []
  const attributes = characterAttributeRows(sheet?.attributes, ruleAttrs)
  const skills = skillList(sheet)
  const groups = characterItemGroups(sheet)
  const status = characterStatusFlags(sheet)
  const deathSaves = deathSaveCounts(sheet)
  const t = useT()
  const labels = itemLabels(t)
  const portraitEditable = !!player && !!onEditPortrait
  const showStatusBadge = status.deceased || status.downed || status.stable || !!status.raw

  return (
    <ScrollView
      className="flex-1"
      nestedScrollEnabled
      showsVerticalScrollIndicator={false}
      contentContainerClassName="gap-4 pb-8"
    >
      <View className="flex-row items-center gap-3">
        {/* 头像可点（对齐 Web portrait-edit-button）；有玩家身份才给入口 */}
        {portraitEditable ? (
          <Pressable
            onPress={onEditPortrait}
            className="items-center gap-0.5 active:opacity-60"
            accessibilityRole="button"
            accessibilityLabel={t('clickToChangeAvatar')}
          >
            <RemoteAvatar
              key={avatar?.uri ?? 'fallback'}
              source={avatar}
              name={player?.character_name ?? '?'}
              className="h-14 w-14 rounded-full"
            />
            <Text variant="small" className="text-muted-foreground">
              {t('changeAvatar')}
            </Text>
          </Pressable>
        ) : (
          <RemoteAvatar
            key={avatar?.uri ?? 'fallback'}
            source={avatar}
            name={player?.character_name ?? '?'}
            className="h-14 w-14 rounded-full"
          />
        )}
        <View className="flex-1 gap-0.5">
          <Text variant="h3">{player?.character_name ?? t('dfCharacterNotFound')}</Text>
          <Text variant="small">
            {[sheet?.race, sheet?.class, sheet?.level ? `Lv.${sheet.level}` : '']
              .filter(Boolean)
              .join(' · ')}
          </Text>
          {/* 角色状态徽章（倒地/稳定/死亡不可操作，对齐 Web 的 tag 行） */}
          {showStatusBadge ? (
            <View className="flex-row flex-wrap gap-1 pt-0.5">
              {status.deceased ? (
                <StatusBadge tone="destructive">{t('unavailable')}</StatusBadge>
              ) : null}
              {status.downed ? <StatusBadge tone="warning">{t('statusDowned')}</StatusBadge> : null}
              {status.stable ? <StatusBadge tone="warning">{t('statusStable')}</StatusBadge> : null}
              {!status.downed && !status.stable && status.raw ? (
                <StatusBadge>{status.raw}</StatusBadge>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>

      <Section title={t('dfCharacterSectionLife')}>
        <View className="gap-2">
          <ResourceRow label="HP" current={sheet?.hp} max={sheet?.max_hp ?? undefined} />
          {/* 死亡豁免计数（仅在倒地时出现，对齐 Web vitals 的 stat-row） */}
          {status.downed && deathSaves ? (
            <View className="flex-row items-center justify-between">
              <Text variant="small">{t('deathSaves')}</Text>
              <Text variant="small" className="font-mono">
                {deathSaves.success}✓ / {deathSaves.failure}✗
              </Text>
            </View>
          ) : null}
        </View>
      </Section>

      {specialStats.length > 0 && (
        <Section title={t('dfCharacterSectionSpecial')}>
          <View className="gap-2">
            {specialStats.map((stat) => (
              <ResourceRow
                key={stat.key}
                label={stat.name ?? stat.key}
                current={sheet?.resources?.[stat.key]?.current}
                max={stat.max ?? sheet?.resources?.[stat.key]?.max}
              />
            ))}
          </View>
        </Section>
      )}

      {attributes.length > 0 && (
        <Section title={t('dfCharacterSectionAttributes')}>
          <View className="flex-row flex-wrap gap-2">
            {attributes.map((attribute) => (
              <PanelCard key={attribute.key}>
                <Text variant="small" numberOfLines={1}>
                  {attribute.label}
                </Text>
                <Text className="font-mono text-xl font-semibold">{attribute.value}</Text>
              </PanelCard>
            ))}
          </View>
        </Section>
      )}

      {skills.length > 0 && (
        <Section title={t('dfCharacterSectionSkills')}>
          <View className="flex-row flex-wrap gap-2">
            {skills.map((skill, index) => (
              <PanelCard key={`${skill}-${index}`}>
                <Text className="text-sm" numberOfLines={2}>
                  {skill}
                </Text>
              </PanelCard>
            ))}
          </View>
        </Section>
      )}

      {typeof sheet?.gold === 'number' && (
        <Section title={t('dfCharacterSectionAssets')}>
          <View className="flex-row flex-wrap gap-2">
            <PanelCard>
              <Text variant="small">{t('goldCurrency')}</Text>
              <Text className="font-mono text-xl font-semibold">{sheet.gold}</Text>
            </PanelCard>
          </View>
        </Section>
      )}

      {/* 物品三组分栏：装备/背包/关键物品，行内可展开详情（对齐 Web item-groups + 详情弹窗） */}
      {groups.equipment.length > 0 && (
        <Section title={t('dfCharacterSectionEquipment')}>
          <View className="gap-1">
            {groups.equipment.map((item, index) => (
              <ItemRow
                key={`equipment-${index}`}
                item={item}
                group="equipment"
                gameKey={gameKey}
                labels={labels}
              />
            ))}
          </View>
        </Section>
      )}

      {groups.inventory.length > 0 && (
        <Section title={t('dfCharacterSectionInventory')}>
          <View className="gap-1">
            {groups.inventory.map((item, index) => (
              <ItemRow
                key={`inventory-${index}`}
                item={item}
                group="inventory"
                gameKey={gameKey}
                labels={labels}
              />
            ))}
          </View>
        </Section>
      )}

      {groups.keyItems.length > 0 && (
        <Section title={t('dfCharacterSectionKeyItems')}>
          <View className="gap-1">
            {groups.keyItems.map((item, index) => (
              <ItemRow
                key={`key-items-${index}`}
                item={item}
                group="key_items"
                gameKey={gameKey}
                labels={labels}
              />
            ))}
          </View>
        </Section>
      )}

      <Separator className="my-1" />
      <Text variant="small" className="text-center text-muted-foreground">
        {t('dfCharacterEditHint')}
      </Text>
    </ScrollView>
  )
}
