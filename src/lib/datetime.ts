/**
 * 服务端时间戳展示格式化。
 * 服务端混有两种形态：Python isoformat（2026-08-31T03:45:35.398423+00:00，编辑接口写入）
 * 与空格分隔（2026-08-21 10:30:06），统一转本地时区的 "YYYY-MM-DD HH:MM:SS"。
 */
export function formatDateTime(value?: string | null): string {
  if (!value) return ''
  const parsed = new Date(value)
  // 解析失败原样返回，避免吞掉服务端已有的可读格式
  if (Number.isNaN(parsed.getTime())) return value
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())} ${pad(parsed.getHours())}:${pad(parsed.getMinutes())}:${pad(parsed.getSeconds())}`
}
