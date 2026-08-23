import * as React from 'react'
import { View } from 'react-native'

import { Badge, BadgeText } from '@/components/ui/badge'
import { Text } from '@/components/ui/text'
import { cn } from '@/lib/utils'

import { parseGMText, type TagBadge } from './gmText'
import { STATE_TONES, TAG_TONES } from './tagTones'

/** 段内行内 markdown（粗体/斜体/行内代码），覆盖 GM 输出的常见形态 */
function renderInline(text: string) {
  const parts: React.ReactNode[] = []
  const pattern = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`\n]+`)/g
  let last = 0
  let match: RegExpExecArray | null
  let key = 0
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parts.push(<Text key={key++}>{text.slice(last, match.index)}</Text>)
    const token = match[0]
    if (token.startsWith('**')) {
      parts.push(
        <Text key={key++} className="font-bold">
          {token.slice(2, -2)}
        </Text>,
      )
    } else if (token.startsWith('`')) {
      parts.push(
        <Text key={key++} className="font-mono text-muted-foreground">
          {token.slice(1, -1)}
        </Text>,
      )
    } else {
      parts.push(
        <Text key={key++} className="italic">
          {token.slice(1, -1)}
        </Text>,
      )
    }
    last = match.index + token.length
  }
  if (last < text.length) parts.push(<Text key={key++}>{text.slice(last)}</Text>)
  return parts
}

function TagChip({ badge }: { badge: TagBadge }) {
  // roll 等中性标签走次级徽章令牌；数值类标签用 Web 同款强色+同色底
  const tone = TAG_TONES[badge.tone]
  if (!tone) {
    return (
      <Badge variant="secondary">
        <BadgeText>{badge.text}</BadgeText>
      </Badge>
    )
  }
  return (
    <Badge className="border-transparent" style={{ backgroundColor: tone.bg }}>
      <BadgeText style={{ color: tone.color }}>{badge.text}</BadgeText>
    </Badge>
  )
}

export function GmNarration({ text, className }: { text: string; className?: string }) {
  const block = parseGMText(text)
  if (!block.paragraphs.length && !block.states.length && !block.tags.length) return null
  return (
    <View className={cn('gap-2.5', className)}>
      {block.paragraphs.map((paragraph, index) => (
        <Text key={index} className="leading-6 text-foreground">
          {renderInline(paragraph.replace(/^[#>\s]+/, '').replace(/^[-•*]\s+/, '• '))}
        </Text>
      ))}
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
