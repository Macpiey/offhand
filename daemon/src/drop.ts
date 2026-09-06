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

export function showDropToast(savedPath: string): void {
  const title = psQuote('offhand — file received');
  const body = psQuote(`Saved to ${savedPath}`);
  const script = `
$title = ${title}
$body = ${body}
try {
  [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
  [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
  $safeTitle = [System.Security.SecurityElement]::Escape($title)
  $safeBody = [System.Security.SecurityElement]::Escape($body)
  $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
  $xml.LoadXml("<toast><visual><binding template=\\"ToastGeneric\\"><text>$safeTitle</text><text>$safeBody</text></binding></visual></toast>")
  $toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
  [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("offhand").Show($toast)
} catch {
  try {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    $n = New-Object System.Windows.Forms.NotifyIcon
    $n.Icon = [System.Drawing.SystemIcons]::Information
    $n.Visible = $true
    $n.ShowBalloonTip(5000, $title, $body, [System.Windows.Forms.ToolTipIcon]::Info)
    Start-Sleep -Seconds 5
    $n.Dispose()
  } catch {}
}`;
  const child = spawn('powershell', ['-NoProfile', '-Command', script], {
    windowsHide: true,
    stdio: 'ignore',
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
