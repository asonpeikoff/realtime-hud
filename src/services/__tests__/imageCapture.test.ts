import { describe, it, expect, vi, beforeEach } from 'vitest';
import { captureFrame } from '../imageCapture';

describe('captureFrame', () => {
  let videoElement: HTMLVideoElement;

  beforeEach(() => {
    videoElement = document.createElement('video');
  });

  it('returns null when video has no dimensions', () => {
    Object.defineProperty(videoElement, 'videoWidth', { value: 0, configurable: true });
    Object.defineProperty(videoElement, 'videoHeight', { value: 0, configurable: true });
    expect(captureFrame(videoElement)).toBeNull();
  });

  it('scales down oversized frames to maxWidth', () => {
    Object.defineProperty(videoElement, 'videoWidth', { value: 3840, configurable: true });
    Object.defineProperty(videoElement, 'videoHeight', { value: 2160, configurable: true });

    const canvasSpy = vi.spyOn(document, 'createElement');
    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue({ drawImage: vi.fn() }),
      toDataURL: vi.fn().mockReturnValue('data:image/jpeg;base64,abc123'),
    };
    canvasSpy.mockImplementation((tag: string) => {
      if (tag === 'canvas') return mockCanvas as unknown as HTMLCanvasElement;
      return document.createElement(tag);
    });

    captureFrame(videoElement, 0.6, 1280);

    expect(mockCanvas.width).toBe(1280);
    expect(mockCanvas.height).toBe(720);

    canvasSpy.mockRestore();
  });

  it('does not scale frames smaller than maxWidth', () => {
    Object.defineProperty(videoElement, 'videoWidth', { value: 800, configurable: true });
    Object.defineProperty(videoElement, 'videoHeight', { value: 600, configurable: true });

    const canvasSpy = vi.spyOn(document, 'createElement');
    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue({ drawImage: vi.fn() }),
      toDataURL: vi.fn().mockReturnValue('data:image/jpeg;base64,abc123'),
    };
    canvasSpy.mockImplementation((tag: string) => {
      if (tag === 'canvas') return mockCanvas as unknown as HTMLCanvasElement;
      return document.createElement(tag);
    });

    captureFrame(videoElement, 0.6, 1280);

    expect(mockCanvas.width).toBe(800);
    expect(mockCanvas.height).toBe(600);

    canvasSpy.mockRestore();
  });

  it('returns base64 string without data URL prefix', () => {
    Object.defineProperty(videoElement, 'videoWidth', { value: 640, configurable: true });
    Object.defineProperty(videoElement, 'videoHeight', { value: 480, configurable: true });

    const canvasSpy = vi.spyOn(document, 'createElement');
    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue({ drawImage: vi.fn() }),
      toDataURL: vi.fn().mockReturnValue('data:image/jpeg;base64,SGVsbG8='),
    };
    canvasSpy.mockImplementation((tag: string) => {
      if (tag === 'canvas') return mockCanvas as unknown as HTMLCanvasElement;
      return document.createElement(tag);
    });

    const result = captureFrame(videoElement);
    expect(result).toBe('SGVsbG8=');
    expect(result).not.toContain('data:');

    canvasSpy.mockRestore();
  });
});
