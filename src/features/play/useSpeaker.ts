/**
 * TTS 朗读：POST /games/{key}/speech 拿音频字节 → 写缓存文件 → expo-audio 播放。
 * v1 只支持服务端合成（browser 引擎是 Web 专用的 speechSynthesis，移动端隐藏入口）。
 */
import * as React from 'react'
import { Paths, File } from 'expo-file-system'
import { createAudioPlayer, type AudioPlayer } from 'expo-audio'

import { synthesizeSpeech } from '@/api/speech'
import { useSettingsStore } from '@/stores/settings'

export function useSpeaker(gameKey: string) {
  const ttsRate = useSettingsStore((s) => s.ttsRate)
  const [playing, setPlaying] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const playerRef = React.useRef<AudioPlayer | null>(null)

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
    setPlaying(false)
  }

  async function speak(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return
    stop()
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
          player.release()
          if (playerRef.current === player) playerRef.current = null
        }
      })
      setPlaying(true)
      player.play()
    } catch (e) {
      setError(e instanceof Error ? e.message : '语音合成失败')
    } finally {
      setBusy(false)
    }
  }

  return { speak, stop, playing, busy, error }
}
