import * as React from 'react'
import { Keyboard, Platform } from 'react-native'

/**
 * 键盘避让：直接返回当前键盘高度（0 = 收起）。
 *
 * 为什么不用 KeyboardAvoidingView：edge-to-edge（SDK 56+ 默认）下 Android
 * 窗口不随键盘重排，KAV 的 height/padding 行为依赖屏幕坐标系换算，在
 * RN 0.86 的 edge-to-edge 坐标空间里计算结果不可靠。这里直接用
 * endCoordinates.height 做底部内边距，两端行为一致且可预期。
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = React.useState(0)

  React.useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide'
    const show = Keyboard.addListener(showEvent, (e) => setHeight(e.endCoordinates.height))
    const hide = Keyboard.addListener(hideEvent, () => setHeight(0))
    return () => {
      show.remove()
      hide.remove()
    }
  }, [])

  return height
}
