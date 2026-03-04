// ─── AI CONCURRENCY SEMAPHORE ─────────────────────────────────────────────────
// Limits simultaneous AI calls to prevent rate-limit cascades on free providers.
// Default: max 2 concurrent AI calls. Queue overflow waits, never drops.

import { LIMITS } from "../core/constants.js";

class Semaphore {
  private queue: (() => void)[] = [];
  private active = 0;

  constructor(private readonly max: number) {}

  async acquire(): Promise<() => void> {
    if (this.active < this.max) {
      this.active++;
      return () => this.release();
    }
    return new Promise<() => void>((resolve) => {
      this.queue.push(() => {
        this.active++;
        resolve(() => this.release());
      });
    });
  }

  private release(): void {
    this.active--;
    const next = this.queue.shift();
    if (next) next();
  }

  get pending(): number { return this.queue.length; }
  get running(): number { return this.active; }
}

export const aiSemaphore = new Semaphore(LIMITS.AI_CONCURRENCY);
