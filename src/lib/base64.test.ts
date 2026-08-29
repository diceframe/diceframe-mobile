import { describe, expect, it } from 'vitest'

import { bytesToBase64 } from './base64'

describe('bytesToBase64', () => {
  it('编码空字节得到空串', () => {
    expect(bytesToBase64(new Uint8Array([]))).toBe('')
  })

  it('处理 RFC 4648 的 padding 边界（0/1/2 字节尾组）', () => {
    expect(bytesToBase64(new Uint8Array([0x66]))).toBe('Zg==')
    expect(bytesToBase64(new Uint8Array([0x66, 0x6f]))).toBe('Zm8=')
    expect(bytesToBase64(new Uint8Array([0x66, 0x6f, 0x6f]))).toBe('Zm9v')
  })

  it('与 Node 的 base64 实现逐字节一致（含跨块边界）', () => {
    const sizes = [1, 2, 3, 4, 5, 4095, 4096, 4097, 12288, 12289, 40000]
    for (const size of sizes) {
      const bytes = new Uint8Array(size)
      for (let i = 0; i < size; i++) bytes[i] = (i * 31 + (i >> 5)) & 0xff
      expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'))
    }
  })
})
