import { useEffect, useRef, useCallback, useState } from 'react';
import { useRealtimeSession } from './hooks/useRealtimeSession';
import { useScreenCapture } from './hooks/useScreenCapture';
import { useAudioCapture } from './hooks/useAudioCapture';
import { captureFrame } from './services/imageCapture';
import { RecordingBadge } from './components/RecordingBadge';
import { ScreenCapturePanel } from './components/ScreenCapturePanel';
import { AudioControls } from './components/AudioControls';
import { HUDDisplay } from './components/HUDDisplay';
import { TextInputArea } from './components/TextInputArea';
import { SettingsPanel } from './components/SettingsPanel';

const DEFAULT_CAPTURE_INTERVAL_SECS = 10;

export default function App() {
  const session = useRealtimeSession();
  const screen = useScreenCapture();
  const audio = useAudioCapture();

  const captureIntervalRef = useRef<number | null>(null);
  const [captureIntervalSecs, setCaptureIntervalSecs] = useState(DEFAULT_CAPTURE_INTERVAL_SECS);
  const captureIntervalSecsRef = useRef(captureIntervalSecs);

  useEffect(() => {
    captureIntervalSecsRef.current = captureIntervalSecs;
  }, [captureIntervalSecs]);

  // ── Session management ──────────────────────────────────────────────────────

  const handleStart = useCallback(async () => {
    await session.connect();
  }, [session]);

  const handleStop = useCallback(() => {
    // Stop everything
    audio.stopMic();
    audio.stopSystemAudio();
    screen.stopCapture();
    session.disconnect();

    if (captureIntervalRef.current !== null) {
      clearInterval(captureIntervalRef.current);
      captureIntervalRef.current = null;
    }
  }, [audio, screen, session]);

  // ── Screenshot loop ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (session.state === 'active' && screen.isCapturing && screen.videoRef.current) {
      if (captureIntervalRef.current !== null) {
        clearInterval(captureIntervalRef.current);
      }

      // Send the first frame immediately
      const sendFrame = () => {
        if (!screen.videoRef.current) return;
        const frame = captureFrame(screen.videoRef.current);
        if (frame) {
          session.provider.sendImage(frame);
        }
      };
      sendFrame();

      captureIntervalRef.current = window.setInterval(sendFrame, captureIntervalSecsRef.current * 1000);
    } else {
      if (captureIntervalRef.current !== null) {
        clearInterval(captureIntervalRef.current);
        captureIntervalRef.current = null;
      }
    }

    return () => {
      if (captureIntervalRef.current !== null) {
        clearInterval(captureIntervalRef.current);
        captureIntervalRef.current = null;
      }
    };
  }, [session.state, session.provider, screen.isCapturing, screen.videoRef]);

  // ── System audio: start when screen capture has audio ──────────────────────

  useEffect(() => {
    if (screen.isCapturing && screen.stream && session.state === 'active') {
      const hasAudio = screen.stream.getAudioTracks().length > 0;
      if (hasAudio && !audio.systemAudioActive) {
        audio.startSystemAudio(screen.stream, (pcm16) => {
          session.provider.sendAudio(pcm16);
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen.isCapturing, screen.stream, session.state]);

  // ── Mic toggle ─────────────────────────────────────────────────────────────

  const handleToggleMic = useCallback(() => {
    if (audio.micActive) {
      audio.stopMic();
    } else {
      audio.startMic((pcm16) => {
        session.provider.sendAudio(pcm16);
      });
    }
  }, [audio, session.provider]);

  // ── System audio toggle ────────────────────────────────────────────────────

  const handleToggleSystemAudio = useCallback(() => {
    if (audio.systemAudioActive) {
      audio.stopSystemAudio();
    } else if (screen.stream) {
      audio.startSystemAudio(screen.stream, (pcm16) => {
        session.provider.sendAudio(pcm16);
      });
    }
  }, [audio, screen.stream, session.provider]);

  // ── Pop out HUD ─────────────────────────────────────────────────────────────

  const handlePopOut = useCallback(() => {
    window.open('/hud', 'realtime-hud', 'width=600,height=800,toolbar=no,menubar=no');
  }, []);

  const isRunning = session.state === 'active' || session.state === 'connecting';
  const systemAudioAvailable = !!(screen.stream && screen.stream.getAudioTracks().length > 0);

  return (
    <div className="min-h-screen bg-hud-bg text-hud-text flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-hud-border bg-hud-panel/50 backdrop-blur">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🧿</span>
          <div>
            <h1 className="text-base font-bold text-hud-text tracking-tight">Realtime HUD</h1>
            <p className="text-xs text-hud-muted">AI-powered heads-up display</p>
          </div>
        </div>
        <RecordingBadge state={session.state} />
      </header>

      {/* Main content */}
      <main className="flex-1 flex overflow-hidden p-4 gap-4">
        {/* Left panel: inputs */}
        <aside className="w-80 flex-shrink-0 flex flex-col bg-hud-panel border border-hud-border rounded-xl overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            <ScreenCapturePanel
              isCapturing={screen.isCapturing}
              stream={screen.stream}
              error={screen.error}
              videoRef={screen.videoRef}
              onStart={screen.startCapture}
              onStop={screen.stopCapture}
            />

            <AudioControls
              micActive={audio.micActive}
              systemAudioActive={audio.systemAudioActive}
              systemAudioAvailable={systemAudioAvailable}
              onToggleMic={handleToggleMic}
              onToggleSystemAudio={handleToggleSystemAudio}
              disabled={!isRunning}
            />

            {session.error && (
              <div className="bg-red-900/20 border border-hud-danger/30 rounded-lg px-3 py-2 text-xs text-hud-danger">
                ⚠ {session.error}
              </div>
            )}

            {/* Start / Stop */}
            {!isRunning ? (
              <button
                onClick={handleStart}
                className="w-full py-3 bg-hud-accent hover:bg-blue-600 text-white font-semibold text-sm rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <span className="w-2 h-2 rounded-full bg-white" />
                Start AI Session
              </button>
            ) : (
              <button
                onClick={handleStop}
                className="w-full py-3 bg-hud-danger/20 hover:bg-hud-danger/30 text-hud-danger border border-hud-danger/40 font-semibold text-sm rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <span className="w-2 h-2 rounded-sm bg-hud-danger" />
                Stop Session
              </button>
            )}
          </div>

          <TextInputArea
            onSend={(text) => session.provider.sendText(text)}
            disabled={!isRunning}
          />
          <SettingsPanel
            captureIntervalSecs={captureIntervalSecs}
            onChangeCaptureInterval={setCaptureIntervalSecs}
          />
        </aside>

        {/* Right panel: HUD display */}
        <section className="flex-1 min-w-0">
          <HUDDisplay
            messages={session.messages}
            state={session.state}
            onClear={session.clearMessages}
            onPopOut={handlePopOut}
          />
        </section>
      </main>
    </div>
  );
}
