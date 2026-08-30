/**
 * TTS 朗读：POST /games/{key}/speech 拿音频字节 → 写缓存文件 → expo-audio 播放。
 * v1 只支持服务端合成（browser 引擎是 Web 专用的 speechSynthesis，移动端隐藏入口）。
 */
import * as React from 'react'
import { Paths, File } from 'expo-file-system'
import { createAudioPlayer, type AudioPlayer } from 'expo-audio'

import { synthesizeSpeech } from '@/api/speech'
import { getT } from '@/i18n/t'
import { useSettingsStore } from '@/stores/settings'

export function useSpeaker(gameKey: string) {
  const ttsRate = useSettingsStore((s) => s.ttsRate)
  const [playing, setPlaying] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const playerRef = React.useRef<AudioPlayer | null>(null)
  // 合成在途标记用 ref：快速连点时事件处理器读到的还是旧渲染闭包，state 挡不住
  const busyRef = React.useRef(false)
  // 当前发声（合成中或播放中）的文本，用于同段按钮的停止语义与完成后的复位
  const activeTextRef = React.useRef('')

  React.useEffect(() => {
    return () => {
      playerRef.current?.release()
      playerRef.current = null
    }
  }, [])

  function stop() {
    playerRef.current?.pause()
    playerRef.current?.release()
    playerRef.current = null
    activeTextRef.current = ''
    setPlaying(false)
  }

  async function speak(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return
    // 防抖：合成在途时忽略新请求，连点与自动朗读叠加都不会并发请求重复合成
    if (busyRef.current) return
    // 正在朗读同一段时再按 = 停止（对齐 Web ttsToggle 的停止语义）
    if (activeTextRef.current === trimmed) {
      stop()
      return
    }
    stop()
    activeTextRef.current = trimmed
    busyRef.current = true
    setBusy(true)
    setError('')
    try {
      const { bytes } = await synthesizeSpeech(gameKey, { text: trimmed, speed: ttsRate })
      const file = new File(Paths.cache, `diceframe-tts-${Date.now()}.mp3`)
      const writer = file.writableStream().getWriter()
      await writer.write(new Uint8Array(bytes))
      await writer.close()
      const player = createAudioPlayer({ uri: file.uri })
      playerRef.current = player
      player.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish) {
          setPlaying(false)
          if (activeTextRef.current === trimmed) activeTextRef.current = ''
          player.release()
          if (playerRef.current === player) playerRef.current = null
        }
      })
      setPlaying(true)
      player.play()
    } catch (e) {
      // 失败后清掉活动文本，下次点击可以重试同一段
      if (activeTextRef.current === trimmed) activeTextRef.current = ''
      setError(e instanceof Error ? e.message : getT()('dfPlayTtsFailed'))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  return { speak, stop, playing, busy, error }
}
