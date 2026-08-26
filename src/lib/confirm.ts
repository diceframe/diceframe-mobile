import { Alert } from 'react-native'

export interface ConfirmOptions {
  title: string
  message: string
  confirmText: string
  cancelText: string
}

/** Native confirmation that resolves false for cancellation or dismissal. */
export function confirmDestructive({
  title,
  message,
  confirmText,
  cancelText,
}: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (value: boolean) => {
      if (settled) return
      settled = true
      resolve(value)
    }

    Alert.alert(
      title,
      message,
      [
        { text: cancelText, style: 'cancel', onPress: () => finish(false) },
        { text: confirmText, style: 'destructive', onPress: () => finish(true) },
      ],
      { cancelable: true, onDismiss: () => finish(false) },
    )
  })
}
