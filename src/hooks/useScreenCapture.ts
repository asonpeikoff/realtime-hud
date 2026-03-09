import { useState, useRef, useCallback } from 'react';
import type { ScreenCaptureState } from '../types';

interface UseScreenCaptureResult extends ScreenCaptureState {
  videoRef: React.RefObject<HTMLVideoElement>;
  startCapture: () => Promise<void>;
  stopCapture: () => void;
}

export function useScreenCapture(): UseScreenCaptureResult {
  const [state, setState] = useState<ScreenCaptureState>({
    isCapturing: false,
    stream: null,
    error: null,
  });
  const videoRef = useRef<HTMLVideoElement>(null);

  const startCapture = useCallback(async () => {
    setState({ isCapturing: false, stream: null, error: null });
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 5, max: 15 }, // Low frame rate is sufficient; we capture periodic screenshots rather than processing every frame
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: {
          // Capture system/computer audio alongside the screen
          echoCancellation: false,
          noiseSuppression: false,
          sampleRate: 44100,
        } as MediaTrackConstraints,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // Auto-stop when user clicks browser's native "Stop sharing" button
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        setState({ isCapturing: false, stream: null, error: null });
      });

      setState({ isCapturing: true, stream, error: null });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start screen capture';
      setState({ isCapturing: false, stream: null, error: msg });
    }
  }, []);

  const stopCapture = useCallback(() => {
    state.stream?.getTracks().forEach((t) => t.stop());
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setState({ isCapturing: false, stream: null, error: null });
  }, [state.stream]);

  return { ...state, videoRef, startCapture, stopCapture };
}
