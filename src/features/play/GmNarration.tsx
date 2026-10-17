import * as React from 'react'
import { View } from 'react-native'

import { renderInlineMarkdown } from '@/components/patterns/inline-markdown'
import { Badge } from '@/components/ui/badge'
import { Text } from '@/components/ui/text'
import { useT } from '@/i18n/t'
import { cn } from '@/lib/utils'

import { parseGMText, type TagBadge } from './gmText'
import { STATE_TONES, TAG_TONES } from './tagTones'

function TagChip({ badge }: { badge: TagBadge }) {
  // roll 等中性标签走次级徽章令牌；数值类标签用 Web 同款强色+同色底
  const tone = TAG_TONES[badge.tone]
  if (!tone) {
    return (
      <Badge variant="secondary">
        <Text>{badge.text}</Text>
      </Badge>
    )
  }
  return (
    <Badge className="border-transparent" style={{ backgroundColor: tone.bg }}>
      <Text style={{ color: tone.color }}>{badge.text}</Text>
    </Badge>
  )
}

export function GmNarration({
  text,
  className,
  image,
}: {
  text: string
  className?: string
  /** 叙事段与状态卡之间的插槽（本回合场景图），对齐 Web 时间线的图文混排位置 */
  image?: React.ReactNode
}) {
  const t = useT()
  // 协议标签徽章的本地化文案（金币前缀 / DECISION 缺省），其余标签是服务端原文
  const block = parseGMText(text, { gold: t('goldCurrency'), decision: t('dfPlayKeyDecision') })
  if (!block.paragraphs.length && !block.states.length && !block.tags.length && !image) return null
  return (
    <View className={cn('gap-2', className)}>
      {block.paragraphs.map((paragraph, index) => (
        <Text key={index} className="leading-6 text-foreground">
          {renderInlineMarkdown(paragraph.replace(/^[#>\s]+/, '').replace(/^[-•*]\s+/, '• '))}
        </Text>
      ))}
      {image}
      {block.states.map((state) => {
        const tone = STATE_TONES[state.tone]
        return (
          <View
            key={state.title + state.body}
            className="rounded-md border px-3 py-2"
            style={{ backgroundColor: tone.bg, borderColor: tone.border }}
          >
            <Text className="text-sm font-semibold" style={{ color: tone.color }}>
              【{state.title}】{state.body}
            </Text>
          </View>
        )
      })}
      {block.tags.length > 0 && (
        <View className="flex-row flex-wrap gap-1.5">
          {block.tags.map((badge, index) => (
            <TagChip key={index} badge={badge} />
          ))}
        </View>
      )}
    </View>
  )
}
