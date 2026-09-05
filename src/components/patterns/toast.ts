/**
 * 应用内 toast 的统一入口：业务侧不直接依赖 sonner-native，
 * 位置/配色/时长集中在根布局的 <Toaster />，这里只固化语义与调用形态。
 */
import { toast } from 'sonner-native'

/** 操作失败提示（校验失败、识别失败等服务端/客户端原因），支持附一段补充说明。 */
export function toastError(message: string, description?: string) {
  toast.error(message, description ? { description } : undefined)
}

/** 非错误的状态提示（如麦克风就绪），自动消失不打断操作。 */
export function toastNotice(message: string) {
  toast(message)
}
