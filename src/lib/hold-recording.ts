export type RecordingPhase = 'idle' | 'preparing' | 'recording' | 'transcribing'
export type RecordingDestination = 'send' | 'edit'
export type RecordingTarget = RecordingDestination | 'cancel'

export interface HoldRecordingServices {
  authorize: () => Promise<void>
  prepare: () => Promise<void>
  record: () => void
  stop: () => Promise<void>
  resetAudioMode: () => Promise<void>
  transcribe: () => Promise<string>
  onText: (text: string, destination: RecordingDestination) => void | Promise<void>
  onPhase: (phase: RecordingPhase) => void
  onError: (error: unknown) => void
}

interface Session {
  services: HoldRecordingServices
  held: boolean
  cancelled: boolean
  prepared: boolean
  recorded: boolean
  finishing: boolean
}

/** 原生操作由调用方注入，手势与异步准备的先后关系在这里统一处理。 */
export function createHoldRecording() {
  let active: Session | null = null

  function complete(session: Session) {
    if (active !== session) return
    active = null
    session.services.onPhase('idle')
  }

  async function finish(cancelled: boolean, destination: RecordingDestination = 'send') {
    const session = active
    if (!session) return
    session.held = false
    session.cancelled ||= cancelled
    // 准备尚未返回时由 press 的 finally 清理，不能与原生 prepare 并发 stop。
    if (!session.recorded || session.finishing) return
    session.finishing = true
    const services = session.services
    services.onPhase('transcribing')
    try {
      try {
        await services.stop()
      } finally {
        await services.resetAudioMode()
      }
      if (session.cancelled) return
      const text = (await services.transcribe()).trim()
      // 识别期间离开页面或切入后台，迟到结果不得回填到另一轮输入。
      if (!session.cancelled && text) await services.onText(text, destination)
    } catch (error) {
      if (!session.cancelled) services.onError(error)
    } finally {
      complete(session)
    }
  }

  return {
    async press(services: HoldRecordingServices) {
      if (active) return
      const session: Session = {
        services,
        held: true,
        cancelled: false,
        prepared: false,
        recorded: false,
        finishing: false,
      }
      active = session
      services.onPhase('preparing')
      try {
        await services.authorize()
        if (!session.held) return
        session.prepared = true
        await services.prepare()
        if (!session.held) return
        services.record()
        session.recorded = true
        services.onPhase('recording')
      } catch (error) {
        if (!session.cancelled) services.onError(error)
      } finally {
        if (!session.recorded) {
          if (session.prepared) {
            // prepare 可能已创建文件但尚未 record；仍需释放原生录音器和音频模式。
            await services.stop().catch(() => {})
            await services.resetAudioMode().catch(() => {})
          }
          complete(session)
        }
      }
    },
    release: (destination: RecordingDestination = 'send') => finish(false, destination),
    cancel: () => finish(true),
  }
}
