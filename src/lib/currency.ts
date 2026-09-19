/**
 * 统一货币显示/解析：canonical base-unit 整数 ↔ 显示金额 / 输入文本。
 * 移植自上游 `frontend-v2/src/utils/currency.ts`，行为必须与后端 CurrencyCodec 一致。
 *
 * 后端 economy 只认 canonical 整数（25 美分存 25，不是 0.25），页面一律不许自己
 * `amount / 100` 或 `amount * 100`，全部走本模块。
 *
 * 展示与输入分离：
 * - `formatCurrencyAmount` → 界面展示（可带 $/¥ 或单位名）；
 * - `currencyAmountToInputText` → 输入框初值（纯数字，无符号无单位名）；
 * - `parseCurrencyInput` → 输入框文本 → canonical 整数。
 * 后两者永远使用同一个「可编辑单位」（`resolveEditableUnit`），保证 round-trip：
 * display.rate 能有限十进制表示时用 display 单位，否则回退 base unit，
 * 免得输入框里出现解析不回去的小数。
 *
 * 支持的服务器一定下发 `rule_meta.currency_system`（legacy 规则由服务端归一成
 * rate=1 的 spec），所以 cs 为空只会出现在规则尚未加载完的一瞬间；此时按 rate=1
 * 处理只是过渡显示，不是对旧服务器的降级。
 */
import type { CharacterSheet, CurrencySystem, CurrencyUnit } from '@/api/types'

const MAX_FORMAT_DECIMALS = 8
const DECIMAL_RE = /^\d+(\.\d+)?$/

export function resolveDisplayUnit(cs?: CurrencySystem | null): CurrencyUnit {
  const units = (cs?.units || []).filter((unit) => unit && Number(unit.rate) > 0)
  if (!units.length) return { id: 'unit', name: '', rate: 1 }
  const want = String(cs?.display_unit || cs?.base_unit || '')
  return units.find((unit) => unit.id === want) || units[0]
}

/** rate 能被 10^n 整除时返回 n，否则 null（如 rate=3 无法用有限小数表示）。 */
function decimalsForRate(rate: number): number | null {
  const value = Math.round(Number(rate) || 0)
  if (value <= 1) return null
  for (let candidate = 1; candidate <= MAX_FORMAT_DECIMALS; candidate += 1) {
    if (10 ** candidate % value === 0) return candidate
  }
  return null
}

function unitText(unit: CurrencyUnit, value: string): string {
  return unit.symbol ? `${unit.symbol}${value}` : `${value} ${unit.name}`
}

/**
 * 输入框实际使用的单位：display.rate 能有限十进制表示且 >1 时用 display 单位
 * （输入 0.25 表示 $0.25）；否则回退 base unit（输入 4 表示 4 个基础单位）。
 */
export function resolveEditableUnit(cs?: CurrencySystem | null): CurrencyUnit {
  const display = resolveDisplayUnit(cs)
  const rate = Math.round(Number(display.rate) || 1)
  if (rate > 1 && decimalsForRate(rate) !== null) return display
  const units = (cs?.units || []).filter((unit) => unit && Number(unit.rate) > 0)
  return units.find((unit) => unit.id === cs?.base_unit)
    || units.find((unit) => Math.round(Number(unit.rate) || 0) === 1)
    || display
}

/**
 * canonical 整数 → 展示文本：25 cent → "$0.25"；1250 fen → "¥12.50"；25 灵石 → "25 灵石"。
 * 没有 currency_system 时退回「数字 + fallbackLabel」。
 * display.rate 无法有限十进制表示（如 rate=3）时不做小数近似，按面额贪心分解，
 * 余数以 base unit 显示（1 → "1 铜币"）。
 */
