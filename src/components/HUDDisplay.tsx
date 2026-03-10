import { Fragment, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { HUDMessage, RecordingState } from '../types';

interface HUDDisplayProps {
  messages: HUDMessage[];
  state: RecordingState;
  captureIntervalSecs?: number;
  onClear: () => void;
  onPopOut?: () => void;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function renderInlineMarkdown(text: string): ReactNode[] {
  const tokens = text.split(/(\[[^\]]+\]\([^\)]+\)|\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);

  return tokens.map((token, index) => {
    const linkMatch = token.match(/^\[([^\]]+)\]\(([^\)]+)\)$/);
    if (linkMatch) {
      const [, label, href] = linkMatch;
      return (
        <a
          key={`link-${index}`}
          href={href}
          target="_blank"
          rel="noreferrer"
          className="text-hud-accent underline decoration-hud-accent/40 underline-offset-2 hover:decoration-hud-accent"
        >
          {label}
        </a>
      );
    }

    const boldMatch = token.match(/^\*\*([^*]+)\*\*$/);
    if (boldMatch) {
      return <strong key={`strong-${index}`} className="font-semibold text-hud-text">{boldMatch[1]}</strong>;
    }

    const codeMatch = token.match(/^`([^`]+)`$/);
    if (codeMatch) {
      return (
        <code
          key={`code-${index}`}
          className="px-1.5 py-0.5 rounded bg-black/20 border border-white/10 text-hud-accent/90 text-[0.92em]"
        >
          {codeMatch[1]}
        </code>
      );
    }

    return <Fragment key={`text-${index}`}>{token}</Fragment>;
  });
}

function renderMarkdownBlocks(text: string): ReactNode {
  const lines = text.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let bulletItems: string[] = [];
  let paragraphLines: string[] = [];

  const flushBullets = () => {
    if (bulletItems.length === 0) return;
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="space-y-1.5 pl-5 list-disc text-hud-text/95 marker:text-hud-accent/70">
        {bulletItems.map((item, index) => (
          <li key={`li-${index}`} className="leading-relaxed">
            {renderInlineMarkdown(item)}
          </li>
        ))}
      </ul>
    );
    bulletItems = [];
  };

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    blocks.push(
      <p key={`p-${blocks.length}`} className="leading-relaxed text-hud-text/95">
        {renderInlineMarkdown(paragraphLines.join(' '))}
      </p>
    );
    paragraphLines = [];
  };

  lines.forEach((rawLine) => {
    const line = rawLine.trim();

    if (!line) {
      flushBullets();
      flushParagraph();
      return;
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      flushBullets();
      flushParagraph();
      const level = headingMatch[1].length;
      const content = renderInlineMarkdown(headingMatch[2]);

      if (level === 1) {
        blocks.push(
          <h1 key={`h1-${blocks.length}`} className="text-lg font-semibold tracking-tight text-hud-text">
            {content}
          </h1>
        );
      } else if (level === 2) {
        blocks.push(
          <h2 key={`h2-${blocks.length}`} className="text-sm font-semibold uppercase tracking-[0.14em] text-hud-accent/85 pt-2">
            {content}
          </h2>
        );
      } else {
        blocks.push(
          <h3 key={`h3-${blocks.length}`} className="text-sm font-semibold text-hud-text/90 pt-1">
            {content}
          </h3>
        );
      }
      return;
    }

    const bulletMatch = line.match(/^[-*]\s+(.*)$/);
    if (bulletMatch) {
      flushParagraph();
      bulletItems.push(bulletMatch[1]);
      return;
    }

    paragraphLines.push(line);
  });

  flushBullets();
  flushParagraph();

  return <div className="space-y-3">{blocks}</div>;
}

export function HUDDisplay({ messages, state, captureIntervalSecs = 10, onClear, onPopOut }: HUDDisplayProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottomRef = useRef(true);

  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    shouldStickToBottomRef.current = distanceFromBottom <= 40;
  };

  // Keep the view pinned to the latest updates only while the user is near the bottom.
  useEffect(() => {
    if (!shouldStickToBottomRef.current) return;
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  const isEmpty = messages.length === 0;
  const canvasMessage = messages.find((msg) => msg.id === 'hud-canvas');
  const timelineMessages = messages.filter((msg) => msg.id !== 'hud-canvas');

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
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-3 scrollbar-thin"
      >
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
          <>
            {canvasMessage && (
              <div className="rounded-xl px-5 py-4 border bg-hud-accent/5 border-hud-accent/25 shadow-[0_0_0_1px_rgba(59,130,246,0.08)]">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-hud-accent/80">Live HUD Canvas</p>
                    <p className="text-xs text-hud-muted mt-1">Updated in place as the screen meaningfully changes</p>
                  </div>
                  <span className="text-xs text-hud-muted">{formatTime(canvasMessage.timestamp)}</span>
                </div>
                <div className="text-sm text-hud-text leading-relaxed whitespace-pre-wrap">
                  {renderMarkdownBlocks(canvasMessage.text)}
                </div>
              </div>
            )}

            {timelineMessages.map((msg) => (
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
                <div className="text-sm text-hud-text leading-relaxed">
                  {renderMarkdownBlocks(msg.text)}
                </div>
              </div>
            ))}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Footer hint */}
      {state === 'active' && !isEmpty && (
        <div className="px-4 py-2 border-t border-hud-border bg-hud-bg/30">
          <p className="text-xs text-hud-muted/60 text-center">
            Screen captures sent every {captureIntervalSecs} seconds • Audio streamed continuously
          </p>
        </div>
      )}
    </div>
  );
}
