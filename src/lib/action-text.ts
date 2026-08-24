/** 把语音或快捷行动追加到当前草稿，并保证词块之间只有一个分隔空格。 */
export function appendActionText(current: string, addition: string): string {
  const left = current.trimEnd()
  const right = addition.trim()
  if (!right) return left
  return left ? `${left} ${right}` : right
}
