import type { RunEvent } from '@offhand/shared';

/**
 * Single-producer single-consumer async event queue backing
 * RunHandle.events. push() before/after iteration both work; close() ends
 * iteration after the buffer drains.
 */
export class AsyncEventQueue<T> implements AsyncIterable<T> {
  private buffer: T[] = [];
  private waiter: (() => void) | null = null;
  private closed = false;

  push(item: T): void {
    if (this.closed) return;
    this.buffer.push(item);
    this.waiter?.();
  }

  close(): void {
    this.closed = true;
    this.waiter?.();
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    for (;;) {
      while (this.buffer.length > 0) yield this.buffer.shift()!;
      if (this.closed) return;
      await new Promise<void>((resolve) => (this.waiter = resolve));
      this.waiter = null;
    }
  }
}

// Convenience alias so runner files can import one type for their queues.
export type RunEventQueue = AsyncEventQueue<RunEvent>;
