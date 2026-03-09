import type { ScreenCaptureState } from '../types';

interface ScreenCapturePanelProps extends ScreenCaptureState {
  videoRef: React.RefObject<HTMLVideoElement>;
  onStart: () => void;
  onStop: () => void;
}

export function ScreenCapturePanel({
  isCapturing,
  error,
  videoRef,
  onStart,
  onStop,
}: ScreenCapturePanelProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-hud-muted uppercase tracking-widest">
        Screen Capture
      </h3>

      {/* Video preview */}
      <div className="relative aspect-video bg-black rounded-lg overflow-hidden border border-hud-border">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className={`w-full h-full object-contain transition-opacity ${
            isCapturing ? 'opacity-100' : 'opacity-0'
          }`}
          aria-label="Screen capture preview"
        />
        {!isCapturing && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-hud-muted gap-2">
            <span className="text-3xl">🖥</span>
            <span className="text-sm">No capture active</span>
          </div>
        )}
        {isCapturing && (
          <div className="absolute top-2 right-2">
            <span className="bg-hud-danger/80 text-white text-xs px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              LIVE
            </span>
          </div>
        )}
      </div>

      {/* Controls */}
      {!isCapturing ? (
        <button
          onClick={onStart}
          className="w-full py-2.5 bg-hud-accent hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          <span>🖥</span>
          <span>Select Screen to Capture</span>
        </button>
      ) : (
        <button
          onClick={onStop}
          className="w-full py-2.5 bg-hud-danger/20 hover:bg-hud-danger/30 text-hud-danger border border-hud-danger/40 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          <span className="w-2 h-2 rounded-sm bg-hud-danger" />
          <span>Stop Capture</span>
        </button>
      )}

      {error && (
        <p className="text-xs text-hud-danger bg-red-900/20 border border-hud-danger/30 rounded-lg px-3 py-2">
          ⚠ {error}
        </p>
      )}
    </div>
  );
}
