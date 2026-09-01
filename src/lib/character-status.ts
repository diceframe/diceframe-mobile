/**
 * 角色状态徽章的纯逻辑派生（对齐 Web CharacterPanel 的 statusLabel/deathSaves）。
 *
 * status / deceased / death_saves 由服务端写在 character_sheet 顶层
 * （engine/character_utils.py 只写 downed/stable 两态），不在镜像 CharacterSheet
 * 的显式声明里，经索引签名读取并做形状收敛。
 */
import type { CharacterSheet } from '@/api/types'

export interface CharacterStatusFlags {
  /** 已死亡（deceased 徽章） */
  deceased: boolean
  /** 昏迷倒地（statusDowned 徽章 + 死亡豁免计数的前提） */
  downed: boolean
  /** 稳定（statusStable 徽章） */
  stable: boolean
  /** status 原始值；未知状态时组件按原文展示（同 Web statusLabel 的兜底分支） */
  raw: string
}

export function characterStatusFlags(sheet: CharacterSheet | null): CharacterStatusFlags {
  const raw = typeof sheet?.status === 'string' ? sheet.status.trim() : ''
  return {
    deceased: Boolean(sheet?.deceased),
    downed: raw === 'downed',
    stable: raw === 'stable',
    raw,
  }
}

export interface DeathSaveCounts {
  success: number
  failure: number
}

/**
 * 死亡豁免计数（success/failure）；字段缺失或形状不对返回 null，
 * 数值负数/非有限数按 0 计（对齐 Web Number(ds.success || 0) 的宽容解析）。
 */
export function deathSaveCounts(sheet: CharacterSheet | null): DeathSaveCounts | null {
  const saves = sheet?.death_saves
  if (!saves || typeof saves !== 'object' || Array.isArray(saves)) return null
  const record = saves as Record<string, unknown>
  const sanitize = (value: unknown): number => {
    const count = Number(value ?? 0)
    return Number.isFinite(count) && count > 0 ? count : 0
  }
  return { success: sanitize(record.success), failure: sanitize(record.failure) }
}
