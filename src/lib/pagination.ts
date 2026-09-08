/** 页码必须为十进制正整数，不把小数、指数或超出范围的输入静默改成另一页。 */
export function parsePageNumber(input: string, pages: number): number | null {
  const text = input.trim()
  if (!/^\d+$/.test(text)) return null
  const page = Number(text)
  return Number.isSafeInteger(page) && page >= 1 && page <= pages ? page : null
}
