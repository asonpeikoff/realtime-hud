import { useState, useRef } from 'react';

interface TextInputAreaProps {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export function TextInputArea({ onSend, disabled = false }: TextInputAreaProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleSend();
    }
  };

  return (
    <div className="border-t border-hud-border">
      <button
        onClick={() => {
          setIsOpen((o) => !o);
          if (!isOpen) setTimeout(() => textareaRef.current?.focus(), 50);
        }}
        className="w-full flex items-center justify-between px-4 py-2 text-xs text-hud-muted hover:text-hud-text hover:bg-white/5 transition-colors"
        aria-expanded={isOpen}
        aria-controls="text-input-area"
      >
        <span className="flex items-center gap-2">
          <span>⌨</span>
          <span>Steer AI (text input)</span>
        </span>
        <span className="opacity-60">{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div id="text-input-area" className="px-4 pb-4 space-y-2">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            placeholder="Type a message to steer the AI… (Ctrl+Enter to send)"
            rows={3}
            className="w-full bg-hud-bg border border-hud-border rounded-lg px-3 py-2 text-sm text-hud-text placeholder-hud-muted resize-none focus:outline-none focus:ring-1 focus:ring-hud-accent disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <div className="flex justify-between items-center">
            <span className="text-xs text-hud-muted">Ctrl+Enter to send</span>
            <button
              onClick={handleSend}
              disabled={disabled || !text.trim()}
              className="px-4 py-1.5 bg-hud-accent hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-colors"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
