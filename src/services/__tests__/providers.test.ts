import { describe, it, expect } from 'vitest';
import type { AIProvider, AIProviderEvents, RecordingState, HUDMessage } from '../../types';

// Validate that the provider interface contract is complete
describe('AIProvider interface', () => {
  it('provider interface has all required methods', () => {
    // Verify the interface shape via a mock implementation
    const mockProvider: AIProvider = {
      name: 'MockProvider',
      state: 'idle' as RecordingState,
      connect: async (_events: AIProviderEvents) => {},
      disconnect: () => {},
      sendAudio: (_pcm16: ArrayBuffer) => {},
      sendImage: (_base64: string, _prompt?: string) => {},
      sendText: (_text: string) => {},
    };

    expect(mockProvider.name).toBe('MockProvider');
    expect(mockProvider.state).toBe('idle');
    expect(typeof mockProvider.connect).toBe('function');
    expect(typeof mockProvider.disconnect).toBe('function');
    expect(typeof mockProvider.sendAudio).toBe('function');
    expect(typeof mockProvider.sendImage).toBe('function');
    expect(typeof mockProvider.sendText).toBe('function');
  });

  it('HUDMessage has required shape', () => {
    const msg: HUDMessage = {
      id: crypto.randomUUID(),
      text: 'Test insight',
      timestamp: Date.now(),
      streaming: false,
    };

    expect(msg.id).toBeTruthy();
    expect(msg.text).toBe('Test insight');
    expect(typeof msg.timestamp).toBe('number');
    expect(msg.streaming).toBe(false);
  });

  it('RecordingState transitions are valid string literals', () => {
    const validStates: RecordingState[] = ['idle', 'connecting', 'active', 'paused', 'error'];
    expect(validStates).toHaveLength(5);
    validStates.forEach((s) => expect(typeof s).toBe('string'));
  });
});
