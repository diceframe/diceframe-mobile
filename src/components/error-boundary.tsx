import * as React from 'react'
import { View } from 'react-native'

import { Button } from '@/components/ui/button'
import { Text } from '@/components/ui/text'
import { getT } from '@/i18n/t'

interface Props {
  children: React.ReactNode
  /** 备用 UI；不传则用默认的简单错误提示 */
  fallback?: React.ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

/** 渲染错误边界：捕获子树的 JavaScript 崩溃，避免整个 App 白屏。 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // 生产环境可接 Sentry / LogBox，这里仅打日志便于开发调试
    console.warn('[ErrorBoundary]', error, info.componentStack)
  }

  reset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      // class 组件用不了 useT，渲染期取即时语言的 t
      const t = getT()
      return (
        <View className="flex-1 items-center justify-center gap-4 bg-background p-8">
          <Text variant="h3">{t('dfUiRenderErrorTitle')}</Text>
          <Text variant="muted" className="text-center">
            {this.state.error?.message || t('dfUiUnknownError')}
          </Text>
          <Button onPress={this.reset} variant="outline">
            <Text>{t('dfCommonRetry')}</Text>
          </Button>
        </View>
      )
    }
    return this.props.children
  }
}
