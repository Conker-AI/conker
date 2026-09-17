export type VoiceTranscript = { final: string; interim: string }

export type VoiceInputOptions = {
  /** Borrow an existing capture for metering; recognition still uses the browser's default microphone. Never stopped by this client. */
  inputStream?: MediaStream
  language: string
  signal: AbortSignal
  onStart: () => void
  onTranscript: (value: VoiceTranscript) => void
  onLevel: (value: number) => void
  onError: (message: string, code?: string) => void
  onEnd: () => void
}

export type VoiceInputSession = {
  /** Finish recognition, including its final result, before ending. */
  stop: () => void
  /** Release the microphone immediately and discard late events. */
  cancel: () => void
}

/** An input capability, independent of the model that answers the message. */
export interface VoiceInputClient {
  availability: () => { supported: boolean; reason?: string }
  start: (options: VoiceInputOptions) => Promise<VoiceInputSession>
}

export const unavailableVoiceInput: VoiceInputClient = {
  availability: () => ({ supported: false, reason: "Voice typing is not connected in this client." }),
  start: async () => { throw new Error("Voice typing is not connected in this client.") },
}
