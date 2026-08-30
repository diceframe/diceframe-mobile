/**
 * 移动端自有文案（上游 frontend-v2 没有的界面）。
 *
 * 规约：
 * - 按功能簇拆文件（common/settings/auth/overview/profile/play/characters/lore），
 *   每个簇内 zh / en / ja 三块并列，key 三语必须一一对应；
 * - key 必须加 `df` 前缀，与 web 镜像段共用 i18next 单一扁平命名空间，
 *   不得与上游 key 重名（由 src/i18n/messages.test.ts 兜底校验）；
 * - 上游已有且语义完全一致的通用词（cancel/delete/back/roomPassword 等）直接复用上游 key，不建 df key；
 * - 插值用 i18next 双花括号：{{name}}。
 */

/** 跨簇共用：通用动作、触觉事件名、底栏 Tab */
export const common = {
  zh: {
    dfCommonConfirm: '确定',
    dfCommonCancel: '取消',
    dfCommonRetry: '重试',
    dfCommonLoading: '加载中…',
    dfCommonOperationFailed: '操作失败',
    dfCommonNetworkError: '无法连接服务器，请检查地址与网络',
    dfCommonCopy: '复制',
    dfCommonLogout: '退出登录',
    dfCommonSettings: '设置',
    dfCommonBack: '返回',
    dfCommonDelete: '删除',
    dfCommonSave: '保存',
    dfCommonSaving: '保存中',
    dfHapticDice: '骰子',
    dfHapticDamage: '受伤',
    dfHapticCombat: '攻击',
    dfHapticReward: '拾获',
    dfHapticCheckPass: '检定成功',
    dfHapticCheckFail: '检定失败',
    dfHapticCritical: '大成功',
    dfHapticFumble: '大失败',
    dfTabGames: '对局',
    dfTabLore: '设定',
    dfTabProfile: '我的',
  },
  en: {
    dfCommonConfirm: 'Confirm',
    dfCommonCancel: 'Cancel',
    dfCommonRetry: 'Retry',
    dfCommonLoading: 'Loading…',
    dfCommonOperationFailed: 'Operation failed',
    dfCommonNetworkError: "Can't reach the server. Check the address and network.",
    dfCommonCopy: 'Copy',
    dfCommonLogout: 'Log out',
    dfCommonSettings: 'Settings',
    dfCommonBack: 'Back',
    dfCommonDelete: 'Delete',
    dfCommonSave: 'Save',
    dfCommonSaving: 'Saving',
    dfHapticDice: 'Dice',
    dfHapticDamage: 'Injury',
    dfHapticCombat: 'Attack',
    dfHapticReward: 'Pickup',
    dfHapticCheckPass: 'Check passed',
    dfHapticCheckFail: 'Check failed',
    dfHapticCritical: 'Critical success',
    dfHapticFumble: 'Critical failure',
    dfTabGames: 'Games',
    dfTabLore: 'Lore',
    dfTabProfile: 'Me',
  },
  ja: {
    dfCommonConfirm: '確認',
    dfCommonCancel: 'キャンセル',
    dfCommonRetry: '再試行',
    dfCommonLoading: '読み込み中…',
    dfCommonOperationFailed: '操作に失敗しました',
    dfCommonNetworkError: 'サーバーに接続できません。アドレスとネットワークを確認してください',
    dfCommonCopy: 'コピー',
    dfCommonLogout: 'ログアウト',
    dfCommonSettings: '設定',
    dfCommonBack: '戻る',
    dfCommonDelete: '削除',
    dfCommonSave: '保存',
    dfCommonSaving: '保存中',
    dfHapticDice: 'ダイス',
    dfHapticDamage: '負傷',
    dfHapticCombat: '攻撃',
    dfHapticReward: '拾得',
    dfHapticCheckPass: '判定成功',
    dfHapticCheckFail: '判定失敗',
    dfHapticCritical: '大成功',
    dfHapticFumble: '大失敗',
    dfTabGames: '対局',
    dfTabLore: '設定',
    dfTabProfile: 'マイ',
  },
} as const

export type CommonCluster = typeof common
