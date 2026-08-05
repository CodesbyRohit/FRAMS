import { randomUUID } from 'crypto';

/** Prefixed ULID-style ids keep entity types readable in logs and the graph. */
export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 22)}`;
}
