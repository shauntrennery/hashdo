/**
 * Request throttling primitives for the public HTTP server.
 *
 * The card image endpoints are the most expensive thing this server exposes:
 * each miss costs an external API fetch plus a full headless-Chromium render.
 * Without bounds, an unauthenticated caller can spawn unlimited concurrent
 * renders and exhaust CPU/RAM. These two primitives bound the cost:
 *
 * - `createRateLimiter` — per-client request budget over a fixed window.
 * - `createSemaphore`   — global cap on concurrent renders, with a bounded
 *                         queue so excess load is shed rather than piled up.
 */

export interface RateLimiter {
  /** Record a hit for `key`. Returns false once the key exceeds its budget. */
  check(key: string): boolean;
}

export interface RateLimiterOptions {
  /** Max allowed hits per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Cap on tracked keys, so attacker-varied keys can't grow memory. */
  maxKeys?: number;
}

export function createRateLimiter({
  limit,
  windowMs,
  maxKeys = 5000,
}: RateLimiterOptions): RateLimiter {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return {
    check(key: string): boolean {
      const now = Date.now();
      let entry = hits.get(key);

      if (!entry || now >= entry.resetAt) {
        entry = { count: 0, resetAt: now + windowMs };
        hits.set(key, entry);
      }
      entry.count++;

      if (hits.size > maxKeys) {
        // Drop expired entries first; if still over, evict oldest-inserted.
        for (const [k, v] of hits) {
          if (now >= v.resetAt) hits.delete(k);
          if (hits.size <= maxKeys) break;
        }
        while (hits.size > maxKeys) {
          const oldest = hits.keys().next().value;
          if (oldest === undefined) break;
          hits.delete(oldest);
        }
      }

      return entry.count <= limit;
    },
  };
}

/** Thrown by `Semaphore.run` when the wait queue is already full. */
export class QueueFullError extends Error {
  constructor(message = 'Work queue is full') {
    super(message);
    this.name = 'QueueFullError';
  }
}

export interface Semaphore {
  /** Run `fn` once a slot is free. Throws QueueFullError if the queue is full. */
  run<T>(fn: () => Promise<T>): Promise<T>;
  /** Current occupancy, for diagnostics. */
  stats(): { active: number; queued: number };
}

export interface SemaphoreOptions {
  /** Maximum simultaneous executions. */
  concurrency: number;
  /** Maximum callers allowed to wait for a slot before load is shed. */
  maxQueue: number;
}

export function createSemaphore({ concurrency, maxQueue }: SemaphoreOptions): Semaphore {
  let active = 0;
  const waiters: Array<() => void> = [];

  function release(): void {
    const next = waiters.shift();
    // Hand the slot directly to the next waiter (so `active` stays constant);
    // only decrement when nobody is waiting.
    if (next) next();
    else active--;
  }

  async function acquire(): Promise<void> {
    if (active < concurrency) {
      active++;
      return;
    }
    if (waiters.length >= maxQueue) {
      throw new QueueFullError();
    }
    return new Promise<void>((resolve) => waiters.push(resolve));
  }

  return {
    async run<T>(fn: () => Promise<T>): Promise<T> {
      await acquire();
      try {
        return await fn();
      } finally {
        release();
      }
    },
    stats() {
      return { active, queued: waiters.length };
    },
  };
}
