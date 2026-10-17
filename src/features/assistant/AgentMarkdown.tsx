import * as React from 'react'
import { ScrollView, View } from 'react-native'

import { renderInlineMarkdown } from '@/components/patterns/inline-markdown'
import { Text } from '@/components/ui/text'
import { markdownBlocks } from '@/lib/markdown-blocks'

/** Agent 回复的轻量 markdown 渲染（分块见 lib/markdown-blocks），文本可长按选择复制 */
export function AgentMarkdown({ text }: { text: string }) {
  const blocks = markdownBlocks(text)
  return (
    <View className="gap-2">
      {blocks.map((block, index) => {
        if (block.kind === 'heading') {
          return <Text key={index} selectable className="font-semibold">{renderInlineMarkdown(block.text)}</Text>
        }
        if (block.kind === 'code') {
          return (
            <View key={index} className="rounded-md bg-muted px-2.5 py-2">
              <Text selectable className="font-mono text-xs leading-5">{block.text}</Text>
            </View>
          )
        }
        if (block.kind === 'table') {
          // 宽表格横向滚动，不撑破气泡（上游 #549 修的同类问题）
          return (
            <ScrollView key={index} horizontal showsHorizontalScrollIndicator={false}>
              <View className="rounded-md border border-border">
                {[block.header, ...block.rows].map((row, rowIndex) => (
                  <View key={rowIndex} className={rowIndex ? 'flex-row border-t border-border' : 'flex-row bg-muted'}>
                    {block.header.map((_, cellIndex) => (
                      <View key={cellIndex} className="w-36 px-2 py-1.5">
                        <Text selectable variant="small" className={rowIndex ? undefined : 'font-semibold'}>
                          {renderInlineMarkdown(row[cellIndex] ?? '')}
                        </Text>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            </ScrollView>
          )
        }
        if (block.kind === 'list') {
          return (
            <View key={index} className="gap-1">
              {block.items.map((item, itemIndex) => (
                <View key={itemIndex} className="flex-row gap-2">
                  <Text className="text-muted-foreground">{block.ordered ? `${itemIndex + 1}.` : '•'}</Text>
                  <Text selectable className="flex-1 leading-6">{renderInlineMarkdown(item)}</Text>
                </View>
              ))}
            </View>
          )
        }
        return <Text key={index} selectable className="leading-6">{renderInlineMarkdown(block.text)}</Text>
      })}
    </View>
  )
}
