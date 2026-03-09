import { useEffect, useRef } from 'react';
import type { HUDMessage, RecordingState } from '../types';

interface HUDDisplayProps {
  messages: HUDMessage[];
  state: RecordingState;
  onClear: () => void;
  onPopOut?: () => void;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function HUDDisplay({ messages, state, onClear, onPopOut }: HUDDisplayProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-full bg-hud-panel border border-hud-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-hud-border bg-hud-bg/50">
        <div className="flex items-center gap-2">
          <span className="text-hud-accent text-lg">🧠</span>
          <span className="text-sm font-semibold text-hud-text">AI Insights</span>
          {state === 'active' && (
            <span className="w-2 h-2 rounded-full bg-hud-danger animate-pulse" title="Actively recording" />
          )}
        </div>
        <div className="flex items-center gap-2">
          {onPopOut && (
            <button
              onClick={onPopOut}
              title="Pop out to second monitor"
              className="p-1.5 text-hud-muted hover:text-hud-text hover:bg-white/10 rounded-lg transition-colors text-xs"
            >
              ⤢ Pop Out
            </button>
          )}
          <button
            onClick={onClear}
            title="Clear messages"
            disabled={isEmpty}
            className="p-1.5 text-hud-muted hover:text-hud-text hover:bg-white/10 rounded-lg transition-colors text-xs disabled:opacity-30"
          >
            ✕ Clear
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 scrollbar-thin">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-hud-muted gap-3 py-12">
            <span className="text-4xl opacity-40">💡</span>
            <div>
              <p className="text-sm font-medium">No insights yet</p>
              <p className="text-xs mt-1 opacity-70">
                {state === 'idle'
                  ? 'Start a session to begin receiving AI insights'
                  : state === 'connecting'
                  ? 'Connecting to AI…'
                  : 'Capture your screen to receive insights'}
              </p>
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`rounded-lg px-4 py-3 border transition-all ${
                msg.streaming
                  ? 'bg-hud-accent/5 border-hud-accent/30'
                  : 'bg-white/5 border-hud-border/50'
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <span className="text-xs text-hud-muted">{formatTime(msg.timestamp)}</span>
                {msg.streaming && (
                  <span className="text-xs text-hud-accent font-medium flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-hud-accent animate-pulse" />
                    Streaming
                  </span>
                )}
              </div>
              <p className="text-sm text-hud-text leading-relaxed whitespace-pre-wrap">{msg.text}</p>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Footer hint */}
      {state === 'active' && !isEmpty && (
        <div className="px-4 py-2 border-t border-hud-border bg-hud-bg/30">
          <p className="text-xs text-hud-muted/60 text-center">
            Screen captures sent every 10 seconds • Audio streamed continuously
          </p>
        </div>
      )}
    </div>
  );
}
