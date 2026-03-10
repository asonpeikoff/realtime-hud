import type {
  AIConnectOptions,
  AIProvider,
  AIProviderEvents,
  AITextDelta,
  AIResponseItem,
  RecordingState,
  RealtimeInterface,
} from '../../types';

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
  private static readonly HUD_CANVAS_ITEM_ID = 'hud-canvas';

  private ws: WebSocket | null = null;
  private events: AIProviderEvents | null = null;
  private _state: RecordingState = 'idle';
  private sessionConfigured = false;
  private systemPrompt = DEFAULT_SYSTEM_PROMPT;
  private mode: 'realtime' | 'responses' = 'realtime';
  private model = 'gpt-realtime-1.5';
  private realtimeInterface: RealtimeInterface = 'beta';
  private latestCanvas = '';
  private hudRequestInFlight = false;

  get state(): RecordingState {
    return this._state;
  }

  private setState(state: RecordingState) {
    this._state = state;
    this.events?.onStateChange(state);
  }

  async connect(events: AIProviderEvents, options?: AIConnectOptions): Promise<void> {
    this.events = events;
    this.sessionConfigured = false;
    this.setState('connecting');
    this.mode = options?.mode ?? 'realtime';
    this.model = options?.model ?? 'gpt-realtime-1.5';
    this.realtimeInterface = options?.realtimeInterface ?? 'beta';
    this.latestCanvas = '';
    this.hudRequestInFlight = false;

    // Fetch non-sensitive config (includes optional custom system prompt)
    try {
      const cfg = await fetch('/api/config').then((r) => r.json() as Promise<{ model?: string; systemPrompt?: string }>);
      if (cfg.systemPrompt) {
        this.systemPrompt = cfg.systemPrompt;
      }
    } catch {
      // Non-fatal: fall back to default system prompt
    }

    if (this.mode === 'responses') {
      this.sessionConfigured = true;
      this.setState('active');
      this.events?.onConnected();
      return;
    }

    const params = new URLSearchParams({
      model: this.model,
      realtime_interface: this.realtimeInterface,
    });
    const wsUrl =
      window.location.protocol === 'https:'
        ? `wss://${window.location.host}/api/realtime?${params.toString()}`
        : `ws://${window.location.host}/api/realtime?${params.toString()}`;

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
    this.latestCanvas = '';
    this.hudRequestInFlight = false;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
    this.ws = null;
    this.setState('idle');
  }

  sendAudio(pcm16Buffer: ArrayBuffer): void {
    if (this.mode === 'responses') return;
    if (!this.isReady()) return;
    const base64 = btoa(String.fromCharCode(...new Uint8Array(pcm16Buffer)));
    this.send({
      type: 'input_audio_buffer.append',
      audio: base64,
    });
  }

  sendImage(base64Jpeg: string, prompt = 'Analyze this screen capture and provide a brief HUD insight.'): void {
    if (!this.isReady()) return;

    if (this.mode === 'responses') {
      void this.requestHudNote({ imageBase64: base64Jpeg, prompt });
      return;
    }

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

    this.send({
      type: 'response.create',
      response: {
        modalities: ['text'],
      },
    });
  }

  sendText(text: string): void {
    if (!this.isReady()) return;

    if (this.mode === 'responses') {
      void this.requestHudNote({ prompt: text });
      return;
    }

    this.send({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text }],
      },
    });

    this.send({
      type: 'response.create',
      response: {
        modalities: ['text'],
      },
    });
  }

  private isReady(): boolean {
    if (this.mode === 'responses') {
      return this.sessionConfigured && this._state === 'active';
    }
    return this.ws?.readyState === WebSocket.OPEN && this.sessionConfigured;
  }

  private async requestHudNote({ imageBase64, prompt }: { imageBase64?: string; prompt: string }): Promise<void> {
    if (this.hudRequestInFlight) return;
    this.hudRequestInFlight = true;

    try {
      const response = await fetch('/api/hud-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          prompt,
          imageBase64,
          previousCanvas: this.latestCanvas,
        }),
      });

      const data = (await response.json()) as {
        text?: string;
        board?: string;
        changed?: boolean;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error ?? `HUD note request failed (${response.status})`);
      }

      const boardText = (data.board ?? data.text ?? '').trim();
      if (!boardText) {
        return;
      }

      if (data.changed === false || boardText === this.latestCanvas) {
        return;
      }

      this.latestCanvas = boardText;

      this.events?.onTextDelta({
        itemId: OpenAIRealtimeProvider.HUD_CANVAS_ITEM_ID,
        delta: boardText,
        replace: true,
      });
      this.events?.onResponseDone({
        itemId: OpenAIRealtimeProvider.HUD_CANVAS_ITEM_ID,
        text: boardText,
        timestamp: Date.now(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate HUD note.';
      this.events?.onError(message);
    } finally {
      this.hudRequestInFlight = false;
    }
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
        type: 'realtime',
        instructions: this.systemPrompt,
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

      case 'response.text.delta':
      case 'response.output_text.delta': {
        const itemId = event.item_id as string;
        const delta = event.delta as string;
        if (itemId && delta) {
          const textDelta: AITextDelta = { itemId, delta };
          this.events?.onTextDelta(textDelta);
        }
        break;
      }

      case 'response.done': {
        const response = event.response as {
          output?: Array<{
            id?: string;
            content?: Array<{ type: string; text?: string }>;
          }>;
        };
        const outputItems = response?.output ?? [];
        for (const outputItem of outputItems) {
          if (!outputItem?.id) continue;
          const textContent = outputItem.content?.find(
            (c) => c.type === 'text' || c.type === 'output_text',
          );
          this.events?.onResponseDone({
            itemId: outputItem.id,
            text: textContent?.text ?? '',
            timestamp: Date.now(),
          });
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
