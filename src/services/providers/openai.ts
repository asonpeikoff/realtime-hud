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

  private pc: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private audioElement: HTMLAudioElement | null = null;
  private events: AIProviderEvents | null = null;
  private _state: RecordingState = 'idle';
  private sessionConfigured = false;
  private systemPrompt = DEFAULT_SYSTEM_PROMPT;
  private mode: 'realtime' | 'responses' = 'realtime';
  private model = 'gpt-realtime-1.5';
  private realtimeInterface: RealtimeInterface = 'beta';
  private latestCanvas = '';
  private hudRequestInFlight = false;
  private pendingHudRequest: { imageBase64?: string; prompt: string } | null = null;
  private refreshTimer: number | null = null;
  private responseInFlight = false;
  private responseQueued = false;
  private draftCanvas = '';

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
    this.pendingHudRequest = null;
    this.responseInFlight = false;
    this.responseQueued = false;
    this.draftCanvas = '';

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

      void this.connectRealtime(resolveOnce, rejectOnce, events);
    });
  }

  disconnect(): void {
    this.sessionConfigured = false;
    this.latestCanvas = '';
    this.hudRequestInFlight = false;
    this.pendingHudRequest = null;
    this.responseInFlight = false;
    this.responseQueued = false;
    this.draftCanvas = '';
    if (this.refreshTimer !== null) {
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    this.dataChannel?.close();
    this.dataChannel = null;
    this.pc?.close();
    this.pc = null;
    this.audioElement?.remove();
    this.audioElement = null;
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
            image_url: `data:image/jpeg;base64,${base64Jpeg}`,
            detail: 'auto',
          },
        ],
      },
    });
    this.queueRealtimeRefresh();
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
    this.queueRealtimeRefresh();
  }

  private isReady(): boolean {
    if (this.mode === 'responses') {
      return this.sessionConfigured && this._state === 'active';
    }
    return this.dataChannel?.readyState === 'open' && this.sessionConfigured;
  }

  private async connectRealtime(
    resolveConnect: () => void,
    rejectConnect: (error: Error) => void,
    events: AIProviderEvents,
  ): Promise<void> {
    try {
      const params = new URLSearchParams({
        model: this.model,
        realtime_interface: this.realtimeInterface,
      });
      const sessionResponse = await fetch(`/api/session?${params.toString()}`);
      if (!sessionResponse.ok) {
        throw new Error(await sessionResponse.text());
      }

      const session = (await sessionResponse.json()) as { value?: string };
      const sessionToken = session.value;
      if (!sessionToken) {
        throw new Error('Realtime client secret is missing from /api/session');
      }

      this.pc = new RTCPeerConnection();
      this.pc.addTransceiver('audio', { direction: 'sendrecv' });
      this.audioElement = document.createElement('audio');
      this.audioElement.autoplay = true;
      this.audioElement.muted = true;
      this.audioElement.volume = 0;
      this.pc.ontrack = (event) => {
        this.audioElement!.srcObject = event.streams[0] ?? null;
      };
      this.pc.onconnectionstatechange = () => {
        if (!this.pc) return;
        if (this.pc.connectionState === 'failed' || this.pc.connectionState === 'closed') {
          const msg = `Realtime peer connection ${this.pc.connectionState}.`;
          if (this._state === 'connecting') {
            this.setState('error');
            events.onError(msg);
            rejectConnect(new Error(msg));
            return;
          }
          this.setState('idle');
          events.onDisconnected();
        }
      };

      this.dataChannel = this.pc.createDataChannel('oai-events');
      this.dataChannel.addEventListener('open', () => {
        this.configureSession();
      });
      this.dataChannel.addEventListener('message', (event) => {
        try {
          const data: RealtimeEvent = JSON.parse(event.data as string);
          this.handleEvent(data, resolveConnect, rejectConnect);
        } catch {
          // Ignore non-JSON messages
        }
      });
      this.dataChannel.addEventListener('close', () => {
        if (this._state === 'connecting') {
          const msg = 'Realtime data channel closed before session initialization.';
          this.setState('error');
          events.onError(msg);
          rejectConnect(new Error(msg));
          return;
        }
        if (this._state !== 'idle') {
          this.setState('idle');
          events.onDisconnected();
        }
      });

      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);

      const sdpResponse = await fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST',
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          'Content-Type': 'application/sdp',
        },
      });

      if (!sdpResponse.ok) {
        throw new Error(await sdpResponse.text());
      }

      const answer: RTCSessionDescriptionInit = {
        type: 'answer',
        sdp: await sdpResponse.text(),
      };
      await this.pc.setRemoteDescription(answer);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to initialize realtime session.';
      this.setState('error');
      events.onError(message);
      rejectConnect(new Error(message));
    }
  }

  private queueRealtimeRefresh(delayMs = 1200): void {
    this.responseQueued = true;
    if (this.refreshTimer !== null) {
      window.clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      this.flushRealtimeRefresh();
    }, delayMs);
  }

  private flushRealtimeRefresh(): void {
    if (!this.isReady()) return;
    if (!this.responseQueued || this.responseInFlight) return;
    this.responseQueued = false;
    this.responseInFlight = true;
    this.draftCanvas = '';
    this.send({
      type: 'response.create',
      response: {
        output_modalities: ['text'],
      },
    });
  }

  private async requestHudNote({ imageBase64, prompt }: { imageBase64?: string; prompt: string }): Promise<void> {
    if (this.hudRequestInFlight) {
      this.pendingHudRequest = { imageBase64, prompt };
      return;
    }
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
      if (this.pendingHudRequest) {
        const nextRequest = this.pendingHudRequest;
        this.pendingHudRequest = null;
        void this.requestHudNote(nextRequest);
      }
    }
  }

  private send(data: Record<string, unknown>): void {
    if (this.mode === 'realtime' && this.dataChannel?.readyState === 'open') {
      this.dataChannel.send(JSON.stringify(data));
    }
  }

  private configureSession(): void {
    this.send({
      type: 'session.update',
      session: {
        type: 'realtime',
        output_modalities: ['text'],
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
        const delta = event.delta as string;
        if (delta) {
          this.draftCanvas += delta;
          const textDelta: AITextDelta = {
            itemId: OpenAIRealtimeProvider.HUD_CANVAS_ITEM_ID,
            delta: this.draftCanvas,
            replace: true,
          };
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
        let finalText = this.draftCanvas;
        for (const outputItem of outputItems) {
          if (!outputItem?.id) continue;
          const textContent = outputItem.content?.find(
            (c) => c.type === 'text' || c.type === 'output_text',
          );
          if (textContent?.text) {
            finalText = textContent.text;
          }
        }
        this.finishRealtimeResponse(finalText);
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
          this.finishRealtimeResponse(textContent?.text ?? this.draftCanvas);
        }
        break;
      }

      case 'error': {
        const errMsg = (event.error as { message?: string })?.message ?? 'Unknown error';
        console.error('[OpenAI Realtime] Error:', errMsg);
        this.responseInFlight = false;
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

  private finishRealtimeResponse(text: string): void {
    const finalText = text.trim();
    this.responseInFlight = false;
    if (finalText) {
      this.latestCanvas = finalText;
      this.events?.onTextDelta({
        itemId: OpenAIRealtimeProvider.HUD_CANVAS_ITEM_ID,
        delta: finalText,
        replace: true,
      });
      const responseItem: AIResponseItem = {
        itemId: OpenAIRealtimeProvider.HUD_CANVAS_ITEM_ID,
        text: finalText,
        timestamp: Date.now(),
      };
      this.events?.onResponseDone(responseItem);
    }
    this.draftCanvas = '';
    if (this.responseQueued) {
      this.queueRealtimeRefresh(250);
    }
  }
}
