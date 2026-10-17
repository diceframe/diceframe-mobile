/**
 * 文本 → 二维码模块矩阵（纯 JS，qrcode-generator），渲染交给 components/patterns/qr-code。
 *
 * 纠错等级 M：邀请链接带房间 / 席位凭证，比 L 更耐屏幕反光与轻微遮挡，码点又不至于太密。
 * 按 UTF-8 编码：链接通常是 ASCII，但服务器地址或参数里出现中文时也要能被扫码端正确还原。
 */
import qrcode from 'qrcode-generator'

qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8']

/** 每行一个布尔数组，true = 深色模块；内容为空返回空矩阵 */
export function qrMatrix(text: string): boolean[][] {
  if (!text) return []
  const code = qrcode(0, 'M')
  code.addData(text, 'Byte')
  code.make()
  const count = code.getModuleCount()
  return Array.from({ length: count }, (_, row) => Array.from({ length: count }, (__, col) => code.isDark(row, col)))
}

/**
 * 深色模块合成一条 SVG path（每行连续的深色块合并成一个矩形），
 * 坐标以模块为单位、左上角让出 margin 个模块的静区。
 */
export function qrPath(matrix: boolean[][], margin: number): string {
  const parts: string[] = []
  matrix.forEach((row, y) => {
    let start = -1
    row.forEach((dark, x) => {
      if (dark && start < 0) start = x
      if ((!dark || x === row.length - 1) && start >= 0) {
        const end = dark ? x + 1 : x
        parts.push(`M${start + margin} ${y + margin}h${end - start}v1h${start - end}z`)
        start = -1
      }
    })
  })
  return parts.join('')
}
