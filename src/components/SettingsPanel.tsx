import { useState } from 'react';

interface SettingsPanelProps {
  captureIntervalSecs: number;
  onChangeCaptureInterval: (secs: number) => void;
}

export function SettingsPanel({ captureIntervalSecs, onChangeCaptureInterval }: SettingsPanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-t border-hud-border">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-2 text-xs text-hud-muted hover:text-hud-text hover:bg-white/5 transition-colors"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <span>⚙</span>
          <span>Settings</span>
        </span>
        <span className="opacity-60">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          <div>
            <label htmlFor="capture-interval" className="block text-xs text-hud-muted mb-1">
              Screenshot interval: {captureIntervalSecs}s
            </label>
            <input
              id="capture-interval"
              type="range"
              min={5}
              max={60}
              step={5}
              value={captureIntervalSecs}
              onChange={(e) => onChangeCaptureInterval(Number(e.target.value))}
              className="w-full accent-hud-accent"
            />
            <div className="flex justify-between text-xs text-hud-muted/60 mt-0.5">
              <span>5s (more frequent)</span>
              <span>60s (less data)</span>
            </div>
          </div>
          <div className="text-xs text-hud-muted/70 bg-yellow-900/10 border border-yellow-700/30 rounded-lg px-3 py-2">
            <p className="font-medium text-hud-warning mb-1">⚠ Privacy Notice</p>
            <p>
              Screen content and audio are sent to OpenAI's Realtime API for processing.
              No data is stored on the server – it is proxied directly to OpenAI.
              Stop the session at any time to stop sending data.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
