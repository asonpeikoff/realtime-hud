/**
 * Captures a JPEG frame from a video element and returns it as a base64 string.
 * Used to periodically snapshot the screen capture stream for sending to the AI.
 */
export interface CapturedFrame {
  imageBase64: string;
  signature: number[];
}

function computeSignature(ctx: CanvasRenderingContext2D, width: number, height: number): number[] {
  const sampleSize = 16;
  const sampleCanvas = document.createElement('canvas');
  sampleCanvas.width = sampleSize;
  sampleCanvas.height = sampleSize;
  const sampleCtx = sampleCanvas.getContext('2d');
  if (!sampleCtx) return [];

  sampleCtx.drawImage(ctx.canvas, 0, 0, width, height, 0, 0, sampleSize, sampleSize);
  const { data } = sampleCtx.getImageData(0, 0, sampleSize, sampleSize);
  const signature: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    signature.push(Math.round((data[i] + data[i + 1] + data[i + 2]) / 3));
  }
  return signature;
}

export function frameSignatureDifference(a: number[] | null, b: number[]): number {
  if (!a || a.length !== b.length) return 1;
  let total = 0;
  for (let i = 0; i < a.length; i += 1) {
    total += Math.abs(a[i] - b[i]);
  }
  return total / (a.length * 255);
}

export function captureFrame(
  videoElement: HTMLVideoElement,
  quality = 0.6,
  maxWidth = 1280
): string | null {
  return captureFrameSnapshot(videoElement, quality, maxWidth)?.imageBase64 ?? null;
}

export function captureFrameSnapshot(
  videoElement: HTMLVideoElement,
  quality = 0.6,
  maxWidth = 1280
): CapturedFrame | null {
  const { videoWidth, videoHeight } = videoElement;
  if (!videoWidth || !videoHeight) return null;

  // Scale down if the capture is very large to reduce bandwidth
  const scale = videoWidth > maxWidth ? maxWidth / videoWidth : 1;
  const width = Math.round(videoWidth * scale);
  const height = Math.round(videoHeight * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.drawImage(videoElement, 0, 0, width, height);
  const signature = computeSignature(ctx, width, height);

  // Return base64 without the data URL prefix
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  const imageBase64 = dataUrl.split(',')[1] ?? null;
  if (!imageBase64) return null;

  return { imageBase64, signature };
}
