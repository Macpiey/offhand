import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Receipt, WorkspaceInfo } from '@offhand/shared';
import type { WorkspaceRow } from './store.js';

const exec = promisify(execFile);
const MAX_DIFF_BYTES = 48 * 1024;

async function git(cwd: string, ...args: string[]): Promise<string | null> {
  try {
    const { stdout } = await exec('git', args, { cwd, timeout: 10_000 });
    return stdout;
  } catch {
    return null;
  }
}

export async function workspaceInfo(row: WorkspaceRow): Promise<WorkspaceInfo> {
  const branch = (await git(row.path, 'rev-parse', '--abbrev-ref', 'HEAD'))?.trim();
  const status = branch ? await git(row.path, 'status', '--porcelain') : null;
  return {
    path: row.path,
    label: row.label,
    ...(branch ? { gitBranch: branch } : {}),
    ...(status !== null ? { dirty: status.trim() !== '' } : {}),
    ...(row.devUrl ? { devUrl: row.devUrl } : {}),
  };
}

/**
 * Receipt for a finished run, scoped to the files the agent's tool events
 * touched (approximation documented in the plan: includes pre-run local edits
 * to the same files — acceptable for beta).
 */
export async function buildReceipt(
  workspace: string,
  runId: string,
  ok: boolean,
  durationMs: number,
  touchedFiles: string[],
  toolCount: number,
): Promise<Receipt> {
  const base: Receipt = {
    runId,
    ok,
    durationMs,
    filesChanged: 0,
    additions: 0,
    deletions: 0,
    diff: '',
    toolCount,
  };
  const files = [...new Set(touchedFiles)];
  if (files.length === 0) return base;

  const numstat = await git(workspace, 'diff', 'HEAD', '--numstat', '--', ...files);
  if (numstat !== null) {
    for (const line of numstat.split('\n')) {
      const m = /^(\d+|-)\t(\d+|-)\t/.exec(line);
      if (!m) continue;
      base.filesChanged++;
      if (m[1] !== '-') base.additions += Number(m[1]);
      if (m[2] !== '-') base.deletions += Number(m[2]);
    }
    const diff = await git(workspace, 'diff', 'HEAD', '--', ...files);
    if (diff) {
      base.diff =
        diff.length > MAX_DIFF_BYTES
          ? diff.slice(0, MAX_DIFF_BYTES) + '\n… diff truncated …'
          : diff;
    }
  } else {
    // Non-git workspace: report touched file count only.
    base.filesChanged = files.length;
  }
  return base;
}

const FRONTEND_EXT = /\.(html?|css|scss|sass|less|vue|svelte|jsx|tsx)$/i;

/** Should this run produce a screenshot? Only when UI-ish files changed. */
export function shouldScreenshot(touchedFiles: string[], devUrl: string | null): boolean {
  return Boolean(devUrl) && touchedFiles.some((f) => FRONTEND_EXT.test(f));
}
