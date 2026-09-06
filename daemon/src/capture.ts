import { sealBytes, openBytes, type SessionKeys } from '@offhand/shared';

/**
 * M5 artifact pipeline: Playwright screenshot of the workspace's dev URL →
 * encrypt client-side → upload opaque bytes to the relay → return blob id.
 * The relay never sees a pixel.
 *
 * Playwright is imported lazily so daemons without --capture-url never pay
 * the dependency cost at runtime.
 */
export async function captureScreenshot(url: string): Promise<Uint8Array> {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); // phone-shaped
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
    const png = await page.screenshot({ fullPage: true, type: 'png' });
    return new Uint8Array(png);
  } finally {
    await browser.close();
  }
}

export async function uploadArtifact(
  relayUrl: string,
  sessionId: string,
  data: Uint8Array,
  keys: SessionKeys,
  contentHint: string,
): Promise<string> {
  const encrypted = sealBytes(data, keys.tx);
  const res = await fetch(`${relayUrl.replace(/\/$/, '')}/artifacts/${encodeURIComponent(sessionId)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream', 'x-content-hint': contentHint },
    body: Buffer.from(encrypted),
  });
  if (!res.ok) throw new Error(`artifact upload failed: ${res.status}`);
  const body = (await res.json()) as { blobId: string };
  return body.blobId;
}

/** Fetch + decrypt a blob the PHONE uploaded (phone tx == daemon rx). */
export async function downloadArtifact(
  relayUrl: string,
  sessionId: string,
  blobId: string,
  keys: SessionKeys,
): Promise<Uint8Array> {
  const res = await fetch(
    `${relayUrl.replace(/\/$/, '')}/artifacts/${encodeURIComponent(sessionId)}/${encodeURIComponent(blobId)}`,
  );
  if (!res.ok) throw new Error(`artifact download failed: ${res.status}`);
  return openBytes(new Uint8Array(await res.arrayBuffer()), keys.rx);
}
