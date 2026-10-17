import { describe, expect, it } from 'vitest'

import { qrMatrix, qrPath } from './qr-matrix'

describe('二维码矩阵', () => {
  it('方阵、尺寸符合版本规则（21 + 4n），三个角是定位图案', () => {
    const matrix = qrMatrix('http://192.168.1.10:18000/#/join?game=web%7Cabc%7Cbot&seat=token')
    const size = matrix.length
    expect(matrix.every((row) => row.length === size)).toBe(true)
    expect((size - 21) % 4).toBe(0)
    // 定位图案外圈：左上、右上、左下 7×7 的四条边全是深色
    for (const [r, c] of [[0, 0], [0, size - 7], [size - 7, 0]]) {
      for (let i = 0; i < 7; i += 1) {
        expect(matrix[r][c + i]).toBe(true)
        expect(matrix[r + 6][c + i]).toBe(true)
        expect(matrix[r + i][c]).toBe(true)
        expect(matrix[r + i][c + 6]).toBe(true)
      }
    }
  })

  it('中文内容按 UTF-8 编码也能生成；空文本返回空矩阵', () => {
    expect(qrMatrix('http://例子.测试/邀请').length).toBeGreaterThanOrEqual(21)
    expect(qrMatrix('')).toEqual([])
  })

  it('每行连续深色块合并为一个矩形，坐标带静区偏移', () => {
    expect(qrPath([[true, true, false, true]], 4)).toBe('M4 4h2v1h-2zM7 4h1v1h-1z')
    expect(qrPath([[false, false]], 4)).toBe('')
  })
})
