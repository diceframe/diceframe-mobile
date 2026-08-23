import * as React from 'react'
import { ScrollView, View } from 'react-native'
import { Image } from 'expo-image'

import { Avatar } from '@/components/ui/avatar'
import { Badge, BadgeText } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Text } from '@/components/ui/text'
import type { CharacterSheet, Player, RuleAttribute, RuleMeta } from '@/api/types'
import { avatarSource } from '@/api/assets'

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

function itemList(items?: CharacterSheet['equipment']): string[] {
  return (items ?? [])
    .map((item) => item.name ?? '')
    .filter(Boolean)
}

/** 角色面板（对齐 Web CharacterPanel 的 v1 子集，只读） */
export function CharacterPanel({
  gameKey,
  player,
  ruleAttrs,
  ruleMeta,
}: {
  gameKey: string
  player: Player | null
  ruleAttrs: RuleAttribute[]
  ruleMeta: RuleMeta | null
}) {
  const sheet = player?.character_sheet ?? null
  const avatar = avatarSource(gameKey, sheet?.portrait)
  const specialStats = ruleMeta?.rule_special_stats ?? []

  return (
    <ScrollView className="flex-1" showsVerticalScrollIndicator={false} contentContainerClassName="gap-5 pb-8">
      <View className="flex-row items-center gap-3">
        {avatar ? (
          <Image source={avatar} className="h-14 w-14 rounded-full" contentFit="cover" />
        ) : (
          <Avatar name={player?.character_name ?? '?'} className="h-14 w-14" />
        )}
        <View className="flex-1 gap-0.5">
          <Text variant="h3">{player?.character_name ?? '未找到角色'}</Text>
          <Text variant="small">
            {[sheet?.race, sheet?.class, sheet?.level ? `Lv.${sheet.level}` : '']
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
      </View>

      <Section title="生命">
        <ResourceRow label="HP" current={sheet?.hp} max={sheet?.max_hp ?? undefined} />
      </Section>

      {specialStats.length > 0 && (
        <Section title="特殊状态">
          <View className="gap-2.5">
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

      {sheet?.attributes && Object.keys(sheet.attributes).length > 0 && (
        <Section title="属性">
          <View className="flex-row flex-wrap gap-2">
            {(ruleAttrs.length > 0
              ? ruleAttrs.map((attr) => ({ key: attr.key, label: attr.display_name || attr.name || attr.key }))
              : Object.keys(sheet.attributes).map((key) => ({ key, label: key }))
            ).map(({ key, label }) => (
              <Badge key={key} variant="secondary">
                <BadgeText>
                  {label} {sheet.attributes?.[key] ?? '?'}
                </BadgeText>
              </Badge>
            ))}
          </View>
        </Section>
      )}

      {skillList(sheet).length > 0 && (
        <Section title="技能">
          <View className="flex-row flex-wrap gap-2">
            {skillList(sheet).map((skill) => (
              <Badge key={skill} variant="outline">
                <BadgeText>{skill}</BadgeText>
              </Badge>
            ))}
          </View>
        </Section>
      )}

      {typeof sheet?.gold === 'number' && (
        <Section title="财产">
          <Text className="font-mono">💰 {sheet.gold}</Text>
        </Section>
      )}

      {itemList(sheet?.equipment).length > 0 && (
        <Section title="装备">
          <View className="gap-1">
            {itemList(sheet?.equipment).map((name) => (
              <Text key={name} className="text-sm">
                ⚔ {name}
              </Text>
            ))}
          </View>
        </Section>
      )}

      {itemList(sheet?.inventory).length > 0 && (
        <Section title="背包">
          <View className="flex-row flex-wrap gap-2">
            {itemList(sheet?.inventory).map((name) => (
              <Badge key={name} variant="secondary">
                <BadgeText>{name}</BadgeText>
              </Badge>
            ))}
          </View>
        </Section>
      )}

      {itemList(sheet?.key_items).length > 0 && (
        <Section title="关键物品">
          <View className="gap-1">
            {itemList(sheet?.key_items).map((name) => (
              <Text key={name} className="text-sm">
                🔑 {name}
              </Text>
            ))}
          </View>
        </Section>
      )}

      <Separator />
      <Text variant="small" className="text-center text-muted-foreground">
        角色编辑请使用 Web 端（GM 或设置中的角色管理）
      </Text>
    </ScrollView>
  )
}
