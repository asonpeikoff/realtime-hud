import { useState, useRef, useCallback } from 'react';
import { AudioStreamProcessor } from '../services/audioProcessor';
import type { AudioCaptureState } from '../types';

interface UseAudioCaptureResult extends AudioCaptureState {
  startMic: (onChunk: (pcm16: ArrayBuffer) => void) => Promise<void>;
  stopMic: () => void;
  startSystemAudio: (stream: MediaStream, onChunk: (pcm16: ArrayBuffer) => void) => Promise<void>;
  stopSystemAudio: () => void;
}

export function useAudioCapture(): UseAudioCaptureResult {
  const [state, setState] = useState<AudioCaptureState>({
    micActive: false,
    systemAudioActive: false,
    error: null,
  });

  const micProcessor = useRef<AudioStreamProcessor | null>(null);
  const systemProcessor = useRef<AudioStreamProcessor | null>(null);
  const micStream = useRef<MediaStream | null>(null);

  const startMic = useCallback(async (onChunk: (pcm16: ArrayBuffer) => void) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        },
      });
      micStream.current = stream;
      micProcessor.current = new AudioStreamProcessor();
      await micProcessor.current.start(stream, onChunk);
      setState((s) => ({ ...s, micActive: true, error: null }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Microphone access denied';
      setState((s) => ({ ...s, micActive: false, error: msg }));
    }
  }, []);

  const stopMic = useCallback(() => {
    micProcessor.current?.stop();
    micProcessor.current = null;
    micStream.current?.getTracks().forEach((t) => t.stop());
    micStream.current = null;
    setState((s) => ({ ...s, micActive: false }));
  }, []);

  const startSystemAudio = useCallback(
    async (stream: MediaStream, onChunk: (pcm16: ArrayBuffer) => void) => {
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        setState((s) => ({
          ...s,
          error: 'No system audio track found. Enable "Share system audio" in the screen capture dialog.',
        }));
        return;
      }
      try {
        const audioStream = new MediaStream(audioTracks);
        systemProcessor.current = new AudioStreamProcessor();
        await systemProcessor.current.start(audioStream, onChunk);
        setState((s) => ({ ...s, systemAudioActive: true, error: null }));
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to capture system audio';
        setState((s) => ({ ...s, systemAudioActive: false, error: msg }));
      }
    },
    []
  );

  const stopSystemAudio = useCallback(() => {
    systemProcessor.current?.stop();
    systemProcessor.current = null;
    setState((s) => ({ ...s, systemAudioActive: false }));
  }, []);

  return { ...state, startMic, stopMic, startSystemAudio, stopSystemAudio };
}
