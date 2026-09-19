import { describe, expect, it } from 'vitest'

import type { CurrencySystem } from '@/api/types'

import {
  characterCurrencyAmount,
  currencyAmountToInputText,
  currencyEditableUnitLabel,
  formatCurrencyAmount,
  hasCurrencyAmount,
  parseCurrencyInput,
  resolveEditableUnit,
} from './currency'

const dollarCent: CurrencySystem = {
  schema_version: 2,
  base_unit: 'cent',
  display_unit: 'dollar',
  units: [
    { id: 'dollar', name: '美元', symbol: '$', rate: 100 },
    { id: 'cent', name: '美分', rate: 1 },
  ],
}

const yuanFen: CurrencySystem = {
  schema_version: 2,
  base_unit: 'fen',
  display_unit: 'yuan',
  units: [
    { id: 'yuan', name: '人民币', symbol: '¥', rate: 100 },
    { id: 'fen', name: '分', rate: 1 },
  ],
}

const spirit: CurrencySystem = {
  base_unit: 'unit',
  display_unit: 'unit',
  units: [{ id: 'unit', name: '灵石', rate: 1 }],
}

// rate=3 无法有限十进制表示：展示按面额分解，输入回退 base unit。
const silverCopper: CurrencySystem = {
  schema_version: 2,
  base_unit: 'copper',
  display_unit: 'silver',
  units: [
    { id: 'silver', name: '银币', rate: 3 },
    { id: 'copper', name: '铜币', rate: 1 },
  ],
}

describe('formatCurrencyAmount', () => {
  it('按 display 单位带符号与定长小数展示', () => {
    expect(formatCurrencyAmount(25, dollarCent)).toBe('$0.25')
    expect(formatCurrencyAmount(100, dollarCent)).toBe('$1.00')
    expect(formatCurrencyAmount(1250, yuanFen)).toBe('¥12.50')
    expect(formatCurrencyAmount(0, dollarCent)).toBe('$0.00')
    expect(formatCurrencyAmount(-250, dollarCent)).toBe('-$2.50')
  })

  it('没有符号时退回单位名', () => {
    expect(formatCurrencyAmount(25, spirit)).toBe('25 灵石')
  })

  it('没有 currency_system 时退回纯数字或数字加货币名', () => {
    expect(formatCurrencyAmount(25, null)).toBe('25')
    expect(formatCurrencyAmount(25, null, '金币')).toBe('25 金币')
  })

  it('rate=3 按面额分解，不伪造小数', () => {
    expect(formatCurrencyAmount(1, silverCopper)).toBe('1 铜币')
    expect(formatCurrencyAmount(2, silverCopper)).toBe('2 铜币')
    expect(formatCurrencyAmount(3, silverCopper)).toBe('1 银币')
    expect(formatCurrencyAmount(4, silverCopper)).toBe('1 银币 1 铜币')
    expect(formatCurrencyAmount(6, silverCopper)).toBe('2 银币')
  })
})

describe('parseCurrencyInput', () => {
  it('把可编辑单位的小数解析成 canonical 整数', () => {
    expect(parseCurrencyInput('0.25', dollarCent)).toBe(25)
    expect(parseCurrencyInput('1', dollarCent)).toBe(100)
    expect(parseCurrencyInput('12.50', yuanFen)).toBe(1250)
    expect(parseCurrencyInput('3', spirit)).toBe(3)
  })

  it('换不出整数基础单位或非正金额一律 null', () => {
    expect(parseCurrencyInput('0.001', dollarCent)).toBeNull()
    expect(parseCurrencyInput('0.5', spirit)).toBeNull()
    expect(parseCurrencyInput('abc', dollarCent)).toBeNull()
    expect(parseCurrencyInput('-5', dollarCent)).toBeNull()
    expect(parseCurrencyInput('0', dollarCent)).toBeNull()
    expect(parseCurrencyInput('', dollarCent)).toBeNull()
  })

  it('只有角色卡余额编辑允许 0', () => {
    expect(parseCurrencyInput('0', spirit, { allowZero: true })).toBe(0)
    expect(parseCurrencyInput('0.00', dollarCent, { allowZero: true })).toBe(0)
  })

  it('没有 currency_system 时按 rate=1 处理', () => {
    expect(parseCurrencyInput('25', null)).toBe(25)
    expect(parseCurrencyInput('0.5', null)).toBeNull()
  })
})

describe('编辑框单位与 round-trip', () => {
  it('rate 可有限十进制表示时用 display 单位', () => {
    expect(resolveEditableUnit(dollarCent).id).toBe('dollar')
    expect(resolveEditableUnit(yuanFen).id).toBe('yuan')
  })

  it('rate=3 回退 base unit，避免输入框出现解析不回去的小数', () => {
    expect(resolveEditableUnit(silverCopper).id).toBe('copper')
  })

  it.each([
    ['美分', 25, dollarCent, '0.25'],
    ['人民币分', 1250, yuanFen, '12.50'],
    ['灵石', 25, spirit, '25'],
    ['铜币（rate=3 回退）', 4, silverCopper, '4'],
  ])('%s：canonical → 输入文本 → 解析回同一个整数', (_name, canonical, system, text) => {
    const input = currencyAmountToInputText(canonical, system as CurrencySystem)
    expect(input).toBe(text)
    // 输入框初值必须是纯数字，不能带符号或单位名。
    expect(input).toMatch(/^\d+(\.\d+)?$/)
    expect(parseCurrencyInput(input, system as CurrencySystem)).toBe(canonical)
  })
})

describe('currencyEditableUnitLabel 与解析单位一致', () => {
  it('编辑回退到 base unit 时标签也跟着回退', () => {
    expect(currencyEditableUnitLabel(silverCopper, '银币')).toBe('铜币')
    expect(currencyEditableUnitLabel(silverCopper)).toBe('铜币')
  })

  it('rate 可有限十进制表示时用 display 单位名', () => {
    expect(currencyEditableUnitLabel(dollarCent, '美元')).toBe('美元')
    expect(currencyEditableUnitLabel(yuanFen, '人民币')).toBe('人民币')
    expect(currencyEditableUnitLabel(spirit, '灵石')).toBe('灵石')
  })

  it('没有单位名时退回传入的货币名', () => {
    expect(currencyEditableUnitLabel(null, '金币')).toBe('金币')
    expect(currencyEditableUnitLabel(null)).toBe('')
  })
})

describe('角色卡余额读取', () => {
  it('新存档取 currency.amount，老存档取 gold', () => {
    expect(characterCurrencyAmount({ currency: { amount: 1250 }, gold: 12 })).toBe(1250)
    expect(characterCurrencyAmount({ gold: 30 })).toBe(30)
    expect(characterCurrencyAmount({})).toBe(0)
    expect(characterCurrencyAmount(null)).toBe(0)
  })

  it('两个字段都缺才算没有余额；0 是合法余额', () => {
    expect(hasCurrencyAmount({ gold: 0 })).toBe(true)
    expect(hasCurrencyAmount({ currency: { amount: 0 } })).toBe(true)
    expect(hasCurrencyAmount({})).toBe(false)
    expect(hasCurrencyAmount(null)).toBe(false)
  })
})
