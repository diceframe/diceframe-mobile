import * as React from 'react'

import { Text } from '@/components/ui/text'

/**
 * 行内 markdown（粗体 / 斜体 / 行内代码）→ 嵌套 Text 片段，放进外层 Text 里使用。
 * GM 叙事与 DF Agent 回复共用；只认这三种标记，其余字符原样输出（不解析链接与 HTML）。
 */
export function renderInlineMarkdown(text: string): React.ReactNode[] {
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
