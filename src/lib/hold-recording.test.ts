import { describe, expect, it, vi } from 'vitest'

import { createHoldRecording, type HoldRecordingServices } from './hold-recording'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}

function services(): HoldRecordingServices {
  return {
    authorize: vi.fn(async () => {}),
    prepare: vi.fn(async () => {}),
    record: vi.fn(),
    stop: vi.fn(async () => {}),
    resetAudioMode: vi.fn(async () => {}),
    transcribe: vi.fn(async () => '  推开门  '),
    onText: vi.fn(),
    onPhase: vi.fn(),
    onError: vi.fn(),
  }
}

describe('按住录音', () => {
  it('按下只录音，松开后停止并识别一次', async () => {
    const session = createHoldRecording()
    const audio = services()
    await session.press(audio)
    expect(audio.record).toHaveBeenCalledOnce()
    expect(audio.transcribe).not.toHaveBeenCalled()
    await Promise.all([session.release(), session.release()])
    expect(audio.stop).toHaveBeenCalledOnce()
    expect(audio.transcribe).toHaveBeenCalledOnce()
    expect(audio.onText).toHaveBeenCalledWith('推开门', 'send')
    expect(audio.onPhase).toHaveBeenLastCalledWith('idle')
  })

  it('权限尚未返回就松手，不会迟到启动录音', async () => {
    const session = createHoldRecording()
    const audio = services()
    const permission = deferred()
    audio.authorize = () => permission.promise
    const pressing = session.press(audio)
    await session.release()
    permission.resolve()
    await pressing
    expect(audio.prepare).not.toHaveBeenCalled()
    expect(audio.record).not.toHaveBeenCalled()
    expect(audio.transcribe).not.toHaveBeenCalled()
  })

  it('设备准备期间松手，准备完成后清理且不录音', async () => {
    const session = createHoldRecording()
    const audio = services()
    const preparation = deferred()
    audio.prepare = vi.fn(() => preparation.promise)
    const pressing = session.press(audio)
    await Promise.resolve()
    expect(audio.prepare).toHaveBeenCalledOnce()
    await session.release()
    preparation.resolve()
    await pressing
    expect(audio.record).not.toHaveBeenCalled()
    expect(audio.stop).toHaveBeenCalledOnce()
    expect(audio.resetAudioMode).toHaveBeenCalledOnce()
    expect(audio.transcribe).not.toHaveBeenCalled()
  })

  it('上滑取消只停止，不上传识别', async () => {
    const session = createHoldRecording()
    const audio = services()
    await session.press(audio)
    await session.cancel()
    await session.release()
    expect(audio.stop).toHaveBeenCalledOnce()
    expect(audio.transcribe).not.toHaveBeenCalled()
    expect(audio.onText).not.toHaveBeenCalled()
  })

  it('识别在途时点取消立即收起浮层，迟到结果不回填且可立刻重开', async () => {
    const session = createHoldRecording()
    const audio = services()
    const transcription = deferred()
    audio.transcribe = vi.fn(async () => { await transcription.promise; return '迟到文字' })
    await session.press(audio)
    const releasing = session.release()
    await Promise.resolve()
    await Promise.resolve()
    // 松手后浮层停在「转写中」，此时点 X 必须立刻回到 idle，而不是等识别返回。
    await session.cancel()
    expect(audio.onPhase).toHaveBeenLastCalledWith('idle')
    transcription.resolve()
    await releasing
    expect(audio.onText).not.toHaveBeenCalled()
    const next = services()
    await session.press(next)
    expect(next.record).toHaveBeenCalledOnce()
    await session.cancel()
  })

  it('取消进行中的识别后忽略迟到结果，期间不接受另一轮按下', async () => {
    const session = createHoldRecording()
    const audio = services()
    const transcription = deferred()
    audio.transcribe = vi.fn(async () => { await transcription.promise; return '迟到文字' })
    await session.press(audio)
    const releasing = session.release()
    await Promise.resolve()
    await Promise.resolve()
    const next = services()
    await session.press(next)
    expect(next.authorize).not.toHaveBeenCalled()
    await session.cancel()
    transcription.resolve()
    await releasing
    expect(audio.onText).not.toHaveBeenCalled()
    await session.press(next)
    expect(next.record).toHaveBeenCalledOnce()
    await session.cancel()
  })

  it('准备失败会恢复音频模式，并允许下一次重试', async () => {
    const session = createHoldRecording()
    const audio = services()
    const failure = new Error('准备失败')
    audio.prepare = vi.fn(async () => { throw failure })
    await session.press(audio)
    expect(audio.onError).toHaveBeenCalledWith(failure)
    expect(audio.resetAudioMode).toHaveBeenCalledOnce()
    const next = services()
    await session.press(next)
    expect(next.record).toHaveBeenCalledOnce()
    await session.cancel()
  })

  it('停止失败也恢复音频模式，不上传录音', async () => {
    const session = createHoldRecording()
    const audio = services()
    audio.stop = vi.fn(async () => { throw new Error('停止失败') })
    await session.press(audio)
    await session.release()
    expect(audio.resetAudioMode).toHaveBeenCalledOnce()
    expect(audio.transcribe).not.toHaveBeenCalled()
    expect(audio.onError).toHaveBeenCalledOnce()
  })

  it('识别失败后可重试，空白结果不回填', async () => {
    const session = createHoldRecording()
    const audio = services()
    audio.transcribe = vi.fn(async () => { throw new Error('网络失败') })
    await session.press(audio)
    await session.release()
    expect(audio.onError).toHaveBeenCalledOnce()
    const next = services()
    next.transcribe = vi.fn(async () => '   ')
    await session.press(next)
    await session.release()
    expect(next.onText).not.toHaveBeenCalled()
  })

  it('在文字区松手只进入编辑，后续重复松手不会变成直接发送', async () => {
    const session = createHoldRecording()
    const audio = services()
    await session.press(audio)
    await Promise.all([session.release('edit'), session.release('send')])
    expect(audio.onText).toHaveBeenCalledOnce()
    expect(audio.onText).toHaveBeenCalledWith('推开门', 'edit')
  })

  it('直接发送在途时不接受第二轮录音，等待发送完成再复位', async () => {
    const session = createHoldRecording()
    const audio = services()
    const sending = deferred()
    audio.onText = vi.fn(() => sending.promise)
    await session.press(audio)
    const releasing = session.release('send')
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    expect(audio.onText).toHaveBeenCalledWith('推开门', 'send')
    const next = services()
    await session.press(next)
    expect(next.record).not.toHaveBeenCalled()
    sending.resolve()
    await releasing
    expect(audio.onPhase).toHaveBeenLastCalledWith('idle')
  })

  it('发送回调失败会被捕获，不产生未处理的 Promise 拒绝', async () => {
    const session = createHoldRecording()
    const audio = services()
    const failure = new Error('发送失败')
    audio.onText = vi.fn(async () => { throw failure })
    await session.press(audio)
    await session.release()
    expect(audio.onError).toHaveBeenCalledWith(failure)
    expect(audio.onPhase).toHaveBeenLastCalledWith('idle')
  })
})
