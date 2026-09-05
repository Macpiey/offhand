import { describe, it, expect } from 'vitest';
import { ApprovalBroker, classifyRisk } from '../src/approvals.js';
import type { RunEvent } from '@offhand/shared';

describe('ApprovalBroker', () => {
  it('emits an approval event and resolves on approve', async () => {
    const broker = new ApprovalBroker(5000);
    const events: RunEvent[] = [];
    broker.attach((ev) => events.push(ev));

    const verdictP = broker.submit('Edit', { file_path: 'C:\\x\\index.html' });
    expect(events).toHaveLength(1);
    const ev = events[0]!;
    if (ev.type !== 'approval') throw new Error('expected approval event');
    expect(ev.action).toBe('Edit');
    expect(ev.risk).toBe('low');

    expect(broker.resolve(ev.id, true)).toBe(true);
    await expect(verdictP).resolves.toEqual({ approve: true, message: undefined });
    // Verdict echoed into the stream so replays resolve the card.
    expect(events[1]).toEqual({ type: 'approval-result', id: ev.id, approve: true });
  });

  it('resolves deny with a message', async () => {
    const broker = new ApprovalBroker(5000);
    const events: RunEvent[] = [];
    broker.attach((ev) => events.push(ev));
    const verdictP = broker.submit('Bash', { command: 'npm test' });
    const ev = events[0]!;
    if (ev.type !== 'approval') throw new Error('expected approval event');
    broker.resolve(ev.id, false);
    await expect(verdictP).resolves.toMatchObject({ approve: false });
  });

  it('auto-denies after the timeout', async () => {
    const broker = new ApprovalBroker(50);
    broker.attach(() => {});
    const verdict = await broker.submit('Bash', { command: 'rm -rf /' });
    expect(verdict.approve).toBe(false);
    expect(verdict.message).toContain('auto-denied');
  });

  it('denies immediately when no session is attached', async () => {
    const broker = new ApprovalBroker(5000);
    const verdict = await broker.submit('Edit', {});
    expect(verdict.approve).toBe(false);
  });

  it('resolve on unknown id returns false', () => {
    const broker = new ApprovalBroker(5000);
    expect(broker.resolve('nope', true)).toBe(false);
  });
});

describe('classifyRisk', () => {
  it.each([
    ['Bash', { command: 'rm -rf node_modules' }, 'high'],
    ['Bash', { command: 'git push --force origin main' }, 'high'],
    ['Bash', { command: 'shutdown /s' }, 'high'],
    ['Bash', { command: 'npm run build' }, 'low'],
    ['Edit', { file_path: 'src/index.ts' }, 'low'],
    ['Bash', { command: 'del /f important.txt' }, 'high'],
  ])('%s %o → %s', (tool, input, expected) => {
    expect(classifyRisk(tool as string, input)).toBe(expected);
  });
});
