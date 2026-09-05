interface VoicePresentationState {
  recording: boolean
  preparing: boolean
  busy: boolean
  sending: boolean
  reviewText: string | null
}

/** /action 可能等整轮 GM 生成后才返回，发送阶段只能在对局页提示，不能挡住叙事。 */
export function voicePresentation(state: VoicePresentationState): 'hidden' | 'recording' | 'review' {
  if (state.sending) return 'hidden'
  if (state.reviewText !== null) return 'review'
  if (state.recording || state.preparing || state.busy) return 'recording'
  return 'hidden'
}
