// ─── Recording / Session State ───────────────────────────────────────────────

export type RecordingState = 'idle' | 'connecting' | 'active' | 'paused' | 'error';

export type RealtimeInterface = 'ga' | 'beta';

export interface AIConnectOptions {
  mode: 'realtime' | 'responses';
  model: string;
  realtimeInterface?: RealtimeInterface;
}

// ─── Provider-Agnostic AI Interface ──────────────────────────────────────────

/** A streamed text delta from the AI */
export interface AITextDelta {
  itemId: string;
  delta: string;
  replace?: boolean;
}

/** A completed AI response item */
export interface AIResponseItem {
  itemId: string;
  text: string;
  timestamp: number;
}

/** Events emitted by an AI provider */
export interface AIProviderEvents {
  onConnected: () => void;
  onDisconnected: () => void;
  onTextDelta: (delta: AITextDelta) => void;
  onResponseDone: (item: AIResponseItem) => void;
  onError: (message: string) => void;
  onStateChange: (state: RecordingState) => void;
}

/** Provider-agnostic interface for real-time AI providers */
export interface AIProvider {
  readonly name: string;
  readonly state: RecordingState;

  connect(events: AIProviderEvents, options?: AIConnectOptions): Promise<void>;
  disconnect(): void;

  /** Send a raw audio chunk (PCM16 at 24 kHz, mono) */
  sendAudio(pcm16Buffer: ArrayBuffer): void;

  /** Send a screenshot frame (base64 JPEG) with an optional text prompt */
  sendImage(base64Jpeg: string, prompt?: string): void;

  /** Send a text message */
  sendText(text: string): void;
}

// ─── Screen Capture ───────────────────────────────────────────────────────────

export interface ScreenCaptureState {
  isCapturing: boolean;
  stream: MediaStream | null;
  error: string | null;
}

// ─── Audio ────────────────────────────────────────────────────────────────────

export interface AudioCaptureState {
  micActive: boolean;
  systemAudioActive: boolean;
  error: string | null;
}

// ─── HUD Message ─────────────────────────────────────────────────────────────

export interface HUDMessage {
  id: string;
  text: string;
  timestamp: number;
  /** Whether the message is still streaming */
  streaming: boolean;
}
