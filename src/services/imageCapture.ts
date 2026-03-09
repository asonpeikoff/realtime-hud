/**
 * Captures a JPEG frame from a video element and returns it as a base64 string.
 * Used to periodically snapshot the screen capture stream for sending to the AI.
 */
export function captureFrame(
  videoElement: HTMLVideoElement,
  quality = 0.6,
  maxWidth = 1280
): string | null {
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

  // Return base64 without the data URL prefix
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  return dataUrl.split(',')[1] ?? null;
}
