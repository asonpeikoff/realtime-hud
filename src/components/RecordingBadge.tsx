import type { RecordingState } from '../types';

interface RecordingBadgeProps {
  state: RecordingState;
}

const STATE_CONFIG: Record<RecordingState, { label: string; dotClass: string; bgClass: string; textClass: string }> = {
  idle: {
    label: 'Not Recording',
    dotClass: 'bg-hud-muted',
    bgClass: 'bg-gray-800/80',
    textClass: 'text-hud-muted',
  },
  connecting: {
    label: 'Connecting…',
    dotClass: 'bg-hud-warning animate-pulse',
    bgClass: 'bg-yellow-900/40',
    textClass: 'text-hud-warning',
  },
  active: {
    label: 'Recording',
    dotClass: 'bg-hud-danger animate-pulse',
    bgClass: 'bg-red-900/40',
    textClass: 'text-hud-danger',
  },
  paused: {
    label: 'Paused',
    dotClass: 'bg-hud-warning',
    bgClass: 'bg-yellow-900/40',
    textClass: 'text-hud-warning',
  },
  error: {
    label: 'Error',
    dotClass: 'bg-hud-danger',
    bgClass: 'bg-red-900/40',
    textClass: 'text-hud-danger',
  },
};

export function RecordingBadge({ state }: RecordingBadgeProps) {
  const config = STATE_CONFIG[state];

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 ${config.bgClass}`}
      title={`AI Session: ${config.label}`}
      role="status"
      aria-live="polite"
    >
      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${config.dotClass}`} />
      <span className={`text-xs font-semibold tracking-wide uppercase ${config.textClass}`}>
        {config.label}
      </span>
    </div>
  );
}
