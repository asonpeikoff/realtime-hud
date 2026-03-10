import { useState, useRef, useCallback, useEffect } from 'react';
import { OpenAIRealtimeProvider } from '../services/providers';
import type { AIConnectOptions, AIProvider, HUDMessage, RecordingState } from '../types';

interface UseRealtimeSessionResult {
  state: RecordingState;
  messages: HUDMessage[];
  error: string | null;
  provider: AIProvider;
  connect: (options?: AIConnectOptions) => Promise<void>;
  disconnect: () => void;
  clearMessages: () => void;
}

export function useRealtimeSession(): UseRealtimeSessionResult {
  const [state, setState] = useState<RecordingState>('idle');
  const [messages, setMessages] = useState<HUDMessage[]>([]);
  const [error, setError] = useState<string | null>(null);

  const providerRef = useRef<AIProvider>(new OpenAIRealtimeProvider());

  // Clean up on unmount
  useEffect(() => {
    const provider = providerRef.current;
    return () => {
      provider.disconnect();
    };
  }, []);

  const connect = useCallback(async (options?: AIConnectOptions) => {
    setError(null);
    setMessages([]);

    await providerRef.current.connect({
      onConnected: () => {
        setState('active');
      },
      onDisconnected: () => {
        setState('idle');
      },
      onTextDelta: ({ itemId, delta, replace }) => {
        setMessages((prev) => {
          const existing = prev.find((m) => m.id === itemId);
          if (existing) {
            return prev.map((m) =>
              m.id === itemId ? { ...m, text: replace ? delta : m.text + delta, streaming: true } : m
            );
          }
          return [
            ...prev,
            { id: itemId, text: delta, timestamp: Date.now(), streaming: true },
          ];
        });
      },
      onResponseDone: ({ itemId }) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === itemId ? { ...m, streaming: false } : m))
        );
      },
      onError: (msg) => {
        setError(msg);
        setState('error');
      },
      onStateChange: (newState) => {
        setState(newState);
      },
    }, options);
  }, []);

  const disconnect = useCallback(() => {
    providerRef.current.disconnect();
    setState('idle');
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    state,
    messages,
    error,
    provider: providerRef.current,
    connect,
    disconnect,
    clearMessages,
  };
}
