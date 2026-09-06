import { existsSync, readdirSync, readFileSync, statSync, type Dirent } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import type { ConversationSummary } from '@offhand/shared';

const DEFAULT_PROJECTS_DIR = join(homedir(), '.claude', 'projects');

export function listClaudeConversations(
  workspace: string,
  projectsDir = process.env.OFFHAND_CLAUDE_PROJECTS_DIR ?? DEFAULT_PROJECTS_DIR,
): ConversationSummary[] {
  const projectDir = findProjectDir(workspace, projectsDir);
  if (!projectDir) return [];

  return listJsonlFiles(projectDir)
    .map((path) => summarizeConversation(path, workspace))
    .filter((c): c is ConversationSummary => c !== null)
    .sort((a, b) => b.lastActiveMs - a.lastActiveMs)
    .slice(0, 50);
}

function findProjectDir(workspace: string, projectsDir: string): string | null {
  if (!existsSync(projectsDir)) return null;

  const candidates = new Set([encodeWorkspace(workspace), encodeWorkspace(resolve(workspace))]);
  for (const candidate of candidates) {
    const exact = join(projectsDir, candidate);
    if (existsSync(exact)) return exact;
  }

  const lower = new Set([...candidates].map((c) => c.toLowerCase()));
  for (const entry of safeReadDir(projectsDir)) {
    if (entry.isDirectory() && lower.has(entry.name.toLowerCase())) return join(projectsDir, entry.name);
  }
  return null;
}

function encodeWorkspace(workspace: string): string {
  return workspace.replace(/[^A-Za-z0-9]/g, '-');
}

function listJsonlFiles(projectDir: string): string[] {
  const files = safeReadDir(projectDir)
    .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
    .map((entry) => join(projectDir, entry.name));
  const sessionsDir = join(projectDir, 'sessions');
  if (!existsSync(sessionsDir)) return files;
  return [
    ...files,
    ...safeReadDir(sessionsDir)
      .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
      .map((entry) => join(sessionsDir, entry.name)),
  ];
}

function summarizeConversation(path: string, workspace: string): ConversationSummary | null {
  let firstPrompt = '';
  let messageCount = 0;
  for (const line of readLines(path)) {
    try {
      const text = userMessageText(JSON.parse(line));
      if (text === null) continue;
      messageCount++;
      if (!firstPrompt) firstPrompt = collapseText(text);
    } catch {
      // Claude history is append-only JSONL; a partial or malformed line is skipped.
    }
  }
  if (messageCount === 0) return null;
  return {
    conversationId: basename(path, '.jsonl'),
    workspace,
    firstPrompt: truncate(firstPrompt || '(empty prompt)', 120),
    lastActiveMs: Math.floor(statSync(path).mtimeMs),
    messageCount,
  };
}

function readLines(path: string): string[] {
  try {
    return readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean);
  } catch {
    return [];
  }
}

function userMessageText(value: unknown): string | null {
  if (!isRecord(value) || value.type !== 'user' || !isRecord(value.message)) return null;
  const content = value.message.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (isRecord(part) && typeof part.text === 'string') return part.text;
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function collapseText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function safeReadDir(path: string): Dirent[] {
  try {
    return readdirSync(path, { withFileTypes: true });
  } catch {
    return [];
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
