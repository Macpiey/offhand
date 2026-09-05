import jsQR from 'jsqr';

/** In-app QR scanner (iOS Camera-app scans open Safari, not the PWA). */
export async function scanQR(
  video: HTMLVideoElement,
  signal: AbortSignal,
): Promise<string | null> {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  video.srcObject = stream;
  await video.play();
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  try {
    return await new Promise<string | null>((resolve) => {
      const tick = () => {
        if (signal.aborted) return resolve(null);
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0);
          const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const hit = jsQR(image.data, image.width, image.height);
          if (hit?.data) return resolve(hit.data);
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  } finally {
    stream.getTracks().forEach((t) => t.stop());
  }
}

/** Parse a scanned pairing QR (full link) or a raw pairing code. */
export function parseScanned(text: string): { code: string; relay?: string } {
  const trimmed = text.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    const params = new URLSearchParams(new URL(trimmed).hash.replace(/^#/, ''));
    const code = params.get('pair');
    if (!code) throw new Error('QR does not contain a pairing code');
    return { code, relay: params.get('relay') ?? undefined };
  }
  return { code: trimmed };
}
