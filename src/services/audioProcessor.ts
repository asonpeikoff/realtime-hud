/**
 * Manages an AudioWorkletNode that converts MediaStream audio to PCM16 chunks.
 * The AudioContext is created at 24 kHz so the browser handles downsampling.
 */
export class AudioStreamProcessor {
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private onChunk: ((pcm16: ArrayBuffer) => void) | null = null;

  async start(
    stream: MediaStream,
    onChunk: (pcm16: ArrayBuffer) => void
  ): Promise<void> {
    this.onChunk = onChunk;

    // Create AudioContext at 24 kHz (OpenAI Realtime API requirement)
    this.audioContext = new AudioContext({ sampleRate: 24000 });

    await this.audioContext.audioWorklet.addModule('/audio-processor.worklet.js');

    this.workletNode = new AudioWorkletNode(this.audioContext, 'audio-processor');
    this.workletNode.port.onmessage = (e: MessageEvent<{ type: string; data: ArrayBuffer }>) => {
      if (e.data.type === 'audio') {
        this.onChunk?.(e.data.data);
      }
    };

    this.sourceNode = this.audioContext.createMediaStreamSource(stream);
    this.sourceNode.connect(this.workletNode);
    this.workletNode.connect(this.audioContext.destination);
  }

  stop(): void {
    this.sourceNode?.disconnect();
    this.workletNode?.disconnect();
    this.audioContext?.close();
    this.sourceNode = null;
    this.workletNode = null;
    this.audioContext = null;
    this.onChunk = null;
  }
}
