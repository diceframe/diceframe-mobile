import { UserFacingError } from '@/lib/user-facing-error'

/** Web Sharing 不支持原生缓存文件 URI；用已鉴权下载的字节创建浏览器下载。 */
export async function shareExportBlob(bytes: Uint8Array, filename: string, _dialogTitle: string): Promise<void> {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') {
    throw new UserFacingError('dfShareFileUnavailable')
  }
  const type = filename.endsWith('.json') ? 'application/json' : 'application/zip'
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type }))
  const link = document.createElement('a')
  try {
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
  } finally {
    link.remove()
    // 浏览器需要先读到 URL，再释放（不能在 click 同步栈里撤销）。
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}
