import { useState } from 'react';

interface SettingsPanelProps {
  captureIntervalSecs: number;
  onChangeCaptureInterval: (secs: number) => void;
  modelChoice: string;
  modelChoices: Array<{ id: string; label: string }>;
  onChangeModelChoice: (id: string) => void;
}

export function SettingsPanel({
  captureIntervalSecs,
  onChangeCaptureInterval,
  modelChoice,
  modelChoices,
  onChangeModelChoice,
}: SettingsPanelProps) {
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
            <label htmlFor="model-choice" className="block text-xs text-hud-muted mb-1">
              Model
            </label>
            <select
              id="model-choice"
              value={modelChoice}
              onChange={(e) => onChangeModelChoice(e.target.value)}
              className="w-full bg-hud-bg border border-hud-border rounded-lg px-3 py-2 text-sm text-hud-text focus:outline-none focus:ring-1 focus:ring-hud-accent"
            >
              {modelChoices.map((choice) => (
                <option key={choice.id} value={choice.id}>
                  {choice.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="capture-interval" className="block text-xs text-hud-muted mb-1">
              Screenshot interval: {captureIntervalSecs}s
            </label>
            <input
              id="capture-interval"
              type="range"
              min={1}
              max={20}
              step={1}
              value={captureIntervalSecs}
              onChange={(e) => onChangeCaptureInterval(Number(e.target.value))}
              className="w-full accent-hud-accent"
            />
            <div className="flex justify-between text-xs text-hud-muted/60 mt-0.5">
              <span>1s (more frequent)</span>
              <span>20s (less data)</span>
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