export function formatCurrencyAmount(
  amount: number,
  cs?: CurrencySystem | null,
  fallbackLabel?: string,
): string {
  const value = Math.round(Number(amount) || 0)
  if (!cs || !(cs.units || []).length) return fallbackLabel ? `${value} ${fallbackLabel}` : String(value)
  const sign = value < 0 ? '-' : ''
  const abs = Math.abs(value)
  const display = resolveDisplayUnit(cs)
  const displayRate = Math.round(Number(display.rate) || 1)
  if (displayRate > 1) {
    const decimals = decimalsForRate(displayRate)
    if (decimals !== null) return sign + unitText(display, (abs / displayRate).toFixed(decimals))
  }
  // display 即 base，或 rate 无法精确十进制表示：按面额贪心分解。
  const larger = (cs.units || [])
    .filter((unit) => Number(unit.rate) > 1 && Number(unit.rate) <= abs)
    .sort((a, b) => Number(b.rate) - Number(a.rate))
  if (larger.length) {
    const parts: string[] = []
    let remaining = abs
    for (const unit of larger) {
      const count = Math.floor(remaining / Number(unit.rate))
      remaining %= Number(unit.rate)
      if (count) parts.push(`${count} ${unit.name}`)
    }
    const baseUnit = (cs.units || []).find((unit) => unit.id === cs.base_unit) || display
    if (remaining || !parts.length) parts.push(`${remaining} ${baseUnit.name || baseUnit.id}`)
    return sign + parts.join(' ')
  }
  if (displayRate === 1) return sign + unitText(display, String(abs))
  // 金额不足以兑任何高面额单位：以 base unit 显示，绝不冒充高面额单位。
  const baseUnit = (cs.units || []).find((unit) => unit.id === cs.base_unit)
    || (cs.units || []).find((unit) => Number(unit.rate) === 1)
    || display
  return sign + unitText(baseUnit, String(abs))
}

/**
 * 输入框实际解析单位的名称（与 parser 同单位）。
 * rate=3 这类结构会回退 base unit（如「铜币」），标签必须跟着回退，
 * 否则标签写「银币」而输入按铜币解析。拿不到名称时用 fallbackLabel。
 */
export function currencyEditableUnitLabel(
  cs?: CurrencySystem | null,
  fallbackLabel?: string,
): string {
  return resolveEditableUnit(cs).name || fallbackLabel || ''
}

/**
 * canonical 整数 → 输入框纯数字字符串（不含 $/¥ 与单位名）。
 * 与 `parseCurrencyInput` 同单位，保证 round-trip。
 */
export function currencyAmountToInputText(amount: number, cs?: CurrencySystem | null): string {
  const value = Math.round(Number(amount) || 0)
  const rate = Math.round(Number(resolveEditableUnit(cs).rate) || 1)
  if (rate <= 1) return String(value)
  const decimals = decimalsForRate(rate)
  return decimals === null ? String(value) : (value / rate).toFixed(decimals)
}

/**
 * 输入框文本 → canonical 整数；不是正金额、或小数位换算不出整数基础单位时返回 null。
 * `allowZero` 供角色卡余额编辑（0 是合法余额）；扣款等路径保持 >0。
 */
export function parseCurrencyInput(
  text: string | number,
  cs?: CurrencySystem | null,
  options?: { allowZero?: boolean },
): number | null {
  const raw = String(text ?? '').trim()
  if (!DECIMAL_RE.test(raw)) return null
  const rate = Math.round(Number(resolveEditableUnit(cs).rate) || 1)
  const [intPart, fracPart = ''] = raw.split('.')
  let canonical = Number(intPart) * rate
  if (fracPart) {
    const scaled = (Number(fracPart) * rate) / 10 ** fracPart.length
    // 0.005 美元换不出整数美分：宁可报错，也不悄悄四舍五入成另一个金额。
    if (!Number.isInteger(scaled)) return null
    canonical += scaled
  }
  const allowZero = options?.allowZero === true
  return canonical > 0 || (allowZero && canonical === 0) ? canonical : null
}

/**
 * 角色卡余额的权威读法（对齐上游 ruleSchema.getCurrencyAmount）：
 * 新存档写 `currency.amount`，老存档只有 `gold`，两者都是 canonical 整数。
 */
export function characterCurrencyAmount(sheet?: CharacterSheet | null): number {
  if (sheet?.currency?.amount !== undefined) return Number.parseInt(String(sheet.currency.amount), 10) || 0
  return Number.parseInt(String(sheet?.gold ?? 0), 10) || 0
}

/** 角色卡是否有余额可展示：两个字段都缺才算没有（0 是合法余额，必须显示）。 */
export function hasCurrencyAmount(sheet?: CharacterSheet | null): boolean {
  return sheet?.currency?.amount !== undefined || sheet?.gold !== undefined
}
