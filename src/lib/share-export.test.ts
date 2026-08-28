import { beforeEach, describe, expect, it, vi } from 'vitest'
import { shareExportBlob } from './share-export'

const mocks = vi.hoisted(() => ({
  available: vi.fn<() => Promise<boolean>>(),
  shareAsync: vi.fn<(uri: string, options?: Record<string, string>) => Promise<void>>(),
  files: [] as { uri: string; chunks: Uint8Array[]; deleted: boolean }[],
  FakeFile: class {
    uri: string
    chunks: Uint8Array[] = []
    deleted = false

    constructor(_directory: string, filename: string) {
      this.uri = `file:///cache/${filename}`
      mocks.files.push(this)
    }

    writableStream() {
      return new WritableStream<Uint8Array>({
        write: (chunk) => {
          this.chunks.push(chunk)
        },
      })
    }

    delete() {
      this.deleted = true
    }
  },
}))

vi.mock('expo-file-system', () => ({
  File: mocks.FakeFile,
  Paths: { cache: 'cache' },
}))

vi.mock('expo-sharing', () => ({
  isAvailableAsync: mocks.available,
  shareAsync: mocks.shareAsync,
}))

describe('shareExportBlob', () => {
  beforeEach(() => {
    mocks.available.mockReset()
    mocks.shareAsync.mockReset()
    mocks.files.length = 0
    mocks.available.mockResolvedValue(true)
    mocks.shareAsync.mockResolvedValue(undefined)
  })

  it('writes the archive bytes and shares the resulting file URI', async () => {
    await shareExportBlob(new Blob([new Uint8Array([1, 2, 3])]), 'diceframe-game.zip', '分享存档')

    expect(mocks.files).toHaveLength(1)
    expect(Array.from(mocks.files[0].chunks[0])).toEqual([1, 2, 3])
    expect(mocks.shareAsync).toHaveBeenCalledWith(
      'file:///cache/diceframe-game.zip',
      expect.objectContaining({ mimeType: 'application/zip', UTI: 'public.zip-archive' }),
    )
    expect(mocks.files[0].deleted).toBe(true)
  })

  it('fails clearly when native file sharing is unavailable', async () => {
    mocks.available.mockResolvedValue(false)

    await expect(
      shareExportBlob(new Blob(['archive']), 'diceframe-game.zip', '分享存档'),
    ).rejects.toThrow('当前设备不支持分享文件')
    expect(mocks.shareAsync).not.toHaveBeenCalled()
    expect(mocks.files[0].deleted).toBe(true)
  })
})
