/**
 * 版本兼容检查的组合层：把 /api/config 探测、App 版本读取与判定文案
 * 拼在一起。纯判定逻辑在 version-compat.ts（有单测），这里只做装配；
 * 连接入口（登录/切换/加入）与启动检查共用，保证四处行为一致。
 */
import Constants from 'expo-constants'

import { fetchAppConfig } from '@/api/client'
import type { AppConfig } from '@/api/types'
import { getT } from '@/i18n/t'
import {
  APP_MIN_SERVER_VERSION,
  serverCompatibility,
  type ServerCompatStatus,
} from '@/lib/version-compat'

/** app.json 的 expo.version（profile 页"关于"同源） */
export function appVersion(): string {
  return Constants.expoConfig?.version ?? ''
}

/** 对一次已拿到的 /api/config 做双向兼容判定 */
export function checkServerCompatibility(config: AppConfig): ServerCompatStatus {
  return serverCompatibility(config, appVersion(), APP_MIN_SERVER_VERSION)
}

/**
 * 连接入口（登录/切换/加入）的阻断信号：携带判定结论与当次探测到的
 * 服务器配置，入口 catch 后经 serverCompatErrorText 组文案展示。
 */
export class ServerCompatBlocked extends Error {
  constructor(
    public readonly status: Exclude<ServerCompatStatus, 'ok' | 'unknown'>,
    public readonly config: AppConfig,
  ) {
    super(`server incompatible: ${status}`)
    this.name = 'ServerCompatBlocked'
  }
}

export interface ServerCompatProbe {
  status: ServerCompatStatus
  /** 当次探测到的 /api/config（文案插值取 server_version 用） */
  config: AppConfig
}

/** 探测 + 判定一步完成（启动后台检查 / 加入流程用）；网络失败由调用方兜底 */
export async function fetchServerCompat(): Promise<ServerCompatProbe> {
  const config = await fetchAppConfig()
  return { status: serverCompatibility(config, appVersion(), APP_MIN_SERVER_VERSION), config }
}

/** 不兼容提示正文（带双方版本号插值）；只在 app-too-old / server-too-old 时调用 */
export function serverCompatErrorText(
  status: Exclude<ServerCompatStatus, 'ok' | 'unknown'>,
  config: AppConfig,
): string {
  const t = getT()
  return t(
    status === 'app-too-old' ? 'dfServerCompatAppTooOld' : 'dfServerCompatServerTooOld',
    {
      app: appVersion() || '-',
      server: config.server_version || '-',
      minServer: APP_MIN_SERVER_VERSION,
    },
  )
}
