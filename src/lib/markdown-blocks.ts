/**
 * 轻量 markdown 分块（DF Agent 回复用）：标题、列表、代码块、段落。
 * 刻意只认常见形态、不支持表格 / 链接 / HTML——回复来自模型，宁可原样显示也不解释未知语法。
 * 行内标记（粗体 / 斜体 / 行内代码）交给 components/patterns/inline-markdown。
 */
export type MarkdownBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'code'; text: string }

const BULLET = /^\s*[-*+•]\s+(.*)$/
const ORDERED = /^\s*\d+[.)、]\s+(.*)$/
const HEADING = /^\s{0,3}#{1,6}\s+(.*)$/
const FENCE = /^\s*```/

export function markdownBlocks(source: string): MarkdownBlock[] {
  const lines = String(source || '').replace(/\r\n/g, '\n').split('\n')
  const blocks: MarkdownBlock[] = []
  let paragraph: string[] = []

  const flush = () => {
    const text = paragraph.join('\n').trim()
    if (text) blocks.push({ kind: 'paragraph', text })
    paragraph = []
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (FENCE.test(line)) {
      flush()
      const code: string[] = []
      index += 1
      while (index < lines.length && !FENCE.test(lines[index])) code.push(lines[index++])
      blocks.push({ kind: 'code', text: code.join('\n') })
      continue
    }
    const heading = line.match(HEADING)
    if (heading) {
      flush()
      blocks.push({ kind: 'heading', text: heading[1].trim() })
      continue
    }
    const bullet = line.match(BULLET)
    const ordered = bullet ? null : line.match(ORDERED)
    if (bullet || ordered) {
      flush()
      const isOrdered = !!ordered
      const last = blocks[blocks.length - 1]
      const text = (bullet ?? ordered)![1].trim()
      if (last?.kind === 'list' && last.ordered === isOrdered) last.items.push(text)
      else blocks.push({ kind: 'list', ordered: isOrdered, items: [text] })
      continue
    }
    if (!line.trim()) {
      flush()
      continue
    }
    paragraph.push(line)
  }
  flush()
  return blocks
}
