import { File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'

import { UserFacingError } from '@/lib/user-facing-error'

/** 原生分享需要本地文件 URI；团录/角色 JSON 与 GM 存档 ZIP 的类型不能混用。 */
export async function shareExportBlob(bytes: Uint8Array, filename: string, dialogTitle: string): Promise<void> {
  const json = filename.endsWith('.json')
  const file = new File(Paths.cache, filename)
  const writer = file.writableStream().getWriter()
  try {
    await writer.write(bytes)
    await writer.close()
    if (!(await Sharing.isAvailableAsync())) throw new UserFacingError('dfShareFileUnavailable')
    await Sharing.shareAsync(file.uri, {
      mimeType: json ? 'application/json' : 'application/zip',
      dialogTitle,
      UTI: json ? 'public.json' : 'public.zip-archive',
    })
  } finally {
    try {
      file.delete()
    } catch {
      // 缓存清理失败不应影响分享结果。
    }
  }
}
