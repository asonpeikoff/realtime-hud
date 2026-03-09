interface AudioControlsProps {
  micActive: boolean;
  systemAudioActive: boolean;
  systemAudioAvailable: boolean;
  onToggleMic: () => void;
  onToggleSystemAudio: () => void;
  disabled?: boolean;
}

export function AudioControls({
  micActive,
  systemAudioActive,
  systemAudioAvailable,
  onToggleMic,
  onToggleSystemAudio,
  disabled = false,
}: AudioControlsProps) {
  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-hud-muted uppercase tracking-widest">Audio</h3>
      <div className="flex gap-2">
        {/* Microphone toggle */}
        <button
          onClick={onToggleMic}
          disabled={disabled}
          title={micActive ? 'Disable microphone' : 'Enable microphone'}
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
            micActive
              ? 'bg-hud-accent/20 border-hud-accent text-hud-accent'
              : 'bg-transparent border-hud-border text-hud-muted hover:border-hud-accent hover:text-hud-text'
          } disabled:opacity-40 disabled:cursor-not-allowed`}
          aria-pressed={micActive}
        >
          <span>{micActive ? '🎙' : '🎙️'}</span>
          <span>Microphone</span>
          {micActive && <span className="w-1.5 h-1.5 rounded-full bg-hud-danger animate-pulse" />}
        </button>

        {/* System audio toggle */}
        <button
          onClick={onToggleSystemAudio}
          disabled={disabled || !systemAudioAvailable}
          title={
            !systemAudioAvailable
              ? 'Start screen capture with audio to enable system audio'
              : systemAudioActive
              ? 'Disable system audio'
              : 'Enable system audio'
          }
          className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
            systemAudioActive
              ? 'bg-hud-accent/20 border-hud-accent text-hud-accent'
              : 'bg-transparent border-hud-border text-hud-muted hover:border-hud-accent hover:text-hud-text'
          } disabled:opacity-40 disabled:cursor-not-allowed`}
          aria-pressed={systemAudioActive}
        >
          <span>🔊</span>
          <span>System Audio</span>
          {systemAudioActive && <span className="w-1.5 h-1.5 rounded-full bg-hud-danger animate-pulse" />}
        </button>
      </div>
      {!systemAudioAvailable && (
        <p className="text-xs text-hud-muted/70">
          Enable "Share system audio" during screen capture to use system audio.
        </p>
      )}
    </div>
  );
}
