/**
 * TTS 朗读，两条引擎路径：
 * - server：POST /games/{key}/speech 拿音频字节 → 写缓存文件 → expo-audio 播放（对齐 Web）；
 * - system：expo-speech 调设备自带 TTS，零配置可用（Android 有 maxSpeechInputLength
 *   上限，超长叙事按边界分块排队读）。
 * browser 引擎是 Web 专用的 speechSynthesis，移动端没有对应物，不作为选项。
 */
import * as React from 'react'
import { Paths, File } from 'expo-file-system'
import * as Speech from 'expo-speech'
import { createAudioPlayer, type AudioPlayer } from 'expo-audio'

import { synthesizeSpeech } from '@/api/speech'
import { getT } from '@/i18n/t'
import { useSettingsStore } from '@/stores/settings'

import { chunkSpeechText } from './tts-options'

export function useSpeaker(gameKey: string) {
  const ttsRate = useSettingsStore((s) => s.ttsRate)
  const ttsEngine = useSettingsStore((s) => s.ttsEngine)
  const [playing, setPlaying] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const playerRef = React.useRef<AudioPlayer | null>(null)
  // 合成在途标记用 ref：快速连点时事件处理器读到的还是旧渲染闭包，state 挡不住
  const busyRef = React.useRef(false)
  // 当前发声（合成中或播放中）的文本，用于同段按钮的停止语义与完成后的复位
  const activeTextRef = React.useRef('')
  // 系统引擎排队块计数：expo-speech 对每块各回调一次 onDone，全部结束才算播完
  const pendingChunksRef = React.useRef(0)

  React.useEffect(() => {
    return () => {
      playerRef.current?.release()
      playerRef.current = null
      void Speech.stop()
    }
  }, [])

  function stop() {
    playerRef.current?.pause()
    playerRef.current?.release()
    playerRef.current = null
    // 两个引擎都停：播放途中切换引擎不留残余语音（无语音时是空操作）
    void Speech.stop()
    pendingChunksRef.current = 0
    activeTextRef.current = ''
    setPlaying(false)
  }

  /** 系统引擎的单块结束回调；stop()/新朗读会先清掉 activeText，旧块的迟到回调据此失效 */
  function settleSystemChunk(trimmed: string, failure?: string) {
    if (activeTextRef.current !== trimmed) return
    if (failure) setError(failure)
    pendingChunksRef.current -= 1
    if (failure || pendingChunksRef.current <= 0) {
      activeTextRef.current = ''
      setPlaying(false)
    }
  }

  function speakWithSystem(trimmed: string) {
    const chunks = chunkSpeechText(trimmed, Speech.maxSpeechInputLength)
    pendingChunksRef.current = chunks.length
    setPlaying(true)
    for (const chunk of chunks) {
      Speech.speak(chunk, {
        rate: ttsRate,
        onDone: () => settleSystemChunk(trimmed),
        onStopped: () => settleSystemChunk(trimmed),
        onError: () => settleSystemChunk(trimmed, getT()('dfPlayTtsFailed')),
      })
    }
  }

  async function speakWithServer(trimmed: string) {
    busyRef.current = true
    setBusy(true)
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
    setError('')
    if (ttsEngine === 'system') {
      speakWithSystem(trimmed)
      return
    }
    await speakWithServer(trimmed)
  }

  return { speak, stop, playing, busy, error }
}
