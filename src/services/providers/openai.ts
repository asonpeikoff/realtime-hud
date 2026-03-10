import type { AIProvider, AIProviderEvents, AITextDelta, AIResponseItem, RecordingState } from '../../types';

/** OpenAI Realtime API event types */
interface RealtimeEvent {
  type: string;
  [key: string]: unknown;
}

const DEFAULT_SYSTEM_PROMPT = `You are a real-time HUD (Heads-Up Display) assistant. You analyze screen captures and audio to provide useful supplementary information about what the user is viewing.

Guidelines:
- Provide concise, relevant insights about what's on screen
- Supplement what the user is seeing with related context, data, or facts
- Confirm important information when relevant
- Be brief – this is a HUD, not a conversation interface
- Use 1-3 short bullet points when possible
- Respond quickly with the most important insight first
- Do not describe what you see; add value beyond what's visible
- Flag potential errors, warnings, or important details you notice`;

/**
 * OpenAI Realtime API provider using a server-configured realtime model.
 * Communicates via the backend WebSocket proxy at /api/realtime.
 */
export class OpenAIRealtimeProvider implements AIProvider {
  readonly name = 'OpenAI Realtime';

  private ws: WebSocket | null = null;
  private events: AIProviderEvents | null = null;
  private _state: RecordingState = 'idle';
  private sessionConfigured = false;
  private systemPrompt = DEFAULT_SYSTEM_PROMPT;

  get state(): RecordingState {
    return this._state;
  }

  private setState(state: RecordingState) {
    this._state = state;
    this.events?.onStateChange(state);
  }

  async connect(events: AIProviderEvents): Promise<void> {
    this.events = events;
    this.sessionConfigured = false;
    this.setState('connecting');

    // Fetch non-sensitive config (includes optional custom system prompt)
    try {
      const cfg = await fetch('/api/config').then((r) => r.json() as Promise<{ model?: string; systemPrompt?: string }>);
      if (cfg.systemPrompt) {
        this.systemPrompt = cfg.systemPrompt;
      }
    } catch {
      // Non-fatal: fall back to default system prompt
    }

    const wsUrl =
      window.location.protocol === 'https:'
        ? `wss://${window.location.host}/api/realtime`
        : `ws://${window.location.host}/api/realtime`;

    return new Promise((resolve, reject) => {
      let settled = false;
      const resolveOnce = () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      };
      const rejectOnce = (error: Error) => {
        if (!settled) {
          settled = true;
          reject(error);
        }
      };

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.configureSession();
      };

      this.ws.onmessage = (event) => {
        try {
          const data: RealtimeEvent = JSON.parse(event.data as string);
          this.handleEvent(data, resolveOnce, rejectOnce);
        } catch {
          // Ignore non-JSON messages
        }
      };

      this.ws.onerror = () => {
        const msg = 'WebSocket connection failed. Is the server running?';
        this.setState('error');
        events.onError(msg);
        rejectOnce(new Error(msg));
      };

      this.ws.onclose = () => {
        if (this._state === 'connecting') {
          const msg = 'Realtime connection closed before session initialization.';
          this.setState('error');
          events.onError(msg);
          rejectOnce(new Error(msg));
          return;
        }
        if (this._state !== 'idle') {
          this.setState('idle');
          events.onDisconnected();
        }
      };
    });
  }

  disconnect(): void {
    this.sessionConfigured = false;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
    this.ws = null;
    this.setState('idle');
  }

  sendAudio(pcm16Buffer: ArrayBuffer): void {
    if (!this.isReady()) return;
    const base64 = btoa(String.fromCharCode(...new Uint8Array(pcm16Buffer)));
    this.send({
      type: 'input_audio_buffer.append',
      audio: base64,
    });
  }

  sendImage(base64Jpeg: string, prompt = 'Analyze this screen capture and provide a brief HUD insight.'): void {
    if (!this.isReady()) return;

    this.send({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: prompt,
          },
          {
            type: 'input_image',
            image: `data:image/jpeg;base64,${base64Jpeg}`,
            detail: 'auto',
          },
        ],
      },
    });

    this.send({ type: 'response.create' });
  }

  sendText(text: string): void {
    if (!this.isReady()) return;

    this.send({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text }],
      },
    });

    this.send({ type: 'response.create' });
  }

  private isReady(): boolean {
    return this.ws?.readyState === WebSocket.OPEN && this.sessionConfigured;
  }

  private send(data: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private configureSession(): void {
    this.send({
      type: 'session.update',
      session: {
        modalities: ['text'],
        instructions: this.systemPrompt,
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription: { model: 'whisper-1' },
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
        },
        temperature: 0.7,
        max_response_output_tokens: 512,
      },
    });
  }

  private handleEvent(
    event: RealtimeEvent,
    resolveConnect?: () => void,
    rejectConnect?: (error: Error) => void,
  ): void {
    switch (event.type) {
      case 'session.created':
      case 'session.updated':
        this.sessionConfigured = true;
        this.setState('active');
        this.events?.onConnected();
        resolveConnect?.();
        break;

      case 'response.text.delta': {
        const itemId = event.item_id as string;
        const delta = event.delta as string;
        if (itemId && delta) {
          const textDelta: AITextDelta = { itemId, delta };
          this.events?.onTextDelta(textDelta);
        }
        break;
      }

      case 'response.output_item.done': {
        const item = event.item as {
          id?: string;
          content?: Array<{ type: string; text?: string }>;
        };
        if (item?.id) {
          const textContent = item.content?.find(
            (c) => c.type === 'text' || c.type === 'output_text',
          );
          const responseItem: AIResponseItem = {
            itemId: item.id,
            text: textContent?.text ?? '',
            timestamp: Date.now(),
          };
          this.events?.onResponseDone(responseItem);
        }
        break;
      }

      case 'error': {
        const errMsg = (event.error as { message?: string })?.message ?? 'Unknown error';
        console.error('[OpenAI Realtime] Error:', errMsg);
        if (this._state === 'connecting') {
          this.setState('error');
          rejectConnect?.(new Error(errMsg));
        }
        this.events?.onError(errMsg);
        break;
      }

      default:
        break;
    }
  }
}
