/**
 * Minimal in-memory stand-in for the ioredis commands the API uses (strings,
 * sets, MULTI). TTLs are accepted but not enforced. Set `down = true` to make
 * every command reject, simulating an unreachable Redis.
 */
export class FakeRedis {
  readonly strings = new Map<string, string>();
  readonly sets = new Map<string, Set<string>>();
  down = false;

  private async op<T>(fn: () => T): Promise<T> {
    if (this.down) throw new Error('connect ECONNREFUSED 127.0.0.1:6379');
    return fn();
  }

  get(key: string) {
    return this.op(() => this.strings.get(key) ?? null);
  }
  set(key: string, value: string, ..._args: unknown[]) {
    return this.op(() => {
      this.strings.set(key, value);
      return 'OK';
    });
  }
  getdel(key: string) {
    return this.op(() => {
      const v = this.strings.get(key) ?? null;
      this.strings.delete(key);
      return v;
    });
  }
  del(...keys: string[]) {
    return this.op(() => keys.reduce((n, k) => n + (this.strings.delete(k) || this.sets.delete(k) ? 1 : 0), 0));
  }
  mget(keys: string[]) {
    return this.op(() => keys.map((k) => this.strings.get(k) ?? null));
  }
  incr(key: string) {
    return this.op(() => {
      const n = Number(this.strings.get(key) ?? 0) + 1;
      this.strings.set(key, String(n));
      return n;
    });
  }
  expire(..._args: unknown[]) {
    return this.op(() => 1);
  }
  sadd(key: string, ...members: string[]) {
    return this.op(() => {
      const s = this.sets.get(key) ?? new Set<string>();
      members.forEach((m) => s.add(m));
      this.sets.set(key, s);
      return members.length;
    });
  }
  srem(key: string, ...members: string[]) {
    return this.op(() => members.reduce((n, m) => n + (this.sets.get(key)?.delete(m) ? 1 : 0), 0));
  }
  smembers(key: string) {
    return this.op(() => [...(this.sets.get(key) ?? [])]);
  }

  multi() {
    const queued: Array<() => Promise<unknown>> = [];
    const chain = {
      set: (...a: [string, string, ...unknown[]]) => (queued.push(() => this.set(...a)), chain),
      sadd: (k: string, ...m: string[]) => (queued.push(() => this.sadd(k, ...m)), chain),
      srem: (k: string, ...m: string[]) => (queued.push(() => this.srem(k, ...m)), chain),
      del: (...k: string[]) => (queued.push(() => this.del(...k)), chain),
      expire: (...a: unknown[]) => (queued.push(() => this.expire(...a)), chain),
      incr: (k: string) => (queued.push(() => this.incr(k)), chain),
      exec: async () => {
        if (this.down) throw new Error('connect ECONNREFUSED 127.0.0.1:6379');
        const out: Array<[null, unknown]> = [];
        for (const q of queued) out.push([null, await q()]);
        return out;
      },
    };
    return chain;
  }
}
