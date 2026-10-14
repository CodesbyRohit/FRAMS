/** ISO-8601 wire format for timestamps that TypeORM may hand back as Date objects. */
export function toIso(value: Date | string): string;
export function toIso(value: Date | string | null | undefined): string | null;
export function toIso(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}
