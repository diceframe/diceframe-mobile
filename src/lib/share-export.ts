import { File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'

/** Persist a fetched archive and hand its actual file URI to the native share sheet. */
export async function shareExportBlob(blob: Blob, filename: string, dialogTitle: string): Promise<void> {
  const file = new File(Paths.cache, filename)
  const writer = file.writableStream().getWriter()
  try {
    await writer.write(new Uint8Array(await blob.arrayBuffer()))
    await writer.close()
    if (!(await Sharing.isAvailableAsync())) throw new Error('当前设备不支持分享文件')
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/zip',
      dialogTitle,
      UTI: 'public.zip-archive',
    })
  } finally {
    try {
      file.delete()
    } catch {
      // 缓存清理失败不应影响分享结果。
    }
  }
}
