/**
 * AudioWorkletProcessor that converts Float32 audio samples to PCM16 (Int16)
 * and posts them to the main thread for transmission to the OpenAI Realtime API.
 *
 * The AudioContext is created with sampleRate: 24000, so the browser handles
 * downsampling from the device rate automatically before reaching this processor.
 */
class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._chunks = [];
    this._chunkSize = 2400; // 100ms at 24kHz
    this._accumulated = 0;
    this._buffer = new Int16Array(this._chunkSize);
  }

  /**
   * @param {Float32Array[][]} inputs - Array of input channels
   * @returns {boolean} - true to keep the processor alive
   */
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const float32 = input[0];
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      this._buffer[this._accumulated++] = s < 0 ? s * 0x8000 : s * 0x7fff;

      if (this._accumulated >= this._chunkSize) {
        // Copy buffer and post
        const chunk = new Int16Array(this._chunkSize);
        chunk.set(this._buffer);
        this.port.postMessage({ type: 'audio', data: chunk.buffer }, [chunk.buffer]);
        this._accumulated = 0;
      }
    }
    return true;
  }
}

registerProcessor('audio-processor', AudioProcessor);
