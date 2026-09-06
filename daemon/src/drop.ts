import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  watch,
  writeFileSync,
  type FSWatcher,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, parse, resolve } from 'node:path';
import { spawn } from 'node:child_process';

export const DROP_LOG_SESSION_ID = 'drop';

export function offhandHome(): string {
  return process.env.OFFHAND_HOME ?? join(homedir(), '.offhand');
}

export function dropOutboxDir(home = offhandHome()): string {
  return join(home, 'drop-outbox');
}

export function incomingDropDir(): string {
  return join(homedir(), 'Downloads', 'offhand');
}

export function safeDropName(input: string): string {
  const base = basename(input).replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/[. ]+$/g, '').trim();
  if (!base || base === '.' || base === '..') return 'drop';
  return base;
}

export function dedupeDropName(desiredName: string, existingNames: Iterable<string>): string {
  const safe = safeDropName(desiredName);
  const existing = new Set([...existingNames].map((n) => n.toLowerCase()));
  if (!existing.has(safe.toLowerCase())) return safe;

  const parsed = parse(safe);
  const stem = parsed.name || 'drop';
  const ext = parsed.ext;
  for (let i = 1; ; i++) {
    const candidate = `${stem}-${i}${ext}`;
    if (!existing.has(candidate.toLowerCase())) return candidate;
  }
}

export function queueDropFileForPhone(sourcePath: string, outbox = dropOutboxDir()): string {
  const source = resolve(sourcePath);
  const st = statSync(source);
  if (!st.isFile()) throw new Error(`not a file: ${sourcePath}`);
  mkdirSync(outbox, { recursive: true });
  const dest = join(outbox, dedupeDropName(basename(source), safeNames(outbox)));
  copyFileSync(source, dest);
  return dest;
}

export function saveIncomingDrop(name: string, bytes: Uint8Array, dir = incomingDropDir()): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, dedupeDropName(name, safeNames(dir)));
  writeFileSync(path, bytes);
  return path;
}

export function readOutgoingDrop(path: string): { bytes: Uint8Array; name: string; mime: string; size: number } {
  const bytes = readFileSync(path);
  return {
    bytes,
    name: basename(path),
    mime: mimeFromName(path),
    size: bytes.byteLength,
  };
}

export function startDropOutboxWatcher(
  outbox: string,
  sendFile: (path: string) => Promise<void>,
): () => void {
  mkdirSync(outbox, { recursive: true });
  const inFlight = new Set<string>();
  let closed = false;
  let timer: NodeJS.Timeout | null = null;
  let watcher: FSWatcher | null = null;

  const schedule = (delayMs = 350) => {
    if (closed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(scan, delayMs);
  };

  const processFile = async (path: string) => {
    if (inFlight.has(path)) return;
    inFlight.add(path);
    try {
      const before = statSync(path);
      if (!before.isFile()) return;
      await new Promise((r) => setTimeout(r, 200));
      const after = statSync(path);
      if (before.size !== after.size) {
        schedule();
        return;
      }
      await sendFile(path);
      try {
        unlinkSync(path);
      } catch (e) {
        console.error(`drop: sent but could not delete ${path}: ${e instanceof Error ? e.message : String(e)}`);
      }
    } catch (e) {
      if (existsSync(path)) {
        console.error(`drop: failed to send ${path}: ${e instanceof Error ? e.message : String(e)}`);
        schedule(15_000);
      }
    } finally {
      inFlight.delete(path);
    }
  };

  const scan = () => {
    timer = null;
    if (closed) return;
    for (const entry of safeEntries(outbox)) {
      if (entry.isFile()) void processFile(join(outbox, entry.name));
    }
  };

  watcher = watch(outbox, () => schedule());
  schedule(0);

  return () => {
    closed = true;
    if (timer) clearTimeout(timer);
    watcher?.close();
  };
}

/** Show a Windows toast about a received drop. Uses PowerShell's registered
 * AppUserModelID (unregistered app ids get silently dropped by Windows).
 * `clipboard` additionally copies text content so short notes paste anywhere. */
export function showDropToast(savedPath: string, textToClipboard?: string): void {
  const appId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe';
  const title = 'offhand — drop received';
  const body = textToClipboard !== undefined ? 'Copied to clipboard · also saved to Downloads\\offhand' : `Saved to ${savedPath}`;
  const lines = [
    textToClipboard !== undefined ? `Set-Clipboard -Value ${psQuote(textToClipboard)}` : '',
    `[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null`,
    `[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime] | Out-Null`,
    `$xml = [Windows.Data.Xml.Dom.XmlDocument]::new()`,
    `$t = [System.Security.SecurityElement]::Escape(${psQuote(title)})`,
    `$b = [System.Security.SecurityElement]::Escape(${psQuote(body)})`,
    `$xml.LoadXml('<toast><visual><binding template="ToastGeneric"><text>' + $t + '</text><text>' + $b + '</text></binding></visual></toast>')`,
    `$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)`,
    `[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier(${psQuote(appId)}).Show($toast)`,
  ].filter(Boolean);
  const child = spawn('powershell', ['-NoProfile', '-Command', lines.join('; ')], {
    windowsHide: true,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let errTail = '';
  child.stderr?.setEncoding('utf8');
  child.stderr?.on('data', (c: string) => (errTail = (errTail + c).slice(-500)));
  child.on('exit', (code) => {
    if (code !== 0) console.error(`drop: toast failed (${code}): ${errTail}`);
  });
  child.on('error', () => {});
  console.log(`drop: saved ${savedPath}`);
}

function safeNames(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function safeEntries(dir: string) {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function mimeFromName(path: string): string {
  const ext = parse(path).ext.toLowerCase();
  return (
    {
      '.apng': 'image/apng',
      '.avif': 'image/avif',
      '.gif': 'image/gif',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf',
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.json': 'application/json',
      '.csv': 'text/csv',
      '.mp4': 'video/mp4',
      '.mov': 'video/quicktime',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.zip': 'application/zip',
    }[ext] ?? 'application/octet-stream'
  );
}
